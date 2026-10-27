import * as THREE from 'three';
import type { AvatarMaterials } from './avatarMaterials';

export type AvatarDetailMap = 'normal' | 'orm' | 'eyes';

/** Ownership transfers to these scene materials; one ORM texture is shared.
 * Call only after the loader's scene/session identity check has passed.
 */
export function applyAvatarDetailMap(materials: AvatarMaterials, kind: AvatarDetailMap, texture: THREE.Texture): void {
  texture.flipY = false;
  texture.colorSpace = kind === 'eyes' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (kind === 'normal') {
    materials.body.normalMap = texture;
    materials.body.normalScale.set(.65, .65);
    materials.body.needsUpdate = true;
  } else if (kind === 'orm') {
    materials.body.aoMap = texture;
    materials.body.aoMapIntensity = .55;
    materials.body.roughnessMap = texture;
    materials.body.roughness = 1;
    materials.body.needsUpdate = true;
  } else {
    materials.eyes.map = texture;
    materials.eyes.vertexColors = false;
    materials.eyes.color.set(0xffffff);
    materials.eyes.roughness = .18;
    materials.eyes.clearcoatRoughness = .08;
    materials.eyes.needsUpdate = true;
  }
}
