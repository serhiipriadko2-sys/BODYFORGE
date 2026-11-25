import * as THREE from 'three';
import recipe from './avatarFaceContour.json';

/** A static correction of the evaluated Face V2. Compact supports deliberately
 * exclude the lip seam, eyelids, brow, ear seam, scalp and neck. The analytic
 * inverse-transpose preserves original split normals and UV correspondence. */
export function applyAvatarFaceContour(root: THREE.Object3D): number {
  const body = root.getObjectByName('BODYFORGE_Body');
  if (!(body instanceof THREE.SkinnedMesh) || body.userData.BODYFORGE_groom !== 'v2') return 0;
  const geometry = body.geometry;
  if (geometry.userData.facialProfile !== recipe.baseProfile || geometry.userData.facialContour) return 0;
  const rest = geometry.getAttribute('position'), originalNormal = geometry.getAttribute('normal');
  if (rest?.count !== 65895 || originalNormal?.count !== rest.count ||
      rest.itemSize !== 3 || originalNormal.itemSize !== 3) return 0;
  const positions = new THREE.Float32BufferAttribute(rest.count * 3, 3);
  const normals = new THREE.Float32BufferAttribute(rest.count * 3, 3);
  const matrix = new THREE.Matrix3(), normal = new THREE.Vector3();
  let changed = 0;
  for (let i = 0; i < rest.count; i++) {
    const x = rest.getX(i), y = rest.getY(i), z = rest.getZ(i);
    normal.fromBufferAttribute(originalNormal, i);
    let dx = 0, dy = 0, dz = 0;
    matrix.identity();
    const j = matrix.elements, side = x < 0 ? -1 : 1;
    if (y > 1.554 && y < 1.658 && Math.abs(x) < .076 && z > .080) {
      for (const {center, radius, offset} of recipe.zones) {
        const [rx, ry, rz] = radius;
        const u = (x-side*center[0])/rx, v = (y-center[1])/ry, w = (z-center[2])/rz;
        const f = 1-u*u-v*v-w*w;
        if (f <= 0) continue;
        const strength = f*f*f, slope = -6*f*f;
        const ox = side*offset[0], oy = offset[1], oz = offset[2];
        dx += strength*ox; dy += strength*oy; dz += strength*oz;
        const gx = slope*u/rx, gy = slope*v/ry, gz = slope*w/rz;
        j[0]+=ox*gx; j[1]+=oy*gx; j[2]+=oz*gx;
        j[3]+=ox*gy; j[4]+=oy*gy; j[5]+=oz*gy;
        j[6]+=ox*gz; j[7]+=oy*gz; j[8]+=oz*gz;
      }
    }
    const distance = Math.hypot(dx,dy,dz);
    if (distance > 0) {
      // Fail closed before any geometry mutation on an unexpected deformation.
      if (!Number.isFinite(distance) || distance > .006 || matrix.determinant() < .40 ||
          (Math.abs(x) <= .031 && y >= 1.586 && y <= 1.616)) return 0;
      normal.applyMatrix3(matrix.invert().transpose()).normalize();
      if (distance > .00005) changed++;
    }
    positions.setXYZ(i,x+dx,y+dy,z+dz);
    normals.setXYZ(i,normal.x,normal.y,normal.z);
  }
  if (changed < 100 || changed > 12000) return 0;
  geometry.setAttribute('position',positions);
  geometry.setAttribute('normal',normals);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.facialContour=recipe.id;
  return changed;
}
