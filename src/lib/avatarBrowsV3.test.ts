import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { installAvatarBrows, DIRECTIONAL_BROW_INDEX_COUNT } from './avatarBrows';
import { applyAvatarFaceForm } from './avatarFace';
import { createAvatarPhysique } from './avatarPhysique';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarIdle, sampleAvatarIdle } from './avatarIdle';
import { disposeThreeTree } from './threeResources';

const asset = 'bodyforge-brows-v3.glb';
async function load(name: string) {
  return (await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/'+name)).buffer,'')).scene;
}

describe('directional close-fitted brow donor',()=>{
  it('preserves rig, tint, and close attachment across growth and blink samples',async()=>{
    const bytes=readFileSync('public/assets/'+asset);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('57ebb9ddeab1b5cfd43c9efc89348a931e3aef64fd7c2af663c4baf58316b98e');
    expect(bytes.length).toBeLessThan(300000);
    const root=await load('bodyforge-athlete-efficient.glb'), donor=await load(asset);
    try{
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const brows=root.getObjectByName('BODYFORGE_Brows') as THREE.SkinnedMesh;
      const old=brows.geometry,bind=brows.bindMatrix.clone(),skeleton=brows.skeleton;
      expect(installAvatarBrows(body,brows,donor)).toBe(false);
      expect(brows.geometry).toBe(old);
      applyAthleticPose(root);
      expect(applyAvatarFaceForm(root)).toBeDefined();
      const sculpt=createAvatarPhysique(root);
      const tint=new THREE.Color('#b7c1cd');
      (brows.material as THREE.MeshStandardMaterial).color.copy(tint);
      expect(installAvatarBrows(body,brows,donor)).toBe(true);
      expect(donor.children).toHaveLength(0);
      expect(brows.geometry.index!.count).toBe(DIRECTIONAL_BROW_INDEX_COUNT);
      expect(brows.geometry.userData.BODYFORGE_brow_revision).toBe('directional-v3');
      expect(brows.bindMatrix.equals(bind)).toBe(true);
      expect(brows.skeleton).toBe(skeleton);
      expect((brows.material as THREE.MeshStandardMaterial).color.equals(tint)).toBe(true);
      const p=brows.geometry.getAttribute('position'),n=brows.geometry.getAttribute('normal');
      const j=brows.geometry.getAttribute('skinIndex'),w=brows.geometry.getAttribute('skinWeight');
      const head=skeleton.bones.findIndex(bone=>bone.name==='head');
      for(let i=0;i<p.count;i++){
        expect(j.getX(i)).toBe(head);
        expect(w.getX(i)).toBe(1);
        expect(w.getY(i)+w.getZ(i)+w.getW(i)).toBe(0);
        expect(new THREE.Vector3().fromBufferAttribute(n,i).length()).toBeCloseTo(1,4);
      }
      const rest=Array.from(p.array),skin=body.geometry.getAttribute('position'),index=body.geometry.index!;
      const faces:number[][]=[];
      for(let i=0;i<index.count;i+=3){
        const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
        if(ids.every(v=>Math.abs(skin.getX(v))<.065&&skin.getY(v)>1.683&&skin.getY(v)<1.705&&skin.getZ(v)>.12))faces.push(ids);
      }
      expect(faces.length).toBeGreaterThan(100);
      const tri=new THREE.Triangle(),target=new THREE.Vector3(),point=new THREE.Vector3();
      const samples:{i:number;ids:number[]}[]=[];
      for(let i=0;i<p.count;i+=67){
        point.fromBufferAttribute(p,i);
        let best=Infinity,selected:number[]=[];
        for(const ids of faces){
          tri.a.fromBufferAttribute(skin,ids[0]);tri.b.fromBufferAttribute(skin,ids[1]);tri.c.fromBufferAttribute(skin,ids[2]);
          const distance=tri.closestPointToPoint(point,target).distanceToSquared(point);
          if(distance<best){best=distance;selected=ids;}
        }
        expect(Math.sqrt(best)).toBeLessThan(.0004);
        samples.push({i,ids:selected});
      }
      const idle=createAvatarIdle(root)!;
      let maxGap=0;
      for(const muscles of [{},{arms:5,core:5,legs:5,back:5}]){
        sculpt(muscles);
        for(const blink of [0,.25,.5,.75,1]){
          idle.pose({...sampleAvatarIdle(2),blink});
          applyAvatarGrowth(root,muscles,1);
          root.updateMatrixWorld(true);
          for(const {i,ids} of samples){
            brows.getVertexPosition(i,point).applyMatrix4(brows.matrixWorld);
            body.getVertexPosition(ids[0],tri.a).applyMatrix4(body.matrixWorld);
            body.getVertexPosition(ids[1],tri.b).applyMatrix4(body.matrixWorld);
            body.getVertexPosition(ids[2],tri.c).applyMatrix4(body.matrixWorld);
            maxGap=Math.max(maxGap,tri.closestPointToPoint(point,target).distanceTo(point));
          }
        }
      }
      console.info('BROW_V3_POSED_GAP',JSON.stringify({samples:samples.length,poses:10,maxMm:maxGap*1000}));
      expect(maxGap).toBeLessThan(.0008);
      expect(Array.from(p.array)).toEqual(rest);
    }finally{disposeThreeTree(root);disposeThreeTree(donor);}
  },20000);
  it('rejects an incompatible directional donor before mutating the original brow, then accepts the v2 reserve',async()=>{
    const root=await load('bodyforge-athlete-efficient.glb'),bad=await load(asset),reserve=await load('bodyforge-brows-v2.glb');
    try{
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const brows=root.getObjectByName('BODYFORGE_Brows') as THREE.SkinnedMesh;
      applyAvatarFaceForm(root);
      const old=brows.geometry,material=brows.material;
      (bad.children[0] as THREE.Mesh).geometry.getAttribute('position').setY(0,1.9);
      expect(installAvatarBrows(body,brows,bad)).toBe(false);
      expect(brows.geometry).toBe(old);
      expect(brows.material).toBe(material);
      expect(installAvatarBrows(body,brows,reserve)).toBe(true);
      expect(brows.geometry.userData.BODYFORGE_brow_revision).toBe('fitted-v2');
    }finally{disposeThreeTree(root);disposeThreeTree(bad);disposeThreeTree(reserve);}
  });
});
