import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createAvatarPhysique } from './avatarPhysique';
import { disposeThreeTree } from './threeResources';
import type { Muscle } from './game';

async function athlete() {
  const bytes = Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
  return (await new GLTFLoader().parseAsync(bytes.buffer, '')).scene;
}

function positions(root: THREE.Object3D, name: string) {
  return (root.getObjectByName('BODYFORGE_' + name) as THREE.SkinnedMesh).geometry.getAttribute('position');
}

function range(before: ArrayLike<number>, after: ArrayLike<number>, region = (_i: number) => true) {
  let maximum = 0, count = 0;
  for (let i = 0; i < before.length; i += 3) {
    if (!region(i)) continue;
    const delta = Math.hypot(after[i] - before[i], after[i + 1] - before[i + 1], after[i + 2] - before[i + 2]);
    maximum = Math.max(delta, maximum);
    if (delta > .0001) count++;
  }
  return { maximum, count };
}

describe('athlete sculpt on the actual compact GLB', () => {
  it('keeps four independent shapes on the intended body regions and their fitted garments', async () => {
    const root = await athlete();
    try {
      const sculpt = createAvatarPhysique(root);
      const body = positions(root, 'Body');
      const baseline = Array.from(body.array);
      const testCases: readonly [Muscle, string, (i: number) => boolean][] = [
        ['arms', 'Shirt', i => Math.abs(baseline[i]) > .26 && baseline[i + 1] > 1.21],
        ['core', 'Shirt', i => Math.abs(baseline[i]) < .19 && baseline[i + 1] > 1.08 && baseline[i + 1] < 1.28 && baseline[i + 2] > .04],
        ['legs', 'Shorts', i => baseline[i + 1] > .22 && baseline[i + 1] < .91],
        ['back', 'Shirt', i => Math.abs(baseline[i]) < .24 && baseline[i + 1] > 1.25 && baseline[i + 2] < -.06],
      ];
      for (const [group, clothing, inside] of testCases) {
        const garment = positions(root, clothing);
        const originalGarment = Array.from(garment.array);
        sculpt({ [group]: 2 });
        const mid = range(baseline, body.array, inside);
        sculpt({ [group]: 5 });
        const max = range(baseline, body.array, inside);
        expect(max.count, group).toBeGreaterThan(100);
        expect(max.maximum, group).toBeGreaterThan(.004);
        expect(mid.maximum / max.maximum, group).toBeCloseTo(.4, 4);
        expect(range(originalGarment, garment.array).maximum, clothing).toBeGreaterThan(.003);
        const previous = Array.from(body.array);
        sculpt({ [group]: 5 });
        expect(Array.from(body.array)).toEqual(previous);
        sculpt({});
        expect(Array.from(body.array)).toEqual(baseline);
      }
    } finally { disposeThreeTree(root); }
  });

  it('preserves skin weights, eyes, fingers and shoe vertices at combined maximum', async () => {
    const root = await athlete();
    try {
      const body = root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const weights = body.geometry.getAttribute('skinWeight');
      const before = Array.from(positions(root, 'Body').array);
      const fixed = ['Eyes', 'Lips', 'Shoes', 'NailsHands'].map(name => [name, positions(root, name)] as const);
      const sculpt = createAvatarPhysique(root);
      sculpt({ arms: 5, core: 5, legs: 5, back: 5 });
      const after = positions(root, 'Body').array;
      expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      for (const [name, attr] of fixed) expect(positions(root, name)).toBe(attr);
      expect(range(before, after, i => before[i + 1] > 1.55 || before[i + 1] < .17 || Math.abs(before[i]) > .50).maximum).toBe(0);
      const normals = body.geometry.getAttribute('normal');
      expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
      expect(range(before, after).maximum).toBeLessThan(.04);
    } finally { disposeThreeTree(root); }
  });
});
