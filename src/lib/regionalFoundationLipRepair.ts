import type { SparseFields, SparsePart } from './zoneMorphRuntime';

export const LIP_REPAIR_V23_ID='BF_V23_LipCompression';
const COUNT=1289,STRIDE=52,POSITION_COUNT=1009;
const POSITION_PIN='de74cfe31458b17f28b096300d4ce319a294c16f997f297b934e725b7d0668ff';

/** Offline, continuous local compression of the original closed lip geometry.
 * No topology change. The asset is pinned before this function is called.
 * Validate the entire repaired rest preimage, paid fields and blink indices
 * before writing either array. */
export function repairFoundationLipRest(fields:SparseFields,part:SparsePart,p:Float32Array,n:Float32Array,
  bytes:ArrayBuffer,blinkIds:Uint32Array):number {
  if(part.name!=='BF_Foundation_Skin'||part.vertices!==41476||part.positionSha256!==POSITION_PIN||
     p.length!==part.vertices*3||n.length!==p.length||p===n||bytes.byteLength!==COUNT*STRIDE||
     !fields.parts.includes(part)||blinkIds.length!==2285)throw Error('Invalid lip repair scope');
  const view=new DataView(bytes),rows=new Float32Array(COUNT*13),ids=new Set<number>();
  let last=-1,positionCount=0;
  for(let i=0;i<COUNT;i++){
    const r=i*13,off=i*STRIDE;
    for(let k=0;k<13;k++){const v=view.getFloat32(off+k*4,true);if(!Number.isFinite(v))throw Error('Nonfinite lip repair row');rows[r+k]=v;}
    const id=rows[r],j=id*3;
    if(!Number.isInteger(id)||id<=last||id>=part.vertices)throw Error('Invalid lip repair index');
    last=id;ids.add(id);
    for(let k=0;k<3;k++)if(p[j+k]!==rows[r+1+k]||n[j+k]!==rows[r+4+k])throw Error('Lip repair preimage mismatch');
    const x=rows[r+1],y=rows[r+2],z=rows[r+3],dy=rows[r+8]-y;
    const dot=rows[r+4]*rows[r+10]+rows[r+5]*rows[r+11]+rows[r+6]*rows[r+12];
    if(Math.abs(x)>.031||y<1.493||y>1.511||z<.130||z>.156||
       rows[r+7]!==x||rows[r+9]!==z||Math.abs(dy)>.00121||rows[r+8]<1.493||rows[r+8]>1.511||
       Math.abs(Math.hypot(rows[r+10],rows[r+11],rows[r+12])-1)>2e-5||dot<.90)
      throw Error('Lip repair outside measured envelope');
    if(dy!==0)positionCount++;
    else if(rows[r+4]===rows[r+10]&&rows[r+5]===rows[r+11]&&rows[r+6]===rows[r+12])throw Error('Empty lip repair row');
  }
  if(positionCount!==POSITION_COUNT)throw Error('Invalid lip position count');
  for(const c of part.channels)for(let i=0;i<c.count;i++)
    if(ids.has(fields.data.getUint32(c.offset+i*28,true)))throw Error('Lip repair intersects paid fields');
  for(const id of blinkIds)if(ids.has(id))throw Error('Lip repair intersects blink fields');
  for(let r=0;r<rows.length;r+=13){
    const j=rows[r]*3;p.set(rows.subarray(r+7,r+10),j);n.set(rows.subarray(r+10,r+13),j);
  }
  return ids.size;
}
