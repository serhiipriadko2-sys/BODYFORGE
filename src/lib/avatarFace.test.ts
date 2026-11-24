import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import profile from './avatarFaceProfile.json';
import { applyAvatarFaceForm, tintAvatarFace } from './avatarFace';
import { createAvatarPhysique } from './avatarPhysique';
import { disposeThreeTree } from './threeResources';

async function fixture() {
  const bytes = Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(profile.sourceSha256);
  return (await new GLTFLoader().parseAsync(bytes.buffer, '')).scene;
}

function mesh(source: THREE.Group, part: string): THREE.SkinnedMesh {
  const node = source.getObjectByName('BODYFORGE_' + part);
  if (!(node instanceof THREE.SkinnedMesh)) throw new Error('Missing pinned rig part ' + part);
  return node;
}

describe('facial planes on the actual rig', () => {
  it('sculpts local face vertices while preserving bones, seams, hair, and eye geometry', async () => {
    const source = await fixture();
    try {
      const body = mesh(source, 'Body');
      const p = body.geometry.getAttribute('position');
      const weights = body.geometry.getAttribute('skinWeight');
      const uv = body.geometry.getAttribute('uv');
      const index = body.geometry.index;
      const skeleton = body.skeleton;
      const fixed = ['Eyes', 'Lips', 'Hair_crop', 'SkinEars', 'Shirt'].map(name => [name, mesh(source, name).geometry.getAttribute('position')] as const);
      const form = applyAvatarFaceForm(source);
      expect(form?.body).toBe(body.geometry);
      expect(form?.pigment.length).toBeGreaterThan(200);
      expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      expect(body.geometry.getAttribute('uv')).toBe(uv);
      expect(body.geometry.index).toBe(index);
      expect(body.skeleton).toBe(skeleton);
      for (const [name, attribute] of fixed) expect(mesh(source, name).geometry.getAttribute('position')).toBe(attribute);
      const edited = body.geometry.getAttribute('position');
      const normals = body.geometry.getAttribute('normal');
      const paired = new Map<string, string>();
      let changed = 0, max = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const delta = Math.hypot(x - edited.getX(i), y - edited.getY(i), z - edited.getZ(i));
        if (delta === 0) continue;
        expect(y).toBeGreaterThan(1.55);
        expect(y).toBeLessThan(1.72);
        expect(Math.abs(x)).toBeLessThan(.08);
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
        const point = `${x},${y},${z}`;
        const result = `${edited.getX(i)},${edited.getY(i)},${edited.getZ(i)}`;
        if (paired.has(point)) expect(result).toBe(paired.get(point));
        paired.set(point, result);
        if (delta > .00005) changed++;
        max = Math.max(max, delta);
      }
      expect(changed).toBe(2071);
      // Blender and packed WebGL positions differ by a few micrometres.
      expect(Math.abs(max - .003876)).toBeLessThan(.000005);
      expect(applyAvatarFaceForm(source)).toBeUndefined();
      expect(body.geometry.getAttribute('position')).toBe(edited);
    } finally { disposeThreeTree(source); }
  });

  it('keeps the face form as the training rest shape across growth, reset and skin changes', async () => {
    const source = await fixture();
    try {
      const body = mesh(source, 'Body');
      const face = applyAvatarFaceForm(source)!;
      const rest = body.geometry.getAttribute('position');
      const applyGrowth = createAvatarPhysique(source);
      for (const growth of [{ arms: 5, core: 5, legs: 5, back: 5 }, {}]) {
        applyGrowth(growth);
        const current = body.geometry.getAttribute('position');
        for (const { vertex } of face.pigment) {
          expect(current.getX(vertex)).toBe(rest.getX(vertex));
          expect(current.getY(vertex)).toBe(rest.getY(vertex));
          expect(current.getZ(vertex)).toBe(rest.getZ(vertex));
        }
      }
      const color = new THREE.Float32BufferAttribute(rest.count * 3, 3);
      const light = new THREE.Color('#edbf9d'), dark = new THREE.Color('#50372f');
      const [sample] = face.pigment;
      tintAvatarFace(color, face.pigment, light);
      const first = color.getX(sample.vertex);
      tintAvatarFace(color, face.pigment, dark);
      expect(color.getX(sample.vertex) / first).toBeCloseTo(dark.r / light.r, 6);
      expect(color.getX(0)).toBe(0);
    } finally { disposeThreeTree(source); }
  });

  it('declines an unknown face mesh instead of moving detached features', async () => {
    const source = await fixture();
    try {
      const body = mesh(source, 'Body');
      const rest = body.geometry.getAttribute('position');
      body.userData.BODYFORGE_groom = 'unidentified';
      expect(applyAvatarFaceForm(source)).toBeUndefined();
      expect(body.geometry.getAttribute('position')).toBe(rest);
    } finally { disposeThreeTree(source); }
  });
});
