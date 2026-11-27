import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { applyAvatarFaceForm } from './avatarFace';
import { installDermalRegions, regionalDermalShaders } from './avatarDermalRegions';
import { avatarSkinShader, installAvatarScanDetail, installAvatarSkinLighting } from './avatarSkinLighting';
import { angularDiffusionShader } from './avatarSkinDiffusion';
import { createAvatarPhysique } from './avatarPhysique';
import { SCAN_TORSO_REVIEW_DATA } from './avatarScanTorsoReviewData';
import { applyAvatarGrowth } from './avatarGrowth';
import { disposeThreeTree } from './threeResources';
import {
  createMetricSkinTile, installMetricSkinCoordinates, metricSkinShaders,
  metricViewGradient, packMetricSkinTile, METRIC_REST, METRIC_NORMAL, METRIC_SKIN_ID,
} from './avatarMetricSkinReview';

const sha=(data:ArrayBufferView)=>createHash('sha256').update(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)).digest('hex');
const v=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);

describe('metric skin gradient and moment review',()=>{
  it('encodes periodic central derivatives, exact zero and original fallback height',()=>{
    const size=64;
    const heights=Uint8Array.from({length:size*size},(_,i)=>
      Math.round(127+45*Math.sin(2*Math.PI*(i%size)*3/size)+36*Math.cos(2*Math.PI*Math.floor(i/size)*5/size)));
    const data=packMetricSkinTile(heights,size);
    const gain=size*.001/(2*255*.045);
    let energy=0,meanX=0,meanY=0,worst=0;
    for(let i=0;i<heights.length;i++){
      const x=i%size,y=Math.floor(i/size),k=i*4;
      const at=(a:number,b:number)=>heights[((b+size)%size)*size+(a+size)%size];
      const gx=(at(x+1,y)-at(x-1,y))*gain,gy=(at(x,y+1)-at(x,y-1))*gain;
      const dx=(data[k+1]-128)/127,dy=(data[k+2]-128)/127;
      expect(data[k]).toBe(heights[i]);
      worst=Math.max(worst,Math.abs(dx-gx),Math.abs(dy-gy));
      expect(Math.abs(data[k+3]/255-(dx*dx+dy*dy))).toBeLessThanOrEqual(.5/255+1e-10);
      energy+=data[k+3]/255;meanX+=dx;meanY+=dy;
    }
    expect(worst).toBeLessThanOrEqual(.5/127+1e-10);
    expect(Math.abs(meanX/size**2)).toBeLessThan(.0001);
    expect(Math.abs(meanY/size**2)).toBeLessThan(.0001);
    expect(energy).toBeGreaterThan(0);
    const flat=packMetricSkinTile(new Uint8Array(16).fill(127),4);
    for(let k=0;k<flat.length;k+=4)expect(Array.from(flat.slice(k,k+4))).toEqual([127,128,128,0]);
    expect(()=>packMetricSkinTile(new Uint8Array(9),3)).toThrow();
    expect(()=>packMetricSkinTile(new Uint8Array(255))).toThrow();
    console.info('METRIC_PERIODIC_REFERENCE',JSON.stringify({samples:heights.length,worst,meanEnergy:energy/heights.length}));
  });

  it('preserves bounded slopes and second moments under linear averaging',()=>{
    const size=256;
    const heights=Uint8Array.from({length:size*size},(_,i)=>(i*31+Math.floor(i/size)*73)%256);
    const p=packMetricSkinTile(heights);
    let energy=0;
    for(let i=0;i<p.length;i+=4){
      const x=(p[i+1]-128)/127,y=(p[i+2]-128)/127;
      expect(Math.hypot(x,y)).toBeLessThan(.907);
      expect(Math.abs(p[i+3]/255-x*x-y*y)).toBeLessThanOrEqual(.5/255+1e-10);
      energy+=p[i+3]/255;
    }
    let a=Float64Array.from(p);
    for(let n=size;n>1;n/=2){
      const next=new Float64Array(n*n);
      for(let y=0;y<n/2;y++)for(let x=0;x<n/2;x++)for(let c=0;c<4;c++){
        const i=(2*y*n+2*x)*4+c;
        next[(y*(n/2)+x)*4+c]=(a[i]+a[i+4]+a[i+n*4]+a[i+n*4+4])/4;
      }
      a=next;
    }
    const mx=(a[1]-128)/127,my=(a[2]-128)/127;
    expect(a[3]/255).toBeCloseTo(energy/(size*size),10);
    expect(a[3]/255-mx*mx-my*my).toBeGreaterThan(.1);
  });

  it('transforms covectors through zoom, rotation and nonuniform growth; rejects degeneracy',()=>{
    const restDx=v(.001,0,0),restDy=v(0,.002,0),g=v(.18,-.24,0);
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,-.9,.7));
    const rotate=(a:THREE.Vector3)=>a.clone().applyQuaternion(q);
    const n=rotate(v(0,0,1));
    for(const scale of [.8,2.7,4.2])for(const zoom of [.05,1,7]){
      const x=restDx.clone().multiplyScalar(zoom),y=restDy.clone().multiplyScalar(zoom);
      const result=metricViewGradient(g,x,y,rotate(x).multiplyScalar(scale),rotate(y).multiplyScalar(scale),n,scale);
      expect(result.distanceTo(rotate(g))).toBeLessThan(1e-10);
      const dx=rotate(v(1.7*x.x,.3*x.x,0)).multiplyScalar(scale);
      const dy=rotate(v(.2*y.y,.85*y.y,0)).multiplyScalar(scale);
      const deformed=metricViewGradient(g,x,y,dx,dy,n,scale);
      expect(deformed.dot(dx)).toBeCloseTo(g.dot(x)*scale,10);
      expect(deformed.dot(dy)).toBeCloseTo(g.dot(y)*scale,10);
      expect(deformed.dot(n)).toBeCloseTo(0,10);
    }
    expect(metricViewGradient(g,restDx,restDy,restDx,restDx,v(0,0,1),1).length()).toBe(0);
    expect(metricViewGradient(v(10,10,0),restDx,restDy,restDx,restDy,v(0,0,1),1).length()).toBeCloseTo(.55,10);
  });

  it('patches only the known regional scan shader, composes with existing diffusion and keeps direct/indirect PBR',()=>{
    const base=regionalDermalShaders(THREE.ShaderLib.physical.vertexShader,
      avatarSkinShader(THREE.ShaderLib.physical.fragmentShader,true))!;
    const patched=metricSkinShaders(base.vertex,base.fragment)!;
    expect(patched.vertex).toContain(METRIC_SKIN_ID);
    expect(patched.vertex).toContain('attribute vec3 bfMetricRest;');
    expect(patched.vertex).toContain('vBfMetricRest = bfMetricRest;');
    expect(patched.fragment.match(/textureGrad\(bumpMap/g)).toHaveLength(3);
    expect(patched.fragment).toContain('bfVariance');
    expect(patched.fragment).toContain('roughnessFactor');
    expect(patched.fragment).toContain('#include <normal_fragment_maps>');
    expect(patched.fragment).toContain('#include <lights_fragment_maps>');
    expect(patched.fragment).toContain('BRDF_GGX');
    expect(angularDiffusionShader(patched.fragment)).toContain('BF_SKIN_ANGULAR_DIFFUSION_V1');
    expect(metricSkinShaders(base.vertex,base.fragment.replace('dHdxy_fwd()','unknown()'))).toBeUndefined();
    expect(metricSkinShaders(patched.vertex,patched.fragment)).toBeUndefined();
  });

  it('replaces only the owned height texture and fails closed on invalid image data',()=>{
    const size=256,rgba=new Uint8ClampedArray(size*size*4);
    for(let i=0;i<size*size;i++){rgba.fill((i*17)%256,i*4,i*4+3);rgba[i*4+3]=255;}
    const source=new THREE.Texture({width:size,height:size}),prior=new THREE.Texture();
    const material=new THREE.MeshPhysicalMaterial({bumpMap:prior,normalMap:new THREE.Texture()});
    const oldDispose=vi.spyOn(prior,'dispose'),sourceDispose=vi.spyOn(source,'dispose');
    const originalNormal=material.normalMap;
    material.userData.BODYFORGE_regionalDermal=true;
    material.userData.BODYFORGE_metricSkinScale=2.7;
    const fake={createElement:()=>({getContext:()=>({drawImage:()=>{},getImageData:()=>({data:rgba})})})};
    vi.stubGlobal('document',fake);
    try{
      installAvatarScanDetail(material,source);
      expect(material.bumpMap).toBeInstanceOf(THREE.DataTexture);
      expect(material.bumpMap?.userData.BODYFORGE_metricSkin).toBe(METRIC_SKIN_ID);
      expect(material.bumpMap?.premultiplyAlpha).toBe(false);
      expect(material.bumpMap?.generateMipmaps).toBe(true);
      expect(material.normalMap).toBe(originalNormal);
      expect(sourceDispose).toHaveBeenCalledTimes(1);
      expect(oldDispose).toHaveBeenCalledTimes(1);
      const packed=material.bumpMap!;
      expect(material.customProgramCacheKey()).toContain('metric-skin-gradient-v1');
      installAvatarSkinLighting(material,true);
      expect(material.bumpMap).toBe(packed);
      rgba[2]=rgba[1]+1;
      expect(createMetricSkinTile(source)).toBeUndefined();
      rgba[2]=rgba[1];
      rgba[3]=0;
      expect(createMetricSkinTile(source)).toBeUndefined();
      const invalid=new THREE.Texture({width:128,height:128});
      installAvatarScanDetail(material,invalid);
      expect(material.bumpMap).toBe(invalid);
      expect(material.customProgramCacheKey()).not.toContain('metric-skin-gradient-v1');
      invalid.dispose();
    }finally{
      vi.unstubAllGlobals();originalNormal?.dispose();material.dispose();
    }
  });

  it('pins real athlete bind coordinates across paid growth and preserves source topology',async()=>{
    const bytes=readFileSync('public/assets/bodyforge-athlete-efficient.glb');
    expect(sha(bytes)).toBe('df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e');
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
    const material=new THREE.MeshPhysicalMaterial();
    try{
      expect(applyAvatarFaceForm(scene)).toBeDefined();
      const surfaces=['Body','SkinEars','SkinNipples'].map(name=>scene.getObjectByName('BODYFORGE_'+name) as THREE.SkinnedMesh);
      const body=surfaces[0],uv=body.geometry.getAttribute('uv'),weights=body.geometry.getAttribute('skinWeight'),index=body.geometry.index;
      expect(installDermalRegions(surfaces)).toBe(true);
      material.userData.BODYFORGE_regionalDermal=true;
      expect(installMetricSkinCoordinates(surfaces,material,2.7)).toBe(true);
      expect(installMetricSkinCoordinates(surfaces,material,2.7)).toBe(false);
      const snapshots=surfaces.map(s=>{
        const p=s.geometry.getAttribute('position'),a=s.geometry.getAttribute(METRIC_REST),n=s.geometry.getAttribute(METRIC_NORMAL);
        expect(a.count).toBe(p.count);expect(n.count).toBe(p.count);
        expect(a.array.byteLength+n.array.byteLength).toBe(p.count*18);
        for(let i=0;i<p.count;i++){
          expect(a.getX(i)).toBe(p.getX(i));expect(a.getY(i)).toBe(p.getY(i));expect(a.getZ(i)).toBe(p.getZ(i));
          expect(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)).toBeLessThan(5e-5);
        }
        return {s,a,n,rest:sha(a.array),normal:sha(n.array)};
      });
      const sculpt=createAvatarPhysique(scene,false,false,SCAN_TORSO_REVIEW_DATA,true,true);
      for(const levels of [{},{arms:5,core:1,legs:3,back:2},{arms:5,core:5,legs:5,back:5},{}]){
        sculpt(levels);applyAvatarGrowth(scene,levels,.4);
        for(const {s,a,n,rest,normal} of snapshots){
          expect(s.geometry.getAttribute(METRIC_REST)).toBe(a);
          expect(s.geometry.getAttribute(METRIC_NORMAL)).toBe(n);
          expect(sha(a.array)).toBe(rest);expect(sha(n.array)).toBe(normal);
        }
      }
      expect(body.geometry.getAttribute('uv')).toBe(uv);
      expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      expect(body.geometry.index).toBe(index);
      console.info('METRIC_BIND',JSON.stringify({vertices:surfaces.reduce((n,s)=>n+s.geometry.getAttribute(METRIC_REST).count,0),
        bytes:surfaces.reduce((n,s)=>n+s.geometry.getAttribute(METRIC_REST).array.byteLength+s.geometry.getAttribute(METRIC_NORMAL).array.byteLength,0)}));
    }finally{disposeThreeTree(scene);material.dispose();}
  },30000);
});
