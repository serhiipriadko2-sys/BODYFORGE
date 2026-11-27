// Exhaustive discrete bind-space field QA; not a collision or rendered test.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MUSCLE_LOBES,addMuscleLobe} from '../src/lib/avatarMuscleAnatomy.ts';
import {addAvatarScanTorsoRelief} from '../src/lib/avatarScanTorsoRelief.ts';
import {SCAN_TORSO_REVIEW_DATA as data} from '../src/lib/avatarScanTorsoReviewData.ts';
const names=['arms','core','legs','back'];
const meshes=['BODYFORGE_Body','BODYFORGE_Shirt','BODYFORGE_Shorts','BODYFORGE_SkinNipples','BODYFORGE_ChestMark'];
const file='public/assets/bodyforge-athlete-efficient.glb';
const expected='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e';
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(file);
if(hash(bytes)!==expected)throw Error('Pinned asset drift');
if(data.id!=='BF_ARTEC_TORSO_RELIEF_DEV_V1'||data.width!==41||data.height!==47||data.front.length!==1927||data.back.length!==1927)throw Error('Field drift');
const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
const coeff=Array.from({length:4},()=>new Float64Array(12));
const d=new Float64Array(3),j=new Float64Array(9),base=new Float64Array(12);
const a=new Float64Array(432),b=new Float64Array(432);
const results=[];
let count=0,checked=0,failed=0;
for(const name of meshes){
  const mesh=scene.getObjectByName(name);
  if(!mesh?.isSkinnedMesh)throw Error('Missing skinned surface '+name);
  const p=mesh.geometry.getAttribute('position');
  let minDet=Infinity,maxSq=0,worst=null,failures=0,identity=0,affected=0;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(![x,y,z].every(Number.isFinite))throw Error('Nonfinite vertex');
    d.fill(0);j.fill(0);addAvatarScanTorsoRelief(data,x,y,z,0,0,d,j);
    base.set(d);base.set(j,3);
    if(Math.hypot(...d)>.00003)affected++;
    for(let g=0;g<4;g++){
      d.fill(0);j.fill(0);
      for(const lobe of MUSCLE_LOBES[names[g]])addMuscleLobe(lobe,1,x,y,z,d,j);
      const c=coeff[g];c.set(d);c.set(j,3);
      if(g===1||g===3){
        d.fill(0);j.fill(0);addAvatarScanTorsoRelief(data,x,y,z,g===1?1:0,g===3?1:0,d,j);
        for(let k=0;k<3;k++)c[k]+=d[k]-base[k];
        for(let k=0;k<9;k++)c[k+3]+=j[k]-base[k+3];
      }
    }
    if(!base.some(v=>v!==0)&&!coeff.some(v=>v.some(q=>q!==0))){
      identity++;if(minDet>1){minDet=1;worst={i,levels:[0,0,0,0],point:[x,y,z],det:1};}continue;
    }
    for(let v=0;v<36;v++){
      const m=Math.floor(v/6)/5,n=(v%6)/5,o=v*12;
      for(let k=0;k<12;k++){
        a[o+k]=base[k]+m*coeff[1][k]+n*coeff[3][k];
        b[o+k]=m*coeff[0][k]+n*coeff[2][k];
      }
    }
    for(let v=0;v<36;v++){
      const u=v*12;
      for(let w=0;w<36;w++){
        const t=w*12,dx=a[u]+b[t],dy=a[u+1]+b[t+1],dz=a[u+2]+b[t+2];
        const A=1+a[u+3]+b[t+3],B=a[u+4]+b[t+4],C=a[u+5]+b[t+5];
        const D=a[u+6]+b[t+6],E=1+a[u+7]+b[t+7],F=a[u+8]+b[t+8];
        const G=a[u+9]+b[t+9],H=a[u+10]+b[t+10],I=1+a[u+11]+b[t+11];
        const det=A*(E*I-F*H)-B*(D*I-F*G)+C*(D*H-E*G);
        const sq=dx*dx+dy*dy+dz*dz;
        if(!Number.isFinite(det)||!Number.isFinite(sq)||det<=.25||sq>=.0025)failures++;
        if(det<minDet){minDet=det;worst={i,levels:[Math.floor(w/6),Math.floor(v/6),w%6,v%6],point:[x,y,z],det};}
        if(sq>maxSq)maxSq=sq;
      }
    }
  }
  const r={name,vertices:p.count,statesPerVertex:1296,covered:p.count*1296,explicit:(p.count-identity)*1296,identityVertices:identity,affectedAtBase:affected,minDet,maxDisplacementMm:Math.sqrt(maxSq)*1000,failures,worst};
  count+=p.count;checked+=r.covered;failed+=failures;results.push(r);console.log(JSON.stringify(r));
}
const out={status:failed===0?'PASS':'FAIL',scope:'All 6^4 discrete levels at each actual raw bind-space vertex; scan and 31 muscle envelopes; excludes posed triangles, clothing folds, collisions and artistic evaluation',asset:{file,bytes:bytes.length,sha256:hash(bytes)},sourceHashes:Object.fromEntries(['src/lib/avatarMuscleAnatomy.ts','src/lib/avatarScanTorsoRelief.ts','src/lib/avatarScanTorsoReviewData.ts','src/lib/avatarPhysique.ts'].map(p=>[p,hash(fs.readFileSync(p))])),vertices:count,states:1296,covered:checked,explicit:results.reduce((n,r)=>n+r.explicit,0),failures:failed,minDet:Math.min(...results.map(r=>r.minDet)),maxDisplacementMm:Math.max(...results.map(r=>r.maxDisplacementMm)),meshes:results};
const dest=path.resolve(process.argv[2]||'docs/audits/BF_AVATAR_SCAN_QC_20261127/field-qc.json');
fs.writeFileSync(dest,JSON.stringify(out,null,2),{flag:'wx'});
console.log('FIELD_QC',JSON.stringify(out));
process.exitCode=failed===0?0:1;
