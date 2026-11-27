import * as THREE from 'three';

export const HEAD_VOLUME_REVIEW_ID = 'BF_HEAD_VOLUME_REVIEW_V4';
const BODY_HASH = 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e';
const X = [0, .038, .068] as const;
const Y = [1.566, 1.604, 1.640] as const;
const RADIUS = [.037, .034, .060] as const;
export type HeadVolumeOffsets = ReadonlyArray<readonly [number, number]>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function exactTriple(value: unknown, x: number, y: number, z: number): boolean {
  return Array.isArray(value) && value.length === 3 && value[0] === x && value[1] === y && value[2] === z;
}

/** Accept only the fixed nine-control revision. No scan mesh or photo required. */
export function parseHeadVolumeRecipe(value: unknown): HeadVolumeOffsets | undefined {
  if (!record(value) || value.id !== HEAD_VOLUME_REVIEW_ID || value.bodySha256 !== BODY_HASH ||
      value.baseline !== 'lower-face-contour-v3' || value.field !== 'normalized-gaussian-protected-v1' ||
      !Array.isArray(value.zones) || value.zones.length !== 9) return;
  const offsets: Array<readonly [number, number]> = [];
  for (let i = 0; i < 9; i++) {
    const zone: unknown = value.zones[i];
    if (!record(zone) || !exactTriple(zone.center, X[i % 3], Y[Math.floor(i / 3)], .129) ||
      !exactTriple(zone.radius, ...RADIUS) || !Array.isArray(zone.offset) || zone.offset.length !== 3) return;
    const [dx, dy, dz] = zone.offset;
    if (typeof dx !== 'number' || typeof dz !== 'number' || dy !== 0 ||
      !Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) > .006001 ||
      (i % 3 === 0 && dx !== 0)) return;
    offsets.push(Object.freeze([dx, dz] as const));
  }
  return Object.freeze(offsets);
}

const smooth = (v: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function protectedHeadVolumePoint(x: number, y: number, z: number): boolean {
  return ![x, y, z].every(Number.isFinite) || y <= 1.552 || y >= 1.658 || Math.abs(x) >= .077 ||
    z <= .065 || (Math.abs(x) <= .031 && y >= 1.586 && y <= 1.616);
}

/** Normalized Gaussian field. Common z exponential cancels algebraically.
 * The mask is C1, including the symmetric centreline and protected mouth.
 * Bind-space metres; evaluated once before growth captures rest data. */
export function sampleHeadVolume(x: number, y: number, z: number, offsets: HeadVolumeOffsets,
  out = new THREE.Vector3()): THREE.Vector3 {
  out.set(0, 0, 0);
  if (protectedHeadVolumePoint(x, y, z)) return out;
  const a = Math.abs(x);
  const region = smooth(y, 1.552, 1.573) * (1 - smooth(y, 1.637, 1.658)) *
    smooth(z, .065, .092) * (1 - smooth(a, .062, .077));
  const seam = (1 - smooth(a, .031, .050)) * smooth(y, 1.572, 1.586) *
    (1 - smooth(y, 1.616, 1.638));
  const nose = (1 - smooth(a, .019, .035)) * smooth(y, 1.620, 1.633);
  const mask = region * (1 - seam) * (1 - nose);
  if (mask === 0) return out;
  let sum = 0, dx = 0, dz = 0;
  for (let i = 0; i < 9; i++) {
    const u = (a - X[i % 3]) / RADIUS[0], v = (y - Y[Math.floor(i / 3)]) / RADIUS[1];
    const w = Math.exp(-.5 * (u * u + v * v));
    sum += w;
    dx += w * offsets[i][0];
    dz += w * offsets[i][1];
  }
  const odd = (x < 0 ? -1 : 1) * smooth(a, 0, .045);
  return out.set(mask * odd * dx / sum, 0, mask * dz / sum);
}

/** Commit atomically only after the actual evaluated mesh passes deformation,
 * normal and triangle gates. UVs, indices, weights, other meshes stay intact. */
export function applyAvatarHeadVolume(root: THREE.Object3D, offsets: HeadVolumeOffsets): number {
  const body = root.getObjectByName('BODYFORGE_Body');
  if (!(body instanceof THREE.SkinnedMesh) || body.userData.BODYFORGE_groom !== 'v2' ||
      offsets.length !== 9 || offsets.some(([x,z],i) =>
        !Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x,z) > .006001 || (i%3===0 && x!==0))) return 0;
  const g = body.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), index = g.index;
  if (g.userData.facialContour !== 'lower-face-contour-v3' || g.userData.headVolumeReview || g.userData.scanTransfer ||
      p?.count !== 65895 || n?.count !== p.count || p.itemSize !== 3 || n.itemSize !== 3 ||
      !index || index.count % 3 !== 0) return 0;
  const positions = new THREE.Float32BufferAttribute(p.count * 3, 3);
  const normals = new THREE.Float32BufferAttribute(p.count * 3, 3);
  const active = new Uint8Array(p.count);
  const delta = new THREE.Vector3(), plus = new THREE.Vector3(), minus = new THREE.Vector3(), normal = new THREE.Vector3();
  const matrix = new THREE.Matrix3(), eps = .0001;
  let changed = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (![x, y, z].every(Number.isFinite)) return 0;
    sampleHeadVolume(x, y, z, offsets, delta);
    normal.fromBufferAttribute(n, i);
    const length = delta.length();
    if (length > 0) {
      if (!Number.isFinite(length) || length > .0042 || protectedHeadVolumePoint(x, y, z)) return 0;
      active[i] = 1;
      if (length > .00005) changed++;
      matrix.identity();
      for (let axis = 0; axis < 3; axis++) {
        const a = axis === 0 ? eps : 0, b = axis === 1 ? eps : 0, c = axis === 2 ? eps : 0;
        sampleHeadVolume(x + a, y + b, z + c, offsets, plus);
        sampleHeadVolume(x - a, y - b, z - c, offsets, minus);
        plus.sub(minus).multiplyScalar(1 / (2 * eps));
        matrix.elements[axis * 3] += plus.x;
        matrix.elements[axis * 3 + 1] += plus.y;
        matrix.elements[axis * 3 + 2] += plus.z;
      }
      const det = matrix.determinant();
      if (!Number.isFinite(det) || det < .68) return 0;
      normal.applyMatrix3(matrix.invert().transpose()).normalize();
      if (!Number.isFinite(normal.lengthSq()) || Math.abs(normal.lengthSq() - 1) > 1e-5) return 0;
    }
    positions.setXYZ(i, x + delta.x, y + delta.y, z + delta.z);
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  if (changed < 1500 || changed > 8500) return 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const before = new THREE.Vector3(), after = new THREE.Vector3();
  const cross = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, j: number, k: number, out: THREE.Vector3) => {
    a.fromBufferAttribute(attr, i); b.fromBufferAttribute(attr, j); c.fromBufferAttribute(attr, k);
    out.crossVectors(b.sub(a), c.sub(a));
  };
  for (let i = 0; i < index.count; i += 3) {
    const j = index.getX(i), k = index.getX(i + 1), l = index.getX(i + 2);
    if (![j, k, l].every(v => Number.isInteger(v) && v >= 0 && v < p.count)) return 0;
    if (!active[j] && !active[k] && !active[l]) continue;
    cross(p, j, k, l, before); cross(positions, j, k, l, after);
    const oldArea = before.lengthSq();
    if (oldArea > 1e-20 && before.dot(after) / oldArea <= .75) return 0;
  }
  g.setAttribute('position', positions); g.setAttribute('normal', normals);
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.headVolumeReview = HEAD_VOLUME_REVIEW_ID;
  return changed;
}
