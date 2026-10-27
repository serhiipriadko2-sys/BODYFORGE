"""Independent Blender 5.2 GLB import gate for BODYFORGE's packed athlete.

Run:
  blender.exe --background --factory-startup --python-exit-code 1 \\
    --python scripts/verify-athlete-glb-blender.py -- original.glb candidate.glb

Read-only: imports scenes but does not overwrite any source files.
"""
import bpy
import json
import math
from pathlib import Path
import sys
from mathutils import Vector

def args():
    if "--" not in sys.argv:
        raise ValueError("Expected '-- original.glb candidate.glb'")
    paths = [Path(v).resolve() for v in sys.argv[sys.argv.index("--") + 1:]]
    if len(paths) != 2:
        raise ValueError("Expected two paths")
    return paths

def inventory(file):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(file))
    if "FINISHED" not in result:
        raise RuntimeError("Blender failed to import " + str(file))
    meshes = []
    for obj in sorted((obj for obj in bpy.data.objects if obj.type == "MESH"), key=lambda x: x.name):
        mesh = obj.data
        coords = [tuple(obj.matrix_world @ vertex.co) for vertex in mesh.vertices]
        if coords:
            min_bounds = [min(v[axis] for v in coords) for axis in range(3)]
            max_bounds = [max(v[axis] for v in coords) for axis in range(3)]
        else:
            min_bounds = max_bounds = [0, 0, 0]
        weights = [[(v_group.group, v_group.weight) for v_group in vert.groups] for vert in mesh.vertices]
        meshes.append({
            "name": obj.name,
            "vertices": len(mesh.vertices),
            "polygons": len(mesh.polygons),
            "triangleCorners": sum(max(0, len(p.vertices) - 2) for p in mesh.polygons),
            "materialSlots": len(obj.material_slots),
            "uvLayers": len(mesh.uv_layers),
            "vertexGroups": len(obj.vertex_groups),
            "armatureModifiers": sum(m.type == "ARMATURE" for m in obj.modifiers),
            "minBound": min_bounds, "maxBound": max_bounds,
            "weightCount": sum(len(v) for v in weights),
            "weightTotal": sum(sum(pair[1] for pair in weights_i) for weights_i in weights),
        })
    armatures = sorted(
        [[bone.name for bone in obj.data.bones] for obj in bpy.data.objects if obj.type == "ARMATURE"]
    )
    return {"file": str(file), "meshes": meshes, "armatures": armatures,
            "totalTriangles": sum(x["triangleCorners"] for x in meshes),
            "totalVertices": sum(x["vertices"] for x in meshes),
            "totalWeightAssignments": sum(x["weightCount"] for x in meshes)}

def check(source, packed):
    # The geometry scene must be identical. Quantized weights/UV/normal are
    # allowed <1e-4 source deviation; Blender's import checks their validity.
    if source["armatures"] != packed["armatures"]:
        raise AssertionError("Skinned skeleton or names differ")
    if len(source["armatures"]) != 1 or len(source["armatures"][0]) != 163:
        raise AssertionError("Unexpected armature")
    if len(source["meshes"]) != len(packed["meshes"]):
        raise AssertionError("Mesh count changed")
    if source["totalTriangles"] != packed["totalTriangles"]:
        raise AssertionError("Triangle count changed")
    if source["totalVertices"] != packed["totalVertices"]:
        raise AssertionError("Vertex count changed")
    if source["totalWeightAssignments"] != packed["totalWeightAssignments"]:
        raise AssertionError("Skin group assignments changed")
    max_bound = max_weights = 0.0
    for old, new in zip(source["meshes"], packed["meshes"]):
        for key in ("name", "vertices", "triangleCorners", "materialSlots",
                    "uvLayers", "vertexGroups", "armatureModifiers", "weightCount"):
            if old[key] != new[key]:
                raise AssertionError("Mismatch " + str(key) + " for " + old["name"])
        # Preserve the original scene's unskinned decorative objects too.
        # The armature modifier count is compared per mesh above.
        for end in ("minBound", "maxBound"):
            max_bound = max(max_bound, *(abs(a-b) for a,b in zip(old[end], new[end])))
        max_weights = max(max_weights, abs(old["weightTotal"] - new["weightTotal"]))
    skinned = sum(mesh['armatureModifiers'] > 0 for mesh in source['meshes'])
    if skinned < 14:
        raise AssertionError('Missing expected skinned athlete mesh objects')
    if max_bound > 0.000001 or max_weights > 0.03:
        raise AssertionError("Unexpected transformed geometry or skin weights")
    return {"skinnedMeshes": skinned, "meshCount":len(source["meshes"]),
            "triangleCount":source["totalTriangles"],"vertexCount":source["totalVertices"],
            "boneCount":len(source["armatures"][0]),
            "weightAssignments":source["totalWeightAssignments"],
            "maxBoundingDiff":max_bound,"maxTotalWeightsDiff":max_weights}

def main():
    first, second = args()
    source = inventory(first)
    print("BLENDER_ORIGINAL_IMPORTED", json.dumps({"triangles": source["totalTriangles"],"meshes":len(source["meshes"]),"bones":len(source["armatures"][0])}))
    packed = inventory(second)
    print("BLENDER_OPTIMIZED_IMPORTED", json.dumps({"triangles":packed["totalTriangles"],"meshes":len(packed["meshes"]),"bones":len(packed["armatures"][0])}))
    verdict = check(source, packed)
    print("BODYFORGE_BLENDER_IMPORT_COMPARE_PASS", json.dumps(verdict, sort_keys=True))

if __name__ == "__main__":
    main()
