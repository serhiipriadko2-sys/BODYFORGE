import * as THREE from 'three';
import type { AvatarIdlePose, AvatarIdleRig } from './avatarIdle';

const FACE_START = 1.425;
const FACE_END = 1.480;
const ARM_RADIANS = THREE.MathUtils.degToRad(6);
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const neutral: AvatarIdlePose = { breath: 0, lean: 0, headYaw: 0, headTilt: 0, gaze: 0, blink: 0 };

export function headWeightBlend(height: number): number {
  if (!Number.isFinite(height)) throw Error('Invalid regional height');
  const t = THREE.MathUtils.clamp((height - FACE_START) / (FACE_END - FACE_START), 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
}

/** The measured V6 donor had neck influence on the lips. Rigidly bind the
 * face, then ease the weights through the neck. Rest positions, paid morphs,
 * UVs, normals and indices are unchanged. Only the V7 review calls this. */
export function regularizeFoundationHead(mesh: THREE.SkinnedMesh): number {
  const pos = mesh.geometry.getAttribute('position');
  const joints = mesh.geometry.getAttribute('skinIndex');
  const weights = mesh.geometry.getAttribute('skinWeight');
  const head = mesh.skeleton.bones.findIndex(b => b.name === 'head');
  if (head < 0 || !pos || !(joints instanceof THREE.BufferAttribute) ||
      !(weights instanceof THREE.BufferAttribute) || weights.normalized ||
      joints.itemSize !== 4 || weights.itemSize !== 4 ||
      pos.count !== joints.count || joints.count !== weights.count) throw Error('Invalid foundation skin weights');
  let changed = 0;
  for (let i = 0; i < pos.count; i++) {
    const t = headWeightBlend(pos.getY(i));
    if (t === 0) continue;
    const ids = [joints.getX(i), joints.getY(i), joints.getZ(i), joints.getW(i)];
    const ws = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
    if (ids.some(j => !Number.isInteger(j) || j < 0 || j >= mesh.skeleton.bones.length) ||
        ws.some(w => !Number.isFinite(w) || w < 0) || Math.abs(ws.reduce((a,b) => a+b,0)-1) > 2e-5)
      throw Error('Invalid foundation vertex skinning');
    const all = new Array<number>(mesh.skeleton.bones.length).fill(0);
    for (let k = 0; k < 4; k++) all[ids[k]] += ws[k] * (1 - t);
    all[head] += t;
    const top = all.map((w, j) => ({ w, j })).sort((a,b) => b.w-a.w || b.j-a.j).slice(0,4);
    const sum = top.reduce((a,b) => a+b.w,0);
    if (!(sum > 0)) throw Error('Missing foundation skinning');
    joints.setXYZW(i, top[0].j, top[1].j, top[2].j, top[3].j);
    weights.setXYZW(i, top[0].w/sum, top[1].w/sum, top[2].w/sum, top[3].w/sum);
    changed++;
  }
  joints.needsUpdate = weights.needsUpdate = true;
  return changed;
}

const activeNames = ['upperarm_L','upperarm_R','spine','chest','neck','head'] as const;
type JointName = typeof activeNames[number];

/** Same character-axis offsets as the independent Blender V7 envelope audit.
 * Absolute rest-relative poses: no incremental drift, no new morph weights.
 * The 19-bone rig does not have eyelid or eye movement joints. */
export function createFoundationIdle(source: THREE.Group, body: THREE.SkinnedMesh): AvatarIdleRig {
  if (body.skeleton.bones.length !== 19) throw Error('Invalid foundation rig');
  source.updateMatrixWorld(true);
  const joints = new Map<JointName, { bone: THREE.Bone; rest: THREE.Quaternion; axes: THREE.Vector3[] }>();
  for (const name of activeNames) {
    const found = body.skeleton.bones.filter(b => b.name === name);
    if (found.length !== 1 || !found[0].matrixAutoUpdate) throw Error('Missing foundation joint '+name);
    const bone = found[0];
    const inverse = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    joints.set(name, { bone, rest: bone.quaternion.clone(), axes: [axisX,axisY,axisZ].map(a=>a.clone().applyQuaternion(inverse)) });
  }
  const q = new THREE.Quaternion();
  const rotate = (name: JointName, x: number, y: number, z: number) => {
    const j = joints.get(name)!;
    j.bone.quaternion.copy(j.rest)
      .multiply(q.setFromAxisAngle(j.axes[0],x))
      .multiply(q.setFromAxisAngle(j.axes[1],y))
      .multiply(q.setFromAxisAngle(j.axes[2],z)).normalize();
  };
  const signed = (n: number) => Number.isFinite(n) ? THREE.MathUtils.clamp(n,-1,1) : 0;
  const pose = (p: AvatarIdlePose) => {
    const breath = Math.max(0,signed(p.breath)), lean = signed(p.lean);
    const yaw = signed(p.headYaw), tilt = signed(p.headTilt);
    rotate('upperarm_L',0,0,-ARM_RADIANS+.006*breath);
    rotate('upperarm_R',0,0,ARM_RADIANS-.006*breath);
    rotate('spine',.003*breath,.002*lean,.0025*lean);
    rotate('chest',-.008*breath,0,.002*lean);
    rotate('neck',.003*tilt,.012*yaw,-.003*lean);
    rotate('head',.004*tilt,.012*yaw,-.002*lean);
    source.updateMatrixWorld(true);
  };
  pose(neutral);
  return { pose, reset: () => pose(neutral) };
}

/** Bounded material-only candidate: retain the donor normal maps and all
 * cosmetic colours. No procedural geometry or simulated fabric physics. */
export function tuneFoundationMaterials(source: THREE.Group): void {
  const done = new Set<THREE.Material>();
  source.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshPhysicalMaterial)) return;
    const m = node.material;
    if (done.has(m)) return;
    done.add(m);
    if (m.name === 'BF_DonorSkin_PBR_V2') {
      m.roughness = .63; m.specularIntensity = .55;
      m.normalScale.set(Math.sign(m.normalScale.x)*.85,Math.sign(m.normalScale.y)*.85); m.clearcoat = 0;
    } else if (m.name === 'BF_Foundation_Textile_V2') {
      m.roughness = .94; m.specularIntensity = .50;
      m.normalScale.set(Math.sign(m.normalScale.x)*.75,Math.sign(m.normalScale.y)*.75); m.sheen = .32; m.sheenRoughness = .82;
      m.sheenColor.setRGB(.10,.12,.15);
    } else if (m.name === 'BF_Foundation_Hair_V2') {
      m.roughness = .68; m.clearcoat = .02;
    } else if (m.name === 'BF_Foundation_Iris_V2') {
      m.roughness = .32; m.clearcoat = .18;
    } else return;
    m.needsUpdate = true;
  });
}
