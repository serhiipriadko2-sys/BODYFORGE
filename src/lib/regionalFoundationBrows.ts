import * as THREE from 'three';

const VERTICES=12480,INDICES=31200,BYTES=674216;
const SOURCE='c879b219060c9d475fca6d8f02764a1356329b6c0c3ac70a3c9f30dc32e6403d';
const BLINK='3a8cc29c0e0c599a994bb784522d05d48884ab20b092c2cd23a502d5bbac61b7';

/** Decode the exact collision-screened V12 brow asset. Normalize triangle
 * winding to the supplied outward normals; the offline ribbon generator
 * emitted all 10,400 triangles with reversed winding. No position changes. */
export function decodeFoundationBrows(bytes:ArrayBuffer):THREE.BufferGeometry {
  if(bytes.byteLength!==BYTES)throw Error('Invalid brow asset length');
  const dv=new DataView(bytes),h=dv.getUint32(4,true);
  if(dv.getUint32(0,false)!==0x42464731||h!==288||
      8+h+44*VERTICES+4*INDICES!==bytes.byteLength)throw Error('Invalid brow asset header');
  const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes,8,h)));
  if(!header||header.version!==1||header.mesh!=='BF_Foundation_Brows'||header.vertices!==VERTICES||
      header.indices!==INDICES||header.sourceSha256!==SOURCE||header.blinkSha256!==BLINK||
      !Array.isArray(header.attributes)||header.attributes.join(',')!=='position,normal,color,uv')
    throw Error('Invalid brow asset scope');
  let off=8+h;
  const read=(size:number)=>{
    const a=new Float32Array(VERTICES*size);
    for(let i=0;i<a.length;i++){const x=dv.getFloat32(off+i*4,true);if(!Number.isFinite(x))throw Error('Nonfinite brow component');a[i]=x;}
    off+=a.byteLength;return a;
  };
  const p=read(3),n=read(3),c=read(3),uv=read(2);
  for(let i=0;i<VERTICES;i++){
    const j=i*3,x=p[j],y=p[j+1],z=p[j+2];
    if(Math.abs(x)<.010||Math.abs(x)>.071||y<1.585||y>1.605||z<.080||z>.146||
       Math.abs(Math.hypot(n[j],n[j+1],n[j+2])-1)>2e-5||
       c[j]<.3||c[j]>1||c[j+1]<.3||c[j+1]>1||c[j+2]<.3||c[j+2]>1||
       uv[2*i]<0||uv[2*i]>1||uv[2*i+1]<0||uv[2*i+1]>1)
      throw Error('Brow outside geometry envelope');
  }
  const ix=new Uint16Array(INDICES);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),v=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<INDICES;i+=3){
    const j=dv.getUint32(off+4*i,true),k=dv.getUint32(off+4*(i+1),true),l=dv.getUint32(off+4*(i+2),true);
    if(j>=VERTICES||k>=VERTICES||l>=VERTICES||j===k||j===l||k===l||
       Math.floor(j/12)!==Math.floor(k/12)||Math.floor(j/12)!==Math.floor(l/12))throw Error('Invalid brow triangle');
    a.fromArray(p,3*j);b.fromArray(p,3*k).sub(a);v.fromArray(p,3*l).sub(a);
    b.cross(v);normal.fromArray(n,3*j);
    if(b.length()<1e-10||b.dot(normal)>=0)throw Error('Unexpected brow winding');
    ix.set([j,l,k],i);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(n,3));
  g.setAttribute('color',new THREE.BufferAttribute(c,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(new THREE.BufferAttribute(ix,1));g.computeBoundingSphere();
  return g;
}
export function installFoundationBrows(source:THREE.Group,bytes:ArrayBuffer):void {
  const mesh=source.getObjectByName('BF_Foundation_Brows');
  if(!(mesh instanceof THREE.SkinnedMesh)||!(mesh.material instanceof THREE.MeshPhysicalMaterial)||
     mesh.material.name!=='BF_Foundation_Hair_V2'||!mesh.material.vertexColors||
     mesh.skeleton.bones.length!==19||mesh.geometry.getAttribute('position')?.count!==7200)
    throw Error('Invalid donor brow scope');
  const old=mesh.geometry,material=mesh.material,j=old.getAttribute('skinIndex'),w=old.getAttribute('skinWeight');
  const head=mesh.skeleton.bones.findIndex(b=>b.name==='head');
  if(head!==12||!j||!w||j.count!==7200||w.count!==7200||j.itemSize!==4||w.itemSize!==4)
    throw Error('Invalid donor brow binding');
  let owners=0,materialOwners=0;
  source.traverse(o=>{if(o instanceof THREE.Mesh){if(o.geometry===old)owners++;if(o.material===material)materialOwners++;}});
  if(owners!==1)throw Error('Shared brow geometry');
  for(let i=0;i<j.count;i++){
    let total=0,bound=0;
    for(let k=0;k<4;k++){const n=w.getComponent(i,k);if(!Number.isFinite(n)||n<0)throw Error('Invalid brow weight');total+=n;if(j.getComponent(i,k)===head)bound+=n;}
    if(Math.abs(total-1)>1e-6||Math.abs(bound-1)>1e-6)throw Error('Nonrigid brow binding');
  }
  const g=decodeFoundationBrows(bytes),ids=new Uint16Array(VERTICES*4),weights=new Float32Array(VERTICES*4);
  for(let i=0;i<VERTICES;i++){ids[4*i]=head;weights[4*i]=1;}
  g.setAttribute('skinIndex',new THREE.BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));
  const m=material.clone();m.roughness=.62;m.specularIntensity=.60;m.clearcoat=.02;m.needsUpdate=true;
  mesh.geometry=g;mesh.material=m;mesh.frustumCulled=false;
  old.dispose();if(materialOwners===1)material.dispose();
}
