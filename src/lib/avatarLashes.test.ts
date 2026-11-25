import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { applyAvatarFaceForm } from './avatarFace';
import { createAvatarLashes, LASH_INDEX_COUNT, LASH_VERTICES_PER_STRAND } from './avatarLashes';
import { createAvatarIdle, sampleAvatarIdle } from './avatarIdle';
import { applyAthleticPose } from './avatarPose';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarPhysique } from './avatarPhysique';
import { disposeThreeTree } from './threeResources';
import recipe from './avatarLashGuides.json';

describe('surface-fitted eyelash fibres',()=>{
  it('anchors every root to the evaluated face and follows the actual eyelids through blink and growth',async()=>{
    const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(recipe.sourceSha256);
    const {scene:root}=await new GLTFLoader().parseAsync(bytes.buffer,'');
    try{
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      expect(createAvatarLashes(body)).toBeUndefined();
      applyAthleticPose(root);
      expect(applyAvatarFaceForm(root)).toBeDefined();
      const lash=createAvatarLashes(body)!;
      expect(lash).toBeDefined();
      expect(lash.skeleton).toBe(body.skeleton);
      expect(lash.bindMatrix.equals(body.bindMatrix)).toBe(true);
      expect(createAvatarLashes(body)).toBeUndefined();
      expect(lash.geometry.index!.count).toBe(LASH_INDEX_COUNT);
      const p=lash.geometry.getAttribute('position');
      expect(p.count).toBe(156*LASH_VERTICES_PER_STRAND);
      const original=Array.from(p.array);
      const pos=body.geometry.getAttribute('position'),index=body.geometry.index!;
      const faces:number[][]=[];
      for(let i=0;i<index.count;i+=3){
        const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
        if(ids.every(v=>Math.abs(pos.getX(v))<.05&&pos.getY(v)>1.665&&pos.getY(v)<1.684&&pos.getZ(v)>.13))faces.push(ids);
      }
      expect(faces.length).toBeGreaterThan(100);
      const tri=new THREE.Triangle(),target=new THREE.Vector3();
      const closest=recipe.guides.map(guide=>{
        const rootPoint=new THREE.Vector3(...guide.root);
        let best=Infinity, selected:number[]=[];
        for(const ids of faces){
          tri.a.fromBufferAttribute(pos,ids[0]);tri.b.fromBufferAttribute(pos,ids[1]);tri.c.fromBufferAttribute(pos,ids[2]);
          const distance=tri.closestPointToPoint(rootPoint,target).distanceToSquared(rootPoint);
          if(distance<best){best=distance;selected=ids;}
        }
        expect(Math.sqrt(best)).toBeLessThan(.0003);
        return selected;
      });
      const idle=createAvatarIdle(root)!;
      expect(idle).toBeDefined();
      const sculpt=createAvatarPhysique(root);
      const max={arms:5,core:5,legs:5,back:5};
      const centre=(i:number)=>{
        const c=new THREE.Vector3();
        for(let j=0;j<4;j++)c.add(lash.getVertexPosition(i*LASH_VERTICES_PER_STRAND+j,new THREE.Vector3()).applyMatrix4(lash.matrixWorld));
        return c.multiplyScalar(.25);
      };
      let worst=0;
      const roots=()=>{
        root.updateMatrixWorld(true);
        return closest.map((ids,i)=>{
          const c=centre(i);
          body.getVertexPosition(ids[0],tri.a).applyMatrix4(body.matrixWorld);
          body.getVertexPosition(ids[1],tri.b).applyMatrix4(body.matrixWorld);
          body.getVertexPosition(ids[2],tri.c).applyMatrix4(body.matrixWorld);
          const distance=tri.closestPointToPoint(c,target).distanceTo(c);
          worst=Math.max(worst,distance);
          expect(distance).toBeLessThan(.00055);
          return c;
        });
      };
      applyAvatarGrowth(root,{});
      const open=roots();
      idle.pose({...sampleAvatarIdle(0),blink:1,gaze:.7});
      applyAvatarGrowth(root,{});
      const shut=roots();
      expect(shut.filter((v,i)=>recipe.guides[i].upper&&v.y<open[i].y-.001).length).toBeGreaterThan(80);
      expect(shut.filter((v,i)=>!recipe.guides[i].upper&&v.y>open[i].y+.00025).length).toBeGreaterThan(40);
      sculpt(max);
      for(const blink of [0,.25,.5,.75,1]){
        idle.pose({...sampleAvatarIdle(2),blink});
        applyAvatarGrowth(root,max,1);
        roots();
      }
      idle.reset();sculpt({});applyAvatarGrowth(root,{});
      roots().forEach((v,i)=>expect(v.distanceTo(open[i])).toBeLessThan(1e-7));
      expect(Array.from(p.array)).toEqual(original);
      console.info('LASH_FIT',JSON.stringify({strands:recipe.guides.length,triangles:LASH_INDEX_COUNT/3,maxRootGapMm:worst*1000}));
    } finally {disposeThreeTree(root);}
  },20000);
});
