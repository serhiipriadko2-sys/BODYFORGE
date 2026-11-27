import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createPoseCorrective, poseCorrectiveMask, armTaperGain, ARM_TAPER_ID } from './avatarPoseCorrectiveReview';
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

describe('axial arm taper on the pinned athlete',()=>{
  it('has a bounded smooth mask and excludes face, hands and lower body',()=>{
    for(const [x,y] of [[0,1.35],[.09,1.20],[.52,1.35],[.25,1.10],[.15,1.54],[.15,.8],[.8,1.45]])expect(poseCorrectiveMask(x,y)).toBe(0);
    for(const [x,y] of [[.2,1.35],[.25,1.42],[.12,1.47]]){
      const f=poseCorrectiveMask(x,y);
      expect(f).toBeGreaterThan(0);expect(f).toBeLessThanOrEqual(1);
      expect(f).toBe(poseCorrectiveMask(-x,y));
    }
  });
  it('attenuates only the distal limb and is mirrored and bounded',()=>{
    expect(armTaperGain(.15,1.35,.08)).toBe(1);
    expect(armTaperGain(.203572626546,1.428929295450,.018598292131)).toBe(1);
    expect(armTaperGain(.443856,1.167148,.116230)).toBe(0);
    expect(armTaperGain(NaN,1,1)).toBe(0);
    let last=1;
    for(let i=0;i<=2000;i++){
      const t=i/1000,x=.203572626546+t*.170015193799,y=1.428929295450-t*.197040238502,z=.018598292131-t*.001440444382;
      const gain=armTaperGain(x,y,z);
      expect(gain).toBeGreaterThanOrEqual(0);expect(gain).toBeLessThanOrEqual(last+1e-12);
      expect(armTaperGain(-x,y,z)).toBe(gain);
      last=gain;
    }
  });
  it('preserves actual rig, immutable buffers and growth; exports independent Blender evidence',async()=>{
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
        const correction=enabled?createPoseCorrective(root,full[0],true):undefined;
        if(enabled)expect(correction).toBeDefined();
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
              let peak=0,changed=0,outside=0;
              for(let i=0;i<p[j].length;i+=3){
                const d=Math.hypot(p[j][i]-old[j][i],p[j][i+1]-old[j][i+1],p[j][i+2]-old[j][i+2]);
                peak=Math.max(peak,d);if(d>1e-6)changed++;
                if(j>=2||poseCorrectiveMask(bind[j][i],bind[j][i+1])===0)outside=Math.max(outside,d);
              }
              expect(outside).toBeLessThan(1e-6);
              expect(peak).toBeLessThan(.037);
              metrics.push({mesh:names[j],peak,changed,outside});
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
        if(enabled)expect(root.userData.BODYFORGE_poseCorrectiveReview).toBe(ARM_TAPER_ID);
        report[enabled?'candidate':'baseline']={stats,samples,deltas};
      }finally{disposeThreeTree(root);}
    }
    if(process.env.BODYFORGE_QA_EXPORT_ARM_TAPER==='1'){
      const binary=Buffer.concat(chunks);
      writeFileSync('.bodyforge-qa/arm-taper-20261127/runtime.bin',binary,{flag:'wx'});
      writeFileSync('docs/audits/BF_AVATAR_ARM_TAPER_20261127/runtime.json',JSON.stringify({binaryBytes:binary.length,binarySha256:sha(binary),report},null,2),{flag:'wx'});
    }
  },90000);
});
