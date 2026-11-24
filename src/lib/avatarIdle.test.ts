import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { AvatarIdleClock, createAvatarIdle, sampleAvatarIdle } from './avatarIdle';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarPhysique } from './avatarPhysique';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import recipe from './avatarGarmentSeams.json';
import { disposeThreeTree } from './threeResources';

const zero=sampleAvatarIdle(0);
const max={arms:5,core:5,legs:5,back:5};
const protectedNames=['head','wristL','wristR','footL','footR'];
const linear=[0,1,2,4,5,6,8,9,10];

async function athlete() {
  const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
  const {scene:root}=await new GLTFLoader().parseAsync(bytes.buffer,'');
  applyAthleticPose(root);
  return root;
}
function protectedBasis(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return protectedNames.map(name=>linear.map(i=>root.getObjectByName(name)!.matrixWorld.elements[i]));
}
function sampleVertices(mesh: THREE.SkinnedMesh, indices: number[]) {
  return indices.map(i=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
}
function weighted(mesh: THREE.SkinnedMesh, name: string) {
  const bone=mesh.skeleton.bones.findIndex(b=>b.name===name);
  expect(bone).toBeGreaterThanOrEqual(0);
  const j=mesh.geometry.getAttribute('skinIndex'), w=mesh.geometry.getAttribute('skinWeight');
  return Array.from({length:j.count},(_,i)=>i).filter(i=>
    [0,1,2,3].some(k=>j.getComponent(i,k)===bone&&w.getComponent(i,k)>.65));
}
const average=(values:number[])=>values.reduce((a,b)=>a+b,0)/values.length;

describe('bounded idle animation',()=>{
  it('keeps the breath and blink deterministic, bounded and time-based',()=>{
    expect(zero).toEqual({breath:0,lean:0,headYaw:0,headTilt:0,gaze:0,blink:0});
    expect(sampleAvatarIdle(NaN)).toEqual(zero);
    expect(sampleAvatarIdle(2.016).breath).toBeCloseTo(1,6);
    expect(sampleAvatarIdle(4.8).breath).toBe(0);
    expect(sampleAvatarIdle(2.46).blink).toBe(1);
    expect(sampleAvatarIdle(2.7).blink).toBe(0);
    for(let t=0;t<35;t+=.013){
      const p=sampleAvatarIdle(t);
      expect(p.breath).toBeGreaterThanOrEqual(0);
      expect(p.breath).toBeLessThanOrEqual(1);
      expect(p.blink).toBeGreaterThanOrEqual(0);
      expect(p.blink).toBeLessThanOrEqual(1);
      expect(Object.values(p).every(n=>Number.isFinite(n)&&Math.abs(n)<=1.0000001)).toBe(true);
    }
  });
  it('limits the target cadence and never catches up a suspended page',()=>{
    const clock=new AvatarIdleClock();
    expect(clock.tick(0)).toBeUndefined();
    expect(clock.tick(16.6)).toBeUndefined();
    expect(clock.tick(33.3)).toBeUndefined();
    expect(clock.tick(50)).toBeCloseTo(.05);
    expect(clock.tick(100)).toBeCloseTo(.1);
    expect(clock.tick(3000)).toBeCloseTo(.35);
    clock.reset();
    expect(clock.tick(3100)).toBeUndefined();
    expect(clock.tick(3150)).toBeCloseTo(.05);
  });
  it('moves both actual eyelids and eye surfaces while preserving the existing rig',async()=>{
    const root=await athlete();
    try{
      const idle=createAvatarIdle(root)!;
      expect(idle).toBeDefined();
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const eyes=root.getObjectByName('BODYFORGE_Eyes') as THREE.SkinnedMesh;
      const positions=body.geometry.getAttribute('position'), weights=body.geometry.getAttribute('skinWeight');
      const groups=['orbicularis03L','orbicularis04L','orbicularis03R','orbicularis04R'].map(n=>weighted(body,n));
      expect(groups.every(ids=>ids.length>40)).toBe(true);
      const eyeIds=weighted(eyes,'eyeL').filter((_,i)=>i%4===0);
      applyAvatarGrowth(root,{});
      root.updateMatrixWorld(true);
      const neutral=groups.map(ids=>sampleVertices(body,ids));
      const eyeNeutral=sampleVertices(eyes,eyeIds);
      idle.pose({...zero,blink:1,gaze:.7});
      applyAvatarGrowth(root,{});
      root.updateMatrixWorld(true);
      const moved=groups.map(ids=>sampleVertices(body,ids));
      for(let i=0;i<groups.length;i++){
        const dy=average(moved[i].map((p,j)=>p.y-neutral[i][j].y));
        if(i%2===0)expect(dy).toBeLessThan(-.001);
        else expect(dy).toBeGreaterThan(.0003);
      }
      const eyeMoved=sampleVertices(eyes,eyeIds);
      expect(Math.max(...eyeMoved.map((p,i)=>p.distanceTo(eyeNeutral[i])))).toBeGreaterThan(.0002);
      expect(body.geometry.getAttribute('position')).toBe(positions);
      expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      idle.reset();
      applyAvatarGrowth(root,{});
      root.updateMatrixWorld(true);
      groups.forEach((ids,i)=>sampleVertices(body,ids).forEach((v,j)=>expect(v.distanceTo(neutral[i][j])).toBeLessThan(1e-8)));
    }finally{disposeThreeTree(root);}
  });
  it('retains maximum-growth anatomy, fitted hems and exact neutral pose over repeated breaths',async()=>{
    const root=await athlete();
    try{
      const garments=recipe.garments.map(spec=>root.getObjectByName(spec.name) as THREE.SkinnedMesh);
      const seams=createAvatarGarmentSeams(garments)!;
      const sculpt=createAvatarPhysique(root,true);
      const idle=createAvatarIdle(root)!;
      expect(idle).toBeDefined();
      sculpt(max);
      applyAvatarGrowth(root,max);
      seams.update(root);
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const positions=body.geometry.getAttribute('position'), weights=body.geometry.getAttribute('skinWeight');
      const original=Array.from(positions.array);
      const neutral=protectedBasis(root);
      const chest=root.getObjectByName('spine01')!;
      const chestRest=chest.matrixWorld.determinant();
      const pose=sampleAvatarIdle(2.016);
      idle.pose(pose);
      applyAvatarGrowth(root,{},0);
      const unscaled=protectedBasis(root);
      applyAvatarGrowth(root,max,pose.breath);
      const grown=protectedBasis(root);
      grown.forEach((values,i)=>values.forEach((v,j)=>expect(v).toBeCloseTo(unscaled[i][j],8)));
      expect(chest.matrixWorld.determinant()).toBeGreaterThan(chestRest*1.02);
      for(let frame=0;frame<24;frame++){
        const sample=sampleAvatarIdle(frame/6);
        idle.pose(sample); applyAvatarGrowth(root,max,sample.breath); seams.update(root);
        for(const [i,garment] of garments.entries()){
          const mesh=garment.getObjectByName('BF_GarmentSeams_'+garment.name) as THREE.Mesh;
          const p=mesh.geometry.getAttribute('position');
          const a=garment.getVertexPosition(recipe.garments[i].loops[0].vertices[0],new THREE.Vector3());
          const centre=new THREE.Vector3();
          for(let k=0;k<6;k++)centre.add(new THREE.Vector3().fromBufferAttribute(p,k));
          expect(centre.divideScalar(6).distanceTo(a)).toBeCloseTo(.0009,5);
        }
      }
      idle.reset(); applyAvatarGrowth(root,max); seams.update(root);
      protectedBasis(root).forEach((values,i)=>values.forEach((v,j)=>expect(v).toBeCloseTo(neutral[i][j],8)));
      expect(Array.from(positions.array)).toEqual(original);
      expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      expect(createAvatarIdle(new THREE.Group())).toBeUndefined();
    }finally{disposeThreeTree(root);}
  });
});
