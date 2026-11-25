import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { applyAvatarFaceForm } from './avatarFace';
import { applyAvatarFaceContour } from './avatarFaceContour';
import { applyAthleticPose } from './avatarPose';
import { createAvatarPhysique } from './avatarPhysique';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarLashes } from './avatarLashes';
import { installAvatarBrows } from './avatarBrows';
import { createAvatarIdle, sampleAvatarIdle } from './avatarIdle';
import { disposeThreeTree } from './threeResources';

async function load(name:string) {
  return (await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/'+name)).buffer,'')).scene;
}

describe('bounded lower facial contour on the packed athlete',()=>{
  it('changes real cheek, chin and nasal geometry without changing protected seams or attributes',async()=>{
    const root=await load('bodyforge-athlete-efficient.glb');
    try{
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      expect(applyAvatarFaceContour(root)).toBe(0);
      expect(applyAvatarFaceForm(root)).toBeDefined();
      const g=body.geometry, p=g.getAttribute('position'),n=g.getAttribute('normal');
      const index=g.index!, uv=g.getAttribute('uv'), weights=g.getAttribute('skinWeight');
      const fixed=['Lips','Eyes','SkinEars','Brows','Shirt','Hair_crop'].map(name=>{
        const mesh=root.getObjectByName('BODYFORGE_'+name) as THREE.SkinnedMesh;
        return [mesh,mesh.geometry.getAttribute('position')] as const;
      });
      const changed=applyAvatarFaceContour(root);
      expect(changed).toBeGreaterThan(1000);
      expect(changed).toBeLessThan(1800);
      const q=g.getAttribute('position'),normals=g.getAttribute('normal');
      expect(g.getAttribute('uv')).toBe(uv);
      expect(g.getAttribute('skinWeight')).toBe(weights);
      expect(g.index).toBe(index);
      for(const [mesh,position] of fixed)expect(mesh.geometry.getAttribute('position')).toBe(position);
      let peak=0, count=0, protectedCount=0, maxCheek=0, maxJaw=0, maxChin=0, maxNose=0;
      const displacements=new Float64Array(p.count);
      const split=new Map<string,string>();
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        const dx=q.getX(i)-x,dy=q.getY(i)-y,dz=q.getZ(i)-z;
        const distance=Math.hypot(dx,dy,dz);
        displacements[i]=distance;
        peak=Math.max(peak,distance);
        if(distance>.00005)count++;
        if(y>=1.658||y<=1.554||z<=.080||(Math.abs(x)<=.031&&y>=1.586&&y<=1.616)){
          protectedCount++;
          if(distance!==0||normals.getX(i)!==n.getX(i)||normals.getY(i)!==n.getY(i)||normals.getZ(i)!==n.getZ(i))throw Error('protected vertex changed: '+i);
        }
        if(distance===0)continue;
        expect(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))).toBeCloseTo(1,5);
        const key=[x,y,z].join(','),v=[q.getX(i),q.getY(i),q.getZ(i)].join(',');
        if(split.has(key))expect(v).toBe(split.get(key));
        split.set(key,v);
        if(Math.abs(x)>.037&&y>1.625&&y<1.65)maxCheek=Math.max(maxCheek,dz);
        if(Math.abs(x)>.04&&y<1.595)maxJaw=Math.max(maxJaw,Math.abs(x+dx)-Math.abs(x));
        if(Math.abs(x)<.02&&y<1.585)maxChin=Math.max(maxChin,dz);
        if(Math.abs(x)<.015&&y>1.635&&y<1.653)maxNose=Math.max(maxNose,-dz);
      }
      expect(Math.abs(count-changed)).toBeLessThan(3);
      expect(peak).toBeGreaterThan(.002);
      expect(peak).toBeLessThan(.003);
      expect(maxCheek).toBeGreaterThan(.001);
      expect(maxJaw).toBeGreaterThan(.001);
      expect(maxChin).toBeGreaterThan(.002);
      expect(maxNose).toBeGreaterThan(.001);
      const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),before=new THREE.Vector3(),after=new THREE.Vector3();
      let minOrientation=Infinity,affectedTriangles=0;
      const cross=(attr:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,ids:number[],out:THREE.Vector3)=>{
        a.fromBufferAttribute(attr,ids[0]);b.fromBufferAttribute(attr,ids[1]);c.fromBufferAttribute(attr,ids[2]);
        out.crossVectors(b.sub(a),c.sub(a));
      };
      for(let i=0;i<index.count;i+=3){
        const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
        if(ids.every(id=>displacements[id]===0))continue;
        cross(p,ids,before);cross(q,ids,after);
        if(before.length()<1e-10)continue;
        const ratio=before.dot(after)/before.lengthSq();
        minOrientation=Math.min(minOrientation,ratio);affectedTriangles++;
      }
      expect(minOrientation).toBeGreaterThan(.7);
      expect(applyAvatarFaceContour(root)).toBe(0);
      expect(g.getAttribute('position')).toBe(q);
      console.info('FACE_CONTOUR_RUNTIME',JSON.stringify({changed,count,protectedCount,affectedTriangles,minOrientation,peakMm:peak*1000,cheekMm:maxCheek*1000,jawMm:maxJaw*1000,chinMm:maxChin*1000,noseMm:maxNose*1000}));
    }finally{disposeThreeTree(root);}
  });
  it('keeps the revised face and compatible lashes and brows through all four growth groups and blink',async()=>{
    const root=await load('bodyforge-athlete-efficient.glb'),donor=await load('bodyforge-brows-v3.glb');
    try{
      applyAthleticPose(root);
      expect(applyAvatarFaceForm(root)).toBeDefined();
      expect(applyAvatarFaceContour(root)).toBeGreaterThan(1000);
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const brow=root.getObjectByName('BODYFORGE_Brows') as THREE.SkinnedMesh;
      const lashes=createAvatarLashes(body);
      expect(lashes).toBeDefined();
      const rest=body.geometry.getAttribute('position'),norm=body.geometry.getAttribute('normal');
      const ids=Array.from({length:rest.count},(_,i)=>i).filter(i=>rest.getY(i)>1.54);
      const sculpt=createAvatarPhysique(root);
      expect(installAvatarBrows(body,brow,donor)).toBe(true);
      const idle=createAvatarIdle(root)!;
      for(const muscles of [{arms:5},{core:5},{legs:5},{back:5},{arms:5,core:5,legs:5,back:5},{}]){
        sculpt(muscles);
        idle.pose({...sampleAvatarIdle(1.5),blink:1});
        applyAvatarGrowth(root,muscles,1);
        const p=body.geometry.getAttribute('position'),n=body.geometry.getAttribute('normal');
        for(const i of ids)if(p.getX(i)!==rest.getX(i)||p.getY(i)!==rest.getY(i)||p.getZ(i)!==rest.getZ(i)||n.getX(i)!==norm.getX(i)||n.getY(i)!==norm.getY(i)||n.getZ(i)!==norm.getZ(i))throw Error('training changed facial rest shape at '+i);
      }
      expect(brow.geometry.userData.BODYFORGE_brow_revision).toBe('directional-v3');
      expect(body.geometry.userData.facialContour).toBe('lower-face-contour-v3');
    }finally{disposeThreeTree(root);disposeThreeTree(donor);}
  });
});
