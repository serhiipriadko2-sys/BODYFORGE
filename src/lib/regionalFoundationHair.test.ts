import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {createFoundationHairAtlas,decodeFoundationHair,foundationScalpCoverage,installFoundationHair} from './regionalFoundationHair';
import {disposeThreeTree} from './threeResources';
import type {HairStyle} from './avatarLook';

const styles=['buzz','crop','swept'] as const;
const specs={buzz:[27564,68910,1488676,37500],crop:[27456,68640,1482844,47500],swept:[27252,68130,1471828,47500]} as const;
function fixture(style:HairStyle){
  const [n,indices,bytes]=specs[style],h=212,b=new ArrayBuffer(bytes),dv=new DataView(b);
  const header=new TextEncoder().encode(JSON.stringify({version:1,mesh:'BF_Foundation_Hair_'+style,vertices:n,indices,attributes:['position','normal','color','uv'],sourceSha256:'7dc94d5c9755fc6152c20120296d4a2213c18e59b2c970d658b4ef20e8247fa1'}));
  if(header.length>h)throw Error('fixture header');
  dv.setUint32(0,0x42464831,false);dv.setUint32(4,h,true);new Uint8Array(b,8,h).fill(32);new Uint8Array(b,8,header.length).set(header);
  let off=8+h;const put=(x:number)=>{dv.setFloat32(off,x,true);off+=4;};
  for(let i=0;i<n;i++)for(const x of [.01+(i%2)*.001,1.65+Math.floor(i%12/2)*.001,.1])put(x);
  for(let i=0;i<n;i++)for(const x of [0,0,1])put(x);
  for(let i=0;i<n;i++)for(const x of [.8,.7,.6])put(x);
  for(let i=0;i<n;i++)for(const x of [i%2,Math.floor(i%12/2)/5])put(x);
  const indexOffset=off;
  for(let i=0;i<n;i+=12)for(let k=0;k<5;k++){const a=i+2*k;for(const x of [a,a+1,a+2,a+1,a+3,a+2]){dv.setUint32(off,x,true);off+=4;}}
  if(off!==b.byteLength)throw Error('fixture length');return {b,dv,indexOffset};
}
function root(){
  const root=new THREE.Group(),mat=new THREE.MeshPhysicalMaterial({vertexColors:true});
  mat.name='BF_Foundation_Hair_V2';
  const bones=Array.from({length:19},(_,i)=>{const b=new THREE.Bone();b.name=i===12?'head':'joint_'+i;root.add(b);return b;});
  const skeleton=new THREE.Skeleton(bones);
  const meshes=[...styles.map(s=>['Hair_'+s,specs[s][3]] as const),['Scalp',2719] as const].map(([name,n])=>{
    const g=new THREE.BufferGeometry(),p=new Float32Array(n*3),c=new Float32Array(n*3).fill(.8),j=new Uint16Array(n*4),w=new Float32Array(n*4);
    for(let i=0;i<n;i++){p.set([.03,1.66,.1],i*3);j[i*4]=12;w[i*4]=1;}
    g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('color',new THREE.BufferAttribute(c,3));
    g.setAttribute('skinIndex',new THREE.BufferAttribute(j,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(w,4));
    const m=new THREE.SkinnedMesh(g,mat);m.name='BF_Foundation_'+name;root.add(m);m.bind(skeleton);return m;
  });
  return {root,mat,meshes};
}
describe('V14 measured card hair',()=>{
  it('has a bounded deterministic scalp fade with intentional ear exclusion',()=>{
    expect(foundationScalpCoverage(0,1.68,.11)).toBe(1);
    expect(foundationScalpCoverage(.088,1.56,.03)).toBe(0);
    expect(foundationScalpCoverage(-.088,1.56,.03)).toBe(0);
    expect(foundationScalpCoverage(0,1.55,.13)).toBe(0);
    expect(()=>foundationScalpCoverage(NaN,1.6,0)).toThrow();
    for(let i=0;i<1000;i++){const a=foundationScalpCoverage(.1*Math.sin(i),1.54+.15*(i/999),.15*Math.cos(i));expect(a>=0&&a<=1&&Number.isFinite(a)).toBe(true);}
  });
  it('generates independent mipmapped alpha atlases',()=>{
    const a=createFoundationHairAtlas(),b=createFoundationHairAtlas();
    try{
      expect(a).not.toBe(b);expect(a.image.data).not.toBe(b.image.data);
      expect(a.image.data).toEqual(b.image.data);expect(a.image.width).toBe(128);expect(a.image.height).toBe(256);
      const pixels=a.image.data as Uint8Array;let zeros=0,ones=0,partial=0;
      for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0){zeros++;expect(pixels[i-3]).toBeGreaterThan(100);}else if(pixels[i]===255)ones++;else partial++;}
      expect([zeros,ones,partial]).toEqual([23032,4980,4756]);
      expect(a.generateMipmaps).toBe(true);expect(a.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    }finally{a.dispose();b.dispose();}
  });
  it('decodes the exact geometry envelope and rejects corrupt payloads',()=>{
    for(const s of styles){
      const f=fixture(s),g=decodeFoundationHair(f.b,s);expect(g.getAttribute('position').count).toBe(specs[s][0]);expect(g.index?.count).toBe(specs[s][1]);g.dispose();
      expect(()=>decodeFoundationHair(f.b.slice(0,-4),s)).toThrow('length');
    }
    const f=fixture('buzz');f.dv.setUint32(f.indexOffset,27564,true);expect(()=>decodeFoundationHair(f.b,'buzz')).toThrow('triangle');
    const bad=fixture('crop');bad.dv.setFloat32(220,NaN,true);expect(()=>decodeFoundationHair(bad.b,'crop')).toThrow('Nonfinite');
  });
  it('keeps original meshes on failure and disposes replaced root-local resources once',()=>{
    const r=root(),original=r.meshes.map(m=>m.geometry),assets=styles.map(s=>fixture(s).b);
    let matDisposals=0,geometryDisposals=0;
    r.mat.addEventListener('dispose',()=>matDisposals++);original.slice(0,3).forEach(g=>g.addEventListener('dispose',()=>geometryDisposals++));
    try{
      expect(()=>installFoundationHair(r.root,[assets[0],assets[1],new ArrayBuffer(4)])).toThrow('length');
      r.meshes.forEach((m,i)=>expect(m.geometry).toBe(original[i]));expect(geometryDisposals).toBe(0);expect(matDisposals).toBe(0);
      installFoundationHair(r.root,assets);expect(geometryDisposals).toBe(3);expect(matDisposals).toBe(1);
      expect(r.meshes[0].material).toBe(r.meshes[1].material);expect(r.meshes[1].material).toBe(r.meshes[2].material);
      expect(r.meshes[3].geometry).toBe(original[3]);expect(r.meshes[3].geometry.getAttribute('color').itemSize).toBe(4);expect(r.meshes[3].castShadow).toBe(false);expect((r.meshes[3].material as THREE.MeshPhysicalMaterial).forceSinglePass).toBe(true);
      const m=r.meshes[0].material as THREE.MeshPhysicalMaterial;expect(m.alphaTest).toBe(.22);expect(m.alphaToCoverage).toBe(true);expect(m.map).toBeInstanceOf(THREE.DataTexture);
      expect(()=>installFoundationHair(r.root,assets)).toThrow('scope');
    }finally{disposeThreeTree(r.root);}
  });
});
