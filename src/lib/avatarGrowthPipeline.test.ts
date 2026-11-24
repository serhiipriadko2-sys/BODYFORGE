import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarPhysique } from './avatarPhysique';
import { createFighter, freshGame, MAX_MUSCLE_LEVEL, muscleCost, upgradeMuscle, type Muscle } from './game';
import { EMPTY_PROFILE } from './progression';
import { disposeThreeTree } from './threeResources';

const groups: Muscle[] = ['arms', 'core', 'legs', 'back'];

describe('purchase -> actual skinned athlete geometry', () => {
  it.each(groups)('renders each paid %s level independently, without accumulation or profile mutation', async (group) => {
    const bytes = Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
    const { scene: root } = await new GLTFLoader().parseAsync(bytes.buffer, '');
    try {
      applyAthleticPose(root);
      const deform = createAvatarPhysique(root);
      const body = root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const surface = body.geometry.getAttribute('position');
      const sample = Array.from({ length: surface.count }, (_, i) => i).filter(i => {
        const x = Math.abs(surface.getX(i)), y = surface.getY(i), z = surface.getZ(i);
        return i % 3 === 0 && (group === 'arms' ? x > .27 && y > 1.18 && y < 1.44 :
          group === 'core' ? x < .15 && y > 1.08 && y < 1.28 && z > .05 :
          group === 'legs' ? y > .25 && y < .91 :
          x < .23 && y > 1.25 && y < 1.48 && z < -.06);
      });
      expect(sample.length).toBeGreaterThan(40);
      const posed = () => sample.map(i => body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
      const render = (muscles: Partial<Record<Muscle, number>>) => {
        deform(muscles);
        applyAvatarGrowth(root, muscles);
        root.updateWorldMatrix(true, true);
        return posed();
      };
      let profile = createFighter({ ...EMPTY_PROFILE, coins: 500, workouts: [], game: freshGame() }, 'lean', 'QA');
      const baseline = render(profile.game.muscles);
      let prior = 0;
      for (let level = 1; level <= MAX_MUSCLE_LEVEL; level++) {
        const cost = muscleCost(level - 1), balance = profile.coins;
        profile = upgradeMuscle(profile, group);
        const save = JSON.stringify(profile);
        const actual = render(profile.game.muscles);
        const distance = Math.max(...actual.map((point, i) => point.distanceTo(baseline[i])));
        expect(distance).toBeGreaterThan(prior + .0001);
        expect(profile.coins).toBe(balance - cost);
        expect(profile.game.muscles[group]).toBe(level);
        for (const other of groups.filter(m => m !== group)) expect(profile.game.muscles[other]).toBe(0);
        expect(JSON.stringify(profile)).toBe(save);
        prior = distance;
      }
      expect(upgradeMuscle(profile, group)).toBe(profile);
      const repeated = render(profile.game.muscles);
      const again = render(profile.game.muscles);
      expect(Math.max(...repeated.map((point, i) => point.distanceTo(again[i])))).toBeLessThan(1e-8);
      const restored = render({});
      expect(Math.max(...restored.map((point, i) => point.distanceTo(baseline[i])))).toBeLessThan(1e-8);
    } finally { disposeThreeTree(root); }
  });
});
