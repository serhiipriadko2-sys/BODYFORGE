import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createLayeredGroomMaterial, isLayeredAvatarGroom, LAYERED_GROOM_INDEX_COUNT } from './avatarStrandGroom';
import { disposeThreeTree } from './threeResources';

describe('layered scalp-fitted hair',()=>{
  it('accepts both pinned haircuts and rejects changed geometry before adoption',async()=>{
    const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-strand-groom-v2.glb'));
    expect(bytes.length).toBeLessThan(850000);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('1f1d2d3d40a043bfbebf185be3614854588f755d1ce3028e3498976436714bc1');
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
    try{
      expect(scene.children).toHaveLength(2);
      for(const style of ['crop','swept']){
        const mesh=scene.getObjectByName('BODYFORGE_Groom_'+style) as THREE.Mesh;
        expect(isLayeredAvatarGroom(mesh)).toBe(true);
        expect(mesh.geometry.index!.count).toBe(LAYERED_GROOM_INDEX_COUNT);
        const p=mesh.geometry.getAttribute('position');
        const old=p.getY(0);
        p.setY(0,1.95);
        expect(isLayeredAvatarGroom(mesh)).toBe(false);
        p.setY(0,old);
        expect(isLayeredAvatarGroom(mesh)).toBe(true);
        mesh.scale.x=1.1;
        expect(isLayeredAvatarGroom(mesh)).toBe(false);
        mesh.scale.x=1;
      }
    }finally{disposeThreeTree(scene);}
  });
  it('uses opaque, restrained specular reflection and the existing dye mechanism',()=>{
    const material=createLayeredGroomMaterial();
    expect(material.vertexColors).toBe(true);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(material.roughness).toBeGreaterThan(.7);
    expect(material.specularIntensity).toBeLessThan(.3);
    expect(material.envMapIntensity).toBeLessThan(.6);
    material.color.set('#b7c1cd');
    expect(material.color.getHexString()).toBe('b7c1cd');
    material.dispose();
  });
});
