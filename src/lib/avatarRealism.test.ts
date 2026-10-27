import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { importedSurfaceRole } from './avatarMaterials';
import { maskAthleteOcclusion } from './avatarOcclusion';
import { disposeThreeTree } from './threeResources';

async function fixture(file: string) {
  const b = readFileSync('public/assets/' + file);
  return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '')).scene;
}

describe('refined Blender athlete asset contract', () => {
  it('keeps the real rig, normalized weights, eye/lip roles, three head-bound haircuts and a bounded asset', async () => {
    const root = await fixture('bodyforge-athlete-realistic.glb');
    const body = root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
    expect(body.userData.BODYFORGE_realism).toBe('v1');
    expect(body.skeleton.bones).toHaveLength(163);
    let meshes = 0;
    root.traverse((node) => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      meshes++;
      const p = node.geometry.getAttribute('position'), w = node.geometry.getAttribute('skinWeight');
      expect(w.count).toBe(p.count);
      if (!['BODYFORGE_Brows', 'BODYFORGE_ChestMark'].includes(node.name)) {
        expect(node.geometry.getAttribute('uv').count).toBe(p.count);
      }
      let maxWeightError = 0, finite = true;
      for (let i = 0; i < w.count; i++) {
        maxWeightError = Math.max(maxWeightError, Math.abs(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i) - 1));
        finite &&= Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i));
      }
      expect(maxWeightError).toBeLessThan(1e-5);
      expect(finite).toBe(true);
    });
    expect(meshes).toBe(15);
    const brows = root.getObjectByName('BODYFORGE_Brows') as THREE.Mesh;
    expect(brows.geometry.getAttribute('position').count).toBeGreaterThan(1000);
    const browNormals = brows.geometry.getAttribute('normal');
    expect(Array.from({length:browNormals.count},(_,i)=>browNormals.getZ(i)>0).filter(Boolean).length / browNormals.count).toBeGreaterThan(.95);
    for (const id of ['buzz', 'crop', 'swept']) {
      const mesh = root.getObjectByName('BODYFORGE_Hair_' + id) as THREE.SkinnedMesh;
      expect(mesh.geometry.getAttribute('position').count).toBeLessThan(9000);
      const weights = mesh.geometry.getAttribute('skinWeight'), indices = mesh.geometry.getAttribute('skinIndex');
      expect(Array.from({length:weights.count}, (_,i) => weights.getX(i) === 1 && mesh.skeleton.bones[indices.getX(i)].name === 'head').every(Boolean)).toBe(true);
    }
    expect(importedSurfaceRole('BODYFORGE_Eyes', (root.getObjectByName('BODYFORGE_Eyes') as THREE.Mesh).geometry)).toBe('eyes');
    expect(importedSurfaceRole('BODYFORGE_Lips', (root.getObjectByName('BODYFORGE_Lips') as THREE.Mesh).geometry)).toBe('lips');
    expect(readFileSync('public/assets/bodyforge-athlete-realistic.glb').byteLength).toBeLessThan(7_000_000);
    expect(maskAthleteOcclusion(root).removedTriangles).toBeGreaterThan(18000);
    disposeThreeTree(root);
  });

  it('preserves per-triangle UVs and weights and confines sculpting to the head', async () => {
    const old = await fixture('bodyforge-athlete.glb'), revised = await fixture('bodyforge-athlete-realistic.glb');
    const a = (old.getObjectByName('BODYFORGE_Body') as THREE.Mesh).geometry;
    const b = (revised.getObjectByName('BODYFORGE_Body') as THREE.Mesh).geometry;
    expect(b.index!.count).toBe(a.index!.count);
    let changed = 0, outsideHead = 0, maxDistance = 0, maxUv = 0, maxWeight = 0;
    for (let i = 0; i < a.index!.count; i++) {
      const ai = a.index!.getX(i), bi = b.index!.getX(i);
      const ap = a.getAttribute('position'), bp = b.getAttribute('position');
      const distance = Math.hypot(ap.getX(ai) - bp.getX(bi), ap.getY(ai) - bp.getY(bi), ap.getZ(ai) - bp.getZ(bi));
      if (ap.getY(ai) < 1.53) outsideHead = Math.max(outsideHead, distance);
      maxDistance = Math.max(maxDistance, distance);
      if (distance > .001) changed++;
      maxUv = Math.max(maxUv, Math.abs(a.getAttribute('uv').getX(ai) - b.getAttribute('uv').getX(bi)), Math.abs(a.getAttribute('uv').getY(ai) - b.getAttribute('uv').getY(bi)));
      for (let axis = 0; axis < 4; axis++) maxWeight = Math.max(maxWeight, Math.abs(a.getAttribute('skinWeight').array[ai * 4 + axis] - b.getAttribute('skinWeight').array[bi * 4 + axis]));
    }
    expect(changed).toBeGreaterThan(1000);
    expect(outsideHead).toBeLessThan(.00005); // glTF round-trip precision.
    expect(maxDistance).toBeLessThan(.006);
    expect(maxUv).toBe(0);
    expect(maxWeight).toBeLessThan(1e-6);
    disposeThreeTree(old); disposeThreeTree(revised);
  });

  it('keeps the scalp outward-facing, rather than rendering only loose strands over a bald head', async () => {
    const root = await fixture('bodyforge-athlete-realistic.glb');
    const cap = (root.getObjectByName('BODYFORGE_Hair_buzz') as THREE.Mesh).geometry;
    const p = cap.getAttribute('position'), n = cap.getAttribute('normal');
    let outward = 0;
    for (let i = 0; i < p.count; i++) {
      const dot = p.getX(i) * n.getX(i) + (p.getY(i) - 1.70923) * n.getY(i) + (p.getZ(i) - .07756) * n.getZ(i);
      if (dot > 0) outward++;
    }
    expect(outward / p.count).toBeGreaterThan(.95);
    disposeThreeTree(root);
  });

  it('maps the visible gaze to the actual photographic pupils instead of the old black atlas corner', async () => {
    const root = await fixture('bodyforge-athlete-realistic.glb');
    const g = (root.getObjectByName('BODYFORGE_Eyes') as THREE.Mesh).geometry;
    const p = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (const side of [-1, 1]) {
      let closest = -1, distance = Infinity;
      for (let i = 0; i < p.count; i++) {
        if (p.getZ(i) < .144 || Math.sign(p.getX(i)) !== side) continue;
        const d = Math.hypot(p.getX(i) - side * .030, p.getY(i) - 1.676);
        if (d < distance) { distance = d; closest = i; }
      }
      expect(closest).toBeGreaterThan(-1);
      const centre = side > 0 ? [.70703125, .296875] : [.294921875, .708984375];
      expect(Math.hypot(uv.getX(closest) - centre[0], uv.getY(closest) - centre[1])).toBeLessThan(.035);
    }
    disposeThreeTree(root);
  });
});
