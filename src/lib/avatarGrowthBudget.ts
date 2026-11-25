import * as THREE from 'three';
import type { Muscle } from './game';

type Levels = Partial<Record<Muscle, number>>;
type Joint = { name: string; bone: THREE.Bone; scale: THREE.Vector3; neutral: THREE.Matrix4 };
const rigs = new WeakMap<THREE.Object3D, Joint[]>();
const protectedNames = new Set(['head', 'wristl', 'wristr', 'footl', 'footr']);
const key = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clampLevel = (v: number | undefined) =>
  typeof v === 'number' && Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 5) : 0;
const targetNames = [
  'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head',
  ...['l', 'r'].flatMap(s => ['breast','clavicle','shoulder01','upperarm01','upperarm02',
    'lowerarm01','lowerarm02','wrist','upperleg01','upperleg02','lowerleg01','lowerleg02','foot'].map(n => n+s)),
];

/** Absolute cross-section budgets in each bone's current unscaled basis.
 * These artistic coefficients are not physiological growth predictions.
 * A child's budget never multiplies by the parent's radial budget. */
function radial(name: string, a: number, c: number, l: number, b: number): number {
  if (protectedNames.has(name)) return 1;
  if (name.startsWith('upperarm')) return 1 + .018*a;
  if (name.startsWith('lowerarm')) return 1 + .009*a;
  if (name.startsWith('upperleg')) return 1 + .019*l;
  if (name.startsWith('lowerleg')) return 1 + .009*l;
  if (name.startsWith('clavicle') || name.startsWith('shoulder')) return 1 + .008*b + .004*a;
  if (name === 'spine05') return 1 + .009*b;
  if (name === 'spine04') return 1 + .013*b + .007*c;
  if (name === 'spine03') return 1 + .015*b + .009*c;
  if (name === 'spine02' || name === 'spine01' || name.startsWith('breast')) return 1 + .016*b + .009*c;
  if (name === 'neck01') return 1 + .005*b;
  if (name === 'neck02') return 1 + .002*b;
  return 1;
}

function bind(root: THREE.Object3D): Joint[] | undefined {
  const body = root.getObjectByName('BODYFORGE_Body');
  if (!(body instanceof THREE.SkinnedMesh) || body.userData.BODYFORGE_groom !== 'v2' ||
      body.geometry.getAttribute('position')?.count !== 65895) return;
  const bones = new Set(body.skeleton.bones), seen = new Set<string>(), joints: Joint[] = [];
  root.traverse(node => {
    if (!(node instanceof THREE.Bone) || !bones.has(node)) return;
    const name = key(node.name);
    if (!targetNames.includes(name) || seen.has(name) || !node.matrixAutoUpdate) return;
    seen.add(name);
    joints.push({ name, bone: node, scale: node.scale.clone(), neutral: new THREE.Matrix4() });
  });
  if (joints.length !== targetNames.length ||
      targetNames.some(name => body.skeleton.bones.filter(bone => key(bone.name) === name).length !== 1)) return;
  rigs.set(root, joints);
  return joints;
}

/** Pinned compact rig only. Restore the current posed baseline every call,
 * then assign independent world-space linear transforms in hierarchy order.
 * Joint origins follow the grown parent; local pose quaternions, bind
 * matrices and all geometry attributes are kept intact. */
export function applyBoundedAvatarGrowth(root: THREE.Object3D, levels: Levels, breath: number): boolean {
  const joints = rigs.get(root) ?? bind(root);
  if (!joints) return false;
  const a = clampLevel(levels.arms), c = clampLevel(levels.core);
  const l = clampLevel(levels.legs), b = clampLevel(levels.back);
  const inhalation = Number.isFinite(breath) ? THREE.MathUtils.clamp(breath, 0, 1) : 0;
  for (const joint of joints) {
    joint.bone.scale.copy(joint.scale);
    joint.bone.matrixAutoUpdate = true;
    joint.bone.matrixWorldNeedsUpdate = true;
  }
  root.updateWorldMatrix(true, true);
  for (const joint of joints) joint.neutral.copy(joint.bone.matrixWorld);

  const desired = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const origin = new THREE.Vector3(), scale = new THREE.Vector3();
  for (const { name, bone, neutral } of joints) {
    // Traversal order is parent-first, so this origin already follows the
    // corrected parent, not the previous frame's accumulated scaling.
    bone.updateWorldMatrix(false, false);
    origin.setFromMatrixPosition(bone.matrixWorld);
    const factor = radial(name, a, c, l, b);
    const thorax = name === 'spine02' ? .012 :
      name === 'spine01' || name.startsWith('breast') ? .018 : 0;
    scale.set(factor*(1+thorax*inhalation), 1, factor*(1+thorax*1.55*inhalation));
    desired.copy(neutral).scale(scale).setPosition(origin);
    bone.matrix.copy(bone.parent ? inverse.copy(bone.parent.matrixWorld).invert().multiply(desired) : desired);
    bone.matrixAutoUpdate = false;
    bone.matrixWorldNeedsUpdate = true;
    bone.updateWorldMatrix(false, false);
  }
  root.updateMatrixWorld(true);
  return true;
}
