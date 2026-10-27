"""Conservatively pack a pinned BODYFORGE athlete GLB without changing topology.

Safe changes:
  NORMAL: float32 VEC3 -> normalized int16 VEC3, stride 8 with padding.
  WEIGHTS_0: float32 VEC4 -> normalized uint16 VEC4, preserving total 65535.
  TEXCOORD_0: float32 VEC2 -> normalized uint16 VEC2 only if all values [0,1].

KHR_mesh_quantization is REQUIRED for normalized int16 normals.
Core glTF supports the other two encodings. Three's GLTFLoader supports this
extension without a new decoder. A Blender import and browser QA are still
required before integrating the output.
"""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import sys

SOURCE_SHA256 = "16d3f6110d07179d71378af462a2c0ddc99d7e73207df123b3401769f18d53d6"
JSON_KIND, BIN_KIND = 0x4E4F534A, 0x004E4942
FLOAT32, SHORT, USHORT = 5126, 5122, 5123

def load_glb(path, allow_quantization=False):
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF" or struct.unpack_from("<I", raw, 4)[0] != 2:
        raise ValueError("Expected GLB 2.0")
    if struct.unpack_from("<I", raw, 8)[0] != len(raw):
        raise ValueError("GLB header length mismatch")
    offset, chunks = 12, {}
    while offset < len(raw):
        if offset + 8 > len(raw):
            raise ValueError("Malformed chunk header")
        length, kind = struct.unpack_from("<II", raw, offset)
        offset += 8
        if offset + length > len(raw) or kind in chunks or length % 4:
            raise ValueError("Malformed or duplicated GLB chunk")
        chunks[kind] = raw[offset:offset + length]
        offset += length
    if set(chunks) != {JSON_KIND, BIN_KIND}:
        raise ValueError("Unexpected GLB chunk types")
    document = json.loads(chunks[JSON_KIND].decode("utf8").rstrip(" \t\n\r\0"))
    if len(document.get("buffers", [])) != 1 or document["buffers"][0].get("uri"):
        raise ValueError("Only embedded single-buffer GLB is supported")
    required = document.get("extensionsRequired", [])
    used = document.get("extensionsUsed", [])
    if required or used:
        if not allow_quantization or required != ["KHR_mesh_quantization"] or used != required:
            raise ValueError("Cannot transparently rewrite an unknown GLB extension")
    old_bin = chunks[BIN_KIND]
    if not document["buffers"][0]["byteLength"] <= len(old_bin) <= document["buffers"][0]["byteLength"] + 3:
        raise ValueError("GLB buffer declared length mismatch")
    return document, old_bin

def byte_alignment(value):
    return (value + 3) & ~3

def pack_weights(original):
    parts = []
    max_error = 0.0
    for (w0, w1, w2, w3) in struct.iter_unpack("<ffff", original):
        raw = (w0, w1, w2, w3)
        if not all(math.isfinite(w) and 0 <= w <= 1.000001 for w in raw):
            raise ValueError("Non-finite or out-of-bounds skin weight")
        total = sum(raw)
        if abs(total - 1) > 0.0001:
            raise ValueError("Non-unit skin weight sum")
        weights = [min(1.0, max(0.0, w / total)) for w in raw]
        floats = [w * 65535.0 for w in weights]
        packed = [int(math.floor(w)) for w in floats]
        leftover = 65535 - sum(packed)
        if not 0 <= leftover <= 4:
            raise ValueError("Skin packing rounding overflow")
        for idx in sorted(range(4), key=lambda index: floats[index] - packed[index], reverse=True)[:leftover]:
            packed[idx] += 1
        if sum(packed) != 65535:
            raise ValueError("Packed weights must total 65535")
        max_error = max(max_error, *(abs(packed[i] / 65535 - weights[i]) for i in range(4)))
        parts.append(struct.pack("<HHHH", *packed))
    return b"".join(parts), max_error

def pack_normals(original):
    parts = []
    max_error = 0.0
    for vec in struct.iter_unpack("<fff", original):
        if not all(math.isfinite(v) and -1.0001 <= v <= 1.0001 for v in vec):
            raise ValueError("Invalid normal")
        quantized = [int(round(max(-1.0, min(1.0, v)) * 32767)) for v in vec]
        max_error = max(max_error, *(abs(quantized[i] / 32767 - vec[i]) for i in range(3)))
        parts.append(struct.pack("<hhhxx", *quantized))
    return b"".join(parts), max_error

def pack_uvs(original):
    parts = []
    max_error = 0.0
    for vec in struct.iter_unpack("<ff", original):
        if not all(math.isfinite(v) for v in vec):
            raise ValueError("Invalid UV")
        if any(v < 0 or v > 1 for v in vec):
            return None, 0.0
        packed = [int(round(v * 65535)) for v in vec]
        max_error = max(max_error, *(abs(packed[i] / 65535 - vec[i]) for i in range(2)))
        parts.append(struct.pack("<HH", *packed))
    return b"".join(parts), max_error

def build(original_document, original_bin):
    doc = copy.deepcopy(original_document)
    old_views = original_document.get("bufferViews", [])
    views = doc["bufferViews"]
    accessors = doc["accessors"]
    original_accessors = original_document["accessors"]
    owners = {}
    for idx, accessor in enumerate(original_accessors):
        if "sparse" in accessor:
            raise ValueError("Sparse accessors are unsupported")
        view = accessor.get("bufferView")
        if view is not None:
            owners.setdefault(view, []).append(idx)
    for image in original_document.get("images", []):
        if "bufferView" in image:
            owners.setdefault(image["bufferView"], []).append("image")
    replacements = {}
    summary = {"normals": 0, "weights": 0, "uvs": 0, "uvSkipped": 0,
               "maxNormalError": 0.0, "maxWeightError": 0.0, "maxUvError": 0.0}
    seen = set()
    for mesh in original_document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            for name in ("NORMAL", "WEIGHTS_0", "TEXCOORD_0"):
                idx = primitive.get("attributes", {}).get(name)
                if idx is None or idx in seen:
                    continue
                seen.add(idx)
                a = original_accessors[idx]
                view_id = a.get("bufferView")
                expected_components = {"NORMAL": 3, "WEIGHTS_0": 4, "TEXCOORD_0": 2}[name]
                if a.get("componentType") != FLOAT32 or a.get("type") != "VEC" + str(expected_components):
                    continue
                if a.get("normalized", False) or "min" in a or "max" in a:
                    continue
                if view_id is None or owners.get(view_id) != [idx] or a.get("byteOffset", 0) != 0:
                    continue
                old_view = old_views[view_id]
                size = a["count"] * expected_components * 4
                if old_view.get("byteStride") or old_view.get("byteLength") != size:
                    continue
                start = old_view.get("byteOffset", 0)
                if start % 4 or start + size > len(original_bin):
                    raise ValueError("Invalid source buffer view")
                original = original_bin[start:start + size]
                if name == "NORMAL":
                    replacement, error = pack_normals(original)
                    accessors[idx]["componentType"] = SHORT
                    accessors[idx]["normalized"] = True
                    views[view_id]["byteStride"] = 8
                    summary["normals"] += a["count"]
                    summary["maxNormalError"] = max(summary["maxNormalError"], error)
                elif name == "WEIGHTS_0":
                    replacement, error = pack_weights(original)
                    accessors[idx]["componentType"] = USHORT
                    accessors[idx]["normalized"] = True
                    summary["weights"] += a["count"]
                    summary["maxWeightError"] = max(summary["maxWeightError"], error)
                else:
                    replacement, error = pack_uvs(original)
                    if replacement is None:
                        summary["uvSkipped"] += a["count"]
                        continue
                    accessors[idx]["componentType"] = USHORT
                    accessors[idx]["normalized"] = True
                    summary["uvs"] += a["count"]
                    summary["maxUvError"] = max(summary["maxUvError"], error)
                replacements[view_id] = replacement
    if summary["normals"] < 70000 or summary["weights"] < 70000:
        raise ValueError("Optimization coverage unexpectedly small")
    # Preserve original scene, node hierarchy, skins, indices and all untouched
    # attribute bytes. Repack each bufferView once, retaining its other fields.
    new_bin = bytearray()
    for index, old_view in enumerate(old_views):
        start = old_view.get("byteOffset", 0)
        length = old_view["byteLength"]
        if start + length > len(original_bin):
            raise ValueError("Out-of-bounds view")
        while len(new_bin) % 4:
            new_bin.append(0)
        blob = replacements.get(index, original_bin[start:start + length])
        new_bin.extend(blob)
        views[index]["byteOffset"] = len(new_bin) - len(blob)
        views[index]["byteLength"] = len(blob)
    if "KHR_mesh_quantization" not in doc.get("extensionsUsed", []):
        doc["extensionsUsed"] = [*doc.get("extensionsUsed", []), "KHR_mesh_quantization"]
    if "KHR_mesh_quantization" not in doc.get("extensionsRequired", []):
        doc["extensionsRequired"] = [*doc.get("extensionsRequired", []), "KHR_mesh_quantization"]
    doc["buffers"][0]["byteLength"] = len(new_bin)
    while len(new_bin) % 4:
        new_bin.append(0)
    compact_json = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf8")
    compact_json += b" " * (byte_alignment(len(compact_json)) - len(compact_json))
    size = 12 + 8 + len(compact_json) + 8 + len(new_bin)
    encoded = (
        struct.pack("<4sII", b"glTF", 2, size)
        + struct.pack("<II", len(compact_json), JSON_KIND) + compact_json
        + struct.pack("<II", len(new_bin), BIN_KIND) + new_bin
    )
    summary["sizeBefore"] = len(original_bin)
    summary["sizeAfter"] = len(new_bin)
    summary["saved"] = len(original_bin) - len(new_bin)
    return bytes(encoded), summary

def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: python scripts/pack-athlete-glb.py original.glb NEW_OUTPUT.glb")
    source = Path(sys.argv[1]).resolve()
    target = Path(sys.argv[2]).resolve()
    if target.exists():
        raise SystemExit("Output exists: refusing to overwrite " + str(target))
    if source == target or target.parent == source.parent:
        raise SystemExit("Generate an isolated candidate outside public/assets first")
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise SystemExit("Unexpected source SHA-256; re-audit before changing the model")
    original, old_bin = load_glb(source)
    encoded, summary = build(original, old_bin)
    if len(encoded) > source.stat().st_size * 0.91:
        raise SystemExit("Insufficient safe reduction: refusing to write")
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_name(target.name + ".tmp")
    if temp.exists():
        raise SystemExit("Temporary candidate already exists")
    try:
        with temp.open("xb") as out:
            out.write(encoded)
        # Read back the candidate before declaring output created.
        result, _ = load_glb(temp, allow_quantization=True)
        if len(result["meshes"]) != len(original["meshes"]) or len(result["skins"]) != len(original["skins"]):
            raise ValueError("Mesh/skin counts changed")
        if result["nodes"] != original["nodes"] or result["skins"] != original["skins"]:
            raise ValueError("Node hierarchy or skeleton changed")
        if result["meshes"] != original["meshes"]:
            # Only accessor metadata is allowed to differ; mesh JSON itself is immutable.
            raise ValueError("Mesh primitive hierarchy changed")
        os.replace(temp, target)
    except:
        temp.unlink(missing_ok=True)
        raise
    summary.update({
        "source": str(source), "sourceSha256": SOURCE_SHA256,
        "fileBytesBefore": source.stat().st_size,
        "fileBytesAfter": target.stat().st_size,
        "fileSha256After": hashlib.sha256(target.read_bytes()).hexdigest(),
        "percentageSaved": round(100 * (1 - target.stat().st_size / source.stat().st_size), 1),
    })
    print("BODYFORGE_GLB_PACK_CANDIDATE", json.dumps(summary, ensure_ascii=False, sort_keys=True))

if __name__ == "__main__":
    main()
