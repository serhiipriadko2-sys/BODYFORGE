import * as THREE from 'three';
import type { Muscle } from './game';

type Vector = readonly [number, number, number];
interface Sculpt { center: Vector; radius: Vector; offset: Vector; bilateral: true }

// Metres in the pinned athlete's bind pose (+Z forward). Ellipsoids taper to
// zero before reaching face, wrists and shoes. Each group has its own shape.
const SCULPTS: Record<Muscle, readonly Sculpt[]> = {
  arms: [
    { center: [.278, 1.385, .018], radius: [.092, .098, .11], offset: [.013, .005, -.001], bilateral: true },
    { center: [.309, 1.31, .058], radius: [.091, .111, .090], offset: [.008, .001, .018], bilateral: true },
    { center: [.313, 1.31, -.033], radius: [.088, .103, .086], offset: [.008, .001, -.012], bilateral: true },
    { center: [.423, 1.193, .117], radius: [.067, .074, .112], offset: [.008, 0, .007], bilateral: true },
  ],
  core: [
    // Paired rectus bellies over a broad abdominal wall; leave the midline
    // and transverse intersections softer than the contracting muscle.
    { center: [.048, 1.225, .137], radius: [.053, .043, .077], offset: [0, 0, .012], bilateral: true },
    { center: [.046, 1.175, .136], radius: [.052, .043, .077], offset: [0, 0, .013], bilateral: true },
    { center: [.044, 1.125, .133], radius: [.051, .046, .077], offset: [0, 0, .010], bilateral: true },
    { center: [.053, 1.176, .112], radius: [.064, .143, .107], offset: [0, 0, .006], bilateral: true },
    { center: [.107, 1.137, .076], radius: [.095, .145, .115], offset: [.006, 0, .004], bilateral: true },
  ],
  legs: [
    { center: [.130, .779, .087], radius: [.106, .221, .130], offset: [.007, 0, .021], bilateral: true },
    { center: [.153, .765, -.085], radius: [.103, .189, .114], offset: [.008, 0, -.015], bilateral: true },
    { center: [.171, .392, -.038], radius: [.093, .162, .115], offset: [.008, 0, -.017], bilateral: true },
  ],
  back: [
    { center: [.116, 1.391, -.116], radius: [.116, .153, .114], offset: [.011, .004, -.017], bilateral: true },
    { center: [.146, 1.283, -.091], radius: [.114, .156, .114], offset: [.016, 0, -.012], bilateral: true },
    // Latissimus wraps toward the flank; trapezius stays below the neck.
    { center: [.165, 1.30, -.036], radius: [.092, .130, .095], offset: [.012, .001, -.004], bilateral: true },
    { center: [.085, 1.45, -.078], radius: [.087, .073, .090], offset: [.004, .003, -.007], bilateral: true },
  ],
};

const groups = Object.keys(SCULPTS) as Muscle[];
const fitted = new Set(['BODYFORGE_Body', 'BODYFORGE_SkinNipples', 'BODYFORGE_Shirt', 'BODYFORGE_Shorts', 'BODYFORGE_ChestMark']);
type Surface = { positions: THREE.BufferAttribute; normals: THREE.BufferAttribute; rest: Float32Array; normalsAtRest: Float32Array };

export function createAvatarPhysique(root: THREE.Object3D): (muscles: Partial<Record<Muscle, number>>) => void {
  const surfaces: Surface[] = [];
  root.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh) || !fitted.has(node.name)) return;
    const positions = node.geometry.getAttribute('position');
    const normals = node.geometry.getAttribute('normal');
    if (!positions || !normals || positions.count !== normals.count) return;
    // Compact GLBs use normalized integer normals. Decode once before writing
    // any sculpted normals, and keep position/index/UV/weights correspondence.
    const read = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
      const copy = new Float32Array(attribute.count * 3);
      for (let i = 0; i < attribute.count; i++) copy.set([attribute.getX(i), attribute.getY(i), attribute.getZ(i)], i * 3);
      return copy;
    };
    const rest = read(positions);
    const normalsAtRest = read(normals);
    const moved = new THREE.Float32BufferAttribute(rest.slice(), 3);
    const rotated = new THREE.Float32BufferAttribute(normalsAtRest.slice(), 3);
    node.geometry.setAttribute('position', moved);
    node.geometry.setAttribute('normal', rotated);
    surfaces.push({ positions: moved, normals: rotated, rest, normalsAtRest });
  });

  let previous = '0,0,0,0';
  const j = new Float64Array(9);
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  return muscles => {
    const levels = groups.map(group => {
      const level = muscles[group] ?? 0;
      return Number.isFinite(level) ? THREE.MathUtils.clamp(level, 0, 5) / 5 : 0;
    });
    const signature = levels.join(',');
    if (signature === previous) return;
    previous = signature;
    const active = groups.flatMap((group, i) => levels[i] === 0 ? [] : SCULPTS[group].map(sculpt => ({ ...sculpt, weight: levels[i] })));
    for (const { positions, normals, rest, normalsAtRest } of surfaces) {
      for (let i = 0; i < positions.count; i++) {
        const offset = i * 3;
        const x = rest[offset], y = rest[offset + 1], z = rest[offset + 2];
        let dx = 0, dy = 0, dz = 0;
        j.fill(0); j[0] = j[4] = j[8] = 1;
        for (const { center, radius, offset: delta, bilateral, weight } of active) {
          const side = bilateral && x < 0 ? -1 : 1;
          const [rx, ry, rz] = radius;
          const u = (x - side * center[0]) / rx;
          const v = (y - center[1]) / ry;
          const w = (z - center[2]) / rz;
          const falloff = 1 - u * u - v * v - w * w;
          if (falloff <= 0) continue;
          const a = side * delta[0], b = delta[1], c = delta[2];
          const amount = weight * falloff ** 3;
          dx += a * amount; dy += b * amount; dz += c * amount;
          const derivative = -6 * weight * falloff * falloff;
          const gx = derivative * u / rx, gy = derivative * v / ry, gz = derivative * w / rz;
          j[0] += a * gx; j[1] += a * gy; j[2] += a * gz;
          j[3] += b * gx; j[4] += b * gy; j[5] += b * gz;
          j[6] += c * gx; j[7] += c * gy; j[8] += c * gz;
        }
        positions.setXYZ(i, x + dx, y + dy, z + dz);
        normal.fromArray(normalsAtRest, offset);
        if (dx !== 0 || dy !== 0 || dz !== 0) {
          // Transform the original normal instead of welding or averaging UV
          // seams. Identical bind positions get identical displacement.
          normalMatrix.set(j[0], j[1], j[2], j[3], j[4], j[5], j[6], j[7], j[8]).invert().transpose();
          normal.applyMatrix3(normalMatrix).normalize();
        }
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      positions.needsUpdate = normals.needsUpdate = true;
    }
  };
}
