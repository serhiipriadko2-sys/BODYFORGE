import * as THREE from 'three';

/**
 * Local scan-height gradient review. The normalized source is the existing
 * CC BY 3.0 cheek tile, not calibrated physical displacement or body scans.
 * The 45 mm period / 1 mm full-range height scale are artistic choices.
 * Use rest-pose metres, not stretched UVs; the posed surface gradient accounts
 * for current skinning, growth, camera projection and scene normalization.
 */
export const METRIC_SKIN_ID = 'BF_METRIC_SKIN_GRADIENT_V1';
export const METRIC_SKIN_SIZE = 256;
export const METRIC_SKIN_PERIOD = .045;
export const METRIC_SKIN_HEIGHT = .001;
export const METRIC_SKIN_MAX_SLOPE = .90;
export const METRIC_REST = 'bfMetricRest';
export const METRIC_NORMAL = 'bfMetricNormal';
const clamp = (x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));

/** R: original height for fail-closed UV bump; GB: signed slopes; A: squared
 * slope moment. Ordinary linear mip filtering gives both the mean slope and
 * its second moment, so lost microgeometry can contribute to roughness.
 * The two channels use symmetric signed quantization around exact byte 128.
 * No normal renormalization during downsampling, no gamma, no premultiply. */
export function packMetricSkinTile(heights:Uint8Array,size=METRIC_SKIN_SIZE):Uint8Array {
  if(!Number.isInteger(size)||size<4||size>METRIC_SKIN_SIZE||(size&(size-1))!==0||heights.length!==size*size)
    throw Error('Invalid periodic skin height tile');
  const bytes=new Uint8Array(heights.length*4);
  const gain=size*METRIC_SKIN_HEIGHT/(2*255*METRIC_SKIN_PERIOD);
  const sample=(x:number,y:number)=>heights[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let gx=(sample(x+1,y)-sample(x-1,y))*gain;
    let gy=(sample(x,y+1)-sample(x,y-1))*gain;
    const length=Math.hypot(gx,gy);
    if(length>METRIC_SKIN_MAX_SLOPE){const k=METRIC_SKIN_MAX_SLOPE/length;gx*=k;gy*=k;}
    const r=128+Math.round(gx*127),g=128+Math.round(gy*127);
    const sx=(r-128)/127,sy=(g-128)/127,i=(y*size+x)*4;
    bytes[i]=heights[y*size+x];bytes[i+1]=r;bytes[i+2]=g;
    bytes[i+3]=Math.round(255*clamp(sx*sx+sy*sy,0,1));
  }
  return bytes;
}

/** All meshes sharing this material must have a valid immutable bind field.
 * Capture after facial corrections, before physique/pose growth writes. */
export function installMetricSkinCoordinates(surfaces:readonly THREE.SkinnedMesh[],
  material:THREE.MeshPhysicalMaterial,sceneScale:number):boolean {
  const body=surfaces.find(s=>s.name==='BODYFORGE_Body');
  if(!body||body.userData.BODYFORGE_groom!=='v2'||body.geometry.getAttribute('position')?.count!==65895||
     material.userData.BODYFORGE_regionalDermal!==true||!Number.isFinite(sceneScale)||sceneScale<.5||sceneScale>5||
     material.userData.BODYFORGE_metricSkinScale!==undefined)return false;
  const data:{geometry:THREE.BufferGeometry;rest:Float32Array;normals:Int16Array}[]=[];
  for(const s of surfaces){
    const geometry=s.geometry,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
    if(!p||p.itemSize!==3||!n||n.itemSize!==3||p.count!==n.count||
       geometry.hasAttribute(METRIC_REST)||geometry.hasAttribute(METRIC_NORMAL))return false;
    const rest=new Float32Array(p.count*3),normals=new Int16Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
      const len=Math.hypot(nx,ny,nz);
      if(![x,y,z,len].every(Number.isFinite)||len<.5||len>1.5)return false;
      rest.set([x,y,z],i*3);
      normals.set([Math.round(32767*nx/len),Math.round(32767*ny/len),Math.round(32767*nz/len)],i*3);
    }
    data.push({geometry,rest,normals});
  }
  for(const {geometry,rest,normals} of data){
    geometry.setAttribute(METRIC_REST,new THREE.Float32BufferAttribute(rest,3));
    geometry.setAttribute(METRIC_NORMAL,new THREE.Int16BufferAttribute(normals,3,true));
  }
  material.userData.BODYFORGE_metricSkinScale=sceneScale;
  return true;
}

/** No extra network fetch or retained second texture. Fail closed if image
 * decoding or the source contract fails. Canvas reads a same-origin image. */
export function createMetricSkinTile(source:THREE.Texture):THREE.DataTexture|undefined {
  const image=source.image as HTMLImageElement|undefined;
  if(typeof document==='undefined'||!image||image.width!==METRIC_SKIN_SIZE||image.height!==METRIC_SKIN_SIZE)return;
  try{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=METRIC_SKIN_SIZE;
    const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return;
    context.drawImage(image,0,0);
    const rgba=context.getImageData(0,0,METRIC_SKIN_SIZE,METRIC_SKIN_SIZE).data;
    const heights=new Uint8Array(METRIC_SKIN_SIZE*METRIC_SKIN_SIZE);
    for(let i=0;i<heights.length;i++){
      const k=i*4;
      if(rgba[k]!==rgba[k+1]||rgba[k]!==rgba[k+2]||rgba[k+3]!==255)return;
      heights[i]=rgba[k];
    }
    const pixels=packMetricSkinTile(heights);
    const texture=new THREE.DataTexture(pixels,METRIC_SKIN_SIZE,METRIC_SKIN_SIZE,THREE.RGBAFormat,THREE.UnsignedByteType);
    texture.userData.BODYFORGE_metricSkin=METRIC_SKIN_ID;
    return texture;
  }catch{return;}
}

/** CPU reference for the covector transform: gradients are slopes in bind
 * metres and position derivatives in normalized view-space units. This is
 * not used on every vertex/frame. A grazing/degenerate frame fails closed. */
export function metricViewGradient(restGradient:THREE.Vector3,restDx:THREE.Vector3,restDy:THREE.Vector3,
  viewDx:THREE.Vector3,viewDy:THREE.Vector3,macroNormal:THREE.Vector3,sceneScale:number):THREE.Vector3 {
  const a=new THREE.Vector3().crossVectors(viewDy,macroNormal);
  const b=new THREE.Vector3().crossVectors(macroNormal,viewDx);
  const det=viewDx.dot(a),area=viewDx.length()*viewDy.length();
  if(!Number.isFinite(det)||!Number.isFinite(area)||area<1e-12||Math.abs(det)<=area*.04)return new THREE.Vector3();
  const g=a.multiplyScalar(restGradient.dot(restDx)*sceneScale/det)
    .addScaledVector(b,restGradient.dot(restDy)*sceneScale/det);
  return g.clampLength(0,.55);
}

/** Replace the existing three height lookups with three filtered gradient
 * samples. Blend triplanar fields in bind space and apply a bounded
 * surface-gradient transform. No per-fragment inverse matrix, no new pass.
 * The micro normal is layered on the tangent-space atlas; roughness includes
 * an approximate slope-variance term when the resolved detail is filtered. */
export function metricSkinShaders(vertex:string,fragment:string):{vertex:string;fragment:string}|undefined {
  const begin='#include <begin_vertex>';
  const normal='normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd() * mix(0.28, 0.92, vBfDermal.z), faceDirection);';
  if(vertex.includes(METRIC_SKIN_ID)||!vertex.includes('BODYFORGE_DERMAL_REGIONS_V3')||
     !fragment.includes('BODYFORGE_SCAN_MICRO_V2')||vertex.split(begin).length!==2||fragment.split(normal).length!==2)return;
  const varying='varying vec3 vBfMetricRest;\nvarying vec3 vBfMetricNormal;\n';
  return{
    vertex:'// '+METRIC_SKIN_ID+'\nattribute vec3 bfMetricRest;\nattribute vec3 bfMetricNormal;\n'+varying+
      vertex.replace(begin,begin+'\n vBfMetricRest = bfMetricRest;\n vBfMetricNormal = bfMetricNormal;'),
    fragment:'// '+METRIC_SKIN_ID+'\n'+varying+'uniform float bfMetricSceneScale;\n'+fragment.replace(normal,[
      // The condition enclosing this code is the original tangent-normal+bump condition.
      'vec3 bfMetricP = vBfMetricRest / '+METRIC_SKIN_PERIOD.toFixed(8)+';',
      'vec3 bfMetricDx = dFdx(bfMetricP), bfMetricDy = dFdy(bfMetricP);',
      'vec3 bfMetricW = abs(vBfMetricNormal); bfMetricW *= bfMetricW; bfMetricW *= bfMetricW;',
      'bfMetricW /= max(0.00001, dot(bfMetricW, vec3(1.0)));',
      'vec4 bfMetricX = textureGrad(bumpMap, bfMetricP.zy, bfMetricDx.zy, bfMetricDy.zy);',
      'vec4 bfMetricY = textureGrad(bumpMap, bfMetricP.xz+vec2(0.37,0.19), bfMetricDx.xz, bfMetricDy.xz);',
      'vec4 bfMetricZ = textureGrad(bumpMap, bfMetricP.xy+vec2(0.71,0.43), bfMetricDx.xy, bfMetricDy.xy);',
      'vec2 bfSlopeX = (bfMetricX.gb*255.0-128.0)/127.0;',
      'vec2 bfSlopeY = (bfMetricY.gb*255.0-128.0)/127.0;',
      'vec2 bfSlopeZ = (bfMetricZ.gb*255.0-128.0)/127.0;',
      'vec3 bfGrad = bfMetricW.x*vec3(0.0,bfSlopeX.y,bfSlopeX.x)+bfMetricW.y*vec3(bfSlopeY.x,0.0,bfSlopeY.y)+bfMetricW.z*vec3(bfSlopeZ,0.0);',
      'vec3 bfSx = dFdx(-vViewPosition), bfSy = dFdy(-vViewPosition);',
      'vec3 bfR1 = cross(bfSy,nonPerturbedNormal), bfR2 = cross(nonPerturbedNormal,bfSx);',
      'float bfDet = dot(bfSx,bfR1), bfArea = length(bfSx)*length(bfSy);',
      'float bfStrength = mix(0.60,1.15,vBfDermal.z);',
      'if (bfArea>1e-12 && abs(bfDet)>bfArea*0.04) {',
      '  vec3 bfViewGrad = (bfR1*dot(bfGrad,bfMetricDx)+bfR2*dot(bfGrad,bfMetricDy))*('+METRIC_SKIN_PERIOD.toFixed(8)+'*bfMetricSceneScale/bfDet);',
      '  bfViewGrad *= min(1.0,0.55/max(1e-8,length(bfViewGrad)));',
      '  vec3 bfSurfaceNormal = normal-bfViewGrad*bfStrength;',
      '  normal = normalize(bfSurfaceNormal);',
      '}',
      'vec3 bfVariance = max(vec3(0.0),vec3(bfMetricX.a,bfMetricY.a,bfMetricZ.a)-vec3(dot(bfSlopeX,bfSlopeX),dot(bfSlopeY,bfSlopeY),dot(bfSlopeZ,bfSlopeZ)));',
      // GGX alpha = perceptual roughness squared; combine approximate alpha^2.
      'float bfUnresolved = dot(bfMetricW*bfMetricW,bfVariance)*bfStrength*bfStrength;',
      'roughnessFactor = min(0.94,pow(pow(roughnessFactor,4.0)+0.75*bfUnresolved,0.25));',
    ].join('\n'))
  };
}
