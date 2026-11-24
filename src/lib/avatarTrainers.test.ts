import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installAvatarTrainers } from './avatarTrainers';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarPhysique } from './avatarPhysique';
import { disposeThreeTree } from './threeResources';

async function load(name: string) {
  const data = Uint8Array.from(readFileSync('public/assets/' + name));
  return (await new GLTFLoader().parseAsync(data.buffer, '')).scene;
}

describe('Blender fitted trainers', () => {
  it('fits six bounded details to the original shared rig and protects sole shape at max growth', async () => {
    const root = await load('bodyforge-athlete-efficient.glb');
    const donor = await load('bodyforge-trainers.glb');
    try {
      const shoes = root.getObjectByName('BODYFORGE_Shoes') as THREE.SkinnedMesh;
      const originalPosition = shoes.geometry.getAttribute('position');
      const originalWeights = shoes.geometry.getAttribute('skinWeight');
      const originalBind = shoes.bindMatrix.clone();
      applyAthleticPose(root);
      const sculpt = createAvatarPhysique(root);
      applyAvatarGrowth(root, {});
      expect(installAvatarTrainers(shoes, donor)).toBe(true);
      expect(donor.children).toHaveLength(0);
      const details = shoes.parent!.children.filter(node => node.name.startsWith('BF_Trainer_')) as THREE.SkinnedMesh[];
      expect(details).toHaveLength(6);
      let triangles = 0;
      for (const mesh of details) {
        expect(mesh.skeleton).toBe(shoes.skeleton);
        expect(mesh.bindMatrix.equals(originalBind)).toBe(true);
        const weights = mesh.geometry.getAttribute('skinWeight');
        const indices = mesh.geometry.getAttribute('skinIndex');
        triangles += mesh.geometry.index!.count / 3;
        for (let i = 0; i < weights.count; i++) {
          expect(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)).toBeCloseTo(1, 5);
          for (let j = 0; j < 4; j++) expect(indices.getComponent(i, j)).toBeLessThan(shoes.skeleton.bones.length);
        }
      }
      expect(triangles).toBeLessThanOrEqual(6500);
      expect(shoes.geometry.getAttribute('position')).toBe(originalPosition);
      expect(shoes.geometry.getAttribute('skinWeight')).toBe(originalWeights);

      const sole = details.find(mesh => mesh.name === 'BF_Trainer_Midsole')!;
      const pos = sole.geometry.getAttribute('position'), idx = sole.geometry.getAttribute('skinIndex');
      for (let i = 0; i < pos.count; i++) {
        const bindFoot = shoes.skeleton.boneInverses[idx.getX(i)].clone().invert();
        expect(Math.sign(bindFoot.elements[12])).toBe(Math.sign(pos.getX(i)));
      }
      const samples = Array.from({length:pos.count}, (_,i)=>i).filter(i=>pos.getX(i)>0);
      const measure = () => {
        root.updateMatrixWorld(true);
        const anchor = sole.getVertexPosition(samples[0],new THREE.Vector3()).applyMatrix4(sole.matrixWorld);
        return samples.map(i => sole.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(sole.matrixWorld).sub(anchor));
      };
      const before = measure();
      sculpt({arms:5,core:5,legs:5,back:5});
      applyAvatarGrowth(root,{arms:5,core:5,legs:5,back:5});
      const after = measure();
      expect(Math.max(...after.map((point,i)=>point.distanceTo(before[i])))).toBeLessThan(1e-6);
    } finally { disposeThreeTree(root); disposeThreeTree(donor); }
  });
  it('fails closed without adopting any detail if a donor part is missing', async () => {
    const root=await load('bodyforge-athlete-efficient.glb'), donor=await load('bodyforge-trainers.glb');
    const missing=donor.children[0]; donor.remove(missing);
    try {
      const shoes=root.getObjectByName('BODYFORGE_Shoes') as THREE.SkinnedMesh;
      expect(installAvatarTrainers(shoes,donor)).toBe(false);
      expect(shoes.parent!.children.some(node=>node.name.startsWith('BF_Trainer_'))).toBe(false);
      expect(donor.children).toHaveLength(5);
    } finally { donor.add(missing); disposeThreeTree(root); disposeThreeTree(donor); }
  });
});
