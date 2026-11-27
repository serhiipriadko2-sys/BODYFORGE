import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describe,expect,it,vi} from 'vitest';
import {installScalpDensity,scalpDensityShaders,setScalpDensityLook} from './avatarScalpDensity';
import {BUZZ_ATLAS_SIZE,BUZZ_CELLS,BUZZ_REVIEW_ID,buzzFibrePixels,createBuzzFibreTexture,installBuzzSurface,setBuzzSurface,buzzSurfaceState,buzzSurfaceShaders} from './avatarBuzzReview';
import {installAvatarSkinLighting,installAvatarScanDetail} from './avatarSkinLighting';
import {disposeThreeTree} from './threeResources';

describe('scalp-surface stubble review',()=>{
  it('creates a deterministic bounded non-color coverage tile with irregular fibers',()=>{
    const a=buzzFibrePixels(),b=buzzFibrePixels();
    expect(a).toEqual(b);expect(a).not.toBe(b);
    expect(a.byteLength).toBe(BUZZ_ATLAS_SIZE**2);expect(BUZZ_CELLS).toBe(16);
    const mean=a.reduce((s,n)=>s+n,0)/(255*a.length);
    expect(mean).toBeGreaterThan(.07);expect(mean).toBeLessThan(.22);
    expect(a.some(x=>x===0)).toBe(true);expect(a.some(x=>x>200)).toBe(true);
    const texture=createBuzzFibreTexture();
    try{
      expect(texture.format).toBe(THREE.RedFormat);expect(texture.colorSpace).toBe(THREE.NoColorSpace);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);expect(texture.generateMipmaps).toBe(true);
      expect(texture.unpackAlignment).toBe(1);
    }finally{texture.dispose();}
    console.info('BUZZ_COVERAGE',JSON.stringify({mean,bytes:a.byteLength}));
  });

  it('patches exactly the existing scalp color mixing with explicit mip derivatives',()=>{
    const base=scalpDensityShaders(THREE.ShaderLib.physical.vertexShader,THREE.ShaderLib.physical.fragmentShader)!;
    const next=buzzSurfaceShaders(base.vertex,base.fragment)!;
    expect(next.vertex).toContain(BUZZ_REVIEW_ID);
    expect(next.vertex).toContain('vBfBuzzPosition = position');
    expect(next.fragment).toContain('bfBuzzEnabled > 0.5');
    expect(next.fragment.split('textureGrad(bfBuzzAtlas,')).toHaveLength(4);
    expect(next.fragment).toContain('bfScalpCoverage *= 0.40 + 0.60 * bfStubble');
    expect(next.fragment).toContain('mix(diffuseColor.rgb, bfScalpColor, bfScalpCoverage)');
    expect(buzzSurfaceShaders(next.vertex,next.fragment)).toBeUndefined();
    expect(buzzSurfaceShaders('unknown',base.fragment)).toBeUndefined();
  });

  it('installs only on the real protected scalp, retains skin and disposes the owned atlas once',async()=>{
    const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
    const material=new THREE.MeshPhysicalMaterial(),blank=new THREE.MeshPhysicalMaterial();
    try{
      expect(installBuzzSurface(blank)).toBeUndefined();
      expect(setBuzzSurface(blank,true)).toBe(false);
      const body=scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const p=body.geometry.getAttribute('position'),weights=body.geometry.getAttribute('skinWeight');
      expect(installScalpDensity([body],material)).toBeDefined();
      const state=installBuzzSurface(material)!;
      expect(state.enabled.value).toBe(0);
      expect(installBuzzSurface(material)).toBe(state);
      installAvatarSkinLighting(material);
      expect(material.customProgramCacheKey()).toContain('buzz-surface-v1');
      expect(setBuzzSurface(material,true)).toBe(true);
      expect(state.enabled.value).toBe(1);
      setScalpDensityLook(material,new THREE.Color('#181a21'),true);
      expect(setBuzzSurface(material,false)).toBe(false);expect(state.enabled.value).toBe(0);
      expect(body.geometry.getAttribute('position')).toBe(p);expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      const scan=new THREE.Texture();
      installAvatarScanDetail(material,scan);
      expect(buzzSurfaceState(material)).toBe(state);
      expect(material.customProgramCacheKey()).toContain('buzz-surface-v1');
      const dispose=vi.spyOn(state.texture,'dispose');
      material.dispose();material.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);expect(buzzSurfaceState(material)).toBeUndefined();
      scan.dispose();
    }finally{blank.dispose();material.dispose();disposeThreeTree(scene);}
  });
});
