import type { BodyBuild } from './game';
import { ZONE_IDS, ZONE_POINT_MAX, normalizeZoneProgress, type ZoneLevels } from './muscleZones';

export const ZONE_CHANNELS = ['BUILD_LEAN','BUILD_SOLID','BUILD_FULL',...ZONE_IDS.flatMap(id=>[id.toUpperCase()+'_VOLUME',id.toUpperCase()+'_RELIEF'])] as const;
export type ZoneWeights = Record<string,number>;
export const ZONE_MESH_NAMES = ['BF_Foundation_Skin','BF_Foundation_TorsoSkin','BF_Foundation_Shorts','BF_Foundation_Shirt'] as const;
interface Channel { key: string; count: number; offset: number }
export interface SparsePart { name: string; vertices: number; positionSha256: string; channels: Channel[] }
export interface SparseFields { data: DataView; parts: SparsePart[] }
const RECORD_BYTES = 28;
const int = (v: unknown, min: number, max: number): v is number => typeof v==='number' && Number.isSafeInteger(v) && v>=min && v<=max;
const object = (v: unknown): v is Record<string,unknown> => v!==null && typeof v==='object' && !Array.isArray(v);

export function zoneWeights(build: BodyBuild, levels: ZoneLevels, relief=true): ZoneWeights {
  if (!normalizeZoneProgress({version:1,levels}) || !['lean','solid','full'].includes(build)) throw Error('Invalid regional state');
  const w: ZoneWeights = {BUILD_LEAN:Number(build==='lean'),BUILD_SOLID:Number(build==='solid'),BUILD_FULL:Number(build==='full')};
  for (const id of ZONE_IDS) {
    const t=levels[id]/ZONE_POINT_MAX;
    w[id.toUpperCase()+'_VOLUME']=t;
    w[id.toUpperCase()+'_RELIEF']=relief ? .35*t+.65*t*t : 0;
  }
  return w;
}

/** Strict, bounded decode. Offsets and sorted vertex indices are checked once
 * before any mesh is allowed to accept paid geometry changes. */
export function decodeZoneFields(buffer: ArrayBuffer): SparseFields {
  if (buffer.byteLength<12 || buffer.byteLength>48*1024*1024) throw Error('Invalid zone field length');
  const view=new DataView(buffer);
  if (view.getUint32(0,false)!==0x42465a34) throw Error('Invalid field magic');
  const size=view.getUint32(4,true);
  if (!int(size,4,128*1024)||size%4!==0||8+size>buffer.byteLength) throw Error('Invalid field header');
  const header:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(buffer,8,size)));
  if (!object(header)||header.version!==1||header.recordBytes!==RECORD_BYTES||!Array.isArray(header.keys)||
      header.keys.length!==ZONE_CHANNELS.length||!ZONE_CHANNELS.every((k,i)=>(header.keys as unknown[])[i]===k)||
      !Array.isArray(header.parts)||header.parts.length!==ZONE_MESH_NAMES.length) throw Error('Invalid field schema');
  const data=new DataView(buffer,8+size);
  let offset=0;
  const seen=new Set<string>(),parts:SparsePart[]=[];
  for (const raw of header.parts) {
    if (!object(raw)||typeof raw.name!=='string'||!ZONE_MESH_NAMES.some(n=>n===raw.name)||seen.has(raw.name)||
        !int(raw.vertices,1,100000)||typeof raw.positionSha256!=='string'||!/^([a-f0-9]{64})$/.test(raw.positionSha256)||
        !Array.isArray(raw.channels)||raw.channels.length!==ZONE_CHANNELS.length) throw Error('Invalid field mesh');
    seen.add(raw.name);
    const channels:Channel[]=[];
    for (let i=0;i<ZONE_CHANNELS.length;i++) {
      const c:unknown=raw.channels[i];
      if (!object(c)||c.key!==ZONE_CHANNELS[i]||!int(c.count,0,raw.vertices)||c.offset!==offset||
          offset+c.count*RECORD_BYTES>data.byteLength) throw Error('Invalid field range');
      let last=-1;
      for(let j=0;j<c.count;j++) {
        const pos=offset+j*RECORD_BYTES, idx=data.getUint32(pos,true);
        if(idx<=last||idx>=raw.vertices)throw Error('Invalid field vertex');
        last=idx;
        for(let k=1;k<=6;k++){
          const n=data.getFloat32(pos+k*4,true);
          if(!Number.isFinite(n)||Math.abs(n)>(k<=3?.22:2.1))throw Error('Invalid field component');
        }
      }
      channels.push({key:ZONE_CHANNELS[i],count:c.count,offset});
      offset+=c.count*RECORD_BYTES;
    }
    parts.push({name:raw.name,vertices:raw.vertices,positionSha256:raw.positionSha256,channels});
  }
  if(offset!==data.byteLength)throw Error('Extra field payload');
  return {data,parts};
}

/** Always rebuild from immutable rest arrays. No cumulative drift and no
 * 33-layer GPU morph texture. The supplied normal field is additive and
 * renormalized after deformation. */
export function applyZonePart(fields:SparseFields,part:SparsePart,restP:Float32Array,restN:Float32Array,
    outP:Float32Array,outN:Float32Array,weights:ZoneWeights): void {
  if(restP.length!==part.vertices*3||restN.length!==restP.length||outP.length!==restP.length||outN.length!==restP.length||
      restP===outP||restN===outN)throw Error('Invalid field buffers');
  outP.set(restP);outN.set(restN);
  const data=fields.data;
  for(const c of part.channels) {
    const w=weights[c.key];
    if(!Number.isFinite(w)||w<0||w>1)throw Error('Invalid field weight');
    if(w===0)continue;
    for(let i=0;i<c.count;i++){
      const p=c.offset+i*RECORD_BYTES,j=data.getUint32(p,true)*3;
      outP[j]+=w*data.getFloat32(p+4,true);outP[j+1]+=w*data.getFloat32(p+8,true);outP[j+2]+=w*data.getFloat32(p+12,true);
      outN[j]+=w*data.getFloat32(p+16,true);outN[j+1]+=w*data.getFloat32(p+20,true);outN[j+2]+=w*data.getFloat32(p+24,true);
    }
  }
  for(let i=0;i<outN.length;i+=3){
    const len=Math.hypot(outN[i],outN[i+1],outN[i+2]);
    if(!Number.isFinite(len)||len<1e-6)throw Error('Invalid deformed normal');
    outN[i]/=len;outN[i+1]/=len;outN[i+2]/=len;
  }
}
export function geometryFingerprint(values:Float32Array): string {
  let hash=2166136261;
  const words=new Uint32Array(values.buffer,values.byteOffset,values.length);
  for(const word of words)hash=Math.imul(hash^word,16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
