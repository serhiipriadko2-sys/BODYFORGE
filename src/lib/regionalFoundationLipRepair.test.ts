import {describe,expect,it} from 'vitest';
import {repairFoundationLipRest} from './regionalFoundationLipRepair';
import type {SparseFields,SparsePart} from './zoneMorphRuntime';

function fixture(){
  const part:SparsePart={name:'BF_Foundation_Skin',vertices:41476,positionSha256:'de74cfe31458b17f28b096300d4ce319a294c16f997f297b934e725b7d0668ff',channels:[]};
  const fields:SparseFields={data:new DataView(new ArrayBuffer(28)),parts:[part]};
  const p=new Float32Array(part.vertices*3),n=p.slice(),bytes=new ArrayBuffer(1289*52),rows=new Float32Array(bytes);
  const blinkIds=Uint32Array.from({length:2285},(_,i)=>20000+i);
  for(let i=0;i<1289;i++){
    const id=2000+i,j=id*3,r=i*13,y=1.5000;
    rows.set([id,.01,y,.145,0,0,1,.01,i<1009?y+.0004:y,.145,0,.06,Math.sqrt(1-.06*.06)],r);
    p.set(rows.subarray(r+1,r+4),j);n.set(rows.subarray(r+4,r+7),j);
  }
  return {part,fields,p,n,bytes,rows,blinkIds};
}
const run=(f:ReturnType<typeof fixture>)=>repairFoundationLipRest(f.fields,f.part,f.p,f.n,f.bytes,f.blinkIds);
function fails(f:ReturnType<typeof fixture>,message:string){
  const p=f.p.slice(),n=f.n.slice();expect(()=>run(f)).toThrow(message);expect(f.p).toEqual(p);expect(f.n).toEqual(n);
}
describe('V23 collision-screened lip rest compression',()=>{
  it('updates exactly the pinned 1289 rows, with 1009 moved positions',()=>{
    const f=fixture(),p=f.p.slice(),n=f.n.slice();
    for(let i=0;i<f.rows.length;i+=13){p.set(f.rows.subarray(i+7,i+10),f.rows[i]*3);n.set(f.rows.subarray(i+10,i+13),f.rows[i]*3);}
    expect(run(f)).toBe(1289);expect(f.p).toEqual(p);expect(f.n).toEqual(n);
    fails(f,'preimage');
  });
  it('rejects a final-row preimage mismatch before writing any rows',()=>{
    const f=fixture();f.n[(2000+1288)*3+2]=.99;fails(f,'preimage');
  });
  it('rejects nonfinite, unordered, horizontal or excessive movement',()=>{
    for(const [offset,value,message]of [[10,NaN,'Nonfinite'],[13,2000,'index'],[7,.012,'envelope'],[8,1.503,'envelope']] as const){
      const f=fixture();f.rows[offset]=value;fails(f,message);
    }
  });
  it('rejects a paid field even when preimages and geometry are valid',()=>{
    const f=fixture();f.fields.data.setUint32(0,2000,true);f.part.channels.push({key:'BUILD_LEAN',offset:0,count:1});fails(f,'paid fields');
  });
  it('rejects a blink field touching the same lip vertex',()=>{
    const f=fixture();f.blinkIds[0]=2001;fails(f,'blink fields');
  });
  it('rejects wrong scope and truncated resources',()=>{
    const f=fixture();f.part.name='BF_Foundation_TorsoSkin';fails(f,'scope');
    const g=fixture();g.bytes=g.bytes.slice(0,-4);fails(g,'scope');
  });
  it('rejects an incorrect changed-position count',()=>{
    const f=fixture();f.rows[8]=f.rows[2];fails(f,'position count');
  });
});
