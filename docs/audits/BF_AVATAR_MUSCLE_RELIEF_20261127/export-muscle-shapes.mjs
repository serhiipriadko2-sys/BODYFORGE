// Export the exact raw-mesh V2 growth and V1 relief deltas, no scan-derived data.
// For a local Blender shape-key authoring review only (not the final posed runtime).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {addAvatarAthleticReviewGrowth} from '../../../src/lib/avatarAthleticReview.ts';
import {addAvatarMuscleRelief,MUSCLE_RELIEF_CONTROLS} from '../../../src/lib/avatarMuscleReliefReview.ts';
import assert from 'node:assert/strict';
const root=process.cwd(),dir=path.join(root,'.bodyforge-qa','muscle-relief-v1');
const asset='public/assets/bodyforge-athlete-efficient.glb',bytes=fs.readFileSync(asset);
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(sha(bytes),'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e');
assert.equal(os.endianness(),'LE');
const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
const groups=['arms','core','legs','back'];
const names=[['BODYFORGE_Body',65895],['BODYFORGE_Shirt',4415],['BODYFORGE_Shorts',1568],['BODYFORGE_SkinNipples',458],['BODYFORGE_ChestMark',8]];
const buffers=[],meshes=[],d=new Float64Array(3),j=new Float64Array(9);
let offset=0;
function append(a){
  const b=Buffer.from(a.buffer,a.byteOffset,a.byteLength),r={offset,bytes:b.byteLength};
  buffers.push(b);offset+=b.byteLength;return r;
}
for(const [name,count] of names){
  const mesh=scene.getObjectByName(name),p=mesh?.geometry.getAttribute('position');
  assert(mesh?.isSkinnedMesh);assert.equal(p.count,count);
  const pos=new Float32Array(count*3);
  for(let i=0;i<count;i++)pos.set([p.getX(i),p.getY(i),p.getZ(i)],i*3);
  const fields={};
  const source=append(pos);
  for(const g of groups){
    fields[g]={};
    for(const [kind,fn] of [['volume',addAvatarAthleticReviewGrowth],['relief',addAvatarMuscleRelief]]){
      const a=new Float32Array(count*3);
      let active=0,peak=0;
      for(let i=0;i<count;i++){
        d.fill(0);j.fill(0);fn(g,1,pos[i*3],pos[i*3+1],pos[i*3+2],d,j);
        const length=Math.hypot(...d);assert(Number.isFinite(length));
        if(length>.0001)active++;
        peak=Math.max(peak,length);
        a.set(d,i*3);
      }
      fields[g][kind]={...append(a),activeAbove01mm:active,peakMm:peak*1000};
    }
  }
  meshes.push({name,count,source,fields});
}
const binary=Buffer.concat(buffers,offset);
const meta={schema:'BF_MUSCLE_SHAPE_REVIEW_V1',scope:'Raw bind-pose CC0 mesh deltas only; excludes scan relief, cloth fitting, pose, bone scaling and runtime materials.',assetSha256:sha(bytes),binaryBytes:binary.length,binarySha256:sha(binary),groups,meshes,controls:MUSCLE_RELIEF_CONTROLS,sourceHashes:Object.fromEntries(['src/lib/avatarAthleticReview.ts','src/lib/avatarMuscleReliefReview.ts'].map(p=>[p,sha(fs.readFileSync(p))]))};
fs.writeFileSync(path.join(dir,'muscle-shapes.bin'),binary,{flag:'wx'});
fs.writeFileSync(path.join(dir,'muscle-shapes.json'),JSON.stringify(meta,null,2),{flag:'wx'});
console.log('MUSCLE_SHAPE_EXPORT',JSON.stringify({meshes:meshes.length,vertices:meshes.reduce((n,m)=>n+m.count,0),bytes:binary.length,sha256:meta.binarySha256}));
