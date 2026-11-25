import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describe,expect,it} from 'vitest';
import recipe from './avatarGarmentSeams.json';
import {createAvatarGarmentSeams} from './avatarGarmentSeams';
import {applyAvatarGarmentFit} from './avatarGarmentFit';
import {createAvatarPhysique} from './avatarPhysique';
import {applyAthleticPose} from './avatarPose';
import {applyAvatarGrowth} from './avatarGrowth';
import {disposeThreeTree} from './threeResources';

async function athlete(){
  const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
  const garments=recipe.garments.map(s=>scene.getObjectByName(s.name) as THREE.SkinnedMesh);
  return {scene,garments};
}
function roughness(p:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,ids:number[]){
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  return ids.reduce((sum,id,i)=>{
    a.fromBufferAttribute(p,ids[(i+ids.length-1)%ids.length]);
    b.fromBufferAttribute(p,id);
    c.fromBufferAttribute(p,ids[(i+1)%ids.length]);
    return sum+a.sub(b).angleTo(b.sub(c))**2;
  },0)/ids.length;
}
describe('tailored garment rest shape',()=>{
  it('improves all seven contours without changing topology, UVs, or weights and retains growth',async()=>{
    const {scene,garments}=await athlete();
    try{
      const seams=createAvatarGarmentSeams(garments)!;
      expect(seams).toBeDefined();
      const source=garments.map((g,i)=>({
        pos:g.geometry.getAttribute('position'),index:g.geometry.index,uv:g.geometry.getAttribute('uv'),
        weights:g.geometry.getAttribute('skinWeight'),
        rough:recipe.garments[i].loops.map(l=>roughness(g.geometry.getAttribute('position'),l.vertices)),
      }));
      expect(applyAvatarGarmentFit(garments)).toBe(4466);
      expect(applyAvatarGarmentFit(garments)).toBe(0);
      for(const [i,g] of garments.entries()){
        const {pos,index,uv,weights,rough}=source[i];
        const p=g.geometry.getAttribute('position'),n=g.geometry.getAttribute('normal');
        expect(g.geometry.index).toBe(index);expect(g.geometry.getAttribute('uv')).toBe(uv);
        expect(g.geometry.getAttribute('skinWeight')).toBe(weights);
        for(const [j,l] of recipe.garments[i].loops.entries())expect(roughness(p,l.vertices)/rough[j]).toBeLessThan(.85);
        let max=0;
        for(let k=0;k<p.count;k++){
          max=Math.max(max,Math.hypot(p.getX(k)-pos.getX(k),p.getY(k)-pos.getY(k),p.getZ(k)-pos.getZ(k)));
          expect(Math.hypot(n.getX(k),n.getY(k),n.getZ(k))).toBeCloseTo(1,4);
        }
        expect(max).toBeGreaterThan(.001);expect(max).toBeLessThan(.003);
      }
      applyAthleticPose(scene);
      const sculpt=createAvatarPhysique(scene,true);
      const draw=(levels:Parameters<typeof sculpt>[0])=>{
        sculpt(levels);applyAvatarGrowth(scene,levels);seams.update(scene);
        return garments.map(g=>Array.from(g.geometry.getAttribute('position').array));
      };
      const neutral=draw({});
      for(const group of ['arms','core','legs','back'] as const){
        const mid=draw({[group]:2}),high=draw({[group]:5});
        expect(mid).not.toEqual(neutral);expect(high).not.toEqual(mid);
        expect(draw({})).toEqual(neutral);
      }
      const max={arms:5,core:5,legs:5,back:5};
      const grown=draw(max);expect(draw(max)).toEqual(grown);
      expect(draw({})).toEqual(neutral);
    }finally{disposeThreeTree(scene);}
  });
  it('rejects changed source atomically',async()=>{
    const {scene,garments}=await athlete();
    try{
      expect(createAvatarGarmentSeams(garments)).toBeDefined();
      const p=garments[1].geometry.getAttribute('position'),before=garments[0].geometry.getAttribute('position');
      p.setX(5,p.getX(5)+.001);
      expect(applyAvatarGarmentFit(garments)).toBe(0);
      expect(garments[0].geometry.getAttribute('position')).toBe(before);
    }finally{disposeThreeTree(scene);}
  });
});
