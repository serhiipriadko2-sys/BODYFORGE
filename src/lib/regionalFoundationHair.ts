import * as THREE from 'three';
import type { HairStyle } from './avatarLook';

const SOURCE='7dc94d5c9755fc6152c20120296d4a2213c18e59b2c970d658b4ef20e8247fa1';
export const FOUNDATION_HAIR_STYLES=['buzz','crop','swept'] as const;
const specs={buzz:{old:37500,vertices:27564,indices:68910,bytes:1488676},crop:{old:47500,vertices:27456,indices:68640,bytes:1482844},swept:{old:47500,vertices:27252,indices:68130,bytes:1471828}} as const;
const smooth=(a:number,b:number,x:number)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*t*(10+t*(-15+6*t));};
export function foundationScalpCoverage(x:number,y:number,z:number):number{
  if(![x,y,z].every(Number.isFinite))throw Error('Invalid scalp coordinates');
  const line=1.548+.078*smooth(.020,.130,z)+.013*smooth(.055,.084,Math.abs(x));
  const ear=smooth(.072,.082,Math.abs(x))*smooth(1.535,1.545,y)*(1-smooth(1.574,1.588,y))*smooth(.005,.015,z)*(1-smooth(.043,.054,z));
  return smooth(-.001,.006,y-line)*(1-ear);
}

/** Decode measured collision-screened, exact subsets of the V14 cards.
 * Keep rest-space coordinates and all donor head bind transforms. */
export function decodeFoundationHair(bytes:ArrayBuffer,style:HairStyle):THREE.BufferGeometry{
  const s=specs[style];
  if(!s||bytes.byteLength!==s.bytes)throw Error('Invalid hair length');
  const dv=new DataView(bytes),h=dv.getUint32(4,true),n=s.vertices;
  if(dv.getUint32(0,false)!==0x42464831||h!==212||8+h+44*n+4*s.indices!==bytes.byteLength)throw Error('Invalid hair header');
  const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(bytes,8,h)));
  if(!header||header.version!==1||header.mesh!=='BF_Foundation_Hair_'+style||header.vertices!==n||header.indices!==s.indices||
    header.sourceSha256!==SOURCE||!Array.isArray(header.attributes)||header.attributes.join(',')!=='position,normal,color,uv')
    throw Error('Invalid hair scope');
  let off=8+h;
  const read=(size:number)=>{
    const a=new Float32Array(n*size);
    for(let i=0;i<a.length;i++){const x=dv.getFloat32(off+4*i,true);if(!Number.isFinite(x))throw Error('Nonfinite hair component');a[i]=x;}
    off+=a.byteLength;return a;
  };
  const p=read(3),normal=read(3),color=read(3),uv=read(2);
  for(let i=0;i<n;i++){
    const j=3*i,x=p[j],y=p[j+1],z=p[j+2];
    if(Math.abs(x)>.090||y<1.544||y>1.697||z<-.061||z>.143||
      Math.abs(Math.hypot(normal[j],normal[j+1],normal[j+2])-1)>2e-5||
      uv[2*i]!==i%2||Math.abs(uv[2*i+1]-Math.floor(i%12/2)/5)>1e-6)
      throw Error('Hair outside geometry envelope');
  }
  if(color.some(x=>x<.35||x>1))throw Error('Invalid hair pigment');
  const ix=new Uint16Array(s.indices),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),v=new THREE.Vector3();
  for(let i=0;i<s.indices;i+=3){
    const j=dv.getUint32(off+4*i,true),k=dv.getUint32(off+4*(i+1),true),l=dv.getUint32(off+4*(i+2),true);
    if(j>=n||k>=n||l>=n||j===k||j===l||k===l||Math.floor(j/12)!==Math.floor(k/12)||Math.floor(j/12)!==Math.floor(l/12))
      throw Error('Invalid hair triangle');
    a.fromArray(p,3*j);b.fromArray(p,3*k).sub(a);c.fromArray(p,3*l).sub(a);b.cross(c);v.fromArray(normal,3*j);
    if(b.length()<1e-10||b.dot(v)<=0)throw Error('Invalid hair winding');
    ix.set([j,k,l],i);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(p,3));g.setAttribute('normal',new THREE.BufferAttribute(normal,3));
  g.setAttribute('color',new THREE.BufferAttribute(color,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(new THREE.BufferAttribute(ix,1));g.computeBoundingSphere();return g;
}

/** Original bounded strand atlas; no external texture or shader injection. */
export function createFoundationHairAtlas():THREE.DataTexture{
  const width=128,height=256,bytes=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height;let alpha=0,tone=0,nearest=0,distance=Infinity;
    for(let s=0;s<9;s++){
      const center=(s+.5)/9+.012*Math.sin(9*v+s*2.3),end=.80+.19*(.5+.5*Math.sin(s*11.9));
      const w=(.026+.009*Math.sin(s*3.7))*(.88+.12*Math.sin(Math.PI*v))*(1-.5*v);
      const cover=(1-THREE.MathUtils.smoothstep(Math.abs(u-center),w*.55,w))*(1-THREE.MathUtils.smoothstep(v,end-.12,end));
      const pigment=(.62+.35*(.5+.5*Math.sin(s*4.37)))*(.76+.24*v),d=Math.abs(u-center);
      if(d<distance){distance=d;nearest=pigment;}
      if(cover>alpha){alpha=cover;tone=pigment;}
    }
    // Extend pigment into zero-coverage texels: mip filtering must not
    // turn silver/blond strand edges black. Alpha stays byte-identical.
    const i=4*(y*width+x),coverage=Math.round(255*alpha),c=Math.round(255*(coverage===0?nearest:tone));
    bytes[i]=c;bytes[i+1]=Math.round(c*.96);bytes[i+2]=Math.round(c*.91);bytes[i+3]=coverage;
  }
  const t=new THREE.DataTexture(bytes,width,height,THREE.RGBAFormat,THREE.UnsignedByteType);
  t.name='BF_V14_OriginalHairAtlas';t.colorSpace=THREE.LinearSRGBColorSpace;t.magFilter=THREE.LinearFilter;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}

export function installFoundationHair(source:THREE.Group,assets:readonly ArrayBuffer[]):void{
  if(assets.length!==3)throw Error('Missing hair assets');
  const owned=new Set<THREE.BufferGeometry>();
  const nodes=[...FOUNDATION_HAIR_STYLES.map(s=>'Hair_'+s),'Scalp'].map((name,i)=>{
    const m=source.getObjectByName('BF_Foundation_'+name),count=i===3?2719:specs[FOUNDATION_HAIR_STYLES[i]].old;
    if(!(m instanceof THREE.SkinnedMesh)||!(m.material instanceof THREE.MeshPhysicalMaterial)||
      m.material.name!=='BF_Foundation_Hair_V2'||!m.material.vertexColors||m.material.map||
      m.skeleton.bones.length!==19||m.skeleton.bones[12]?.name!=='head'||m.geometry.getAttribute('position')?.count!==count)
      throw Error('Invalid donor hair scope');
    const g=m.geometry,j=g.getAttribute('skinIndex'),w=g.getAttribute('skinWeight');
    if(!j||!w||j.itemSize!==4||w.itemSize!==4||j.count!==count||w.count!==count||owned.has(g))throw Error('Invalid donor hair binding');
    owned.add(g);
    for(let k=0;k<count;k++){
      let sum=0,bound=0;
      for(let l=0;l<4;l++){const a=w.getComponent(k,l);if(!Number.isFinite(a)||a<0)throw Error('Invalid hair weight');sum+=a;if(j.getComponent(k,l)===12)bound+=a;}
      if(Math.abs(sum-1)>1e-6||Math.abs(bound-1)>1e-6)throw Error('Nonrigid hair binding');
    }
    return m;
  });
  source.traverse(m=>{if(m instanceof THREE.Mesh&&owned.has(m.geometry)&&!nodes.includes(m as THREE.SkinnedMesh))throw Error('Shared hair geometry');});
  const cap=nodes[3],p=cap.geometry.getAttribute('position'),c=cap.geometry.getAttribute('color');
  if(!c||c.count!==p.count||c.itemSize!==3)throw Error('Invalid scalp pigment');
  const colors=new Float32Array(p.count*4);
  for(let i=0;i<p.count;i++){
    const a=[c.getX(i),c.getY(i),c.getZ(i)];
    if(a.some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('Invalid scalp color');
    colors.set([...a,foundationScalpCoverage(p.getX(i),p.getY(i),p.getZ(i))],4*i);
  }
  // Prepare before modifying the scene. Only the local figure owns these.
  const gs:THREE.BufferGeometry[]=[];let atlas:THREE.DataTexture|undefined,mat:THREE.MeshPhysicalMaterial|undefined,capMat:THREE.MeshPhysicalMaterial|undefined;
  try{
    for(let i=0;i<3;i++){
      const g=decodeFoundationHair(assets[i],FOUNDATION_HAIR_STYLES[i]);gs.push(g);
      const n=g.getAttribute('position').count,j=new Uint16Array(n*4),w=new Float32Array(n*4);
      for(let k=0;k<n;k++){j[k*4]=12;w[k*4]=1;}
      g.setAttribute('skinIndex',new THREE.BufferAttribute(j,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(w,4));
    }
    atlas=createFoundationHairAtlas();mat=(nodes[0].material as THREE.MeshPhysicalMaterial).clone();mat.name='BF_V14_HairCards';
    mat.map=atlas;mat.alphaTest=.22;mat.alphaToCoverage=true;mat.transparent=false;mat.roughness=.86;mat.specularIntensity=.11;mat.clearcoat=0;
    mat.anisotropy=.10;mat.anisotropyRotation=Math.PI/2;mat.needsUpdate=true;
    capMat=(cap.material as THREE.MeshPhysicalMaterial).clone();capMat.name='BF_V14_ScalpCoverage';
    capMat.transparent=true;capMat.depthWrite=false;capMat.forceSinglePass=true;capMat.roughness=.92;capMat.specularIntensity=.12;capMat.clearcoat=0;capMat.needsUpdate=true;
  }catch(e){gs.forEach(g=>g.dispose());atlas?.dispose();mat?.dispose();capMat?.dispose();throw e;}
  const oldM=new Set(nodes.map(m=>m.material as THREE.MeshPhysicalMaterial));
  for(let i=0;i<3;i++){const m=nodes[i],g=m.geometry;m.geometry=gs[i];m.material=mat;m.frustumCulled=false;g.dispose();}
  cap.geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));cap.material=capMat;cap.castShadow=false;
  source.traverse(m=>{if(m instanceof THREE.Mesh)oldM.delete(m.material as THREE.MeshPhysicalMaterial);});
  oldM.forEach(m=>m.dispose());
}
