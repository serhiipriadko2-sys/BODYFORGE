import * as THREE from 'three';
const N=3420,FRAMES=21,INDICES=8550,BYTES=1826456;
const SOURCE='3a8cc29c0e0c599a994bb784522d05d48884ab20b092c2cd23a502d5bbac61b7';
export interface FoundationLashRig { mesh:THREE.SkinnedMesh; pose(blink:number):void; reset():void }
export function decodeFoundationLashes(bytes:ArrayBuffer){
  if(bytes.byteLength!==BYTES)throw Error('Invalid lash length');
  const dv=new DataView(bytes),h=dv.getUint32(4,true);
  if(dv.getUint32(0,false)!==0x42464c31||h!==168||8+h+20*N+4*INDICES+24*N*FRAMES!==BYTES)
    throw Error('Invalid lash header');
  const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes,8,h)));
  if(!header||header.version!==1||header.mesh!=='BF_Foundation_Lashes'||header.vertices!==N||
     header.frames!==FRAMES||header.indices!==INDICES||header.sourceSha256!==SOURCE)throw Error('Invalid lash scope');
  let off=8+h;
  const read=(count:number)=>{
    const a=new Float32Array(count);
    for(let i=0;i<count;i++){const x=dv.getFloat32(off+4*i,true);if(!Number.isFinite(x))throw Error('Nonfinite lash component');a[i]=x;}
    off+=4*count;return a;
  };
  const color=read(3*N),uv=read(2*N);
  if(color.some(x=>x<.5||x>1)||uv.some(x=>x<0||x>1))throw Error('Invalid lash pigment');
  const index=new Uint16Array(INDICES);
  for(let i=0;i<INDICES;i+=3){
    const a=dv.getUint32(off+4*i,true),b=dv.getUint32(off+4*(i+1),true),c=dv.getUint32(off+4*(i+2),true);
    if(a>=N||b>=N||c>=N||a===b||a===c||b===c||Math.floor(a/12)!==Math.floor(b/12)||Math.floor(a/12)!==Math.floor(c/12))
      throw Error('Invalid lash triangle');
    index.set([a,b,c],i);
  }
  off+=4*INDICES;
  const frames=read(N*FRAMES*6);
  for(let f=0;f<FRAMES;f++)for(let i=0;i<N;i++){
    const j=(f*N+i)*6,b=i*6,x=frames[j],y=frames[j+1],z=frames[j+2];
    if(Math.abs(x)<.020||Math.abs(x)>.045||y<1.563||y>1.583||z<.126||z>.141||
       Math.hypot(x-frames[b],y-frames[b+1],z-frames[b+2])>.009||
       Math.abs(Math.hypot(frames[j+3],frames[j+4],frames[j+5])-1)>2e-5)
      throw Error('Lash outside geometry envelope');
    if(f>0){const k=j-N*6;
      if(frames[j+3]*frames[k+3]+frames[j+4]*frames[k+4]+frames[j+5]*frames[k+5]<.9)throw Error('Invalid lash normal continuity');}
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(let f=0;f<FRAMES;f++)for(let i=0;i<INDICES;i+=3){
    const j=(f*N+index[i])*6,k=(f*N+index[i+1])*6,l=(f*N+index[i+2])*6;
    a.fromArray(frames,j);b.fromArray(frames,k).sub(a);c.fromArray(frames,l).sub(a);b.cross(c);n.fromArray(frames,j+3);
    if(b.length()<1e-10||b.dot(n)<=0)throw Error('Invalid lash winding');
  }
  return {color,uv,index,frames};
}
/** The validated 21-knot trajectory follows the V10 lids; interpolate with
 * exactly the same blink parameter. Geometry, saves and growth proofs untouched. */
export function installFoundationLashes(source:THREE.Group,bytes:ArrayBuffer):FoundationLashRig{
  const brow=source.getObjectByName('BF_Foundation_Brows');
  if(!(brow instanceof THREE.SkinnedMesh)||!(brow.material instanceof THREE.MeshPhysicalMaterial)||
     !brow.parent||brow.skeleton.bones.length!==19||brow.skeleton.bones[12]?.name!=='head'||
     brow.geometry.getAttribute('position')?.count!==12480||source.getObjectByName('BF_Foundation_Lashes'))
    throw Error('Invalid lash rig scope');
  const field=decodeFoundationLashes(bytes),g=new THREE.BufferGeometry(),j=new Uint16Array(N*4),w=new Float32Array(N*4);
  const p=new THREE.BufferAttribute(new Float32Array(N*3),3).setUsage(THREE.DynamicDrawUsage),
    n=new THREE.BufferAttribute(new Float32Array(N*3),3).setUsage(THREE.DynamicDrawUsage);
  for(let i=0;i<N;i++){j[i*4]=12;w[i*4]=1;}
  g.setAttribute('position',p);g.setAttribute('normal',n);
  g.setAttribute('color',new THREE.BufferAttribute(field.color,3));g.setAttribute('uv',new THREE.BufferAttribute(field.uv,2));
  g.setAttribute('skinIndex',new THREE.BufferAttribute(j,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(w,4));
  g.setIndex(new THREE.BufferAttribute(field.index,1));
  const material=brow.material.clone();material.name='BF_V13_LashFiber';material.roughness=.85;material.specularIntensity=.12;material.clearcoat=0;
  const mesh=new THREE.SkinnedMesh(g,material);
  mesh.name='BF_Foundation_Lashes';mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
  mesh.position.copy(brow.position);mesh.quaternion.copy(brow.quaternion);mesh.scale.copy(brow.scale);
  mesh.bindMode=brow.bindMode;mesh.bind(brow.skeleton,brow.bindMatrix);
  brow.parent.add(mesh);
  let previous=Infinity;
  const pose=(blink:number)=>{
    const v=Number.isFinite(blink)?THREE.MathUtils.clamp(blink,0,1):0;
    if(v===previous)return;
    const a=v*(FRAMES-1),k=Math.min(FRAMES-2,Math.floor(a)),t=a-k;
    for(let i=0;i<N;i++){
      const j=(k*N+i)*6,l=j+N*6;
      const mix=(m:number)=>field.frames[j+m]*(1-t)+field.frames[l+m]*t;
      p.setXYZ(i,mix(0),mix(1),mix(2));
      const x=mix(3),y=mix(4),z=mix(5),length=Math.hypot(x,y,z);
      n.setXYZ(i,x/length,y/length,z/length);
    }
    p.needsUpdate=n.needsUpdate=true;previous=v;
  };
  pose(0);g.computeBoundingSphere();
  return {mesh,pose,reset:()=>pose(0)};
}
