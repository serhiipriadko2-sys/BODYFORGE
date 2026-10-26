import * as THREE from 'three';
import type { Muscle } from './game';

interface RestBone {
  bone: THREE.Bone;
  scale: THREE.Vector3;
  matrix: THREE.Matrix4;
  matrixAutoUpdate: boolean;
  protected: boolean;
}

const restRigs = new WeakMap<THREE.Object3D, RestBone[]>();
const protectedNames = new Set(['head', 'wristl', 'wristr', 'footl', 'footr']);

/**
 * Cosmetic growth for the static, posed MakeHuman rig. Call after its rest-pose
 * correction and before the first growth. Geometry, bind matrices, weights and
 * gameplay progression are unchanged. This is not an animation mixer contract:
 * a future animated rig must supply a fresh per-frame unscaled pose instead.
 *
 * Scaling ancestors otherwise enlarges the face, hands and shoes as well as
 * muscles. Preserve each protected root's complete baseline world-space linear
 * transform, while letting its origin follow the grown parent. A local affine
 * matrix is necessary: reciprocal scale alone cannot cancel rotated nonuniform
 * ancestor scale and shear. The protected bone deliberately owns its matrix;
 * Three.js skinning reads matrixWorld without decomposing it back into TRS.
 */
export function applyAvatarGrowth(root: THREE.Object3D, muscles: Partial<Record<Muscle, number>>): void {
  let rest = restRigs.get(root);
  if (!rest) {
    root.updateWorldMatrix(true, true);
    rest = [];
    root.traverse((node) => {
      if (!(node instanceof THREE.Bone)) return;
      rest!.push({
        bone: node,
        scale: node.scale.clone(),
        matrix: node.matrix.clone(),
        matrixAutoUpdate: node.matrixAutoUpdate,
        protected: protectedNames.has(node.name.replace(/[^a-z0-9]/gi, '').toLowerCase()),
      });
    });
    restRigs.set(root, rest);
  }

  // Rebuild the baseline in the current outer yaw/build/normalization context.
  // Never invert the previous compensation or multiply yesterday's growth.
  for (const item of rest) {
    item.bone.scale.copy(item.scale);
    if (item.protected) {
      item.bone.matrix.copy(item.matrix);
      item.bone.matrixAutoUpdate = item.matrixAutoUpdate;
      item.bone.matrixWorldNeedsUpdate = true;
    }
  }
  root.updateWorldMatrix(true, true);
  const protectedWorld = new Map<THREE.Bone, THREE.Matrix4>();
  for (const item of rest) {
    if (item.protected) protectedWorld.set(item.bone, item.bone.matrixWorld.clone());
  }

  const arms = muscles.arms ?? 0;
  const core = muscles.core ?? 0;
  const legs = muscles.legs ?? 0;
  const back = muscles.back ?? 0;
  for (const { bone, scale } of rest) {
    const name = bone.name.toLowerCase();
    let factor = 1;
    if (name.startsWith('upperarm')) factor = 1 + arms * .018;
    else if (name.startsWith('lowerarm')) factor = 1 + arms * .009;
    else if (name.startsWith('upperleg')) factor = 1 + legs * .019;
    else if (name.startsWith('lowerleg')) factor = 1 + legs * .009;
    else if (name === 'spine03' || name === 'spine04') factor = 1 + back * .013 + core * .008;
    else if (name === 'spine05') factor = 1 + back * .017;
    bone.scale.x = scale.x * factor;
    bone.scale.z = scale.z * factor;
  }
  root.updateWorldMatrix(true, true);

  for (const [bone, desiredWorld] of protectedWorld) {
    desiredWorld.setPosition(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld));
    bone.matrix.copy(bone.parent ? new THREE.Matrix4().copy(bone.parent.matrixWorld).invert().multiply(desiredWorld) : desiredWorld);
    bone.matrixAutoUpdate = false;
    bone.matrixWorldNeedsUpdate = true;
    bone.updateWorldMatrix(false, true);
  }
}
