import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { installAvatarBrows } from './avatarBrows';
import { applyAvatarFaceForm } from './avatarFace';
import { createAvatarPhysique } from './avatarPhysique';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { disposeThreeTree } from './threeResources';

async function load(name:string) {
  return (await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/'+name)).buffer,'')).scene;
}

describe('Blender fitted eyebrow strands',()=>{
  it('adopts the exact donor on the original head bone and preserves tint, bind, growth and ownership',async()=>{
    const root=await load('bodyforge-athlete-efficient.glb'), donor=await load('bodyforge-brows-v2.glb');
    try {
      expect(createHash('sha256').update(readFileSync('public/assets/bodyforge-brows-v2.glb')).digest('hex')).toBe('dde831c44d835a7c6e078cba6d1654f0f4cd8b9833581985ca87c88ac9302bad');
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const brows=root.getObjectByName('BODYFORGE_Brows') as THREE.SkinnedMesh;
      const skeleton=brows.skeleton,bind=brows.bindMatrix.clone(), old=brows.geometry;
      expect(installAvatarBrows(body,brows,donor)).toBe(false);
      expect(brows.geometry).toBe(old);
      applyAthleticPose(root);
      expect(applyAvatarFaceForm(root)).toBeDefined();
      const tint=new THREE.Color('#543b34');
      (brows.material as THREE.MeshStandardMaterial).color.copy(tint);
      const sculpt=createAvatarPhysique(root);
      expect(installAvatarBrows(body,brows,donor)).toBe(true);
      expect(donor.children).toHaveLength(0);
      expect(brows.skeleton).toBe(skeleton);
      expect(brows.bindMatrix.equals(bind)).toBe(true);
      expect((brows.material as THREE.MeshStandardMaterial).color.equals(tint)).toBe(true);
      expect(brows.geometry.index!.count).toBe(7560);
      const p=brows.geometry.getAttribute('position'), w=brows.geometry.getAttribute('skinWeight'),j=brows.geometry.getAttribute('skinIndex');
      const head=skeleton.bones.findIndex(bone=>bone.name==='head');
      for(let i=0;i<p.count;i++){
        if(j.getX(i)!==head || w.getX(i)!==1 || w.getY(i)!==0 || w.getZ(i)!==0 || w.getW(i)!==0)throw Error('invalid brow skinning at '+i);
      }
      const rest=Array.from(p.array);
      sculpt({arms:5,core:5,legs:5,back:5});
      applyAvatarGrowth(root,{arms:5,core:5,legs:5,back:5});
      expect(Array.from(brows.geometry.getAttribute('position').array)).toEqual(rest);
      expect(installAvatarBrows(body,brows,donor)).toBe(false);
    } finally {disposeThreeTree(root);disposeThreeTree(donor);}
  });
  it('retains the original brow geometry if the donor does not match its bounded fit',async()=>{
    const root=await load('bodyforge-athlete-efficient.glb'),donor=await load('bodyforge-brows-v2.glb');
    try {
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const brows=root.getObjectByName('BODYFORGE_Brows') as THREE.SkinnedMesh;
      applyAvatarFaceForm(root);
      const old=brows.geometry,material=brows.material;
      (donor.children[0] as THREE.Mesh).geometry.getAttribute('position').setY(0,1.8);
      expect(installAvatarBrows(body,brows,donor)).toBe(false);
      expect(brows.geometry).toBe(old);
      expect(brows.material).toBe(material);
      expect(donor.children).toHaveLength(1);
    } finally {disposeThreeTree(root);disposeThreeTree(donor);}
  });
});
