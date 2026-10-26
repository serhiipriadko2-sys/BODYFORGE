import * as THREE from 'three';
import type { Outfit } from './game';

/**
 * Imported CC0 MakeHuman fit, in the source mesh's rest-pose metres.
 * This is surface color on the *original skinned body*, not separate clothing
 * geometries in procedural-avatar coordinates. The skinning and joint bends
 * therefore remain an exact match; no floating shirt, shorts or shoes.
 *
 * Calibrated against public/assets/male-base-mesh-base_male.glb, with a
 * conservative guard in Avatar3D for incompatible replacement models.
 */
export type SurfaceRegion = 'skin' | 'shirt' | 'shorts' | 'shoe' | 'trim';
export type SurfacePalette = { skin: string; trim: string; outfit: Outfit };

export function bodySurfaceRegion(x: number, y: number, z: number): SurfaceRegion {
  if (![x, y, z].every(Number.isFinite)) return 'skin';
  const ax = Math.abs(x);

  // These coordinates are from the source GLB (before its 2.66x display scale).
  // Feet and toes are integral to the same skinned mesh, including the heels.
  if (y >= 0 && y < .165) {
    return 'shoe';
  }
  // Pelvis and thighs, not the forearms that pass the same height.
  if (y >= .730 && y < 1.005 && ax < .275) {
    return 'shorts';
  }
  // Athletic top on torso and proximal shoulders; exclude remote hands/arms.
  if (y >= 1.005 && y <= 1.49) {
    const radius = y > 1.34 ? .328 : y > 1.15 ? .29 : .255;
    const sleeve = y >= 1.28 && y <= 1.46 && ax <= .415;
    if (ax <= radius || sleeve) {
      return 'shirt';
    }
  }
  return 'skin';
}

function outfitColor(outfit: Outfit, region: SurfaceRegion, skin: THREE.Color, trim: THREE.Color) {
  switch (region) {
    case 'trim': return trim;
    case 'shirt': return new THREE.Color(outfit === 'steel' ? '#263e53' : outfit === 'ember' ? '#453130' : '#152533');
    case 'shorts': return new THREE.Color(outfit === 'steel' ? '#354e61' : outfit === 'ember' ? '#764d39' : '#202a35');
    case 'shoe': return new THREE.Color(outfit === 'steel' ? '#2c4457' : '#17222b');
    default: return skin;
  }
}

/** Mutate only a color attribute. No new skinned mesh, bone or GL context. */
export function paintFittedBody(geometry: THREE.BufferGeometry, palette: SurfacePalette): Record<SurfaceRegion, number> {
  const positions = geometry.getAttribute('position');
  if (!positions || positions.itemSize !== 3 || positions.count === 0) throw Error('Imported body positions unavailable');
  const skin = new THREE.Color(palette.skin);
  const trim = new THREE.Color(palette.trim);
  const colors = {
    skin, trim,
    shirt: outfitColor(palette.outfit, 'shirt', skin, trim),
    shorts: outfitColor(palette.outfit, 'shorts', skin, trim),
    shoe: outfitColor(palette.outfit, 'shoe', skin, trim),
  };
  const previous = geometry.getAttribute('color');
  const attribute = previous?.count === positions.count && previous.itemSize === 3
    ? previous : new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
  const counts: Record<SurfaceRegion, number> = { skin: 0, shirt: 0, shorts: 0, shoe: 0, trim: 0 };
  for (let i = 0; i < positions.count; i++) {
    const region = bodySurfaceRegion(positions.getX(i), positions.getY(i), positions.getZ(i));
    counts[region]++;
    const color = colors[region];
    attribute.setXYZ(i, color.r, color.g, color.b);
  }
  if (attribute !== previous) geometry.setAttribute('color', attribute);
  attribute.needsUpdate = true;
  return counts;
}
