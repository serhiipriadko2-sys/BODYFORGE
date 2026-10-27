import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeThreeTree } from './threeResources';
import { maskAthleteOcclusion } from './avatarOcclusion';

async function fixture(file: string) {
  const bytes = readFileSync('public/assets/' + file);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

describe('scalp-fitted groom exported from Blender', () => {
  it('preserves the existing anatomy, UVs, weights, clothing and bind pose', async () => {
    const previous = await fixture('bodyforge-athlete-realistic.glb');
    const next = await fixture('bodyforge-athlete-detail.glb');
    previous.updateMatrixWorld(true); next.updateMatrixWorld(true);
    const beforeRig = (previous.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh).skeleton;
    const afterRig = (next.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh).skeleton;
    let restError = 0, inverseError = 0;
    beforeRig.bones.forEach((bone, index) => {
      bone.matrixWorld.elements.forEach((value, axis) => {
        restError = Math.max(restError, Math.abs(value - afterRig.bones[index].matrixWorld.elements[axis]));
        inverseError = Math.max(inverseError, Math.abs(beforeRig.boneInverses[index].elements[axis] - afterRig.boneInverses[index].elements[axis]));
      });
    });
    expect(restError).toBeLessThan(.00001);
    expect(inverseError).toBeLessThan(.00001);
    previous.traverse((node) => {
      if (!(node instanceof THREE.SkinnedMesh) || /^BODYFORGE_(Hair_|Brows)/.test(node.name)) return;
      const revised = next.getObjectByName(node.name) as THREE.SkinnedMesh;
      expect(revised).toBeInstanceOf(THREE.SkinnedMesh);
      expect(revised.skeleton.bones.map(b => b.name)).toEqual(node.skeleton.bones.map(b => b.name));
      const a = node.geometry, b = revised.geometry;
      expect(b.index!.count).toBe(a.index!.count);
      for (const attribute of ['position', 'uv', 'skinWeight', 'skinIndex']) {
        const av = a.getAttribute(attribute), bv = b.getAttribute(attribute);
        if (!av) continue;
        let maxError = 0;
        for (let corner = 0; corner < a.index!.count; corner++) {
          const ai = a.index!.getX(corner), bi = b.index!.getX(corner);
          for (let axis = 0; axis < av.itemSize; axis++) {
            maxError = Math.max(maxError, Math.abs(Number(av.array[ai * av.itemSize + axis]) - Number(bv.array[bi * bv.itemSize + axis])));
          }
        }
        expect(maxError, node.name + '/' + attribute).toBeLessThan(attribute === 'skinIndex' ? .5 : .00001);
      }
    });
    expect(maskAthleteOcclusion(next).removedTriangles).toBeGreaterThan(18000);
    const shirt = next.getObjectByName('BODYFORGE_Shirt') as THREE.Mesh;
    const brows = next.getObjectByName('BODYFORGE_Brows') as THREE.Mesh;
    const emblem = next.getObjectByName('BODYFORGE_ChestMark') as THREE.Mesh;
    expect(shirt.material).not.toBe(brows.material);
    expect(shirt.material).not.toBe(emblem.material);
    expect((shirt.material as THREE.MeshStandardMaterial).roughness).toBeGreaterThanOrEqual(.78);
    disposeThreeTree(previous); disposeThreeTree(next);
  });

  it('keeps three opaque, varied, outward-facing head-bound grooms within the existing download budget', async () => {
    const root = await fixture('bodyforge-athlete-detail.glb');
    expect(root.getObjectByName('BODYFORGE_Body')!.userData.BODYFORGE_groom).toBe('v2');
    for (const style of ['buzz', 'crop', 'swept']) {
      const mesh = root.getObjectByName('BODYFORGE_Hair_' + style) as THREE.SkinnedMesh;
      const p = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
      const w = mesh.geometry.getAttribute('skinWeight'), j = mesh.geometry.getAttribute('skinIndex');
      const n = mesh.geometry.getAttribute('normal');
      expect(p.count).toBeLessThan(9000);
      expect(uv.count).toBe(p.count);
      let outward = 0;
      for (let i = 0; i < p.count; i++) {
        expect(w.getX(i)).toBe(1);
        expect(mesh.skeleton.bones[j.getX(i)].name).toBe('head');
        expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
        if (style !== 'buzz') expect(uv.getX(i)).toBeGreaterThanOrEqual(style === 'crop' ? -.001 : .499);
        if (style !== 'buzz') expect(uv.getX(i)).toBeLessThanOrEqual(style === 'crop' ? .501 : 1.001);
        if (p.getX(i) * n.getX(i) + (p.getY(i) - 1.69) * n.getY(i) + (p.getZ(i) - .045) * n.getZ(i) > 0) outward++;
      }
      if (style === 'buzz') expect(outward / p.count).toBeGreaterThan(.90);
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox!.max.y).toBeLessThan(1.84);
      expect(mesh.geometry.boundingBox!.min.y).toBeGreaterThan(1.62);
      expect(mesh.material).toMatchObject({ transparent: false });
      if (style !== 'buzz') expect(mesh.userData.BODYFORGE_sourceHair).toBe(style === 'crop' ? 'short04' : 'short02');
    }
    expect(readFileSync('public/assets/bodyforge-athlete-detail.glb').byteLength).toBeLessThan(7_000_000);
    const payload = ['bodyforge-athlete-detail.glb', 'athlete-hair.png', 'athlete-hair-normal.png',
      'athlete-skin-detail.jpg', 'athlete-eyes.jpg', 'athlete-normal.png', 'athlete-orm.png'];
    expect(payload.reduce((sum, file) => sum + readFileSync('public/assets/' + file).byteLength, 0)).toBeLessThan(8_200_000);
    disposeThreeTree(root);
  });
});
