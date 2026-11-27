import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createAvatarPhysique } from './avatarPhysique';
import { SCAN_TORSO_REVIEW_DATA } from './avatarScanTorsoReviewData';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { disposeThreeTree } from './threeResources';

const asset='public/assets/bodyforge-athlete-efficient.glb';
const audit='docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127';
const privateDir='.bodyforge-qa/shoulder-transition-20261127';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function load(){
  const bytes=readFileSync(asset);
  expect(sha(bytes)).toBe('df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e');
  return (await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'')).scene;
}
const coords=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute)=>{
  const p=new Float32Array(a.count*3);
  for(let i=0;i<a.count;i++)p.set([a.getX(i),a.getY(i),a.getZ(i)],i*3);
  return p;
};
const posed=(mesh:THREE.SkinnedMesh)=>{
  const p=mesh.geometry.getAttribute('position'),out=new Float32Array(p.count*3),v=new THREE.Vector3();
  for(let i=0;i<p.count;i++)out.set(mesh.getVertexPosition(i,v).toArray(),i*3);
  return out;
};
const area=(p:Float32Array,a:number,b:number,c:number)=>{
  const x=p[b*3]-p[a*3],y=p[b*3+1]-p[a*3+1],z=p[b*3+2]-p[a*3+2];
  const u=p[c*3]-p[a*3],v=p[c*3+1]-p[a*3+1],w=p[c*3+2]-p[a*3+2];
  return Math.hypot(y*w-z*v,z*u-x*w,x*v-y*u);
};
const quantile=(a:number[],q:number)=>a[Math.floor((a.length-1)*q)];
describe('shoulder transition diagnosis on the actual rig',()=>{
  it('measures compression separately for the closed-arm pose and paid growth',async()=>{
    const root=await load();
    try{
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const bind=coords(body.geometry.getAttribute('position'));
      const idx=Uint32Array.from(body.geometry.index!.array);
      expect(applyAthleticPose(root)).toBe(true);
      root.updateMatrixWorld(true);
      const relaxed=posed(body);
      const sculpt=createAvatarPhysique(root,false,false,SCAN_TORSO_REVIEW_DATA,true,true);
      const output=[{name:'bind',positions:bind},{name:'relaxed',positions:relaxed}];
      const groups=[{}, {arms:5}, {core:5}, {back:5}, {arms:5,core:5,legs:5,back:5}];
      for(const [i,levels] of groups.entries()){
        sculpt(levels);applyAvatarGrowth(root,levels);root.updateMatrixWorld(true);
        output.push({name:['neutral','arms','core','back','max'][i],positions:posed(body)});
      }
      const report=[];
      for(const o of output.slice(1)){
        const ratio:number[]=[],worst:{i:number;r:number;p:number[]}[]=[];
        for(let i=0;i<idx.length;i+=3){
          const a=idx[i],b=idx[i+1],c=idx[i+2];
          const p=[0,1,2].map(k=>(bind[3*a+k]+bind[3*b+k]+bind[3*c+k])/3);
          if(Math.abs(p[0])<.10||Math.abs(p[0])>.34||p[1]<1.25||p[1]>1.49)continue;
          const original=area(bind,a,b,c);if(original<1e-10)continue;
          const r=area(o.positions,a,b,c)/original;
          if(!Number.isFinite(r))throw Error('Nonfinite posed area');
          ratio.push(r);if(r<.55)worst.push({i:i/3,r,p});
        }
        ratio.sort((a,b)=>a-b);worst.sort((a,b)=>a.r-b.r);
        report.push({name:o.name,triangles:ratio.length,areaRatioP01P05Median:[.01,.05,.5].map(q=>quantile(ratio,q)),below055:worst.length,worst:worst.slice(0,8)});
      }
      expect(report[0].triangles).toBeGreaterThan(1000);
      if(process.env.BODYFORGE_QA_EXPORT_SHOULDER==='1'){
        const bin=Buffer.concat([Buffer.from(idx.buffer),...output.map(o=>Buffer.from(o.positions.buffer))]);
        writeFileSync(privateDir+'/diagnostic.bin',bin,{flag:'wx'});
        writeFileSync(audit+'/diagnostic.json',JSON.stringify({scope:'Actual CPU-skinned GLB geometry, no texture, raw bind mesh comparison',vertices:bind.length/3,indices:idx.length,
          states:output.map(o=>o.name),binaryBytes:bin.length,binarySha256:sha(bin),report},null,2),{flag:'wx'});
      }
      console.info('SHOULDER_DIAGNOSIS',JSON.stringify(report));
    }finally{disposeThreeTree(root);}
  },30000);
});

/** Diagnostic sweep: the same world-Z arm closure as avatarPose, before
 * capturing the growth baseline. The production/default pose is untouched. */
function openShoulders(root:THREE.Object3D,degrees:number){
  for(const [name,sign] of [['upperarm01L',1],['upperarm01R',-1]] as const){
    const bone=root.getObjectByName(name) as THREE.Bone;
    const world=bone.getWorldQuaternion(new THREE.Quaternion());
    const parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    const delta=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),THREE.MathUtils.degToRad((34-degrees)*sign));
    bone.quaternion.copy(parent.invert().multiply(delta.multiply(world))).normalize();
    bone.updateWorldMatrix(false,true);
  }
  root.updateMatrixWorld(true);
}
describe('bounded shoulder angle sweep',()=>{
  it('compares the real deformed shoulder at seven angles and six paid profiles',async()=>{
    const report=[];
    for(const angle of [34,32,30,28,26,24,22]){
      const root=await load();
      try{
        const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
        const bind=coords(body.geometry.getAttribute('position')),idx=Uint32Array.from(body.geometry.index!.array);
        const triangles:{a:number;b:number;c:number;base:number}[]=[];
        const selected=new Set<number>();
        for(let i=0;i<idx.length;i+=3){
          const a=idx[i],b=idx[i+1],c=idx[i+2];
          const x=(bind[a*3]+bind[b*3]+bind[c*3])/3,y=(bind[a*3+1]+bind[b*3+1]+bind[c*3+1])/3;
          if(Math.abs(x)<.10||Math.abs(x)>.34||y<1.25||y>1.49)continue;
          const base=area(bind,a,b,c);if(base<1e-10)continue;
          triangles.push({a,b,c,base});selected.add(a);selected.add(b);selected.add(c);
        }
        applyAthleticPose(root);openShoulders(root,angle);
        const sculpt=createAvatarPhysique(root,false,false,SCAN_TORSO_REVIEW_DATA,true,true);
        const rows=[];
        const vector=new THREE.Vector3();
        const p=new Float32Array(bind.length);
        for(const [name,levels] of Object.entries({neutral:{},arms:{arms:5},core:{core:5},back:{back:5},mixed:{arms:3,core:1,back:4,legs:2},max:{arms:5,core:5,back:5,legs:5}})){
          sculpt(levels);applyAvatarGrowth(root,levels);root.updateMatrixWorld(true);
          for(const i of selected)p.set(body.getVertexPosition(i,vector).toArray(),i*3);
          const ratios=triangles.map(t=>area(p,t.a,t.b,t.c)/t.base).sort((a,b)=>a-b);
          expect(ratios.every(Number.isFinite)).toBe(true);
          const arm=root.getObjectByName('upperarm01L')!.getWorldPosition(new THREE.Vector3());
          const elbow=root.getObjectByName('lowerarm01L')!.getWorldPosition(new THREE.Vector3());
          const wrist=root.getObjectByName('wristL')!.getWorldPosition(new THREE.Vector3());
          const outward=THREE.MathUtils.radToDeg(Math.atan2(Math.abs(elbow.x-arm.x),arm.y-elbow.y));
          rows.push({name,min:ratios[0],p01:quantile(ratios,.01),p05:quantile(ratios,.05),below055:ratios.filter(v=>v<.55).length,
            below025:ratios.filter(v=>v<.25).length,upperArmFromVerticalDeg:outward,wristXmm:Math.abs(wrist.x)*1000,wristYmm:wrist.y*1000});
        }
        report.push({angle,triangles:triangles.length,states:rows});
      }finally{disposeThreeTree(root);}
    }
    if(process.env.BODYFORGE_QA_EXPORT_SHOULDER==='1')
      writeFileSync(audit+'/angle-sweep.json',JSON.stringify(report,null,2),{flag:'wx'});
    console.info('SHOULDER_SWEEP',JSON.stringify(report.map(r=>({angle:r.angle,
      worstP01:Math.min(...r.states.map(x=>x.p01)),compressed:r.states.reduce((n,x)=>n+x.below055,0),
      severe:r.states.reduce((n,x)=>n+x.below025,0),neutral:r.states[0],max:r.states.at(-1)}))));
  },60000);
});

import { prepareShoulderWeights, shoulderTransitionMask } from './avatarShoulderTransitionReview';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import { applyAvatarGarmentFit } from './avatarGarmentFit';
import { repairAvatarSleeve } from './avatarSleeveRepair';

describe('local shoulder weight regularization sweep',()=>{
  it('compares candidate skin weights on all primary profiles',async()=>{
    const report=[];
    for(const [angle,iterations,blend] of [[34,0,0],[34,4,.65],[34,8,.75],[34,16,.85],[34,24,1],[28,0,0],[28,8,.75],[28,16,.85],[26,16,.85]]){
      const root=await load();
      try{
        const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
        const shirt=root.getObjectByName('BODYFORGE_Shirt') as THREE.SkinnedMesh;
        const shorts=root.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh;
        const cloth=[shirt,shorts];
        applyAthleticPose(root);openShoulders(root,angle);
        const seams=createAvatarGarmentSeams(cloth);
        expect(seams?.loopCount).toBe(7);
        expect(applyAvatarGarmentFit(cloth)).toBe(4466);
        expect(repairAvatarSleeve(cloth)).toBe(14);
        const bind=coords(body.geometry.getAttribute('position')),idx=Uint32Array.from(body.geometry.index!.array);
        const triangles:{a:number;b:number;c:number;base:number}[]=[];
        const selected=new Set<number>();
        for(let i=0;i<idx.length;i+=3){
          const a=idx[i],b=idx[i+1],c=idx[i+2];
          const x=(bind[a*3]+bind[b*3]+bind[c*3])/3,y=(bind[a*3+1]+bind[b*3+1]+bind[c*3+1])/3;
          if(Math.abs(x)<.10||Math.abs(x)>.34||y<1.25||y>1.49)continue;
          const base=area(bind,a,b,c);if(base<1e-10)continue;
          triangles.push({a,b,c,base});selected.add(a);selected.add(b);selected.add(c);
        }
        let changed:{name:string;changed:number;maxVariation:number;activeVertices:number}[]=[];
        if(iterations){
          const candidate=[body,shirt].map(m=>prepareShoulderWeights(m,iterations,blend));
          if(candidate.some(v=>!v)){report.push({angle,iterations,blend,status:'REJECTED_CONTRACT',valid:candidate.map(Boolean)});continue;}
          changed=candidate.map((c,i)=>{
            const m=[body,shirt][i],v=c!;
            m.geometry.setAttribute('skinIndex',v.indices);
            m.geometry.setAttribute('skinWeight',v.weights);
            return {name:m.name,changed:v.changed,maxVariation:v.maxVariation,activeVertices:v.activeVertices};
          });
        }
        const sculpt=createAvatarPhysique(root,true,false,SCAN_TORSO_REVIEW_DATA,true,true);
        const rows=[];
        const vector=new THREE.Vector3(),p=new Float32Array(bind.length);
        for(const [name,levels] of Object.entries({neutral:{},arms:{arms:5},core:{core:5},back:{back:5},mixed:{arms:3,core:1,back:4,legs:2},max:{arms:5,core:5,back:5,legs:5}})){
          sculpt(levels);applyAvatarGrowth(root,levels);root.updateMatrixWorld(true);
          for(const i of selected)p.set(body.getVertexPosition(i,vector).toArray(),i*3);
          const ratios=triangles.map(t=>area(p,t.a,t.b,t.c)/t.base).sort((a,b)=>a-b);
          expect(ratios.every(Number.isFinite)).toBe(true);
          rows.push({name,min:ratios[0],p01:quantile(ratios,.01),p05:quantile(ratios,.05),below055:ratios.filter(v=>v<.55).length,below025:ratios.filter(v=>v<.25).length});
        }
        report.push({angle,iterations,blend,status:'MEASURED',changed,states:rows,compressed:rows.reduce((n,r)=>n+r.below055,0),severe:rows.reduce((n,r)=>n+r.below025,0),worstP01:Math.min(...rows.map(r=>r.p01))});
      }finally{disposeThreeTree(root);}
    }
    if(process.env.BODYFORGE_QA_EXPORT_SHOULDER==='1')
      writeFileSync(audit+'/weight-sweep.json',JSON.stringify(report,null,2),{flag:'wx'});
    console.info('SHOULDER_WEIGHT_SWEEP',JSON.stringify(report));
    expect(shoulderTransitionMask(.19,1.36)).toBeGreaterThan(.9);
  },90000);
});


import { installShoulderTransition, SHOULDER_TRANSITION_ID } from './avatarShoulderTransitionReview';
import { createAthleteWardrobe } from './avatarOcclusion';
import { createAvatarIdle, sampleAvatarIdle } from './avatarIdle';

it('validates the installed shoulder candidate with garments, growth and idle',async()=>{
  const names=['BODYFORGE_Body','BODYFORGE_Shirt','BODYFORGE_ChestMark','BODYFORGE_SkinNipples'] as const;
  const chunks:Buffer[]=[];let offset=0;
  const put=(a:Float32Array|Uint32Array)=>{
    const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength),r={offset,bytes:b.byteLength};
    offset+=b.byteLength;chunks.push(b);return r;
  };
  const report:Record<string,unknown>={};
  for(const enabled of [false,true]){
    const root=await load();
    try{
      const meshes=names.map(n=>root.getObjectByName(n) as THREE.SkinnedMesh);
      const full=meshes.map(m=>m.geometry.index!);
      const body=meshes[0],shirt=meshes[1];
      const wardrobe=createAthleteWardrobe(root);expect(wardrobe).toBeDefined();
      const garments=[shirt,root.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh];
      applyAthleticPose(root);
      expect(createAvatarGarmentSeams(garments)?.loopCount).toBe(7);
      expect(applyAvatarGarmentFit(garments)).toBe(4466);
      expect(repairAvatarSleeve(garments)).toBe(14);
      full[1]=shirt.geometry.index!;
      const positions=meshes.map(m=>coords(m.geometry.getAttribute('position')));
      const jointBefore=meshes.map(m=>m.geometry.getAttribute('skinIndex').array.slice());
      const weightsBefore=meshes.map(m=>m.geometry.getAttribute('skinWeight').array.slice());
      const activeIndex=body.geometry.index;
      const stats=[];
      if(enabled){
        expect(installShoulderTransition(root,full[0])).toBe(true);
        expect(installShoulderTransition(root,full[0])).toBe(false);
        expect(root.userData.BODYFORGE_shoulderTransitionReview).toBe(SHOULDER_TRANSITION_ID);
      }
      expect(body.geometry.index).toBe(activeIndex);
      for(let j=0;j<meshes.length;j++){
        const m=meshes[j],p=positions[j],w=m.geometry.getAttribute('skinWeight').array,i=m.geometry.getAttribute('skinIndex').array;
        let changed=0;
        for(let k=0;k<p.length/3;k++){
          let diff=false,sum=0;
          for(let a=0;a<4;a++){
            const l=k*4+a;sum+=w[l];diff ||= w[l]!==weightsBefore[j][l]||i[l]!==jointBefore[j][l];
            expect(i[l]).toBeLessThan(163);
          }
          if(diff){
            changed++;expect(sum).toBe(65535);
            expect(shoulderTransitionMask(p[k*3],p[k*3+1])).toBeGreaterThan(0);
          }
        }
        expect(coords(m.geometry.getAttribute('position'))).toEqual(p);
        if(!enabled||j>=2)expect(changed).toBe(0);
        else expect(changed).toBeGreaterThan(1000);
        stats.push({mesh:m.name,changed,vertices:p.length/3,bind:put(p),indices:put(Uint32Array.from(full[j].array))});
      }
      const idle=createAvatarIdle(root);expect(idle).toBeDefined();
      const sculpt=createAvatarPhysique(root,true,false,SCAN_TORSO_REVIEW_DATA,true,true);
      const profiles={neutral:{},arms:{arms:5},core:{core:5},legs:{legs:5},back:{back:5},mixed:{arms:3,core:1,back:4,legs:2},max:{arms:5,core:5,legs:5,back:5}};
      const samples:Record<string,unknown>={};
      const snapshot=(key:string)=>{
        root.updateMatrixWorld(true);
        const arrays=meshes.map(m=>posed(m));
        for(const a of arrays)expect(a.every(Number.isFinite)).toBe(true);
        samples[key]=arrays.map(put);return arrays;
      };
      for(const [name,levels] of Object.entries(profiles)){
        sculpt(levels);applyAvatarGrowth(root,levels);snapshot(name);
      }
      for(const seconds of [.8,2.1,4.2]){
        const sample=sampleAvatarIdle(seconds);idle!.pose(sample);
        applyAvatarGrowth(root,profiles.max,sample.breath);snapshot('idle'+seconds);
      }
      idle!.reset();sculpt(profiles.neutral);applyAvatarGrowth(root,profiles.neutral);
      snapshot('reset');
      wardrobe!.setShirt(true);expect(wardrobe!.shirtVisible).toBe(true);
      wardrobe!.setShirt(false);expect(wardrobe!.shirtVisible).toBe(false);
      report[enabled?'candidate':'baseline']={stats,samples};
    }finally{disposeThreeTree(root);}
  }
  if(process.env.BODYFORGE_QA_EXPORT_SHOULDER_CANDIDATE==='1'){
    const binary=Buffer.concat(chunks);
    writeFileSync(privateDir+'/final-candidate.bin',binary,{flag:'wx'});
    writeFileSync(audit+'/final-candidate.json',JSON.stringify({binaryBytes:binary.length,binarySha256:sha(binary),report},null,2),{flag:'wx'});
  }
  console.info('SHOULDER_CANDIDATE',JSON.stringify(report));
},90000);


it.runIf(process.env.BODYFORGE_QA_SHOULDER_COLLISION_SWEEP==='1')('exports bounded collision sweep for the pose and skin weights',async()=>{
  const names=['BODYFORGE_Body','BODYFORGE_Shirt','BODYFORGE_ChestMark','BODYFORGE_SkinNipples'] as const;
  const report:Record<string,unknown>={},chunks:Buffer[]=[];let offset=0;
  const put=(a:Float32Array|Uint32Array)=>{
    const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength),r={offset,bytes:b.byteLength};
    offset+=b.byteLength;chunks.push(b);return r;
  };
  for(const [angle,iterations,blend,clothBlend] of [[26,0,0,0],[24,0,0,0],[22,0,0,0],[20,0,0,0],[24,8,.75,.75],[22,8,.75,.75],[24,16,.85,.85],[22,16,.85,.85],[24,16,.85,.45],[22,16,.85,.45]]){
    const root=await load();
    try{
      const meshes=names.map(n=>root.getObjectByName(n) as THREE.SkinnedMesh);
      const full=meshes.map(m=>m.geometry.index!);
      const [body,shirt]=meshes;
      applyAthleticPose(root);openShoulders(root,angle);
      const garments=[shirt,root.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh];
      expect(createAvatarGarmentSeams(garments)?.loopCount).toBe(7);
      expect(applyAvatarGarmentFit(garments)).toBe(4466);
      expect(repairAvatarSleeve(garments)).toBe(14);
      full[1]=shirt.geometry.index!;
      if(iterations){
        const b=prepareShoulderWeights(body,iterations,blend),s=prepareShoulderWeights(shirt,iterations,clothBlend);
        if(!b||!s)continue;
        for(const [mesh,c] of [[body,b],[shirt,s]] as const){
          mesh.geometry.setAttribute('skinIndex',c.indices);mesh.geometry.setAttribute('skinWeight',c.weights);
        }
      }
      const stats=meshes.map((m,i)=>({mesh:m.name,bind:put(coords(m.geometry.getAttribute('position'))),indices:put(Uint32Array.from(full[i].array))}));
      const idle=createAvatarIdle(root);expect(idle).toBeDefined();
      const sculpt=createAvatarPhysique(root,true,false,SCAN_TORSO_REVIEW_DATA,true,true);
      const profiles={neutral:{},arms:{arms:5},core:{core:5},legs:{legs:5},back:{back:5},mixed:{arms:3,core:1,back:4,legs:2},max:{arms:5,core:5,legs:5,back:5}};
      const samples:Record<string,unknown>={};
      const snapshot=(key:string)=>{
        root.updateMatrixWorld(true);samples[key]=meshes.map(m=>put(posed(m)));
      };
      for(const [name,levels] of Object.entries(profiles)){sculpt(levels);applyAvatarGrowth(root,levels);snapshot(name);}
      for(const seconds of [.8,2.1,4.2]){
        const sample=sampleAvatarIdle(seconds);idle!.pose(sample);applyAvatarGrowth(root,profiles.max,sample.breath);snapshot('idle'+seconds);
      }
      idle!.reset();sculpt(profiles.neutral);applyAvatarGrowth(root,profiles.neutral);snapshot('reset');
      report[[angle,iterations,blend,clothBlend].join('-')]={stats,samples};
    }finally{disposeThreeTree(root);}
  }
  expect(Object.keys(report).length).toBeGreaterThanOrEqual(8);
  const binary=Buffer.concat(chunks);
  writeFileSync(privateDir+'/collision-sweep.bin',binary,{flag:'wx'});
  writeFileSync(audit+'/collision-sweep.json',JSON.stringify({binaryBytes:binary.length,binarySha256:sha(binary),report},null,2),{flag:'wx'});
},120000);
