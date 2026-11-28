import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFoundationBlink, decodeFoundationBlink } from './regionalFoundationBlink';
import type { SparseFields, SparsePart } from './zoneMorphRuntime';
// Synthetic binary for portable unit tests. The real pinned asset is tested in browser QA.
function fixture(){
  const count=2285,frames=21,buf=new ArrayBuffer(1161064),v=new DataView(buf);
  const part:SparsePart={name:'BF_Foundation_Skin',vertices:41476,positionSha256:'de74cfe31458b17f28b096300d4ce319a294c16f997f297b934e725b7d0668ff',channels:[]};
  const h=buf.byteLength-8-count*4-frames*count*6*4;
  const header=new TextEncoder().encode(JSON.stringify({version:1,mesh:part.name,vertices:part.vertices,positionSha256:part.positionSha256,count,frames,recordFloats:6,sourceCandidateSha256:'3a8cc29c0e0c599a994bb784522d05d48884ab20b092c2cd23a502d5bbac61b7'}));
  if(header.length>h)throw Error('fixture header');
  v.setUint32(0,0x42464231,false);v.setUint32(4,h,true);
  new Uint8Array(buf,8,h).fill(32);new Uint8Array(buf,8,header.length).set(header);
  const fields:SparseFields={data:new DataView(new ArrayBuffer(28)),parts:[part]};
  const p=new Float32Array(part.vertices*3),n=p.slice(),start=8+h+count*4;
  const ids:number[]=[];
  for(let i=0;i<count;i++){
    const j=i+100;ids.push(j);v.setUint32(8+h+i*4,j,true);
    for(let f=0;f<frames;f++){
      const off=start+(f*count+i)*24;
      const values=[.025+(i%20)*.0001,1.57-.008*f/20,.13,0,0,1];
      values.forEach((a,k)=>v.setFloat32(off+k*4,a,true));
      if(f===0)for(let k=0;k<3;k++){p[j*3+k]=v.getFloat32(off+k*4,true);n[j*3+k]=v.getFloat32(off+(k+3)*4,true);}
    }
  }
  return {buf,v,h,part,fields,p,n,ids,start};
}
const equal=(a:ArrayLike<number>,b:ArrayLike<number>)=>a.length===b.length&&Array.prototype.every.call(a,(value:number,i:number)=>value===b[i]);
describe('pinned V10 eyelid animation',()=>{
  it('loads the exact 21-frame field and rejects malformed or mismatched inputs',()=>{
    const x=fixture();
    const data=decodeFoundationBlink(x.buf,x.fields,x.part,x.p,x.n);
    expect(data.ids.length).toBe(2285);expect(data.values.length).toBe(21*2285*6);
    expect(()=>decodeFoundationBlink(x.buf.slice(0,-4),x.fields,x.part,x.p,x.n)).toThrow('scope');
    const bad=x.buf.slice(0);new DataView(bad).setUint32(0,0,false);
    expect(()=>decodeFoundationBlink(bad,x.fields,x.part,x.p,x.n)).toThrow('magic');
    const nonfinite=x.buf.slice(0);new DataView(nonfinite).setFloat32(x.start+4*2285*6,NaN,true);
    expect(()=>decodeFoundationBlink(nonfinite,x.fields,x.part,x.p,x.n)).toThrow('Nonfinite');
    x.p[x.ids[0]*3]+=.00001;
    expect(()=>decodeFoundationBlink(x.buf,x.fields,x.part,x.p,x.n)).toThrow('preimage');
  });
  it('fails closed when a paid field touches an eyelid row',()=>{
    const x=fixture();
    x.fields.data.setUint32(0,x.ids[0],true);x.part.channels.push({key:'BUILD_LEAN',count:1,offset:0});
    expect(()=>decodeFoundationBlink(x.buf,x.fields,x.part,x.p,x.n)).toThrow('paid field');
  });
  it('interpolates absolute shapes, leaves unrelated vertices intact and resets exactly',()=>{
    const x=fixture(),field=decodeFoundationBlink(x.buf,x.fields,x.part,x.p,x.n);
    const g=new THREE.BufferGeometry(),p=new THREE.BufferAttribute(x.p.slice(),3),n=new THREE.BufferAttribute(x.n.slice(),3);
    g.setAttribute('position',p);g.setAttribute('normal',n);
    const mesh=new THREE.SkinnedMesh(g,new THREE.MeshBasicMaterial()),rig=createFoundationBlink(mesh,field);
    rig.reset();const base=p.array.slice(),baseN=n.array.slice();
    rig.pose(1);const closed=p.array.slice();expect(equal(closed,base)).toBe(false);
    rig.pose(.325);const middle=p.array.slice();
    for(let i=0;i<50;i++){rig.pose(i/50);rig.pose(.325);}
    expect(equal(p.array,middle)).toBe(true);
    // Growth may refresh neutral buffers during an active blink.
    p.array.set(base);n.array.set(baseN);rig.reapply();expect(equal(p.array,middle)).toBe(true);
    rig.reset();expect(equal(p.array,base)).toBe(true);expect(equal(n.array,baseN)).toBe(true);
    rig.pose(NaN);expect(equal(p.array,base)).toBe(true);
    const touched=new Set(x.ids);for(let i=0;i<p.count;i++)if(!touched.has(i))for(let k=0;k<3;k++)if(closed[3*i+k]!==base[3*i+k])throw Error('Unrelated vertex drift '+i);
    mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();
  });
});
