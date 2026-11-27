import * as THREE from 'three';
import type { Muscle } from './game';
import { createGarmentFoldProfile, sampleGarmentFold, type GarmentFoldProfile } from './avatarGarmentFolds';

import { MUSCLE_LOBES, addMuscleLobe } from './avatarMuscleAnatomy';
import { ATHLETIC_REVIEW_ID, addAvatarAthleticReviewGrowth } from './avatarAthleticReview';
import { MUSCLE_RELIEF_REVIEW_ID, addAvatarMuscleRelief } from './avatarMuscleReliefReview';
import { createAvatarChestMarkFit } from './avatarChestMarkFit';
import { addTorsoLandmarks } from './avatarTorsoLandmarks';
import { addAvatarScanTorsoRelief, type ScanTorsoReviewField } from './avatarScanTorsoRelief';

const groups = Object.keys(MUSCLE_LOBES) as Muscle[];
const fitted = new Set(['BODYFORGE_Body', 'BODYFORGE_SkinNipples', 'BODYFORGE_Shirt', 'BODYFORGE_Shorts', 'BODYFORGE_ChestMark']);
type Surface = { positions: THREE.BufferAttribute; normals: THREE.BufferAttribute; rest: Float32Array; normalsAtRest: Float32Array; folds?: GarmentFoldProfile };

export function createAvatarPhysique(root: THREE.Object3D, clothFolds = false, landmarks = false, scanTorso?: ScanTorsoReviewField, athleticReview = false, reliefReview = false): (muscles: Partial<Record<Muscle, number>>) => void {
  const body = root.getObjectByName('BODYFORGE_Body');
  const knownAthlete = body instanceof THREE.SkinnedMesh &&
    body.userData.BODYFORGE_groom === 'v2' && body.geometry.getAttribute('position')?.count === 65895;
  const scanField = knownAthlete ? scanTorso : undefined;
  const athletic = import.meta.env.DEV && Boolean(scanField) && athleticReview;
  if (athletic) root.userData.BODYFORGE_athleticReview = ATHLETIC_REVIEW_ID;
  const relief = import.meta.env.DEV && athletic && reliefReview;
  if (relief) root.userData.BODYFORGE_muscleReliefReview = MUSCLE_RELIEF_REVIEW_ID;
  const landmarksEnabled = landmarks && knownAthlete && !scanField;
  if (scanField) root.userData.BODYFORGE_scanTorsoRelief = scanField.id;
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
    surfaces.push({ positions: moved, normals: rotated, rest, normalsAtRest,
      folds: clothFolds ? createGarmentFoldProfile(node.name, rest) : undefined });
  });

  const fitChestMark = clothFolds ? createAvatarChestMarkFit(root) : undefined;
  let previous = clothFolds || landmarksEnabled || scanField ? '' : '0,0,0,0';
  const j = new Float64Array(9);
  const displacement = new Float64Array(3);
  const normalMatrix = new THREE.Matrix3();
  const normal = new THREE.Vector3();
  const foldGradient = new THREE.Vector3();
  return muscles => {
    const levels = groups.map(group => {
      const level = muscles[group] ?? 0;
      return Number.isFinite(level) ? THREE.MathUtils.clamp(level, 0, 5) / 5 : 0;
    });
    const coreLevel = levels[groups.indexOf('core')], backLevel = levels[groups.indexOf('back')];
    const signature = levels.join(',');
    if (signature === previous) return;
    previous = signature;
    const active = athletic ? [] : groups.flatMap((group, i) => levels[i] === 0 ? [] : MUSCLE_LOBES[group].map(lobe => ({ lobe, weight: levels[i] })));
    const activeReview = athletic ? groups.flatMap((group, i) => levels[i] === 0 ? [] : [{ group, weight: levels[i] }]) : [];
    for (const { positions, normals, rest, normalsAtRest, folds } of surfaces) {
      for (let i = 0; i < positions.count; i++) {
        const offset = i * 3;
        const x = rest[offset], y = rest[offset + 1], z = rest[offset + 2];
        displacement.fill(0);
        j.fill(0); j[0] = j[4] = j[8] = 1;
        if (landmarksEnabled) addTorsoLandmarks(x, y, z, displacement, j);
        if (scanField) addAvatarScanTorsoRelief(scanField, x, y, z, coreLevel, backLevel, displacement, j);
        for (const { lobe, weight } of active) {
          addMuscleLobe(lobe, weight, x, y, z, displacement, j);
        }
        if (athletic) for (const { group, weight } of activeReview) {
          addAvatarAthleticReviewGrowth(group, weight, x, y, z, displacement, j);
          if (relief) addAvatarMuscleRelief(group, weight, x, y, z, displacement, j);
        }
        const [dx, dy, dz] = displacement;
        normal.fromArray(normalsAtRest, offset);
        // A displacement can be zero where its spatial derivative is not.
        // The normal transforms with the Jacobian, never with displacement.
        const deformed = j[0] !== 1 || j[4] !== 1 || j[8] !== 1 ||
          j[1] !== 0 || j[2] !== 0 || j[3] !== 0 ||
          j[5] !== 0 || j[6] !== 0 || j[7] !== 0;
        if (deformed) {
          // Transform the original normal instead of welding or averaging UV
          // seams. Identical bind positions get identical displacement.
          normalMatrix.set(j[0], j[1], j[2], j[3], j[4], j[5], j[6], j[7], j[8]).invert().transpose();
          normal.applyMatrix3(normalMatrix).normalize();
        }
        const height = folds ? sampleGarmentFold(folds, i, muscles, foldGradient) : 0;
        positions.setXYZ(i, x + dx + normal.x * height, y + dy + normal.y * height, z + dz + normal.z * height);
        if (height > 0) {
          if (deformed) foldGradient.applyMatrix3(normalMatrix);
          foldGradient.addScaledVector(normal, -foldGradient.dot(normal));
          normal.sub(foldGradient).normalize();
        }
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      positions.needsUpdate = normals.needsUpdate = true;
    }
    fitChestMark?.();
  };
}
