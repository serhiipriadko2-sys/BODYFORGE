import * as THREE from 'three';
import {packMetricSkinTile,METRIC_SKIN_PERIOD} from './avatarMetricSkinReview';
import {createSkinDiffusionTexture} from './avatarSkinDiffusion';

export const FOUNDATION_DETAIL_ID='BF_V15_ScanGradient';
export const DETAIL_REST='bfV15Rest';
export const DETAIL_NORMAL='bfV15Normal';
const NAMES=['BF_Foundation_Skin','BF_Foundation_TorsoSkin'] as const;
const COUNTS=[41476,6870] as const;
type RestPart={mesh:THREE.SkinnedMesh;restP:Float32Array;restN:Float32Array};
const unique=(s:string,a:string)=>s.split(a).length===2;

export function foundationDetailShaders(vertex:string,fragment:string):{vertex:string;fragment:string}|undefined{
  const begin='#include <begin_vertex>',normal='#include <normal_fragment_maps>',main='#include <lights_fragment_begin>',physical='#include <lights_physical_pars_fragment>';
  const line='reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
  const chunk=THREE.ShaderChunk.lights_physical_pars_fragment;
  if(vertex.includes(FOUNDATION_DETAIL_ID)||fragment.includes(FOUNDATION_DETAIL_ID)||!unique(vertex,begin)||
     ![normal,main,physical].every(a=>unique(fragment,a))||!unique(chunk,line))return;
  const varying='varying vec3 vBfV15Rest;\nvarying vec3 vBfV15Normal;\n';
  const declarations=String.raw`
uniform sampler2D bfV15Gradient;
uniform sampler2D bfV15Lut;
uniform float bfV15Scale;
vec3 bfV15Meso;
vec3 bfV15DiffuseNormal;
float bfV15Spread;
float bfV15Bell(float x,float c,float w){float u=(x-c)/w;return exp(-u*u);}
`;
  const layer=String.raw`
bfV15Meso = normal;
// Rest-pose metres; three independent planar projections avoid UV stretching.
vec3 bfP = vBfV15Rest / 0.045;
vec3 bfDx = dFdx(bfP), bfDy = dFdy(bfP);
vec3 bfW = abs(vBfV15Normal); bfW*=bfW; bfW*=bfW;
bfW/=max(0.00001,dot(bfW,vec3(1.0)));
float bfX=abs(vBfV15Rest.x),bfY=vBfV15Rest.y,bfZ=vBfV15Rest.z;
float bfFront=smoothstep(0.098,0.124,bfZ);
float bfCheek=bfV15Bell(bfX,0.046,0.028)*bfV15Bell(bfY,1.539,0.024)*bfFront;
float bfLid=bfV15Bell(bfX,0.033,0.018)*bfV15Bell(bfY,1.574,0.014)*bfFront;
float bfU=bfX/0.031,bfSpan=sqrt(max(0.0,1.0-bfU*bfU));
float bfTop=1.504+(0.0063+0.0016*bfV15Bell(bfU,0.28,0.20))*bfSpan;
float bfBottom=1.504-0.0092*bfSpan;
float bfLip=bfFront*(1.0-smoothstep(0.85,1.02,bfU))*smoothstep(bfBottom-0.0016,bfBottom+0.0016,bfY)*(1.0-smoothstep(bfTop-0.0016,bfTop+0.0016,bfY));
float bfStrength=clamp((0.58+0.30*bfCheek)*(1.0-0.72*max(bfLid,bfLip)),0.12,0.88);
float bfFootprint=1.0+0.75*max(bfLid,bfLip);
vec4 bfTX=textureGrad(bfV15Gradient,bfP.zy,bfDx.zy*bfFootprint,bfDy.zy*bfFootprint);
vec4 bfTY=textureGrad(bfV15Gradient,bfP.xz+vec2(0.37,0.19),bfDx.xz*bfFootprint,bfDy.xz*bfFootprint);
vec4 bfTZ=textureGrad(bfV15Gradient,bfP.xy+vec2(0.71,0.43),bfDx.xy*bfFootprint,bfDy.xy*bfFootprint);
vec2 bfGX=(bfTX.gb*255.0-128.0)/127.0,bfGY=(bfTY.gb*255.0-128.0)/127.0,bfGZ=(bfTZ.gb*255.0-128.0)/127.0;
vec3 bfGrad=bfW.x*vec3(0.0,bfGX.y,bfGX.x)+bfW.y*vec3(bfGY.x,0.0,bfGY.y)+bfW.z*vec3(bfGZ,0.0);
vec3 bfSx=dFdx(-vViewPosition),bfSy=dFdy(-vViewPosition);
vec3 bfR1=cross(bfSy,nonPerturbedNormal),bfR2=cross(nonPerturbedNormal,bfSx);
float bfDet=dot(bfSx,bfR1),bfArea=length(bfSx)*length(bfSy);
if(bfArea>1e-12 && abs(bfDet)>bfArea*0.04){
  vec3 bfV=(bfR1*dot(bfGrad,bfDx)+bfR2*dot(bfGrad,bfDy))*(0.045*bfV15Scale/bfDet);
  bfV*=min(1.0,0.38/max(1e-8,length(bfV)));
  normal=normalize(normal-bfV*bfStrength);
}
// Filtered slope moments approximate unresolved micro-roughness.
vec3 bfVar=max(vec3(0.0),vec3(bfTX.a,bfTY.a,bfTZ.a)-vec3(dot(bfGX,bfGX),dot(bfGY,bfGY),dot(bfGZ,bfGZ)));
float bfUnresolved=dot(bfW*bfW,bfVar)*bfStrength*bfStrength;
roughnessFactor=max(roughnessFactor,min(0.94,pow(pow(roughnessFactor,4.0)+0.65*bfUnresolved,0.25)));
// Bounded vermilion response; the existing geometry and pigment are unchanged.
roughnessFactor=mix(roughnessFactor,max(0.40,roughnessFactor*0.70),0.65*bfLip);
`;
  const setup=String.raw`
float bfRate=length(dFdx(nonPerturbedNormal))+length(dFdy(nonPerturbedNormal));
float bfLength=max(0.0001,length(dFdx(vViewPosition))+length(dFdy(vViewPosition)));
bfV15Spread=clamp(0.20+0.14*clamp(bfRate/bfLength,0.0,5.0),0.0,0.90);
bfV15DiffuseNormal=normalize(mix(bfV15Meso,nonPerturbedNormal,0.62));
`;
  const direct=String.raw`
float bfMu=clamp(dot(bfV15DiffuseNormal,directLight.direction),-1.0,1.0);
vec2 bfUv=(vec2(bfMu*0.5+0.5,bfV15Spread)*vec2(128.0,32.0)+0.5)/vec2(129.0,33.0);
vec3 bfAngular=texture2D(bfV15Lut,bfUv).rgb;
vec3 bfDiffuse=directLight.color*mix(vec3(max(0.0,dot(bfV15Meso,directLight.direction))),bfAngular,0.58);
reflectedLight.directDiffuse += bfDiffuse * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
`;
  return {vertex:'// '+FOUNDATION_DETAIL_ID+'\nattribute vec3 '+DETAIL_REST+';\nattribute vec3 '+DETAIL_NORMAL+';\n'+varying+
      vertex.replace(begin,begin+'\nvBfV15Rest='+DETAIL_REST+';\nvBfV15Normal='+DETAIL_NORMAL+';'),
    fragment:'// '+FOUNDATION_DETAIL_ID+'\n'+varying+declarations+
      fragment.replace(physical,chunk.replace(line,direct)).replace(normal,normal+layer).replace(main,setup+main)};
}

/** Decoded from the pinned CC BY 3.0 grayscale cheek tile. Scale is an
 * artistic transfer from the earlier material study, not measured human
 * pore depth or actual spatial subsurface scattering. */
export function foundationGradientTexture(heights:Uint8Array):THREE.DataTexture{
  if(heights.length!==256*256||METRIC_SKIN_PERIOD!==.045)throw Error('Invalid scan gradient input');
  const t=new THREE.DataTexture(packMetricSkinTile(heights),256,256,THREE.RGBAFormat,THREE.UnsignedByteType);
  t.name=FOUNDATION_DETAIL_ID;t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.premultiplyAlpha=false;t.needsUpdate=true;
  return t;
}
export async function decodeFoundationScan(bytes:ArrayBuffer):Promise<Uint8Array>{
  const b=new DataView(bytes);
  if(bytes.byteLength!==61364||b.getUint32(0)!==0x89504e47||b.getUint32(4)!==0x0d0a1a0a||b.getUint32(16)!==256||b.getUint32(20)!==256)
    throw Error('Invalid scan image header');
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
  try{
    if(bitmap.width!==256||bitmap.height!==256)throw Error('Invalid scan image dimensions');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Scan decode unavailable');
    ctx.drawImage(bitmap,0,0);
    const pixels=ctx.getImageData(0,0,256,256).data,heights=new Uint8Array(65536);
    for(let i=0;i<heights.length;i++){const k=i*4;if(pixels[k]!==pixels[k+1]||pixels[k]!==pixels[k+2]||pixels[k+3]!==255)throw Error('Invalid grayscale scan');heights[i]=pixels[k];}
    return heights;
  }finally{bitmap.close();}
}
export function installFoundationDetail(source:THREE.Group,parts:readonly RestPart[],heights:Uint8Array,scale:number):void{
  if(!Number.isFinite(scale)||scale<2.375||scale>3.167||!foundationDetailShaders(THREE.ShaderLib.physical.vertexShader,THREE.ShaderLib.physical.fragmentShader))throw Error('Invalid detail shader contract');
  const pending=NAMES.map((name,i)=>{
    const p=parts.find(s=>s.mesh.name===name),m=source.getObjectByName(name),n=COUNTS[i];
    if(!p||m!==p.mesh||!(m instanceof THREE.SkinnedMesh)||!(m.material instanceof THREE.MeshPhysicalMaterial)||
       m.material.name!=='BF_DonorSkin_PBR_V2'||m.material.userData.foundationDetail!==undefined||
       m.material.normalMapType!==THREE.TangentSpaceNormalMap||!m.material.normalMap||
       m.material.map?.name!=='BF_V11_OriginalPigmentDetail'||m.material.roughnessMap?.name!=='BF_V11_OriginalRoughness'||
       m.geometry.getAttribute('position')?.count!==n||p.restP.length!==3*n||p.restN.length!==3*n||
       m.geometry.hasAttribute(DETAIL_REST)||m.geometry.hasAttribute(DETAIL_NORMAL))throw Error('Invalid detail material scope');
    const rest=p.restP.slice(),normals=new Int16Array(n*3);
    for(let j=0;j<n;j++){
      const k=3*j,x=rest[k],y=rest[k+1],z=rest[k+2],nx=p.restN[k],ny=p.restN[k+1],nz=p.restN[k+2],len=Math.hypot(nx,ny,nz);
      if(![x,y,z,len].every(Number.isFinite)||Math.abs(x)>.46||y<.10||y>1.70||z<-.12||z>.19||len<.95||len>1.05)throw Error('Invalid detail rest coordinates');
      normals.set([Math.round(32767*nx/len),Math.round(32767*ny/len),Math.round(32767*nz/len)],k);
    }
    return {mesh:m,material:m.material,rest,normals};
  });
  if(pending[0].material!==pending[1].material)throw Error('Unexpected skin material sharing');
  const material=pending[0].material;
  source.traverse(m=>{if(m instanceof THREE.Mesh&&m.material===material&&!pending.some(p=>p.mesh===m))throw Error('Shared material outside detail scope');});
  const gradient=foundationGradientTexture(heights);
  let lut:THREE.DataTexture;
  try{lut=createSkinDiffusionTexture();}catch(e){gradient.dispose();throw e;}
  for(const p of pending){
    p.mesh.geometry.setAttribute(DETAIL_REST,new THREE.BufferAttribute(p.rest,3));
    p.mesh.geometry.setAttribute(DETAIL_NORMAL,new THREE.BufferAttribute(p.normals,3,true));
  }
  const release=()=>{material.removeEventListener('dispose',release);gradient.dispose();lut.dispose();};
  material.addEventListener('dispose',release);
  material.userData.foundationDetail=FOUNDATION_DETAIL_ID;
  material.onBeforeCompile=shader=>{
    const patch=foundationDetailShaders(shader.vertexShader,shader.fragmentShader);
    if(!patch)throw Error('Detail shader anchor changed');
    shader.vertexShader=patch.vertex;shader.fragmentShader=patch.fragment;
    shader.uniforms.bfV15Gradient={value:gradient};shader.uniforms.bfV15Lut={value:lut};shader.uniforms.bfV15Scale={value:scale};
  };
  material.customProgramCacheKey=()=>FOUNDATION_DETAIL_ID;material.needsUpdate=true;
}
