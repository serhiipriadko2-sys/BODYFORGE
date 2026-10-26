import * as THREE from 'three';

const posed = new WeakSet<THREE.Object3D>();

/** Rest-pose correction for the pinned MakeHuman rig, not exercise animation.
 * Rotate upper arms in WORLD space: its local bone axes are not screen axes.
 * Skin, garments and fingers keep the original weights/bind matrices. */
export function applyAthleticPose(root: THREE.Object3D): boolean {
  if (posed.has(root)) return false;
  // GLTFLoader sanitizes dots in bone names for animation property bindings.
  let left:THREE.Bone | undefined, right:THREE.Bone | undefined;
  root.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    const key = node.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (key === 'upperarm01l') left = node;
    if (key === 'upperarm01r') right = node;
  });
  if (!(left instanceof THREE.Bone) || !(right instanceof THREE.Bone)) return false;
  root.updateWorldMatrix(true, true);
  const axis = new THREE.Vector3(0, 0, 1);
  for (const [bone, angle] of [[left, -24], [right, 24]] as const) {
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    const delta = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(angle));
    bone.quaternion.copy(parent.invert().multiply(delta.multiply(world))).normalize();
    bone.updateWorldMatrix(false, true);
  }
  posed.add(root);
  return true;
}
