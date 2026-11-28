import * as THREE from 'three';
import type { SparseFields, SparsePart } from './zoneMorphRuntime';

const COUNT=2285,FRAMES=21,COMPONENTS=6;
const POSITION_PIN='de74cfe31458b17f28b096300d4ce319a294c16f997f297b934e725b7d0668ff';
const CANDIDATE_PIN='3a8cc29c0e0c599a994bb784522d05d48884ab20b092c2cd23a502d5bbac61b7';
export interface FoundationBlinkFields { ids:Uint32Array; values:Float32Array }
export interface FoundationBlinkRig { pose(blink:number):void; reset():void; reapply():void }

/** Exact offline bake, independently collision-screened. No runtime network
 * or physics solver. Fail closed on mismatched mesh, fields or preimages. */
export function decodeFoundationBlink(buffer:ArrayBuffer,fields:SparseFields,part:SparsePart,
  restP:Float32Array,restN:Float32Array):FoundationBlinkFields {
  if(buffer.byteLength!==1161064||part.name!=='BF_Foundation_Skin'||part.vertices!==41476||
     part.positionSha256!==POSITION_PIN||restP.length!==part.vertices*3||restN.length!==restP.length)
    throw Error('Invalid blink asset scope');
  const v=new DataView(buffer);
  if(v.getUint32(0,false)!==0x42464231)throw Error('Invalid blink magic');
  const size=v.getUint32(4,true);
  if(size<32||size>2048||size%4!==0||8+size+4*COUNT+4*COUNT*FRAMES*COMPONENTS!==buffer.byteLength)
    throw Error('Invalid blink length');
  const h=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(buffer,8,size)));
  if(!h||h.version!==1||h.mesh!==part.name||h.vertices!==part.vertices||
     h.positionSha256!==POSITION_PIN||h.count!==COUNT||h.frames!==FRAMES||h.recordFloats!==COMPONENTS||
     h.sourceCandidateSha256!==CANDIDATE_PIN)throw Error('Invalid blink header');
  const ids=new Uint32Array(COUNT),seen=new Set<number>();
  let last=-1;
  for(let i=0;i<COUNT;i++){
    const j=v.getUint32(8+size+i*4,true);
    if(j<=last||j>=part.vertices||restP[j*3+1]<=1.48)throw Error('Invalid blink vertex');
    last=j;ids[i]=j;seen.add(j);
  }
  for(const ch of part.channels)for(let i=0;i<ch.count;i++)
    if(seen.has(fields.data.getUint32(ch.offset+i*28,true)))throw Error('Blink touches paid field');
  const values=new Float32Array(COUNT*FRAMES*COMPONENTS),offset=8+size+COUNT*4;
  for(let frame=0;frame<FRAMES;frame++)for(let i=0;i<COUNT;i++){
    const p=ids[i]*3,j=(frame*COUNT+i)*COMPONENTS;
    for(let k=0;k<6;k++){
      const n=v.getFloat32(offset+(j+k)*4,true);
      if(!Number.isFinite(n))throw Error('Nonfinite blink field');
      values[j+k]=n;
    }
    if(frame===0){
      for(let k=0;k<3;k++)if(values[j+k]!==restP[p+k]||values[j+3+k]!==restN[p+k])
        throw Error('Blink neutral preimage mismatch');
    }
    if(Math.hypot(values[j]-restP[p],values[j+1]-restP[p+1],values[j+2]-restP[p+2])>.009||
      Math.abs(Math.hypot(values[j+3],values[j+4],values[j+5])-1)>2e-5)
      throw Error('Blink outside geometry envelope');
  }
  return {ids,values};
}
export function createFoundationBlink(mesh:THREE.SkinnedMesh,field:FoundationBlinkFields):FoundationBlinkRig {
  const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
  if(!(p instanceof THREE.BufferAttribute)||!(n instanceof THREE.BufferAttribute)||
     !(p.array instanceof Float32Array)||!(n.array instanceof Float32Array)||
     p.count!==41476||n.count!==p.count||p.itemSize!==3||n.itemSize!==3||
     field.ids.length!==COUNT||field.values.length!==COUNT*FRAMES*COMPONENTS)throw Error('Invalid blink geometry');
  let current=0,applied=false;
  const values=field.values;
  const write=(b:number)=>{
    const frame=b*(FRAMES-1),k=Math.min(FRAMES-2,Math.floor(frame)),t=frame-k;
    for(let i=0;i<COUNT;i++){
      const id=field.ids[i],a=(k*COUNT+i)*COMPONENTS,z=a+COUNT*COMPONENTS;
      const mix=(j:number)=>values[a+j]*(1-t)+values[z+j]*t;
      p.setXYZ(id,mix(0),mix(1),mix(2));
      // Match applyZonePart exactly at neutral (normalize the raw Float32
      // normal); renormalize interpolated normals for shading.
      const x=mix(3),y=mix(4),z0=mix(5),len=Math.hypot(x,y,z0);
      if(!Number.isFinite(len)||len<1e-6)throw Error('Invalid blink normal');
      n.setXYZ(id,x/len,y/len,z0/len);
    }
    p.needsUpdate=n.needsUpdate=true;
    applied=true;
  };
  const pose=(b:number)=>{
    const next=Number.isFinite(b)?THREE.MathUtils.clamp(b,0,1):0;
    if(applied&&next===current)return;
    current=next;write(current);
  };
  return {pose,reset:()=>pose(0),reapply:()=>write(current)};
}
