import * as THREE from 'three';
import profile from './avatarFaceProfile.json';

/** These values multiply the normal skin tint in linear light. */
export type FacialPigment = readonly { vertex: number; red: number; green: number; blue: number }[];
export type AvatarFaceForm = { body: THREE.BufferGeometry; pigment: FacialPigment };

function sculpt(geometry: THREE.BufferGeometry, includePigment: boolean) {
  const rest = geometry.getAttribute('position');
  const splitNormals = geometry.getAttribute('normal');
  const positions = new THREE.Float32BufferAttribute(rest.count * 3, 3);
  const normals = new THREE.Float32BufferAttribute(rest.count * 3, 3);
  const normal = new THREE.Vector3();
  const matrix = new THREE.Matrix3();
  const pigment: { vertex: number; red: number; green: number; blue: number }[] = [];

  for (let i = 0; i < rest.count; i++) {
    const x = rest.getX(i), y = rest.getY(i), z = rest.getZ(i);
    normal.fromBufferAttribute(splitNormals, i);
    // This box covers the complete support of every sculpt and leaves the
    // scalp, ears, lips and body outside the operation.
    if (y < 1.55 || y > 1.72 || Math.abs(x) > .08 || z < .075) {
      positions.setXYZ(i, x, y, z);
      normals.setXYZ(i, normal.x, normal.y, normal.z);
      continue;
    }

    const side = x < 0 ? -1 : 1;
    let dx = 0, dy = 0, dz = 0;
    let red = 1, green = 1, blue = 1;
    matrix.identity();
    const j = matrix.elements;
    for (const zone of profile.zones) {
      const [rx, ry, rz] = zone.radius;
      const u = (x - side * zone.center[0]) / rx;
      const v = (y - zone.center[1]) / ry;
      const w = (z - zone.center[2]) / rz;
      const falloff = 1 - u*u - v*v - w*w;
      if (falloff <= 0) continue;

      const strength = falloff ** 3;
      const xOffset = side * zone.offset[0], yOffset = zone.offset[1], zOffset = zone.offset[2];
      dx += strength * xOffset;
      dy += strength * yOffset;
      dz += strength * zOffset;
      const derivative = -6 * falloff * falloff;
      const gx = derivative * u / rx, gy = derivative * v / ry, gz = derivative * w / rz;
      j[0] += xOffset * gx; j[1] += yOffset * gx; j[2] += zOffset * gx;
      j[3] += xOffset * gy; j[4] += yOffset * gy; j[5] += zOffset * gy;
      j[6] += xOffset * gz; j[7] += yOffset * gz; j[8] += zOffset * gz;
      red += strength * zone.pigment[0];
      green += strength * zone.pigment[1];
      blue += strength * zone.pigment[2];
    }
    positions.setXYZ(i, x + dx, y + dy, z + dz);
    if (dx || dy || dz) normal.applyMatrix3(matrix.invert().transpose()).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
    if (includePigment && (Math.abs(red - 1) + Math.abs(green - 1) + Math.abs(blue - 1) > .001)) {
      pigment.push({ vertex: i, red, green, blue });
    }
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('normal', normals);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return pigment;
}

function isCompatible(mesh: THREE.Object3D | undefined, count: number): mesh is THREE.SkinnedMesh {
  if (!(mesh instanceof THREE.SkinnedMesh)) return false;
  const positions = mesh.geometry.getAttribute('position');
  const normals = mesh.geometry.getAttribute('normal');
  return positions?.count === count && positions.itemSize === 3 && normals?.count === count && normals.itemSize === 3;
}

/** Apply once, before training growth captures its rest vertices. */
export function applyAvatarFaceForm(source: THREE.Group): AvatarFaceForm | undefined {
  const body = source.getObjectByName('BODYFORGE_Body');
  const brows = source.getObjectByName('BODYFORGE_Brows');
  if (!isCompatible(body, profile.bodyVertices) || !isCompatible(brows, profile.browVertices) ||
      body.userData.BODYFORGE_groom !== 'v2' || body.skeleton !== brows.skeleton ||
      body.geometry.userData.facialProfile !== undefined) return;
  const pigment = sculpt(body.geometry, true);
  sculpt(brows.geometry, false);
  body.geometry.userData.facialProfile = profile.id;
  return { body: body.geometry, pigment };
}

export function tintAvatarFace(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, pigment: FacialPigment, skin: THREE.Color): void {
  for (const { vertex, red, green, blue } of pigment) {
    attribute.setXYZ(vertex, skin.r * red, skin.g * green, skin.b * blue);
  }
}
