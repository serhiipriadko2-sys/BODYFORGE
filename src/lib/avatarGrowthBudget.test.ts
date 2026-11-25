import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { applyAvatarGrowth } from './avatarGrowth';
import { applyBoundedAvatarGrowth } from './avatarGrowthBudget';
import { applyAthleticPose } from './avatarPose';
import { createAvatarIdle, sampleAvatarIdle } from './avatarIdle';
import { disposeThreeTree } from './threeResources';

const full = {arms:5,core:5,legs:5,back:5};
const keys = ['spine01','upperarm01L','upperarm02L','lowerarm01L','lowerarm02L','upperleg01L',
  'upperleg02L','lowerleg01L','lowerleg02L','head','wristL','footL'] as const;
async function athlete(){
  const data=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
  const {scene}=await new GLTFLoader().parseAsync(data.buffer,'');
  applyAthleticPose(scene);
  return scene;
}
function matrices(root:THREE.Object3D){
  root.updateMatrixWorld(true);
  return Object.fromEntries(keys.map(key=>[key,root.getObjectByName(key)!.matrixWorld.clone()]));
}
function crossScale(m:THREE.Matrix4,rest:THREE.Matrix4){
  return Math.sqrt(m.determinant()/rest.determinant());
}
describe('independent radial budgets on the actual compact athlete',()=>{
  it('never multiplies growth down the limb chain and preserves axial length',async()=>{
    const root=await athlete();
    try{
      expect(applyBoundedAvatarGrowth(root,{},0)).toBe(true);
      const rest=matrices(root);
      for(let level=0;level<=5;level++){
        for(const group of ['arms','core','legs','back'] as const){
          applyAvatarGrowth(root,{[group]:level});
          const now=matrices(root);
          for(const name of keys){
            const expected=name.startsWith('upperarm')?1+(group==='arms'?.018*level:0):
              name.startsWith('lowerarm')?1+(group==='arms'?.009*level:0):
              name.startsWith('upperleg')?1+(group==='legs'?.019*level:0):
              name.startsWith('lowerleg')?1+(group==='legs'?.009*level:0):
              name==='spine01'?1+(group==='back'?.016*level:group==='core'?.009*level:0):1;
            expect(crossScale(now[name],rest[name]),name).toBeCloseTo(expected,8);
          }
        }
      }
      applyAvatarGrowth(root,full);
      const grown=matrices(root);
      const lengths=[['upperarm01L','lowerarm01L'],['lowerarm01L','wristL'],
        ['upperleg01L','lowerleg01L'],['lowerleg01L','footL']] as const;
      for(const [a,b] of lengths){
        const length=(m:ReturnType<typeof matrices>)=>new THREE.Vector3().setFromMatrixPosition(m[a]).distanceTo(new THREE.Vector3().setFromMatrixPosition(m[b]));
        expect(length(grown)).toBeCloseTo(length(rest),7);
      }
      expect(crossScale(grown.lowerarm02L,rest.lowerarm02L)).toBeCloseTo(1.045,8);
      expect(crossScale(grown.spine01,rest.spine01)).toBeCloseTo(1.125,8);
      console.info('RADIAL_BUDGET',JSON.stringify(Object.fromEntries(keys.map(k=>[k,crossScale(grown[k],rest[k])]))));
    }finally{disposeThreeTree(root);}
  });
  it('recomputes the same budgets after breathing, yaw and nonuniform build scaling',async()=>{
    const root=await athlete(),outer=new THREE.Group();
    outer.add(root);
    try{
      const idle=createAvatarIdle(root)!;
      expect(idle).toBeDefined();
      for(let frame=0;frame<12;frame++){
        outer.rotation.y=frame*.17;
        outer.scale.set(1.055,1,.97);
        const pose=sampleAvatarIdle(frame*.27);
        idle.pose(pose);
        applyAvatarGrowth(root,{},0);
        const rest=matrices(root);
        applyAvatarGrowth(root,full,pose.breath);
        const now=matrices(root);
        expect(crossScale(now.upperarm02L,rest.upperarm02L)).toBeCloseTo(1.09,8);
        expect(crossScale(now.lowerarm02L,rest.lowerarm02L)).toBeCloseTo(1.045,8);
        expect(crossScale(now.spine01,rest.spine01)).toBeCloseTo(1.125*Math.sqrt((1+.018*pose.breath)*(1+.0279*pose.breath)),8);
        for(const name of ['head','wristL','footL'] as const){
          for(const i of [0,1,2,4,5,6,8,9,10])expect(now[name].elements[i]).toBeCloseTo(rest[name].elements[i],8);
        }
        applyAvatarGrowth(root,full,pose.breath);
        for(const name of keys)matrices(root)[name].elements.forEach((value,i)=>expect(value).toBeCloseTo(now[name].elements[i],8));
        applyAvatarGrowth(root,{},0);
        for(const name of keys)matrices(root)[name].elements.forEach((value,i)=>expect(value).toBeCloseTo(rest[name].elements[i],8));
      }
    }finally{disposeThreeTree(root);}
  });
  it('does not mutate an unrecognized rig',()=>{
    const root=new THREE.Group();
    expect(applyBoundedAvatarGrowth(root,full,1)).toBe(false);
    expect(root.children).toHaveLength(0);
  });
});
