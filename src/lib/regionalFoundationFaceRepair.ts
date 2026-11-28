import type { SparseFields, SparsePart } from './zoneMorphRuntime';
import { FACE_REPAIR_V9 } from './regionalFoundationFaceData';

/** A pinned local correction on the CC0 V6 skin only. Generated from exact
 * reflected quad topology and independently checked on exported triangles.
 * Every preimage is checked before mutation; no paid field may touch a row. */
export function repairFoundationFaceRest(fields: SparseFields, part: SparsePart, p: Float32Array, n: Float32Array): number {
  if(part.name!=='BF_Foundation_Skin'||part.vertices!==41476||
     part.positionSha256!=='de74cfe31458b17f28b096300d4ce319a294c16f997f297b934e725b7d0668ff'||
     p.length!==part.vertices*3||n.length!==p.length||p===n||FACE_REPAIR_V9.length!==705*13)
    throw Error('Invalid face repair scope');
  const rows=FACE_REPAIR_V9,ids=new Set<number>();
  let last=-1;
  for(let i=0;i<rows.length;i+=13){
    const id=rows[i],j=id*3;
    if(!Number.isInteger(id)||id<=last||id>=part.vertices||p[j+1]<=1.48)throw Error('Invalid face repair index');
    last=id;ids.add(id);
    for(let k=0;k<3;k++){
      if(p[j+k]!==rows[i+1+k]||n[j+k]!==rows[i+4+k]||
         !Number.isFinite(rows[i+7+k])||!Number.isFinite(rows[i+10+k]))throw Error('Face repair preimage mismatch');
    }
    if(Math.hypot(rows[i+7]-p[j],rows[i+8]-p[j+1],rows[i+9]-p[j+2])>.0021||
       Math.abs(Math.hypot(rows[i+10],rows[i+11],rows[i+12])-1)>2e-5)throw Error('Face repair outside envelope');
  }
  for(const ch of part.channels)for(let i=0;i<ch.count;i++){
    const idx=fields.data.getUint32(ch.offset+28*i,true);
    if(ids.has(idx))throw Error('Face repair intersects paid fields');
  }
  for(let i=0;i<rows.length;i+=13){
    const j=rows[i]*3;
    p.set(rows.subarray(i+7,i+10),j);
    n.set(rows.subarray(i+10,i+13),j);
  }
  return ids.size;
}
