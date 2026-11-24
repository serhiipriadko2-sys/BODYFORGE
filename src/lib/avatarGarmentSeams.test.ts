import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import recipe from './avatarGarmentSeams.json';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import { createGarmentFoldProfile, sampleGarmentFold } from './avatarGarmentFolds';
import { createAvatarPhysique } from './avatarPhysique';
import { applyAvatarGrowth } from './avatarGrowth';
import { applyAthleticPose } from './avatarPose';
import { disposeThreeTree } from './threeResources';

const max = {arms:5,core:5,legs:5,back:5} as const;
async function athlete() {
  const data=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
  const root=(await new GLTFLoader().parseAsync(data.buffer,'')).scene;
  const garments=recipe.garments.map(spec=>root.getObjectByName(spec.name) as THREE.SkinnedMesh);
  return {root,garments};
}
function seamMesh(garment: THREE.SkinnedMesh) {
  return garment.getObjectByName('BF_GarmentSeams_'+garment.name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
}
function assertFit(garments: THREE.SkinnedMesh[]) {
  let rings=0;
  for(const [i,garment] of garments.entries()) {
    const seam=seamMesh(garment);
    const positions=seam.geometry.getAttribute('position');
    const normal=seam.geometry.getAttribute('normal');
    let offset=0;
    for(const loop of recipe.garments[i].loops) {
      for(const source of loop.vertices) {
        const anchor=garment.getVertexPosition(source,new THREE.Vector3());
        const centre=new THREE.Vector3();
        for(let j=0;j<6;j++) {
          const p=new THREE.Vector3().fromBufferAttribute(positions,offset+j);
          expect(p.distanceTo(anchor)).toBeLessThan(.006);
          centre.add(p);
          expect(new THREE.Vector3().fromBufferAttribute(normal,offset+j).length()).toBeCloseTo(1,5);
        }
        expect(centre.multiplyScalar(1/6).distanceTo(anchor)).toBeCloseTo(.0009,5);
        offset+=6; rings++;
      }
    }
    expect(offset).toBe(positions.count);
    expect(seam.geometry.index!.count).toBe(offset*6);
  }
  expect(rings).toBe(549);
}

describe('Blender-fitted garment seams and tension folds',()=>{
  it('caps only original shirt holes, follows the evaluated rig at every level, and remains deterministic', async()=>{
    const {root,garments}=await athlete();
    try {
      const [shirt,shorts]=garments;
      const indices=Array.from(shirt.geometry.index!.array);
      const weights=shirt.geometry.getAttribute('skinWeight');
      const uv=shirt.geometry.getAttribute('uv');
      const shortIndex=shorts.geometry.index;
      const seams=createAvatarGarmentSeams(garments);
      expect(seams?.loopCount).toBe(7);
      expect(seams?.patchTriangles).toBe(62);
      expect(Array.from(shirt.geometry.index!.array).slice(0,indices.length)).toEqual(indices);
      expect(shirt.geometry.index!.count).toBe(indices.length+186);
      expect(shirt.geometry.getAttribute('skinWeight')).toBe(weights);
      expect(shirt.geometry.getAttribute('uv')).toBe(uv);
      expect(shorts.geometry.index).toBe(shortIndex);
      const positions=shirt.geometry.getAttribute('position'), normal=shirt.geometry.getAttribute('normal');
      for (const id of new Set(recipe.garments[0].patchIndices)) {
        if (Math.abs(positions.getX(id))<.14) {
          expect(normal.getZ(id)).toBeGreaterThan(.7);
          expect(new THREE.Vector3().fromBufferAttribute(normal,id).length()).toBeCloseTo(1,5);
        }
      }
      expect(createAvatarGarmentSeams(garments)).toBeUndefined();

      applyAthleticPose(root);
      const sculpt=createAvatarPhysique(root,true);
      const render=(levels:Partial<typeof max>)=>{
        sculpt(levels); applyAvatarGrowth(root,levels); seams!.update(root); assertFit(garments);
        return Array.from(seamMesh(shirt).geometry.getAttribute('position').array);
      };
      const baseline=render({});
      const grown=render(max);
      expect(grown).not.toEqual(baseline);
      expect(render(max)).toEqual(grown);
      expect(render({})).toEqual(baseline);
      root.rotation.y=2.4; root.scale.set(1.055,1,1);
      render(max);
      expect(seamMesh(shirt).geometry.getAttribute('position').array.every(Number.isFinite)).toBe(true);
    } finally {disposeThreeTree(root);}
  });
  it('fails closed before either garment is modified if a source anchor drifts',async()=>{
    const {root,garments}=await athlete();
    try {
      const [shirt,shorts]=garments, original=shirt.geometry.index;
      const positions=shorts.geometry.getAttribute('position');
      const id=recipe.garments[1].loops[0].vertices[0];
      positions.setX(id,positions.getX(id)+.01);
      expect(createAvatarGarmentSeams(garments)).toBeUndefined();
      expect(shirt.geometry.index).toBe(original);
      expect(seamMesh(shirt)).toBeUndefined();
    } finally {disposeThreeTree(root);}
  });
  it('authors bounded outward ridges and attenuates only matching tension groups',async()=>{
    const {root,garments}=await athlete();
    try {
      for(const garment of garments) {
        const p=garment.geometry.getAttribute('position');
        const rest=new Float32Array(p.count*3);
        for(let i=0;i<p.count;i++)rest.set([p.getX(i),p.getY(i),p.getZ(i)],i*3);
        const profile=createGarmentFoldProfile(garment.name,rest)!;
        const gradient=new THREE.Vector3();
        let nonzero=0, highest=0;
        for(let i=0;i<p.count;i++) {
          const height=sampleGarmentFold(profile,i,{},gradient);
          expect(height).toBeGreaterThanOrEqual(0);
          expect(height).toBeLessThanOrEqual(.0042);
          expect(gradient.length()).toBeLessThan(1);
          const grown=sampleGarmentFold(profile,i,max,gradient);
          expect(grown).toBeCloseTo(height*.45,7);
          expect(sampleGarmentFold(profile,i,garment.name.endsWith('Shirt')?{legs:5}:{arms:5,core:5,back:5},gradient)).toBe(height);
          if(height>.0001)nonzero++;
          highest=Math.max(highest,height);
        }
        expect(nonzero).toBeGreaterThan(50);
        expect(highest).toBeGreaterThan(.001);
      }
    } finally {disposeThreeTree(root);}
  });
});
