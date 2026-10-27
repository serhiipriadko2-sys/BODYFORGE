import * as THREE from 'three';

export type ImportedSurfaceRole = 'body' | 'eyes' | 'lips' | 'nails';

/**
 * The pinned CC0 GLB exports every primitive with the same clay material.
 * Names alone are insufficient: reject a replacement with incompatible geometry.
 * Coordinates below are source/rest-pose metres, before Avatar3D normalization.
 * Unconfirmed secondary anatomy (including base_5) retains the body material.
 */
export function importedSurfaceRole(name: string, geometry: THREE.BufferGeometry): ImportedSurfaceRole {
  const position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3) return 'body';
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || bounds.isEmpty()) return 'body';
  const close = (actual: number, expected: number) => Math.abs(actual - expected) < .002;
  if (['base_male_bodyhigh-poly', 'BODYFORGE_Eyes'].includes(name) && position.count === 1076 &&
      close(bounds.min.y, 1.6609) && close(bounds.max.y, 1.6915) &&
      close(bounds.min.z, .1213) && close(bounds.max.z, .1466)) return 'eyes';
  if (['base_2', 'BODYFORGE_Lips'].includes(name) && [2210, 2225, 2320].includes(position.count) &&
      close(bounds.min.y, 1.5880) && close(bounds.max.y, 1.6141) &&
      close(bounds.max.x, .0281) && close(bounds.max.z, .1646)) return 'lips';
  if ((['base_3', 'BODYFORGE_NailsHands'].includes(name) && [639, 647, 650].includes(position.count) &&
       close(bounds.min.y, .9602) && close(bounds.max.y, 1.0616)) ||
      (['base_4', 'BODYFORGE_NailsFeet'].includes(name) && [1195, 1222, 1230].includes(position.count) &&
       close(bounds.min.y, .0137) && close(bounds.max.y, .0229))) return 'nails';
  return 'body';
}

/** A bounded, reproducible micro-surface; no external images or DOM canvas. */
function createMicroSurface(): THREE.DataTexture {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  let state = 0x42524647;
  for (let i = 0; i < size * size; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const value = 112 + (state >>> 27);
    pixels[i * 4] = value;
    pixels[i * 4 + 1] = value;
    pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'bodyforge-local-micro-surface';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 24);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Scene-owned materials; disposeThreeTree releases the shared texture once. */
export function createAvatarMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({
      name: 'BF skin and fitted fabric', color: 0xffffff, vertexColors: true,
      metalness: 0, roughness: .72, side: THREE.FrontSide,
      bumpMap: createMicroSurface(), bumpScale: .0012,
    }),
    eyes: new THREE.MeshPhysicalMaterial({
      name: 'BF cornea and iris', color: 0xffffff, vertexColors: true,
      metalness: 0, roughness: .22, clearcoat: .8, clearcoatRoughness: .13,
    }),
    lips: new THREE.MeshStandardMaterial({
      name: 'BF natural lips', color: 0xffffff, vertexColors: true,
      metalness: 0, roughness: .58,
    }),
    nails: new THREE.MeshStandardMaterial({
      name: 'BF natural nails', color: 0xffffff, vertexColors: true,
      metalness: 0, roughness: .52,
    }),
  };
}

export type AvatarMaterials = ReturnType<typeof createAvatarMaterials>;

function writableColors(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const positions = geometry.getAttribute('position');
  if (!positions || positions.itemSize !== 3 || positions.count === 0) {
    throw new Error('Avatar detail positions unavailable');
  }
  const existing = geometry.getAttribute('color');
  if (existing instanceof THREE.BufferAttribute && existing.itemSize === 3 && existing.count === positions.count) {
    return existing;
  }
  const colors = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
  geometry.setAttribute('color', colors);
  return colors;
}

/**
 * Iris/pupil colors on the existing eyeballs, not opaque spheres over the face.
 * Centres are measured against the GLB eye bones. Skinning, UVs and positions
 * remain unchanged; front-facing rings interpolate on the original mesh.
 */
export function paintAvatarEyes(geometry: THREE.BufferGeometry): void {
  const colors = writableColors(geometry);
  const positions = geometry.getAttribute('position');
  const sclera = new THREE.Color('#e6ded4');
  const iris = new THREE.Color('#687d72');
  const limbus = new THREE.Color('#253c36');
  const pupil = new THREE.Color('#080c10');
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const radius = Math.hypot(Math.abs(x) - .030, y - 1.676);
    color.copy(sclera);
    if (z > .137 && radius < .0068) {
      color.copy(iris);
      // Dark outer iris edge and a bounded pupil retain a readable gaze.
      if (radius > .0055) color.lerp(limbus, (radius - .0055) / .0013);
      if (radius < .0031) color.lerp(pupil, THREE.MathUtils.smoothstep(.0031 - radius, 0, .001));
    }
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;
}

/** Cosmetic tint is independent from the reward/profile data model. */
export function tintAvatarNails(geometry: THREE.BufferGeometry, skinColor: string): void {
  const colors = writableColors(geometry);
  const color = new THREE.Color(skinColor).lerp(new THREE.Color('#e3c7b6'), .2);
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, color.r, color.g, color.b);
  colors.needsUpdate = true;
}

/** The source base_2 is the lip surface, verified in the rendered portrait. */
export function tintAvatarLips(geometry: THREE.BufferGeometry, skinColor: string, textured = false): void {
  const colors = writableColors(geometry);
  const color = new THREE.Color(skinColor);
  if (textured) {
    const reference = new THREE.Color('#edbf9d');
    color.r /= reference.r; color.g /= reference.g; color.b /= reference.b;
  } else {
    color.r *= .91;
    color.g *= .66;
    color.b *= .69;
  }
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, color.r, color.g, color.b);
  colors.needsUpdate = true;
}
