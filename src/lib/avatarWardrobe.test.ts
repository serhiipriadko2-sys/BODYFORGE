import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { createAthleteWardrobe, coveredAthleteTriangle, maskAthleteOcclusion } from './avatarOcclusion';
import { applyAthleticPose } from './avatarPose';
import { createAvatarPhysique } from './avatarPhysique';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import { applyAvatarGarmentFit } from './avatarGarmentFit';
import { repairAvatarSleeve } from './avatarSleeveRepair';
import { disposeThreeTree } from './threeResources';
import { paintFittedBody } from './avatarSurfaceFit';
import { parseAvatarLook, readAvatarLook, saveAvatarLook, DEFAULT_AVATAR_LOOK, AVATAR_LOOK_KEY } from './avatarLook';
import type { Muscle } from './game';

async function load(name='bodyforge-athlete-efficient.glb') {
  return (await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/'+name)).buffer,'')).scene;
}
const mesh=(root:THREE.Object3D,name:string)=>root.getObjectByName('BODYFORGE_'+name) as THREE.SkinnedMesh;

describe('independent removable workout shirt',()=>{
  it.each(['bodyforge-athlete-efficient.glb','bodyforge-athlete-detail.glb','bodyforge-athlete-realistic.glb','bodyforge-athlete.glb'])
    ('restores precisely the shirt-covered surface of %s, never shorts',async file=>{
    const root=await load(file);
    try{
      const targets=['Body','SkinNipples'].map(name=>{
        const g=mesh(root,name).geometry,p=g.getAttribute('position'),old=g.index!;
        const always:number[]=[],reveal:number[]=[];
        for(let i=0;i<old.count;i+=3){
          const a=old.getX(i),b=old.getX(i+1),c=old.getX(i+2);
          if(coveredAthleteTriangle(p,a,b,c,false))continue;
          (coveredAthleteTriangle(p,a,b,c)?reveal:always).push(a,b,c);
        }
        return {g,always,reveal,attributes:{...g.attributes}};
      });
      const wardrobe=createAthleteWardrobe(root);
      expect(wardrobe).toBeDefined();
      if(!wardrobe)throw Error('known rig rejected');
      const shirt=mesh(root,'Shirt'),badge=mesh(root,'ChestMark'),shorts=mesh(root,'Shorts'),shoes=mesh(root,'Shoes');
      const stable=targets.map(t=>t.g.index);
      expect(wardrobe.bareTriangles-wardrobe.clothedTriangles).toBeGreaterThan(10000);
      expect(wardrobe.shirtVisible).toBe(false);
      for(let cycle=0;cycle<3;cycle++)for(const visible of [false,true,false]){
        wardrobe.setShirt(visible);
        expect(wardrobe.shirtVisible).toBe(visible);
        expect(shirt.visible).toBe(visible);expect(badge.visible).toBe(visible);
        expect(shorts.visible&&shoes.visible).toBe(true);
        targets.forEach((t,i)=>{
          expect(t.g.index).toBe(stable[i]);
          expect(t.g.drawRange).toEqual({start:0,count:t.always.length+(visible?0:t.reveal.length)});
          for(const [name,attr] of Object.entries(t.attributes))expect(t.g.getAttribute(name)).toBe(attr);
        });
      }
      for(const t of targets)expect(Array.from(t.g.index!.array)).toEqual([...t.always,...t.reveal]);
      expect(createAthleteWardrobe(root)).toBeUndefined();
      expect(maskAthleteOcclusion(root)).toEqual({removedTriangles:0,maskedMeshes:0});
      console.info('WARDROBE_INDEX',file,JSON.stringify({bare:wardrobe.bareTriangles,clothed:wardrobe.clothedTriangles}));
    }finally{disposeThreeTree(root);}
  });
  it('fails closed on a missing garment before mutating skin or shirt visibility',async()=>{
    const root=await load();
    try{
      const body=mesh(root,'Body'),shirt=mesh(root,'Shirt'),shorts=mesh(root,'Shorts');
      const index=body.geometry.index,parent=shorts.parent!;
      shorts.removeFromParent();
      expect(createAthleteWardrobe(root)).toBeUndefined();
      expect(body.geometry.index).toBe(index);expect(shirt.visible).toBe(true);
      parent.add(shorts);
    }finally{disposeThreeTree(root);}
  });
  it('retains the actual skin deformation, garment seams and weights at every purchased group level',async()=>{
    const root=await load();
    try{
      const body=mesh(root,'Body'),shirt=mesh(root,'Shirt'),shorts=mesh(root,'Shorts');
      const w=createAthleteWardrobe(root)!;
      expect(w).toBeDefined();
      applyAthleticPose(root);
      const seams=createAvatarGarmentSeams([shirt,shorts])!;
      expect(seams.loopCount).toBe(7);
      expect(applyAvatarGarmentFit([shirt,shorts])).toBe(4466);
      expect(repairAvatarSleeve([shirt,shorts])).toBe(14);
      const sculpt=createAvatarPhysique(root,true);
      const p=body.geometry.getAttribute('position'),rest=Array.from(p.array),index=body.geometry.index;
      const skinWeights=body.geometry.getAttribute('skinWeight');
      for(const group of ['arms','core','legs','back'] as Muscle[]){
        let prior=0;
        for(let level=1;level<=5;level++){
          const levels={[group]:level};
          sculpt(levels);applyAvatarGrowth(root,levels);seams.update(root);
          const changed=Array.from(p.array);
          let peak=0;
          for(let i=0;i<p.count;i++)peak=Math.max(peak,Math.hypot(p.getX(i)-rest[i*3],p.getY(i)-rest[i*3+1],p.getZ(i)-rest[i*3+2]));
          expect(peak).toBeGreaterThan(prior);prior=peak;
          w.setShirt(true);
          expect(shirt.visible).toBe(true);
          expect(Array.from(p.array)).toEqual(changed);
          w.setShirt(false);
          expect(shirt.visible).toBe(false);
          expect(shorts.visible).toBe(true);
          expect(Array.from(p.array)).toEqual(changed);
          expect(body.geometry.index).toBe(index);
          expect(body.geometry.getAttribute('skinWeight')).toBe(skinWeights);
        }
        sculpt({});applyAvatarGrowth(root,{});seams.update(root);
        expect(Array.from(p.array)).toEqual(rest);
      }
    }finally{disposeThreeTree(root);}
  },30000);
  it('defaults legacy looks to exposed torso and saves a canonical cosmetic flag only',()=>{
    const legacy={version:1 as const,skin:'sand' as const,hair:'ink' as const,trim:'glacier' as const,visor:false};
    expect(DEFAULT_AVATAR_LOOK.shirt).not.toBe(true);
    const initial=JSON.stringify(legacy);
    const entries=new Map([[AVATAR_LOOK_KEY,initial],['bodyforge:pilot:v1','game bytes']]);
    const storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);}};
    expect(readAvatarLook(storage).look).toEqual(legacy);
    expect(entries.get(AVATAR_LOOK_KEY)).toBe(initial);
    // Legacy users can put on a shirt before selecting their first hairstyle.
    const mixed={...legacy,shirt:true,hairStyle:'swept' as const};
    expect(saveAvatarLook(mixed,storage)).toBe(true);
    expect(readAvatarLook(storage).look).toEqual(mixed);
    expect(saveAvatarLook({...mixed,shirt:false},storage)).toBe(true);
    expect(readAvatarLook(storage).look.shirt).toBe(false);
    expect(entries.get('bodyforge:pilot:v1')).toBe('game bytes');
    expect(parseAvatarLook(JSON.stringify({...legacy,shirt:'true'}))).toBeNull();
    expect(saveAvatarLook({...mixed,unexpected:true} as typeof mixed,storage)).toBe(false);
  });
  it('keeps the painted legacy shorts and shoes but exposes the torso',()=>{
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute([0,1.25,.1,0,.88,.1,.12,.09,.2],3));
    const counts=paintFittedBody(g,{skin:'#c59473',trim:'#55e3f2',outfit:'base',shirt:false});
    expect(counts).toMatchObject({shirt:0,skin:1,shorts:1,shoe:1});
    expect(g.getAttribute('color').getX(0)).toBeCloseTo(new THREE.Color('#c59473').r,5);
    g.dispose();
  });
});
