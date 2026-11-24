import * as THREE from 'three';

const posed = new WeakSet<THREE.Object3D>();

/** Rest-pose correction for the pinned MakeHuman rig, not exercise animation.
 * Rotate upper arms in WORLD space: its local bone axes are not screen axes.
 * Skin, garments and fingers keep the original weights/bind matrices. */
export function applyAthleticPose(root: THREE.Object3D): boolean {
  if (posed.has(root)) return false;
  // GLTFLoader sanitizes dots in bone names for animation property bindings.
  let left: THREE.Bone | undefined, right: THREE.Bone | undefined;
  const forearms: THREE.Bone[] = [];
  root.traverse((node) => {
    if (!(node instanceof THREE.Bone)) return;
    const key = node.name.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (key === 'upperarm01l') left = node;
    if (key === 'upperarm01r') right = node;
    if (key === 'lowerarm01l' || key === 'lowerarm01r') forearms.push(node);
  });
  if (!(left instanceof THREE.Bone) || !(right instanceof THREE.Bone)) return false;
  root.updateWorldMatrix(true, true);
  const rotate = (bone: THREE.Bone, axis: THREE.Vector3, angle: number) => {
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    const delta = new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(angle));
    bone.quaternion.copy(parent.invert().multiply(delta.multiply(world))).normalize();
    bone.updateWorldMatrix(false, true);
  };
  const shoulders = new THREE.Vector3(0, 0, 1);
  rotate(left, shoulders, -34);
  rotate(right, shoulders, 34);
  // The imported bind pose carries wrists roughly 20 cm ahead of the elbow.
  // Relax the hinge while keeping a small natural bend and every joint length.
  const elbowAxis = new THREE.Vector3(1, 0, 0);
  for (const bone of forearms) rotate(bone, elbowAxis, 30);
  posed.add(root);
  return true;
}
