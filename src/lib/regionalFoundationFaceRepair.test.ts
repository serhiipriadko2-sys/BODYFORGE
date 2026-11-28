import { describe, expect, it } from 'vitest';
import { FACE_REPAIR_V9 } from './regionalFoundationFaceData';
import { repairFoundationFaceRest } from './regionalFoundationFaceRepair';
import type { SparseFields, SparsePart } from './zoneMorphRuntime';
function fixture() {
  const part:SparsePart={name:'BF_Foundation_Skin',vertices:41476,positionSha256:'de74cfe31458b17f28b096300d4ce319a294c16f997f297b934e725b7d0668ff',channels:[]};
  const data=new DataView(new ArrayBuffer(28)),fields:SparseFields={data,parts:[part]};
  const p=new Float32Array(part.vertices*3),n=p.slice();
  const rows=FACE_REPAIR_V9;
  for(let i=0;i<rows.length;i+=13){
    p.set(rows.subarray(i+1,i+4),rows[i]*3);
    n.set(rows.subarray(i+4,i+7),rows[i]*3);
  }
  return {part,fields,p,n,rows};
}
describe('V9 topology-reflected neutral face repair',()=>{
  it('replaces only the 705 pinned rows, retaining all unrelated coordinates and normals',()=>{
    const {part,fields,p,n,rows}=fixture(),a=p.slice(),b=n.slice();
    expect(repairFoundationFaceRest(fields,part,p,n)).toBe(705);
    for(let i=0;i<rows.length;i+=13){
      a.set(rows.subarray(i+7,i+10),rows[i]*3);
      b.set(rows.subarray(i+10,i+13),rows[i]*3);
    }
    expect(p).toEqual(a);expect(n).toEqual(b);
  });
  it('fails closed without writing any row if even the last preimage differs',()=>{
    const {part,fields,p,n,rows}=fixture();
    p[rows[rows.length-13]*3]+=.00001;
    const a=p.slice(),b=n.slice();
    expect(()=>repairFoundationFaceRest(fields,part,p,n)).toThrow('preimage');
    expect(p).toEqual(a);expect(n).toEqual(b);
  });
  it('rejects a paid channel touching the repair',()=>{
    const {part,fields,p,n,rows}=fixture();
    fields.data.setUint32(0,rows[0],true);part.channels.push({key:'BUILD_LEAN',count:1,offset:0});
    const a=p.slice(),b=n.slice();
    expect(()=>repairFoundationFaceRest(fields,part,p,n)).toThrow('paid fields');
    expect(p).toEqual(a);expect(n).toEqual(b);
  });
  it('rejects unknown rest mesh scope',()=>{
    const {part,fields,p,n}=fixture();part.name='BF_Foundation_TorsoSkin';
    expect(()=>repairFoundationFaceRest(fields,part,p,n)).toThrow('scope');
  });
});
