import * as THREE from 'three';

/** Small seamless weave using the garment's existing UVs. Shared per scene. */
export function createAvatarFabric(): THREE.DataTexture {
  const size = 64;
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = Math.cos(x * Math.PI / 4);
      const weft = Math.cos(y * Math.PI / 4);
      const crossing = Math.cos((x - y) * Math.PI / 8);
      pixels[y * size + x] = Math.round(128 + 24 * (warp + weft) + 15 * crossing * (warp - weft));
    }
  }
  const weave = new THREE.DataTexture(pixels, size, size, THREE.RedFormat);
  weave.name = 'BODYFORGE woven jersey';
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(40, 40);
  weave.minFilter = THREE.LinearMipmapLinearFilter;
  weave.magFilter = THREE.LinearFilter;
  weave.generateMipmaps = true;
  weave.needsUpdate = true;
  return weave;
}

export type AvatarFabricMap = 'normal' | 'roughness';

export function isAvatarTextile(mesh: THREE.SkinnedMesh): boolean {
  return mesh.name === 'BODYFORGE_Shirt' || mesh.name === 'BODYFORGE_Shorts';
}

/** The pinned garment GLBs use untextured PBR materials. Add a restrained
 * fibre-sheen lobe; the existing outfit color remains the source of truth. */
export function createAvatarTextileMaterial(source: THREE.MeshStandardMaterial, weave: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    name: 'BODYFORGE technical stretch fabric',
    color: source.color.clone(), side: source.side,
    roughness: .76, metalness: 0, ior: 1.45, specularIntensity: .66,
    bumpMap: weave, bumpScale: .004,
    sheen: .38, sheenColor: source.color.clone().lerp(new THREE.Color('#788899'), .28),
    sheenRoughness: .74,
  });
}

/** Only the real shirt and shorts share these maps. The caller owns the
 * texture until this succeeds and must dispose an unused/late response. */
export function applyAvatarFabricMap(garments: readonly THREE.SkinnedMesh[], kind: AvatarFabricMap, texture: THREE.Texture): boolean {
  const materials = new Set<THREE.MeshPhysicalMaterial>();
  for (const garment of garments) {
    if (isAvatarTextile(garment) && garment.material instanceof THREE.MeshPhysicalMaterial) materials.add(garment.material);
  }
  if (!materials.size) return false;
  texture.name = 'BODYFORGE measured textile ' + kind;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  for (const material of materials) {
    if (kind === 'normal') {
      material.normalMap = texture;
      // The 512px resampling reduces slope amplitude. The bound recovers
      // cloth grain without adding geometry or exaggerating macro folds.
      material.normalScale.set(2.2, 2.2);
    } else {
      material.roughnessMap = texture;
      material.roughness = 1;
    }
    material.needsUpdate = true;
  }
  return true;
}
