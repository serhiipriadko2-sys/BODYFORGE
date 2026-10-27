"""Read-only inspection of a GLB 2.0 asset's geometry, skins and byte budget."""
import json
import pathlib
import struct
import sys
from collections import Counter

if len(sys.argv) != 2:
    raise SystemExit("usage: python scripts/audit-glb-structure.py path/to/model.glb")
path = pathlib.Path(sys.argv[1])
data = path.read_bytes()
if len(data) < 20 or data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
    raise SystemExit("not a GLB 2.0 file")
if struct.unpack_from("<I", data, 8)[0] != len(data):
    raise SystemExit("GLB length header mismatch")
offset, document, bin_bytes = 12, None, 0
while offset + 8 <= len(data):
    length, kind = struct.unpack_from("<II", data, offset)
    offset += 8
    if offset + length > len(data):
        raise SystemExit("invalid GLB chunk boundary")
    if kind == 0x4E4F534A:
        document = json.loads(data[offset:offset + length].decode("utf-8").rstrip(" \t\r\n\0"))
    elif kind == 0x004E4942:
        bin_bytes += length
    offset += length
if offset != len(data) or document is None:
    raise SystemExit("missing GLB JSON or invalid trailing bytes")
accessors = document.get("accessors", [])
views = document.get("bufferViews", [])
meshes = []
for mesh in document.get("meshes", []):
    primitive_summary = []
    for prim in mesh.get("primitives", []):
        attrs = prim.get("attributes", {})
        count = accessors[attrs["POSITION"]]["count"] if "POSITION" in attrs else 0
        index = prim.get("indices")
        indices = accessors[index]["count"] if index is not None else count
        primitive_summary.append({
            "vertices": count, "triangles": indices // 3,
            "attributes": {key: {"componentType": accessors[value]["componentType"], "bufferView": accessors[value].get("bufferView"), "byteOffset": accessors[value].get("byteOffset", 0), "normalized": accessors[value].get("normalized", False), "stride": views[accessors[value]["bufferView"]].get("byteStride", 0) if "bufferView" in accessors[value] else None} for key, value in attrs.items()}, "material": prim.get("material"),
        })
    meshes.append({"name": mesh.get("name", ""), "primitives": primitive_summary})
images = []
for img in document.get("images", []):
    view = views[img["bufferView"]] if "bufferView" in img else None
    images.append({"name": img.get("name", ""), "mime": img.get("mimeType", ""),
                   "bytes": view.get("byteLength", 0) if view else None})
body = {
    "filename": path.name, "fileBytes": len(data),
    "binaryChunkBytes": bin_bytes,
    "extensionsRequired": document.get("extensionsRequired", []),
    "extensionsUsed": document.get("extensionsUsed", []),
    "skins": len(document.get("skins", [])),
    "maxSkinJoints": max((len(s.get("joints", [])) for s in document.get("skins", [])), default=0),
    "nodes": len(document.get("nodes", [])),
    "meshes": meshes, "materials": len(document.get("materials", [])),
    "images": images, "animations": len(document.get("animations", [])),
    "triangles": sum(p["triangles"] for m in meshes for p in m["primitives"]),
    "attributeVertices": sum(p["vertices"] for m in meshes for p in m["primitives"]),
}
# Report observed numeric ranges so quantization is never based on guesses.
bin_start = 20 + struct.unpack_from("<I", data, 12)[0] + 8
ranges = {}
for label, fmt, width in (("WEIGHTS_0", "<ffff", 16), ("TEXCOORD_0", "<ff", 8)):
    low = [float("inf")] * (4 if label == "WEIGHTS_0" else 2)
    high = [float("-inf")] * len(low)
    sum_deviation = 0.0
    seen = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            idx = primitive.get("attributes", {}).get(label)
            if idx is None:
                continue
            accessor = accessors[idx]
            view = views[accessor["bufferView"]]
            stride = view.get("byteStride", width)
            start = bin_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
            for i in range(accessor["count"]):
                values = struct.unpack_from(fmt, data, start + i * stride)
                for k, val in enumerate(values):
                    low[k] = min(low[k], val)
                    high[k] = max(high[k], val)
                if label == "WEIGHTS_0":
                    sum_deviation = max(sum_deviation, abs(sum(values) - 1))
                seen += 1
    ranges[label] = {"min": low, "max": high, "count": seen, "maxWeightSumDeviation": sum_deviation}
body["numericRanges"] = ranges
print(json.dumps(body, ensure_ascii=False, indent=2))
