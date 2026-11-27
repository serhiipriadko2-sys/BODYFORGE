import { existsSync,readFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describe,expect,it,vi} from 'vitest';
import {createFibreAtlas,createDirectionalGroomMaterial,validateDirectionalGroom,prepareDirectionalTangents,loadDirectionalGroomReview,DIRECTIONAL_GROOM_SIZE,DIRECTIONAL_GROOM_INDICES,FIBRE_ATLAS_SIZE} from './avatarDirectionalGroomReview';
import {disposeThreeTree} from './threeResources';

const asset='.bodyforge-qa/groom-review-v3/bodyforge-strand-groom-v3.glb';
const sha='37fd6ca23f50d666dfbe64b81ae8746b049cec64998e4770cb7466945a54b8d5';
describe('directional hair review',()=>{
  it('creates deterministic padded coverage and opaque scalp undercoat',()=>{
    const a=createFibreAtlas(),b=createFibreAtlas();
    try{
      const data=a.image.data as Uint8Array;
      expect(data.length).toBe(FIBRE_ATLAS_SIZE**2*4);
      expect(data).toEqual(b.image.data);
      let coverage=0,partial=0,tip=0;
      for(let y=0;y<256;y++)for(let x=0;x<256;x++){
        const alpha=data[(y*256+x)*4+3];
        if(y<80)expect(alpha).toBe(255);
        if(y===160){coverage+=alpha/255;if(alpha>0&&alpha<255)partial++;}
        if(y===250)tip+=alpha/255;
      }
      expect(coverage/256).toBeGreaterThan(.45);expect(coverage/256).toBeLessThan(.80);
      expect(partial).toBeGreaterThan(10);expect(tip).toBeLessThan(coverage*.20);
      expect(a.colorSpace).toBe(THREE.SRGBColorSpace);expect(a.flipY).toBe(false);
      expect(a.generateMipmaps).toBe(true);
    }finally{a.dispose();b.dispose();}
  });
  it('uses explicit directional reflection and bounded alpha coverage, not blended transparency',()=>{
    const m=createDirectionalGroomMaterial();
    try{
      expect(m.anisotropy).toBe(.74);expect(m.map).toBeInstanceOf(THREE.DataTexture);
      expect(m.transparent).toBe(false);expect(m.alphaTest).toBe(.28);
      expect(m.alphaToCoverage).toBe(true);expect(m.depthWrite).toBe(true);
      expect(m.vertexColors).toBe(true);expect(m.roughness).toBeGreaterThan(.45);
      m.color.set('#b7c1cd');expect(m.color.getHexString()).toBe('b7c1cd');
    }finally{m.map?.dispose();m.dispose();}
  });
  it('rejects unknown geometry and a failed optional asset fetch',async()=>{
    expect(validateDirectionalGroom(new THREE.Mesh())).toBe(false);
    const mock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('',{status:404}));
    try{await expect(loadDirectionalGroomReview()).rejects.toThrow('unavailable');}
    finally{mock.mockRestore();}
  });
  it.skipIf(!existsSync(asset))('checks both actual local meshes, UV bases and one-time resource ownership',async()=>{
    const bytes=Uint8Array.from(readFileSync(asset));
    expect(bytes.byteLength).toBe(DIRECTIONAL_GROOM_SIZE);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
    try{
      expect(scene.children).toHaveLength(2);
      for(const style of ['crop','swept']){
        const m=scene.getObjectByName('BODYFORGE_Groom_'+style) as THREE.Mesh;
        expect(validateDirectionalGroom(m)).toBe(true);
        expect(m.geometry.index!.count).toBe(DIRECTIONAL_GROOM_INDICES);
        expect(prepareDirectionalTangents(m)).toBe(true);
        const t=m.geometry.getAttribute('tangent'),uv=m.geometry.getAttribute('uv');
        expect(t.count).toBe(m.geometry.getAttribute('position').count);
        expect(uv.getY(0)).toBeCloseTo(.035,5);
        const old=uv.getX(0);uv.setX(0,2);expect(validateDirectionalGroom(m)).toBe(false);uv.setX(0,old);
        m.scale.x=1.1;expect(validateDirectionalGroom(m)).toBe(false);m.scale.x=1;
      }
    }finally{disposeThreeTree(scene);}
    const mock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(bytes.buffer));
    try{
      const g=await loadDirectionalGroomReview();
      expect(g.crop.material).toBe(g.material);expect(g.swept.material).toBe(g.material);
      const dispose=vi.spyOn(g.material,'dispose'),mapDispose=vi.spyOn(g.material.map!,'dispose');
      disposeThreeTree(g.groom);
      expect(dispose).toHaveBeenCalledTimes(1);expect(mapDispose).toHaveBeenCalledTimes(1);
    }finally{mock.mockRestore();}
  });
});
