import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { MUSCLE_LOBES, addMuscleLobe } from './avatarMuscleAnatomy';
import { createAvatarPhysique } from './avatarPhysique';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import { applyAvatarGarmentFit } from './avatarGarmentFit';
import { repairAvatarSleeve } from './avatarSleeveRepair';
import { disposeThreeTree } from './threeResources';

const names = ['gluteus maximus', 'gluteus medius', 'thigh adductors'];
describe('leg progression includes hip muscle anatomy', () => {
  it('has independent hip envelopes that reach the actual body and shorts', async () => {
    const {scene} = await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb')).buffer,'');
    try {
      const lobes = MUSCLE_LOBES.legs.filter(l => names.includes(l.name));
      expect(lobes.map(l => l.name).sort()).toEqual([...names].sort());
      const d=new Float64Array(3),j=new Float64Array(9);
      for (const name of ['BODYFORGE_Body','BODYFORGE_Shorts']) {
        const mesh=scene.getObjectByName(name) as THREE.SkinnedMesh;
        const p=mesh.geometry.getAttribute('position');
        for(const lobe of lobes){
          let peak=0, samples=0;
          for(let i=0;i<p.count;i++){
            d.fill(0);j.fill(0);j[0]=j[4]=j[8]=1;
            addMuscleLobe(lobe,1,p.getX(i),p.getY(i),p.getZ(i),d,j);
            const mm=Math.hypot(...d)*1000;
            peak=Math.max(peak,mm);if(mm>.5)samples++;
          }
          console.info('HIP_LOBE',JSON.stringify({mesh:name,lobe:lobe.name,peakMm:peak,samples}));
          expect(peak,name+' '+lobe.name).toBeGreaterThan(3);
          expect(samples).toBeGreaterThan(4);
        }
      }
    }finally{disposeThreeTree(scene);}
  });
  it('grows the actual posterior hip and shorts progressively and resets exactly',async()=>{
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb')).buffer,'');
    try{
      const body=scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const shirt=scene.getObjectByName('BODYFORGE_Shirt') as THREE.SkinnedMesh;
      const shorts=scene.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh;
      const garments=[shirt,shorts];
      expect(createAvatarGarmentSeams(garments)?.loopCount).toBe(7);
      expect(applyAvatarGarmentFit(garments)).toBe(4466);
      expect(repairAvatarSleeve(garments)).toBe(14);
      const sculpt=createAvatarPhysique(scene,true);
      sculpt({});
      const surfaces=[body,shorts].map(mesh=>{
        const p=mesh.geometry.getAttribute('position');
        const ids=Array.from({length:p.count},(_,i)=>i).filter(i=>{
          const x=Math.abs(p.getX(i));return x>.035&&x<.145&&p.getY(i)>.92&&p.getY(i)<1.0&&p.getZ(i)<-.06;
        });
        return {mesh,p,ids,rest:Array.from(p.array),prior:0};
      });
      for(const s of surfaces)expect(s.ids.length).toBeGreaterThan(12);
      for(let level=1;level<=5;level++){
        sculpt({legs:level});
        for(const s of surfaces){
          const peak=Math.max(...s.ids.map(i=>s.rest[i*3+2]-s.p.getZ(i)));
          expect(peak,s.mesh.name).toBeGreaterThan(s.prior+.001);
          s.prior=peak;
        }
      }
      for(const s of surfaces){
        expect(s.prior,s.mesh.name).toBeGreaterThan(.012);
        expect(s.prior).toBeLessThan(.03);
        console.info('HIP_PROGRESS',JSON.stringify({mesh:s.mesh.name,samples:s.ids.length,peakMm:s.prior*1000}));
      }
      sculpt({});for(const s of surfaces)expect(Array.from(s.p.array)).toEqual(s.rest);
      // No leg-specific bind-pose displacement from other group fields
      // on this protected posterior hip region of bare skin.
      sculpt({arms:5,core:5,back:5});
      const s=surfaces[0];
      for(const i of s.ids)expect(s.p.getZ(i)).toBe(s.rest[i*3+2]);
    }finally{disposeThreeTree(scene);}
  });
});
