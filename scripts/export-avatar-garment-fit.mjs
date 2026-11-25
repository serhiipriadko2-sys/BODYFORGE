// Extract exact runtime vertex ordering from the pinned compact GLB.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const [source,seams,out]=process.argv.slice(2);
const bytes=Uint8Array.from(fs.readFileSync(source));
const sha=createHash('sha256').update(bytes).digest('hex');
if(sha!=='df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e') throw Error('Unexpected GLB');
const seamBytes=fs.readFileSync(seams);
const seamHash=createHash('sha256').update(seamBytes).digest('hex');
if(seamHash!=='be33083fbbda9e60ac516bef95d8cc7c6afa725236f8c83ecf375c044391c8e7') throw Error('Unexpected seam recipe');
const recipe=JSON.parse(seamBytes);
const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
const attr=(a)=>Array.from({length:a.count},(_,i)=>[a.getX(i),a.getY(i),a.getZ(i)]);
const garments=recipe.garments.map(spec=>{
  const m=scene.getObjectByName(spec.name),g=m.geometry;
  if(!m.isSkinnedMesh||g.attributes.position.count!==spec.vertexCount)throw Error('Wrong garment');
  return {name:spec.name,positions:attr(g.attributes.position),normals:attr(g.attributes.normal),
    indices:[...g.index.array,...spec.patchIndices],loops:spec.loops};
});
fs.writeFileSync(out,JSON.stringify({sourceSha256:sha,seamSha256:seamHash,garments}),{flag:'wx'});
