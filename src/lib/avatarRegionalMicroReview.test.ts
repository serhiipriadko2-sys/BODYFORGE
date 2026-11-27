import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { applyAvatarFaceForm } from './avatarFace';
import { installDermalRegions, regionalDermalShaders } from './avatarDermalRegions';
import { avatarSkinShader, installAvatarSkinLighting } from './avatarSkinLighting';
import { angularDiffusionShader } from './avatarSkinDiffusion';
import { installMetricSkinCoordinates, metricSkinShaders, METRIC_REST, METRIC_NORMAL, METRIC_SKIN_ID } from './avatarMetricSkinReview';
import { createAvatarPhysique } from './avatarPhysique';
import { SCAN_TORSO_REVIEW_DATA } from './avatarScanTorsoReviewData';
import { applyAvatarGrowth } from './avatarGrowth';
import { disposeThreeTree } from './threeResources';
import {
  installRegionalMicro, sampleRegionalMicro, regionalMicroShaders, REGIONAL_MICRO_ID,
  REGIONAL_MICRO_ATTRIBUTE, REGIONAL_MICRO_FOOTPRINT_MAX,
} from './avatarRegionalMicroReview';

const sha=(data:ArrayBufferView)=>createHash('sha256').update(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)).digest('hex');
const metricShader=()=>{
  const base=regionalDermalShaders(THREE.ShaderLib.physical.vertexShader,
    avatarSkinShader(THREE.ShaderLib.physical.fragmentShader,true))!;
  return metricSkinShaders(base.vertex,base.fragment)!;
};

describe('bounded regional skin microrelief review',()=>{
  it('distinguishes authored regions, mirrors them and avoids hard boundaries',()=>{
    const cheek=sampleRegionalMicro(.05,1.641,.119);
    const eyelid=sampleRegionalMicro(.03,1.677,.143);
    const ear=sampleRegionalMicro(.079,1.654,.049);
    const hand=sampleRegionalMicro(.548,1.035,.273);
    const knee=sampleRegionalMicro(.151,.538,.073);
    const elbow=sampleRegionalMicro(.382,1.232,-.015);
    const neck=sampleRegionalMicro(.043,1.485,.047);
    expect(cheek[0]).toBeGreaterThan(.62);
    expect(eyelid[0]).toBeCloseTo(.20,6);
    expect(ear[0]).toBeCloseTo(.28,6);
    expect(hand[0]).toBeCloseTo(.35,6);
    expect(knee[0]).toBeCloseTo(.68,6);
    expect(elbow[0]).toBeCloseTo(.66,6);
    expect(neck[0]).toBeCloseTo(.38,6);
    expect(eyelid[1]).toBeGreaterThan(cheek[1]+.5);
    expect(sampleRegionalMicro(-.05,1.641,.119)).toEqual(cheek);
    expect(sampleRegionalMicro(NaN,1,1)).toEqual([.52,.12]);
    let maxStep=0;
    for(let i=0;i<2000;i++){
      const y=1.45+i*.0002;
      const a=sampleRegionalMicro(.03,y,.143),b=sampleRegionalMicro(.03,y+.0002,.143);
      maxStep=Math.max(maxStep,...a.map((v,k)=>Math.abs(v-b[k])));
      expect(a[0]).toBeGreaterThanOrEqual(.12);expect(a[0]).toBeLessThanOrEqual(.78);
      expect(a[1]).toBeGreaterThanOrEqual(0);expect(a[1]).toBeLessThanOrEqual(1);
    }
    expect(maxStep).toBeLessThan(.025);
    expect(REGIONAL_MICRO_FOOTPRINT_MAX).toBe(2.25);
    console.info('REGIONAL_PROFILE_REFERENCE',JSON.stringify({cheek,eyelid,ear,hand,knee,elbow,neck,maxStep}));
  });

  it('uses the same three samples and unscaled geometry derivatives, isolates direct diffuse from pore normals',()=>{
    const base=metricShader();
    for(const diffusion of [false,true]){
      const fragment=diffusion?angularDiffusionShader(base.fragment)!:base.fragment;
      const patched=regionalMicroShaders(base.vertex,fragment)!;
      expect(patched.vertex).toContain('attribute vec2 bfRegionalMicro;');
      expect(patched.fragment).toContain('bfMesoNormal = normal;');
      expect(patched.fragment.indexOf('bfMesoNormal = normal;')).toBeLessThan(patched.fragment.indexOf('vec3 bfMetricP'));
      expect(patched.fragment.match(/textureGrad\(bumpMap/g)).toHaveLength(3);
      expect(patched.fragment.match(/\* bfMicroFootprint/g)).toHaveLength(6);
      expect(patched.fragment).toContain('dot(bfGrad,bfMetricDx)');
      expect(patched.fragment).toContain('dot(bfGrad,bfMetricDy)');
      expect(patched.fragment).toContain('bfUnresolved');
      expect(patched.fragment).toContain('float bfCos = dot(bfMesoNormal, directLight.direction);');
      expect(patched.fragment).toContain('BRDF_GGX');
      expect(patched.fragment).toContain('BRDF_Lambert(material.diffuseContribution) * (1.0 - F)');
      if(diffusion){
        expect(patched.fragment).toContain('mix(bfMesoNormal, nonPerturbedNormal, 0.64)');
        expect(patched.fragment.match(/texture2D\(bfDiffusionLut,/g)).toHaveLength(1);
      }else expect(patched.fragment).toContain('mix(directLight.color * max(0.0, bfCos), directLight.color * bfSoft,');
      expect(regionalMicroShaders(patched.vertex,patched.fragment)).toBeUndefined();
      expect(regionalMicroShaders(base.vertex,fragment.replace('float bfStrength','float unknownStrength'))).toBeUndefined();
    }
    expect(regionalMicroShaders('unknown',base.fragment)).toBeUndefined();
  });

  it('keeps the previous program key unless both metric texture and regional profile are active',()=>{
    const material=new THREE.MeshPhysicalMaterial();
    material.userData.BODYFORGE_regionalDermal=true;
    material.userData.BODYFORGE_metricSkinScale=2.7;
    material.userData.BODYFORGE_regionalMicro=REGIONAL_MICRO_ID;
    installAvatarSkinLighting(material,true);
    expect(material.customProgramCacheKey()).not.toContain('regional-micro-v1');
    const texture=new THREE.DataTexture();
    texture.userData.BODYFORGE_metricSkin=METRIC_SKIN_ID;
    material.bumpMap=texture;
    installAvatarSkinLighting(material,true);
    expect(material.customProgramCacheKey()).toContain('metric-skin-gradient-v1-regional-micro-v1');
    delete material.userData.BODYFORGE_regionalMicro;
    installAvatarSkinLighting(material,true);
    expect(material.customProgramCacheKey()).toBe('bodyforge-scan-micro-v2-regions-v3-metric-skin-gradient-v1');
    texture.dispose();material.dispose();
  });

  it('fails atomically on invalid shared primitive, preserving previously installed fields',()=>{
    const material=new THREE.MeshPhysicalMaterial();
    material.userData.BODYFORGE_regionalDermal=true;
    material.userData.BODYFORGE_metricSkinScale=2.7;
    const body=new THREE.SkinnedMesh(new THREE.BufferGeometry(),material);
    body.name='BODYFORGE_Body';
    const p=new THREE.Float32BufferAttribute(new Float32Array(65895*3),3);
    body.geometry.setAttribute('position',p);
    body.geometry.setAttribute(METRIC_REST,p);
    body.geometry.setAttribute(METRIC_NORMAL,p);
    const invalid=new THREE.SkinnedMesh(new THREE.BufferGeometry(),material);
    expect(installRegionalMicro([body,invalid],material)).toBe(false);
    expect(body.geometry.hasAttribute(REGIONAL_MICRO_ATTRIBUTE)).toBe(false);
    expect(material.userData.BODYFORGE_regionalMicro).toBeUndefined();
    body.geometry.dispose();invalid.geometry.dispose();material.dispose();
  });

  it('installs exactly two bytes per real skin vertex, preserves coincident seams and all paid growth fields',async()=>{
    const bytes=readFileSync('public/assets/bodyforge-athlete-efficient.glb');
    expect(sha(bytes)).toBe('df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e');
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
    const material=new THREE.MeshPhysicalMaterial();
    try{
      expect(applyAvatarFaceForm(scene)).toBeDefined();
      const surfaces=['Body','SkinEars','SkinNipples'].map(name=>scene.getObjectByName('BODYFORGE_'+name) as THREE.SkinnedMesh);
      expect(installDermalRegions(surfaces)).toBe(true);
      material.userData.BODYFORGE_regionalDermal=true;
      expect(installMetricSkinCoordinates(surfaces,material,2.7)).toBe(true);
      const prior=surfaces.map(s=>({s,rest:s.geometry.getAttribute(METRIC_REST),normal:s.geometry.getAttribute(METRIC_NORMAL),
        index:s.geometry.index,uv:s.geometry.getAttribute('uv'),weights:s.geometry.getAttribute('skinWeight')}));
      expect(installRegionalMicro(surfaces,material)).toBe(true);
      expect(installRegionalMicro(surfaces,material)).toBe(false);
      let min=255,max=0,minFilter=255,maxFilter=0,total=0,seams=0;
      const coords=new Map<string,number>();
      const snapshots=prior.map(row=>{
        const {s,rest}=row,a=s.geometry.getAttribute(REGIONAL_MICRO_ATTRIBUTE);
        expect(a.normalized).toBe(true);expect(a.itemSize).toBe(2);
        expect(a.array).toBeInstanceOf(Uint8Array);
        expect(a.count).toBe(rest.count);total+=a.count;
        for(let i=0;i<a.count;i++){
          const x=rest.getX(i),y=rest.getY(i),z=rest.getZ(i);
          const [amp,filter]=sampleRegionalMicro(x,y,z);
          const r=a.array[i*2],g=a.array[i*2+1];
          if(Math.abs(r/255-amp)>.5/255+1e-8||Math.abs(g/255-filter)>.5/255+1e-8)throw Error('Regional quantization drift');
          const k=[x,y,z].join(','),v=r*256+g;
          if(coords.has(k)){if(coords.get(k)!==v)throw Error('Coincident seam mismatch');seams++;}
          else coords.set(k,v);
          min=Math.min(min,r);max=Math.max(max,r);minFilter=Math.min(minFilter,g);maxFilter=Math.max(maxFilter,g);
        }
        return {...row,a,hash:sha(a.array),restHash:sha(rest.array),normalHash:sha(row.normal.array)};
      });
      expect(total).toBe(69871);expect(seams).toBeGreaterThan(100);
      expect(min).toBeLessThan(80);expect(max).toBeGreaterThan(165);
      expect(maxFilter-minFilter).toBeGreaterThan(100);
      const sculpt=createAvatarPhysique(scene,false,false,SCAN_TORSO_REVIEW_DATA,true,true);
      for(const levels of [{},{arms:5,core:1,legs:3,back:2},{arms:5,core:5,legs:5,back:5},{}]){
        sculpt(levels);applyAvatarGrowth(scene,levels,.4);
        for(const row of snapshots){
          const {s,a,rest,normal,index,uv,weights}=row;
          expect(s.geometry.getAttribute(REGIONAL_MICRO_ATTRIBUTE)).toBe(a);
          expect(sha(a.array)).toBe(row.hash);
          expect(sha(rest.array)).toBe(row.restHash);expect(sha(normal.array)).toBe(row.normalHash);
          expect(s.geometry.index).toBe(index);expect(s.geometry.getAttribute('uv')).toBe(uv);
          expect(s.geometry.getAttribute('skinWeight')).toBe(weights);
        }
      }
      console.info('REGIONAL_REAL_RIG',JSON.stringify({vertices:total,bytes:total*2,coincidentDuplicates:seams,strengthBytes:[min,max],filterBytes:[minFilter,maxFilter],
        meshes:snapshots.map(row=>({name:row.s.name,count:row.a.count,sha256:row.hash}))}));
    }finally{disposeThreeTree(scene);material.dispose();}
  },30000);
});
