// Measure signed radial change on actual limb vertices, grouped by bind-space
// axial position and skin weights. These are sample statistics, not girths.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {ATHLETIC_REVIEW_ID, ATHLETIC_REVIEW_AXES, addAvatarAthleticReviewGrowth} from '../src/lib/avatarAthleticReview.ts';
import {Vector3} from 'three';
const file='public/assets/bodyforge-athlete-efficient.glb', bytes=fs.readFileSync(file);
const hash=b=>createHash('sha256').update(b).digest('hex');
if(hash(bytes)!=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e')throw Error('Asset drift');
const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
const body=scene.getObjectByName('BODYFORGE_Body'),p=body.geometry.getAttribute('position'),skin=body.geometry.getAttribute('skinIndex'),weights=body.geometry.getAttribute('skinWeight');
const d=new Float64Array(3),j=new Float64Array(9);
const rows=[];
const quantile=(list,q)=>list[Math.floor((list.length-1)*q)];
for(const [group,axis,prefix] of [['arms',ATHLETIC_REVIEW_AXES.arms[0],'upperarm'],['arms',ATHLETIC_REVIEW_AXES.arms[1],'lowerarm'],['legs',ATHLETIC_REVIEW_AXES.legs[0],'upperleg'],['legs',ATHLETIC_REVIEW_AXES.legs[1],'lowerleg']]){
 const start=new Vector3(...axis.start),u=new Vector3(...axis.end).sub(start),len=u.length();u.normalize();
 const bins=Array.from({length:3},()=>[]);
 const seen=new Set();
 for(let i=0;i<p.count;i++){
  const pt=new Vector3(p.getX(i),p.getY(i),p.getZ(i));if(pt.x<=0)continue;
  const key=pt.toArray().map(v=>Math.round(v*1e6)).join(',');if(seen.has(key))continue;seen.add(key);
  let w=0;
  for(let k=0;k<4;k++){const n=body.skeleton.bones[skin.getComponent(i,k)]?.name.toLowerCase();if(n?.startsWith(prefix)&&n.endsWith('l'))w+=weights.getComponent(i,k);}
  if(w<.60)continue;
  const r=pt.clone().sub(start),t=r.dot(u)/len;r.addScaledVector(u,-t*len);
  if(t<.15||t>=.9||r.length()<.012||r.length()>.13)continue;
  const b=t<.4?0:t<.65?1:2;
  d.fill(0);j.fill(0);addAvatarAthleticReviewGrowth(group,1,pt.x,pt.y,pt.z,d,j);
  const delta=new Vector3(...d);const perpendicular=delta.clone().addScaledVector(u,-delta.dot(u));
  const mm=(r.clone().add(perpendicular).length()-r.length())*1000;
  bins[b].push({mm,posterior:r.z<-.012,anterior:r.z>.012});
 }
 for(const [b,list] of bins.entries()){
  if(list.length<12)throw Error('Insufficient samples '+axis.name+' '+b+' '+list.length);
  const values=list.map(v=>v.mm).sort((a,b)=>a-b);
  const mean=a=>a.length?a.reduce((s,v)=>s+v.mm,0)/a.length:null;
  rows.push({segment:axis.name,bin:['proximal','middle','distal'][b],vertices:list.length,medianMm:quantile(values,.5),p90Mm:quantile(values,.9),meanMm:mean(list),posteriorMeanMm:mean(list.filter(v=>v.posterior)),anteriorMeanMm:mean(list.filter(v=>v.anterior))});
 }
}
const out={revision:ATHLETIC_REVIEW_ID,scope:'Deduplicated left surface vertices with >=60% named segment skin weights, signed radial change in original bind-space axial bins; excludes bone growth, not circumference or clinical data',sourceSha256:hash(fs.readFileSync('src/lib/avatarAthleticReview.ts')),rows};
fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2),{flag:'wx'});
console.log(JSON.stringify(out));
