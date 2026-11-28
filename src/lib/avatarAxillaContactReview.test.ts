import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createPoseCorrective, axillaContactField, axillaMedialField, axillaContactStrength, AXILLA_CONTACT_ID, AXILLA_MEDIAL_ID, ARM_CONTOUR_ID } from './avatarPoseCorrectiveReview';
import { createAthleteWardrobe } from './avatarOcclusion';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import { applyAvatarGarmentFit } from './avatarGarmentFit';
import { repairAvatarSleeve } from './avatarSleeveRepair';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarPhysique } from './avatarPhysique';
import { SCAN_TORSO_REVIEW_DATA } from './avatarScanTorsoReviewData';
import { createAvatarIdle, sampleAvatarIdle } from './avatarIdle';
import { disposeThreeTree } from './threeResources';
import type { Muscle } from './game';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const positions=(m:THREE.SkinnedMesh,posed=false)=>{
  const p=m.geometry.getAttribute('position'),a=new Float32Array(p.count*3),v=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    if(posed)m.getVertexPosition(i,v);else v.fromBufferAttribute(p,i);
    a.set(v.toArray(),i*3);
  }
  return a;
};
const names=['BODYFORGE_Body','BODYFORGE_Shirt','BODYFORGE_ChestMark','BODYFORGE_SkinNipples'] as const;
const profiles:Record<string,Partial<Record<Muscle,number>>>={
  neutral:{},arms:{arms:5},core:{core:5},legs:{legs:5},back:{back:5},
  mixed:{arms:3,core:1,legs:2,back:4},max:{arms:5,core:5,legs:5,back:5},
  intermediate1:{arms:1,core:2,legs:3,back:4},
  intermediate2:{arms:4,core:3,legs:2,back:1},
  intermediate3:{arms:2,core:4,legs:1,back:3},
  intermediate4:{arms:5,core:5,back:0,legs:5},
  intermediate5:{arms:0,core:5,back:5,legs:0},
  intermediate6:{arms:5,core:0,back:5,legs:0},
};

describe('paired axilla contact reserve on the pinned athlete',()=>{
  it('is mirrored, bounded and local; legs and neutral never change it',()=>{
    expect(axillaContactField(.16,1.31,0)).toBeLessThan(0);
    expect(axillaContactField(.25,1.31,0)).toBeGreaterThan(0);
    for(const [x,y,z] of [[0,1.3,0],[.4,1.3,0],[.2,1.1,0],[.2,1.5,0],[.2,1.3,.09],[NaN,1.3,0]])expect(axillaContactField(x,y,z)).toBe(0);
    for(let i=0;i<1000;i++){
      const x=.1+i*.0003,y=1.3,z=.01;
      const f=axillaContactField(x,y,z);
      expect(Math.abs(f)).toBeLessThanOrEqual(1);
      expect(axillaContactField(-x,y,z)+f).toBeCloseTo(0,12);
    }
    // Exhaustively check the scalar reserve only; this is not a full mesh sweep.
    for(let arms=0;arms<=5;arms++)for(let core=0;core<=5;core++)for(let legs=0;legs<=5;legs++)for(let back=0;back<=5;back++){
      const levels={arms,core,legs,back},v=axillaContactStrength(levels);
      expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(.014000000000001);
      expect(v).toBe(axillaContactStrength({...levels,legs:0}));
      for(const k of ['arms','core','back'] as const)if(levels[k]<5)
        expect(axillaContactStrength({...levels,[k]:levels[k]+1})).toBeGreaterThan(v);
    }
    for(let i=0;i<1000;i++){
      const x=.1+i*.0003,y=1.3,z=.01;
      const base=axillaContactField(x,y,z),med=axillaMedialField(x,y,z);
      expect(Math.abs(med)).toBeLessThanOrEqual(Math.abs(base)+1e-12);
      expect(axillaMedialField(-x,y,z)+med).toBeCloseTo(0,12);
      if(base<0)expect(med).toBe(base);
    }
    // At y=1.36, x=.30 is lateral to the measured humeral axis.
    expect(axillaContactField(.30,1.36,0)).toBeGreaterThan(0);
    expect(axillaMedialField(.30,1.36,0)).toBe(0);
    expect(axillaContactStrength({legs:5})).toBe(0);
    expect(axillaContactStrength({arms:NaN,core:-1,back:0})).toBe(0);
    expect(axillaContactStrength({arms:50,core:5,back:5})).toBeCloseTo(.014,12);
  });
  it.each([
    {mode:'contact',build:'lean'},
    {mode:'contact-medial',build:'lean'},
    {mode:'contact-medial',build:'solid'},
  ] as const)('preserves actual rig, growth and buffers: $mode / $build',async({mode,build})=>{
    const fieldFor=mode==='contact-medial'?axillaMedialField:axillaContactField;
    const wrapper=new THREE.Group();
    wrapper.scale.x=build==='solid'?1.055:1;
    const bytes=readFileSync('public/assets/bodyforge-athlete-efficient.glb');
    expect(sha(bytes)).toBe('df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e');
    const report:Record<string,unknown>={},chunks:Buffer[]=[];let offset=0;
    const put=(a:Float32Array|Uint32Array)=>{
      const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength),r={offset,bytes:b.byteLength};
      offset+=b.byteLength;chunks.push(b);return r;
    };
    const baselineBones=new Map<string,number[]>(),baselinePositions=new Map<string,Float32Array[]>();
    for(const enabled of [false,true]){
      const root=(await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'')).scene;
      try{
        const meshes=names.map(n=>root.getObjectByName(n) as THREE.SkinnedMesh);
        const full=meshes.map(m=>m.geometry.index!);
        const [body,shirt]=meshes;
        expect(createAthleteWardrobe(root)).toBeDefined();
        expect(applyAthleticPose(root)).toBe(true);
        const garments=[shirt,root.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh];
        expect(createAvatarGarmentSeams(garments)?.loopCount).toBe(7);
        expect(applyAvatarGarmentFit(garments)).toBe(4466);
        expect(repairAvatarSleeve(garments)).toBe(14);
        full[1]=shirt.geometry.index!;
        const immutable=meshes.map(m=>['uv','skinWeight','skinIndex'].map(k=>m.geometry.getAttribute(k)?.array.slice()));
        const indexes=meshes.map(m=>m.geometry.index);
        const bind=meshes.map(m=>positions(m));
        const stats=meshes.map((m,i)=>({mesh:m.name,bind:put(bind[i]),indices:put(Uint32Array.from(full[i].array))}));
        const correction=createPoseCorrective(root,full[0],enabled?mode:'contour');
        wrapper.add(root);wrapper.updateMatrixWorld(true);
        expect(correction).toBeDefined();
        const idle=createAvatarIdle(root);expect(idle).toBeDefined();
        const sculpt=createAvatarPhysique(root,true,false,SCAN_TORSO_REVIEW_DATA,true,true);
        const samples:Record<string,unknown>={},deltas:Record<string,unknown>={};
        const snapshot=(key:string)=>{
          root.updateMatrixWorld(true);
          const p=meshes.map(m=>positions(m,true));
          const bones=body.skeleton.bones.flatMap(b=>b.matrixWorld.elements);
          if(!enabled){baselinePositions.set(key,p);baselineBones.set(key,bones);}
          else{
            expect(bones).toEqual(baselineBones.get(key));
            const old=baselinePositions.get(key)!;
            const metrics=[];
            for(let j=0;j<p.length;j++){
              let peak=0,changed=0,outside=0,predictionError=0;
              for(let i=0;i<p[j].length;i+=3){
                const d=Math.hypot(p[j][i]-old[j][i],p[j][i+1]-old[j][i+1],p[j][i+2]-old[j][i+2]);
                peak=Math.max(peak,d);if(d>1e-6)changed++;
                const field=j<2?fieldFor(bind[j][i],bind[j][i+1],bind[j][i+2]):0;
                if(field===0)outside=Math.max(outside,d);
                if(!key.startsWith('idle')){
                  const strength=axillaContactStrength(profiles[key]??profiles.neutral);
                  predictionError=Math.max(predictionError,Math.abs(p[j][i]-old[j][i]-field*strength),Math.abs(p[j][i+1]-old[j][i+1]),Math.abs(p[j][i+2]-old[j][i+2]));
                }
              }
              expect(outside).toBeLessThan(1e-6);
              expect(peak,key).toBeLessThan(.016);
              expect(predictionError,key).toBeLessThan(2e-6);
              metrics.push({mesh:names[j],peak,changed,outside,predictionError});
            }
            deltas[key]=metrics;
          }
          for(const m of meshes){
            const n=m.geometry.getAttribute('normal');
            expect(n.array.every(Number.isFinite)).toBe(true);
          }
          samples[key]=p.map(put);return p;
        };
        for(const [key,levels] of Object.entries(profiles)){
          sculpt(levels);applyAvatarGrowth(root,levels);
          if(correction)expect(correction.apply(levels),key).toBe(true);
          snapshot(key);
          const calls=correction?.applications;
          if(correction)expect(correction.apply(levels)).toBe(true);
          expect(correction?.applications).toBe(calls);
        }
        // Capture the max correction once, then allow idle motion without
        // recomputing the local mesh or changing skeleton behavior.
        sculpt(profiles.max);applyAvatarGrowth(root,profiles.max);
        if(correction)expect(correction.apply(profiles.max)).toBe(true);
        const applications=correction?.applications;
        for(const seconds of [.8,2.1,4.2,8.0,12.7]){
          const sample=sampleAvatarIdle(seconds);idle!.pose(sample);
          applyAvatarGrowth(root,profiles.max,sample.breath);snapshot('idle'+seconds);
          expect(correction?.applications).toBe(applications);
        }
        idle!.reset();sculpt(profiles.neutral);applyAvatarGrowth(root,profiles.neutral);
        if(correction)expect(correction.apply(profiles.neutral)).toBe(true);
        const reset=snapshot('reset');
        const neutral=samples.neutral as {offset:number;bytes:number}[];
        for(let i=0;i<reset.length;i++){
          const data=chunks.find((_,k)=>chunks.slice(0,k).reduce((s,c)=>s+c.length,0)===neutral[i].offset)!;
          expect(Buffer.from(reset[i].buffer).equals(data)).toBe(true);
        }
        for(let i=0;i<meshes.length;i++){
          expect(meshes[i].geometry.index).toBe(indexes[i]);
          for(const [j,k] of ['uv','skinWeight','skinIndex'].entries())expect(meshes[i].geometry.getAttribute(k)?.array).toEqual(immutable[i][j]);
        }
        expect(root.userData.BODYFORGE_poseCorrectiveReview).toBe(enabled?(mode==='contact-medial'?AXILLA_MEDIAL_ID:AXILLA_CONTACT_ID):ARM_CONTOUR_ID);
        report[enabled?'candidate':'baseline']={stats,samples,deltas};
      }finally{wrapper.remove(root);disposeThreeTree(root);}
    }
    if(mode==='contact-medial'&&process.env.BODYFORGE_QA_EXPORT_AXILLA_MEDIAL==='1'){
      const binary=Buffer.concat(chunks);
      const path='.bodyforge-qa/avatar-recovery-20261127/medial-runtime-'+build+'-checked';
      writeFileSync(path+'.bin',binary,{flag:'wx'});
      writeFileSync(path+'.json',JSON.stringify({binaryBytes:binary.length,binarySha256:sha(binary),mode,build,report},null,2),{flag:'wx'});
    }
    if(mode==='contact'&&process.env.BODYFORGE_QA_EXPORT_AXILLA_CONTACT==='1'){
      const binary=Buffer.concat(chunks);
      writeFileSync('.bodyforge-qa/avatar-recovery-20261127/contact-runtime.bin',binary,{flag:'wx'});
      writeFileSync('.bodyforge-qa/avatar-recovery-20261127/contact-runtime.json',JSON.stringify({binaryBytes:binary.length,binarySha256:sha(binary),report},null,2),{flag:'wx'});
    }
  },90000);
});
