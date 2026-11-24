import * as THREE from 'three';

export interface AvatarIdlePose {
  breath: number;
  lean: number;
  headYaw: number;
  headTilt: number;
  gaze: number;
  blink: number;
}
const neutral: AvatarIdlePose = { breath: 0, lean: 0, headYaw: 0, headTilt: 0, gaze: 0, blink: 0 };

const smooth = (t: number) => THREE.MathUtils.smoothstep(t, 0, 1);

/** Deterministic asymmetric blink, with a brief closed phase. All times in
 * seconds, not frame counts: display refresh rate cannot change the motion. */
export function sampleAvatarIdle(seconds: number): AvatarIdlePose {
  if (!Number.isFinite(seconds) || seconds <= 0) return { ...neutral };
  const breathPhase = seconds % 4.8 / 4.8;
  const breath = breathPhase < .42 ? smooth(breathPhase/.42) : 1-smooth((breathPhase-.42)/.58);
  const cycle = seconds % 17.3;
  let blink = 0;
  for (const start of [2.35, 6.7, 10.85, 11.33, 15.2]) {
    const dt = cycle - start;
    if (dt >= 0 && dt < .27) {
      blink = Math.max(blink, dt < .095 ? smooth(dt/.095) : dt < .135 ? 1 : 1-smooth((dt-.135)/.135));
    }
  }
  return {
    breath,
    lean: Math.sin(seconds * .57),
    headYaw: Math.sin(seconds * .71) * .65 + Math.sin(seconds * .29) * .35,
    headTilt: Math.sin(seconds * .43),
    gaze: Math.sin(seconds * 1.12) * .55 + Math.sin(seconds * .39) * .45,
    blink,
  };
}

interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
}
export interface AvatarIdleRig {
  pose(sample: AvatarIdlePose): void;
  reset(): void;
}

const names = ['spine02','spine01','neck02','upperarm01l','upperarm01r','eyel','eyer',
  'orbicularis03l','orbicularis03r','orbicularis04l','orbicularis04r'] as const;
type JointName = typeof names[number];

/** Build from the unscaled athletic pose of the pinned model, before growth.
 * All offsets are authored in character axes then converted into each bone's
 * own local frame. No animation may rewrite rest geometry or skin weights. */
export function createAvatarIdle(root: THREE.Object3D): AvatarIdleRig | undefined {
  const body = root.getObjectByName('BODYFORGE_Body');
  if (!(body instanceof THREE.SkinnedMesh) || body.userData.BODYFORGE_groom !== 'v2' ||
      body.geometry.getAttribute('position')?.count !== 65895) return undefined;
  root.updateWorldMatrix(true,true);
  const joints = new Map<JointName, Joint>();
  for (const name of names) {
    const matches = body.skeleton.bones.filter(bone => bone.name.replace(/[^a-z0-9]/gi,'').toLowerCase() === name);
    if (matches.length !== 1 || !matches[0].matrixAutoUpdate) return undefined;
    const bone=matches[0];
    const inverse=bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    joints.set(name, {bone,rest:bone.quaternion.clone(),
      x:new THREE.Vector3(1,0,0).applyQuaternion(inverse),
      y:new THREE.Vector3(0,1,0).applyQuaternion(inverse),
      z:new THREE.Vector3(0,0,1).applyQuaternion(inverse)});
  }
  const delta = new THREE.Quaternion();
  const rotate = (name: JointName, x: number, y: number, z: number) => {
    const joint=joints.get(name)!;
    joint.bone.quaternion.copy(joint.rest)
      .multiply(delta.setFromAxisAngle(joint.x,x))
      .multiply(delta.setFromAxisAngle(joint.y,y))
      .multiply(delta.setFromAxisAngle(joint.z,z)).normalize();
  };
  const signed = (n:number) => Number.isFinite(n) ? THREE.MathUtils.clamp(n,-1,1) : 0;
  const unsigned = (n:number) => Math.max(0,signed(n));
  return {
    pose(sample) {
      const breath=unsigned(sample.breath), lean=signed(sample.lean);
      const yaw=signed(sample.headYaw), tilt=signed(sample.headTilt);
      const gaze=signed(sample.gaze), blink=unsigned(sample.blink);
      rotate('spine02',-.011*breath,0,.005*lean);
      rotate('spine01',.005*breath,.006*lean,0);
      rotate('neck02',.009*tilt,.035*yaw,-.010*lean);
      rotate('upperarm01l',0,0,.008*breath);
      rotate('upperarm01r',0,0,-.008*breath);
      rotate('eyel',0,.043*gaze,0);
      rotate('eyer',0,.043*gaze,0);
      // Both eyelid pivots were verified at the eyeball centre. Positive
      // character-X rotation lowers the front of the upper lid.
      rotate('orbicularis03l',.32*blink,0,0);
      rotate('orbicularis03r',.32*blink,0,0);
      rotate('orbicularis04l',-.105*blink,0,0);
      rotate('orbicularis04r',-.105*blink,0,0);
    },
    reset() {
      for (const joint of joints.values()) joint.bone.quaternion.copy(joint.rest);
    },
  };
}

/** One live 20 Hz target, no catch-up bursts after suspend/slow frames. */
export class AvatarIdleClock {
  private previous: number | undefined;
  private elapsed = 0;
  reset(): void { this.previous=undefined; this.elapsed=0; }
  tick(now: number): number | undefined {
    if (!Number.isFinite(now)) return undefined;
    if (this.previous === undefined || now < this.previous) {
      this.previous=now;
      return undefined;
    }
    const gap=now-this.previous;
    if (gap<49) return undefined;
    this.previous=now;
    this.elapsed+=Math.min(gap,250)/1000;
    return this.elapsed;
  }
}
