import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {decodeFoundationBrows,installFoundationBrows} from './regionalFoundationBrows';
import {decodeFoundationLashes,installFoundationLashes} from './regionalFoundationLashes';
import {disposeThreeTree} from './threeResources';

const source='c879b219060c9d475fca6d8f02764a1356329b6c0c3ac70a3c9f30dc32e6403d';
const blink='3a8cc29c0e0c599a994bb784522d05d48884ab20b092c2cd23a502d5bbac61b7';
function header(bytes:number,h:number,magic:number,json:object){
  const b=new ArrayBuffer(bytes),d=new DataView(b),text=new TextEncoder().encode(JSON.stringify(json));
  if(text.length>h)throw Error('fixture header');
  d.setUint32(0,magic,false);d.setUint32(4,h,true);
  new Uint8Array(b,8,h).fill(32);new Uint8Array(b,8,text.length).set(text);return {b,d};
}
function fixture(lash:boolean){
  const n=lash?3420:12480,indices=n/12*30,h=lash?168:288,frames=21;
  const result=lash?header(1826456,h,0x42464c31,{version:1,mesh:'BF_Foundation_Lashes',vertices:n,frames,indices,sourceSha256:blink}):
    header(674216,h,0x42464731,{version:1,mesh:'BF_Foundation_Brows',vertices:n,indices,attributes:['position','normal','color','uv'],sourceSha256:source,blinkSha256:blink});
  const {b,d}=result;let off=8+h;
  const put=(a:number)=>{d.setFloat32(off,a,true);off+=4;};
  const position=(i:number,f=0)=>[.032+(i%2)*.0001,(lash?1.573:1.59)+Math.floor(i%12/2)*.0002-f*.0002,.133];
  if(!lash){for(let i=0;i<n;i++)position(i).forEach(put);for(let i=0;i<n;i++)[0,0,1].forEach(put);}
  for(let i=0;i<n;i++)[.8,.77,.75].forEach(put);
  for(let i=0;i<n;i++)[i%2,Math.floor(i%12/2)/5].forEach(put);
  const indexOffset=off;
  for(let i=0;i<n;i+=12)for(let k=0;k<5;k++){
    const a=i+2*k,j=[a,a+1,a+2,a+1,a+3,a+2];
    if(!lash){[j[1],j[2]]=[j[2],j[1]];[j[4],j[5]]=[j[5],j[4]];}
    for(const x of j){d.setUint32(off,x,true);off+=4;}
  }
  const frameOffset=off;
  if(lash)for(let f=0;f<frames;f++)for(let i=0;i<n;i++){position(i,f).forEach(put);[0,0,1].forEach(put);}
  if(off!==b.byteLength)throw Error('fixture length');return {b,d,indexOffset,frameOffset};
}
function rig(){
  const root=new THREE.Group(),g=new THREE.BufferGeometry(),material=new THREE.MeshPhysicalMaterial({vertexColors:true});
  material.name='BF_Foundation_Hair_V2';
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(7200*3),3));
  const j=new Uint16Array(7200*4),w=new Float32Array(7200*4);
  for(let i=0;i<7200;i++){j[i*4]=12;w[i*4]=1;}
  g.setAttribute('skinIndex',new THREE.BufferAttribute(j,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(w,4));
  const bones=Array.from({length:19},(_,i)=>{const b=new THREE.Bone();b.name=i===12?'head':'joint_'+i;root.add(b);return b;});
  const mesh=new THREE.SkinnedMesh(g,material);mesh.name='BF_Foundation_Brows';root.add(mesh);mesh.bind(new THREE.Skeleton(bones));
  return {root,mesh,g,material};
}
const equal=(a:ArrayLike<number>,b:ArrayLike<number>)=>a.length===b.length&&Array.prototype.every.call(a,(x:number,i:number)=>x===b[i]);
describe('V12/V13 pinned face groom decoder',()=>{
  it('validates brow bytes and reverses the authored winding',()=>{
    const x=fixture(false),g=decodeFoundationBrows(x.b);
    expect(g.getAttribute('position').count).toBe(12480);expect(g.index?.count).toBe(31200);
    expect(Array.from(g.index!.array.slice(0,6))).toEqual([0,1,2,1,3,2]);g.dispose();
    expect(()=>decodeFoundationBrows(x.b.slice(0,-4))).toThrow('length');
    const invalid=x.b.slice(0);new DataView(invalid).setUint32(0,0,false);expect(()=>decodeFoundationBrows(invalid)).toThrow('header');
    const nonfinite=x.b.slice(0);new DataView(nonfinite).setFloat32(296,NaN,true);expect(()=>decodeFoundationBrows(nonfinite)).toThrow('Nonfinite');
    x.d.setUint32(x.indexOffset,12480,true);expect(()=>decodeFoundationBrows(x.b)).toThrow('triangle');
  });
  it('checks all eyelash frames and rejects invalid envelope and winding',()=>{
    const x=fixture(true),a=decodeFoundationLashes(x.b);
    expect(a.frames.length).toBe(21*3420*6);expect(a.index.length).toBe(8550);
    const bad=x.b.slice(0);new DataView(bad).setFloat32(x.frameOffset+4,1.2,true);
    expect(()=>decodeFoundationLashes(bad)).toThrow('envelope');
    const wrong=x.b.slice(0),d=new DataView(wrong);d.setUint32(x.indexOffset+4,2,true);d.setUint32(x.indexOffset+8,1,true);
    expect(()=>decodeFoundationLashes(wrong)).toThrow('winding');
    x.d.setFloat32(x.frameOffset+3*4,Infinity,true);expect(()=>decodeFoundationLashes(x.b)).toThrow('Nonfinite');
  });
  it('owns replaced geometry and interpolates the lashes with an exact reset',()=>{
    const {root,mesh,g,material}=rig();let geometryDisposed=0,materialDisposed=0;
    g.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);
    try{
      installFoundationBrows(root,fixture(false).b);expect(geometryDisposed).toBe(1);expect(materialDisposed).toBe(1);
      const lashes=installFoundationLashes(root,fixture(true).b),p=lashes.mesh.geometry.getAttribute('position'),n=lashes.mesh.geometry.getAttribute('normal');
      expect(lashes.mesh.skeleton).toBe(mesh.skeleton);expect(lashes.mesh.parent).toBe(mesh.parent);
      const a=p.array.slice(),b=n.array.slice();lashes.pose(1);expect(equal(a,p.array)).toBe(false);
      lashes.pose(.325);const middle=p.array.slice();
      for(let i=0;i<30;i++){lashes.pose(i/30);lashes.pose(.325);}
      expect(equal(middle,p.array)).toBe(true);
      lashes.reset();expect(equal(a,p.array)&&equal(b,n.array)).toBe(true);
      lashes.pose(NaN);expect(equal(a,p.array)).toBe(true);
      expect(()=>installFoundationLashes(root,fixture(true).b)).toThrow('scope');
    }finally{disposeThreeTree(root);}
  });
});
