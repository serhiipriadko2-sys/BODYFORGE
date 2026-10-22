import * as THREE from 'three';

/** Release one exclusively owned 3D subtree, including rigged GLB resources.
 * A geometry, material, texture or skeleton reused within the tree is released
 * exactly once. Do not call on nodes shared by other live scene roots. */
export function disposeThreeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  const textures = new Set<THREE.Texture>();

  root.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) {
      if (node.skeleton) skeletons.add(node.skeleton);
    }
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      const assigned = Array.isArray(node.material) ? node.material : [node.material];
      assigned.forEach((material) => {
        if (material) materials.add(material);
      });
    }
  });

  materials.forEach((material) => {
    // glTF materials can reference a texture from more than one property/mesh.
    // All GPU textures owned by this subtree are released once.
    Object.values(material).forEach((value) => {
      if (value instanceof THREE.Texture) textures.add(value);
    });
  });

  skeletons.forEach((skeleton) => skeleton.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}
