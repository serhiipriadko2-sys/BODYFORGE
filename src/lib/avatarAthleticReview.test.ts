import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ATHLETIC_REVIEW_AXES, ATHLETIC_REVIEW_ID, addAvatarAthleticReviewGrowth } from './avatarAthleticReview';
import { createAvatarPhysique } from './avatarPhysique';
import { SCAN_TORSO_REVIEW_DATA } from './avatarScanTorsoReviewData';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { disposeThreeTree } from './threeResources';
import { createFighter, freshGame, upgradeMuscle, type Muscle } from './game';
import { EMPTY_PROFILE } from './progression';

const groups: Muscle[] = ['arms', 'core', 'legs', 'back'];
const read = () => new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb')).buffer, '');
const field = (group: Muscle, weight: number, x: number, y: number, z: number) => {
  const d = new Float64Array(3), j = new Float64Array(9);
  addAvatarAthleticReviewGrowth(group, weight, x, y, z, d, j);
  return { d, j };
};

describe('alternate athletic volume review', () => {
  it('has a bounded analytic Jacobian, smooth midline and reflected bilateral response', async () => {
    const { scene } = await read();
    let worst = 0, active = 0, samples = 0;
    try {
      const body = scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const p = body.geometry.getAttribute('position');
      const points: number[][] = [];
      for (let i = 0; i < p.count; i += 83) points.push([p.getX(i), p.getY(i), p.getZ(i)]);
      for (const x of [-.025, -.012, -.001, 0, .001, .012, .025])
        for (const y of [1.18, 1.30, 1.34, 1.43])
          for (const z of [-.07, .12]) points.push([x, y, z]);
      for (const group of groups) for (const [x, y, z] of points) {
        const { d, j } = field(group, 1, x, y, z);
        const mirror = field(group, 1, -x, y, z).d;
        expect(mirror[0]).toBeCloseTo(-d[0], 10);
        expect(mirror[1]).toBeCloseTo(d[1], 10);
        expect(mirror[2]).toBeCloseTo(d[2], 10);
        expect(Array.from(field(group, 0, x, y, z).d)).toEqual([0, 0, 0]);
        if (Math.hypot(...d) > 1e-5) active++;
        for (let k = 0; k < 3; k++) {
          const a: [number, number, number] = [x, y, z], b: [number, number, number] = [x, y, z];
          a[k] += 1e-6; b[k] -= 1e-6;
          const plus = field(group, 1, ...a).d, minus = field(group, 1, ...b).d;
          for (let r = 0; r < 3; r++) worst = Math.max(worst, Math.abs((plus[r] - minus[r]) / 2e-6 - j[r * 3 + k]));
          samples++;
        }
      }
      expect(active).toBeGreaterThan(100);
      expect(worst).toBeLessThan(2e-4);
      for (const group of groups) for (const p of [[0, 1.65, .12], [.20, .04, .08], [.60, 1.04, .34]] as const)
        expect(Array.from(field(group, 1, p[0], p[1], p[2]).d)).toEqual([0, 0, 0]);
      console.info('ATHLETIC_JACOBIAN', JSON.stringify({ samples, active, worst }));
    } finally { disposeThreeTree(scene); }
  });

  it.each(groups)('renders paid %s levels monotonically and resets exactly on the actual posed rig', async group => {
    const { scene } = await read();
    try {
      applyAthleticPose(scene);
      const body = scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const index = body.geometry.index, uv = body.geometry.getAttribute('uv'), skin = body.geometry.getAttribute('skinWeight');
      const sculpt = createAvatarPhysique(scene, false, false, SCAN_TORSO_REVIEW_DATA, true);
      expect(scene.userData.BODYFORGE_athleticReview).toBe(ATHLETIC_REVIEW_ID);
      const p = body.geometry.getAttribute('position');
      sculpt({});
      const baseline = Array.from(p.array);
      applyAvatarGrowth(scene, {});
      scene.updateWorldMatrix(true, true);
      const ids = Array.from({ length: p.count }, (_, i) => i).filter(i => i % 11 === 0 &&
        (group === 'arms' ? Math.abs(p.getX(i)) > .27 && p.getY(i) > 1.16 && p.getY(i) < 1.43 :
          group === 'legs' ? p.getY(i) > .25 && p.getY(i) < .91 :
          Math.abs(p.getX(i)) < .18 && p.getY(i) > 1.08 && p.getY(i) < 1.44 &&
          (group === 'core' ? p.getZ(i) > .055 : p.getZ(i) < -.055)));
      expect(ids.length).toBeGreaterThan(30);
      const posed = () => ids.map(i => body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
      const neutral = posed();
      let previous = 0;
      let profile = createFighter({ ...EMPTY_PROFILE, coins: 500, workouts: [], game: freshGame() }, 'lean', 'QA');
      for (let l = 1; l <= 5; l++) {
        profile = upgradeMuscle(profile, group);
        const snapshot = JSON.stringify(profile);
        sculpt(profile.game.muscles);
        applyAvatarGrowth(scene, profile.game.muscles);
        scene.updateWorldMatrix(true, true);
        const peak = Math.max(...posed().map((v, i) => v.distanceTo(neutral[i])));
        expect(peak).toBeGreaterThan(previous + .0001);
        expect(profile.game.muscles[group]).toBe(l);
        for (const other of groups.filter(g => g !== group)) expect(profile.game.muscles[other]).toBe(0);
        expect(JSON.stringify(profile)).toBe(snapshot);
        previous = peak;
      }
      const max = Array.from(p.array);
      sculpt(profile.game.muscles);
      expect(Array.from(p.array)).toEqual(max);
      sculpt({});
      applyAvatarGrowth(scene, {});
      scene.updateWorldMatrix(true, true);
      expect(Array.from(p.array)).toEqual(baseline);
      expect(Math.max(...posed().map((v, i) => v.distanceTo(neutral[i])))).toBeLessThan(1e-8);
      expect(body.geometry.index).toBe(index);
      expect(body.geometry.getAttribute('uv')).toBe(uv);
      expect(body.geometry.getAttribute('skinWeight')).toBe(skin);
      expect(Array.from(body.geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      console.info('ATHLETIC_PAID_LEVELS', JSON.stringify({ group, sampleVertices: ids.length, maxPosedDisplacementMm: previous * 1000 }));
    } finally { disposeThreeTree(scene); }
  }, 30000);


  it('concentrates new limb volume toward the muscle belly, protecting distal transitions', async () => {
    const { scene } = await read();
    try {
      const body = scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const p = body.geometry.getAttribute('position'), skin = body.geometry.getAttribute('skinIndex');
      const weights = body.geometry.getAttribute('skinWeight');
      for (const [group, index, prefix] of [['arms', 1, 'lowerarm'], ['legs', 1, 'lowerleg']] as const) {
        const axis = ATHLETIC_REVIEW_AXES[group][index];
        const start = new THREE.Vector3(...axis.start), u = new THREE.Vector3(...axis.end).sub(start);
        const length = u.length(); u.normalize();
        const bins = [[], [], []] as number[][];
        const rear: number[] = [], front: number[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < p.count; i++) {
          const pt = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
          if (pt.x <= 0) continue;
          const key = pt.toArray().map(v => Math.round(v * 1e6)).join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          let weight = 0;
          for (let k = 0; k < 4; k++) {
            const name = body.skeleton.bones[skin.getComponent(i, k)]?.name.toLowerCase();
            if (name?.startsWith(prefix) && name.endsWith('l')) weight += weights.getComponent(i, k);
          }
          if (weight < .60) continue;
          const r = pt.clone().sub(start), t = r.dot(u) / length;
          r.addScaledVector(u, -t * length);
          if (t < .15 || t >= .9 || r.length() < .012 || r.length() > .13) continue;
          const { d } = field(group, 1, pt.x, pt.y, pt.z);
          const delta = new THREE.Vector3(d[0], d[1], d[2]);
          delta.addScaledVector(u, -delta.dot(u));
          const mm = (r.clone().add(delta).length() - r.length()) * 1000;
          bins[t < .4 ? 0 : t < .65 ? 1 : 2].push(mm);
          if (t < .4 && r.z < -.012) rear.push(mm);
          if (t < .4 && r.z > .012) front.push(mm);
        }
        const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
        expect(bins.every(b => b.length > 100)).toBe(true);
        const [proximal, middle, distal] = bins.map(mean);
        expect(proximal).toBeGreaterThan(group === 'arms' ? 7 : 10);
        expect(proximal).toBeGreaterThan(middle);
        expect(distal).toBeGreaterThan(1);
        expect(distal).toBeLessThan(proximal * .30);
        if (group === 'legs') {
          expect(rear.length).toBeGreaterThan(20);
          expect(front.length).toBeGreaterThan(20);
          expect(mean(rear)).toBeGreaterThan(1.7 * mean(front));
        }
        console.info('ATHLETIC_TAPER', JSON.stringify({ group, samples: bins.map(b => b.length), proximal, middle, distal }));
      }
    } finally { disposeThreeTree(scene); }
  });

  it('uses the pinned anatomical axes, not a change to the skeleton', async () => {
    const { scene } = await read();
    try {
      const body = scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const names = [['upperarm01L', 'lowerarm01L'], ['lowerarm01L', 'wristL'], ['upperleg01L', 'lowerleg01L'], ['lowerleg01L', 'footL']];
      scene.updateWorldMatrix(true, true);
      for (const [i, e] of [...ATHLETIC_REVIEW_AXES.arms, ...ATHLETIC_REVIEW_AXES.legs].entries()) {
        for (const [j, p] of [e.start, e.end].entries()) {
          const bone = body.skeleton.bones.find(b => b.name === names[i][j]);
          expect(bone).toBeDefined();
          expect(bone!.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...p))).toBeLessThan(.00002);
        }
      }
    } finally { disposeThreeTree(scene); }
  });
});
