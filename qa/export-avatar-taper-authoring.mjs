// Authoring bridge: exact runtime muscle displacements, no approximated Python copy.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ATHLETIC_REVIEW_ID,addAvatarAthleticReviewGrowth} from '../src/lib/avatarAthleticReview.ts';
const hash=b=>createHash('sha256').update(b).digest('hex');
const asset=fs.readFileSync('public/assets/bodyforge-athlete-efficient.glb');
if(hash(asset)!=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e')throw Error('Asset drift');
const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(asset).buffer,'');
const names=['BODYFORGE_Body','BODYFORGE_Shirt','BODYFORGE_Shorts','BODYFORGE_SkinNipples','BODYFORGE_ChestMark'],groups=['arms','core','legs','back'];
const chunks=[],meshes=[],d=new Float64Array(3),j=new Float64Array(9);
let offset=0;
for(const name of names){
 const p=scene.getObjectByName(name).geometry.getAttribute('position'),a=new Float32Array(p.count*15);
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=i*15;a.set([x,y,z],k);
  for(let g=0;g<4;g++){d.fill(0);j.fill(0);addAvatarAthleticReviewGrowth(groups[g],1,x,y,z,d,j);a.set(d,k+3+3*g);}
 }
 const b=Buffer.from(a.buffer);chunks.push(b);meshes.push({name,count:p.count,offset,bytes:b.length});offset+=b.length;
}
const bytes=Buffer.concat(chunks),prefix=process.argv[2];
fs.writeFileSync(prefix+'.bin',bytes,{flag:'wx'});
fs.writeFileSync(prefix+'.json',JSON.stringify({revision:ATHLETIC_REVIEW_ID,groups,meshes,bytes:bytes.length,sha256:hash(bytes),fieldSha256:hash(fs.readFileSync('src/lib/avatarAthleticReview.ts'))},null,2),{flag:'wx'});
console.log('AUTHORING_BRIDGE',bytes.length,hash(bytes));
