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

/** Preserve measured roughness variation, but move it into a dry-knit range.
 * Only the textile material uses this extension; no new texture or pass. */
export function avatarTextileShader(fragment: string): string {
  const include = '#include <roughnessmap_fragment>';
  if (fragment.includes('BODYFORGE_MATTE_TEXTILE_V1') || fragment.split(include).length !== 2) return fragment;
  return fragment.replace(include, `${include}
    // BODYFORGE_MATTE_TEXTILE_V1
    #ifdef USE_ROUGHNESSMAP
      roughnessFactor = mix(0.72, 1.0, clamp(roughnessFactor, 0.0, 1.0));
    #endif
  `);
}

export function tintAvatarTextile(material: THREE.MeshPhysicalMaterial): void {
  material.sheenColor.copy(material.color).lerp(new THREE.Color('#788899'), .12);
}

/** Dry technical jersey: broad low-energy fibre sheen, not polished plastic.
 * Outfit color remains the source of truth. */
export function createAvatarTextileMaterial(source: THREE.MeshStandardMaterial, weave: THREE.Texture): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    name: 'BODYFORGE dry technical jersey',
    color: source.color.clone(), side: source.side,
    roughness: .88, metalness: 0, ior: 1.43, specularIntensity: .28,
    envMapIntensity: .55,
    bumpMap: weave, bumpScale: .0025,
    sheen: .24, sheenRoughness: .91,
  });
  tintAvatarTextile(material);
  material.onBeforeCompile = shader => { shader.fragmentShader = avatarTextileShader(shader.fragmentShader); };
  material.customProgramCacheKey = () => 'bodyforge-matte-textile-v1';
  return material;
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
      // Keep the measured weave without exaggerating specular microfacets.
      material.normalScale.set(1.25, 1.25);
    } else {
      material.roughnessMap = texture;
      material.roughness = 1;
    }
    material.needsUpdate = true;
  }
  return true;
}
