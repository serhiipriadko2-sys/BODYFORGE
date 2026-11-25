import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import { applyAvatarGarmentFit } from './avatarGarmentFit';
import { repairAvatarSleeve } from './avatarSleeveRepair';
import { createAvatarPhysique } from './avatarPhysique';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarIdle, sampleAvatarIdle } from './avatarIdle';
import { disposeThreeTree } from './threeResources';

const split=[1252,1253,2122,2370];
async function athlete(){
  const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
  const shirt=scene.getObjectByName('BODYFORGE_Shirt') as THREE.SkinnedMesh;
  const shorts=scene.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh;
  const garments=[shirt,shorts];
  const seams=createAvatarGarmentSeams(garments)!;
  expect(seams.loopCount).toBe(7);
  expect(applyAvatarGarmentFit(garments)).toBe(4466);
  return {scene,shirt,garments,seams};
}
function topology(g:THREE.BufferGeometry){
  const p=g.getAttribute('position'), index=g.index!;
  const keys=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(','));
  const edges=new Map<string,number>();let degenerate=0;
  for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)].map(j=>keys[j]);
    if(new Set(ids).size<3){degenerate++;continue;}
    for(let j=0;j<3;j++){
      const key=[ids[j],ids[(j+1)%3]].sort().join('|');
      edges.set(key,(edges.get(key)||0)+1);
    }
  }
  return {degenerate,boundary:[...edges.values()].filter(n=>n===1).length,nonManifold:[...edges.values()].filter(n=>n>2).length};
}
function separation(shirt:THREE.SkinnedMesh){
  const a=shirt.getVertexPosition(split[0],new THREE.Vector3());
  return Math.max(...split.map(i=>a.distanceTo(shirt.getVertexPosition(i,new THREE.Vector3()))));
}
describe('pinned collapsed sleeve cap',()=>{
  it('removes only the fourteen cap triangles and keeps the four UV splits coincident during actual posed growth',async()=>{
    const baseline=await athlete(), repaired=await athlete();
    try{
      const {shirt,garments}=repaired;
      const g=shirt.geometry,uv=g.getAttribute('uv'),joints=g.getAttribute('skinIndex'),oldWeights=g.getAttribute('skinWeight'),oldPositions=g.getAttribute('position');
      expect(topology(g)).toEqual({degenerate:8,boundary:328,nonManifold:0});
      expect(repairAvatarSleeve(garments)).toBe(14);
      expect(g.index!.count).toBe(24966);
      expect(topology(g)).toEqual({degenerate:0,boundary:328,nonManifold:0});
      expect(repairAvatarSleeve(garments)).toBe(0);
      expect(g.getAttribute('uv')).toBe(uv);
      expect(g.getAttribute('skinIndex')).toBe(joints);
      const p=g.getAttribute('position'),w=g.getAttribute('skinWeight');
      for(let i=0;i<p.count;i++)if(!split.includes(i)){
        expect(p.getX(i)).toBe(oldPositions.getX(i));
        expect(p.getY(i)).toBe(oldPositions.getY(i));
        expect(p.getZ(i)).toBe(oldPositions.getZ(i));
        expect(w.getX(i)).toBe(oldWeights.getX(i));
        expect(w.getY(i)).toBe(oldWeights.getY(i));
        expect(w.getZ(i)).toBe(oldWeights.getZ(i));
        expect(w.getW(i)).toBe(oldWeights.getW(i));
      }
      const n=g.getAttribute('normal');
      for(const i of split)expect(new THREE.Vector3().fromBufferAttribute(n,i).distanceTo(new THREE.Vector3().fromBufferAttribute(n,split[0]))).toBe(0);
      const prepare=(fixture:Awaited<ReturnType<typeof athlete>>)=>{
        applyAthleticPose(fixture.scene);
        return {sculpt:createAvatarPhysique(fixture.scene,true),idle:createAvatarIdle(fixture.scene)!};
      };
      const before=prepare(baseline),after=prepare(repaired);
      expect(after.idle).toBeDefined();
      let worstBefore=0,worstAfter=0;
      for(const muscles of [{},{arms:2},{arms:5},{core:5},{back:5},{legs:5},{arms:5,core:5,back:5,legs:5}]){
        for(const t of [0,1.2,2.4,3.6]){
          const pose=sampleAvatarIdle(t);
          for(const [fixture,driver] of [[baseline,before],[repaired,after]] as const){
            driver.sculpt(muscles);
            driver.idle.pose(pose);
            applyAvatarGrowth(fixture.scene,muscles,pose.breath);
            fixture.scene.updateMatrixWorld(true);
            fixture.seams.update(fixture.scene);
          }
          worstBefore=Math.max(worstBefore,separation(baseline.shirt));
          worstAfter=Math.max(worstAfter,separation(shirt));
        }
      }
      console.info('SLEEVE_GAP',JSON.stringify({beforeMm:worstBefore*1000,afterMm:worstAfter*1000}));
      expect(worstBefore).toBeGreaterThan(.00001);
      expect(worstAfter).toBeLessThan(1e-8);
    }finally{disposeThreeTree(baseline.scene);disposeThreeTree(repaired.scene);}
  },20000);
  it('fails closed if the source index was changed',async()=>{
    const {scene,shirt,garments}=await athlete();
    try{
      const index=shirt.geometry.index!;
      index.setX(0,index.getX(0)+1);
      const position=shirt.geometry.getAttribute('position');
      expect(repairAvatarSleeve(garments)).toBe(0);
      expect(shirt.geometry.index).toBe(index);
      expect(shirt.geometry.getAttribute('position')).toBe(position);
    }finally{disposeThreeTree(scene);}
  });
});
