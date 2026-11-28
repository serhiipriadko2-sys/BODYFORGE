import * as THREE from 'three';

export const EYE_CONTACT_ID='BF_V20_EyeAperture';
const WIDTH=128,FRAMES=21,HEIGHT=FRAMES*2,BYTES=WIDTH*HEIGHT*4;
export interface FoundationEyeContactRig {pose(blink:number):void;reset():void}

/** Front-projected visible globe intervals measured against the repaired
 * donor and the pinned 21-state eyelid trajectory. Not ray-traced light. */
export function decodeEyeAperture(bytes:ArrayBuffer):Uint8Array{
  if(bytes.byteLength!==BYTES)throw Error('Invalid eye aperture length');
  const data=new Uint8Array(bytes).slice();
  for(let side=0;side<2;side++){
    let previous=Infinity;
    for(let frame=0;frame<FRAMES;frame++){
      let total=0,count=0,first=-1,last=-1;
      for(let x=0;x<WIDTH;x++){
        const i=4*((side*FRAMES+frame)*WIDTH+x),lo=data[i],hi=data[i+1],valid=data[i+2];
        // Exact quantized envelope of the pinned donor aperture: y -6.08..3.73 mm.
        if(lo<50||hi>175||hi-lo>123||lo>hi||(valid!==0&&valid!==255)||data[i+3]!==255||(!valid&&lo!==hi)||(valid&&lo===hi))
          throw Error('Invalid eye aperture interval');
        if(valid){total+=hi-lo;count++;if(first<0)first=x;last=x;}
      }
      if(total>previous||(count>0&&last-first+1!==count)||
        (frame===0&&(count<90||count>112||total<9000||total>10000))||
        (frame===20&&(count>2||total>8)))throw Error('Invalid eye closure trajectory');
      previous=total;
    }
  }
  return data;
}

export function eyeContactShaders(vertex:string,fragment:string):{vertex:string;fragment:string}|undefined{
  const a='#include <begin_vertex>',b='#include <opaque_fragment>',c='#include <color_fragment>';
  if(vertex.includes(EYE_CONTACT_ID)||fragment.includes(EYE_CONTACT_ID)||vertex.split(a).length!==2||
    fragment.split(b).length!==2||fragment.split(c).length!==2)return;
  // Same bounded candidate as the hardware comparison. Only the two globe
  // materials use this shader. Local positions follow the CPU gaze pose.
  const layer=String.raw`
float bfSide=step(vBfV20Eye.x,0.0);
vec2 bfCenter=mix(vec2(0.03285256,1.57369493),vec2(-0.03289102,1.57369498),bfSide);
vec2 bfEye=vBfV20Eye.xy-bfCenter;
vec2 bfAperture=texture2D(bfV20Aperture,vec2(clamp(bfEye.x/0.028+0.5,0.5/128.0,127.5/128.0),(bfSide*21.0+clamp(bfV20Blink,0.0,1.0)*20.0+0.5)/42.0)).rg*0.020-0.010;
float bfUpper=max(0.0,bfAperture.y-bfEye.y);
float bfLower=max(0.0,bfEye.y-bfAperture.x);
float bfTopShade=1.0-smoothstep(0.00010,0.0036,bfUpper);
float bfBottomShade=1.0-smoothstep(0.00005,0.0021,bfLower);
float bfCorner=1.0-smoothstep(0.0001,0.0032,bfAperture.y-bfAperture.x);
float bfEyeMask=clamp(max(0.48*bfTopShade,0.30*bfBottomShade)+0.20*bfCorner,0.0,0.68);
float bfInner=bfCorner*(1.0-smoothstep(0.002,0.005,bfSide>0.5?-bfEye.x:bfEye.x));
diffuseColor.rgb*=mix(vec3(1.0),vec3(1.0,0.82,0.79),0.95*bfInner*0.45);
`;
  return {
    vertex:'// '+EYE_CONTACT_ID+'\nvarying vec3 vBfV20Eye;\n'+vertex.replace(a,a+'\nvBfV20Eye=position;'),
    fragment:'// '+EYE_CONTACT_ID+'\nvarying vec3 vBfV20Eye;\nuniform sampler2D bfV20Aperture;\nuniform float bfV20Blink;\n'+
      fragment.replace(c,c+'\n'+layer).replace(b,'outgoingLight*=1.0-0.95*bfEyeMask;\n'+b)
  };
}

export function installFoundationEyeContact(source:THREE.Group,bytes:ArrayBuffer):FoundationEyeContactRig{
  const data=decodeEyeAperture(bytes);
  if(!eyeContactShaders(THREE.ShaderLib.physical.vertexShader,THREE.ShaderLib.physical.fragmentShader))
    throw Error('Eye contact shader contract changed');
  const eyes=(['L','R'] as const).map(side=>{
    const mesh=source.getObjectByName('BF_Foundation_Eye_'+side);
    if(!(mesh instanceof THREE.SkinnedMesh)||!(mesh.material instanceof THREE.MeshPhysicalMaterial)||
       mesh.material.name!=='BF_Sclera_V2'||mesh.material.map?.name!=='BF_V8_OriginalEyePigment'||
       mesh.material.userData.foundationEyeContact!==undefined||
       mesh.geometry.getAttribute('position')?.count!==578||mesh.geometry.index?.count!==3264||
       mesh.skeleton.bones.length!==19||mesh.skeleton.bones[12]?.name!=='head')
      throw Error('Invalid eye contact scope');
    return mesh;
  });
  const materials=new Set(eyes.map(m=>m.material as THREE.MeshPhysicalMaterial));
  source.traverse(m=>{if(m instanceof THREE.Mesh&&materials.has(m.material as THREE.MeshPhysicalMaterial)&&!eyes.includes(m as THREE.SkinnedMesh))throw Error('Shared eye contact material');});
  const texture=new THREE.DataTexture(data,WIDTH,HEIGHT,THREE.RGBAFormat,THREE.UnsignedByteType);
  texture.name=EYE_CONTACT_ID;texture.colorSpace=THREE.NoColorSpace;texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.premultiplyAlpha=false;texture.needsUpdate=true;
  const uniform={value:0},owned=new Set(materials);
  for(const material of materials){
    const dispose=()=>{material.removeEventListener('dispose',dispose);owned.delete(material);if(owned.size===0)texture.dispose();};
    material.addEventListener('dispose',dispose);
    material.userData.foundationEyeContact=EYE_CONTACT_ID;
    material.onBeforeCompile=shader=>{
      const patch=eyeContactShaders(shader.vertexShader,shader.fragmentShader);
      if(!patch)throw Error('Eye contact shader anchor changed');
      shader.vertexShader=patch.vertex;shader.fragmentShader=patch.fragment;
      shader.uniforms.bfV20Aperture={value:texture};shader.uniforms.bfV20Blink=uniform;
    };
    material.customProgramCacheKey=()=>EYE_CONTACT_ID;material.needsUpdate=true;
  }
  const pose=(blink:number)=>{uniform.value=Number.isFinite(blink)?THREE.MathUtils.clamp(blink,0,1):0;};
  return {pose,reset:()=>pose(0)};
}
