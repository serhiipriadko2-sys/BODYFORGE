import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { MUSCLE_LOBES, addMuscleLobe, type MuscleLobe } from './avatarMuscleAnatomy';
import { disposeThreeTree } from './threeResources';
import { createAvatarGarmentSeams } from './avatarGarmentSeams';
import { applyAvatarGarmentFit } from './avatarGarmentFit';
import { repairAvatarSleeve } from './avatarSleeveRepair';
import { createAvatarPhysique } from './avatarPhysique';

const lobes = Object.values(MUSCLE_LOBES).flat();
const evaluate = (zones: readonly MuscleLobe[], x: number, y: number, z: number, weight = 1) => {
  const displacement = new Float64Array(3);
  const jacobian = new Float64Array([1,0,0,0,1,0,0,0,1]);
  for (const zone of zones) addMuscleLobe(zone, weight, x,y,z,displacement,jacobian);
  return { displacement, jacobian };
};

describe('fitted muscle envelopes', () => {
  it('has 28 named mirrored envelopes, smooth support, and exact analytic derivatives', () => {
    expect(lobes).toHaveLength(28);
    expect(new Set(lobes.map(l => l.name)).size).toBe(28);
    const h = 1e-6;
    for (const zone of lobes) {
      const [x,y,z] = zone.center, [rx,ry,rz] = zone.radius;
      // Disjoint mirrored supports prevent a cusp at the sagittal plane.
      expect(x-Math.hypot(rx,(zone.slope?.[0]??0)*ry)).toBeGreaterThan(0);
      const p = [x+rx*.22,y+ry*.17,z-rz*.18] as const;
      const a = evaluate([zone],...p);
      const b = evaluate([zone],-p[0],p[1],p[2]);
      expect(a.displacement[0]).toBeCloseTo(-b.displacement[0],10);
      expect(a.displacement[1]).toBeCloseTo(b.displacement[1],10);
      expect(a.displacement[2]).toBeCloseTo(b.displacement[2],10);
      for (let column=0;column<3;column++) {
        const plus=[...p] as [number,number,number],minus=[...p] as [number,number,number];
        plus[column]+=h;minus[column]-=h;
        const u=evaluate([zone],...plus).displacement,v=evaluate([zone],...minus).displacement;
        for (let row=0;row<3;row++) {
          expect((u[row]-v[row])/(2*h)+(row===column?1:0)).toBeCloseTo(a.jacobian[row*3+column],6);
        }
      }
      expect(Array.from(evaluate([zone],x,y+ry*2,z).displacement)).toEqual([0,0,0]);
    }
  });

  it('grows the chest progressively on the real skin, shirt and peripheral chest emblem',async()=>{
    const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
    try{
      for(const name of ['BODYFORGE_Body','BODYFORGE_Shirt','BODYFORGE_ChestMark']){
        const mesh=scene.getObjectByName(name) as THREE.SkinnedMesh;
        const p=mesh.geometry.getAttribute('position');
        const points=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)] as const)
          .filter(([x,y,z])=>Math.abs(x)>.05&&Math.abs(x)<.19&&y>1.30&&y<1.40&&z>.10);
        expect(points.length,name).toBeGreaterThan(2);
        let prior=0;
        for(let level=1;level<=5;level++){
          const peak=Math.max(...points.map(([x,y,z])=>evaluate(MUSCLE_LOBES.core,x,y,z,level/5).displacement[2]));
          expect(peak,name).toBeGreaterThan(prior+.0001);
          prior=peak;
        }
        // The emblem is near the clavicle, not at the muscle belly.
        expect(prior,name).toBeGreaterThan(name==='BODYFORGE_ChestMark'?.005:.015);
        console.info('CHEST_GROWTH',JSON.stringify({name,samples:points.length,peakMm:prior*1000}));
      }
    }finally{disposeThreeTree(scene);}
  });
  it('keeps the chest emblem close to the fitted shirt at all six torso levels',async()=>{
    const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
    try{
      const shirt=scene.getObjectByName('BODYFORGE_Shirt') as THREE.SkinnedMesh;
      const shorts=scene.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh;
      const mark=scene.getObjectByName('BODYFORGE_ChestMark') as THREE.SkinnedMesh;
      const garments=[shirt,shorts];
      expect(createAvatarGarmentSeams(garments)?.loopCount).toBe(7);
      expect(applyAvatarGarmentFit(garments)).toBe(4466);
      expect(repairAvatarSleeve(garments)).toBe(14);
      const sculpt=createAvatarPhysique(scene,true);
      const cloth=shirt.geometry.getAttribute('position'), index=shirt.geometry.index!;
      const logo=mark.geometry.getAttribute('position');
      const a=new THREE.Vector3(), b=new THREE.Vector3(), c=new THREE.Vector3();
      const p=new THREE.Vector3(), hit=new THREE.Vector3(), ray=new THREE.Ray();
      let minGap=Infinity,maxGap=-Infinity;
      for(let level=0;level<=5;level++){
        sculpt({core:level,arms:5,back:5,legs:5});
        for(let i=0;i<logo.count;i++){
          p.fromBufferAttribute(logo,i);
          ray.origin.copy(p).add(new THREE.Vector3(0,0,.03));
          ray.direction.set(0,0,-1);
          let front=-Infinity;
          for(let j=0;j<index.count;j+=3){
            a.fromBufferAttribute(cloth,index.getX(j));
            b.fromBufferAttribute(cloth,index.getX(j+1));
            c.fromBufferAttribute(cloth,index.getX(j+2));
            if(ray.intersectTriangle(a,b,c,false,hit))front=Math.max(front,hit.z);
          }
          expect(Number.isFinite(front)).toBe(true);
          minGap=Math.min(minGap,p.z-front);maxGap=Math.max(maxGap,p.z-front);
        }
      }
      console.info('CHEST_MARK_CLEARANCE',JSON.stringify({minMm:minGap*1000,maxMm:maxGap*1000}));
      // Signed forward clearance on the authored emblem vertices only.
      expect(minGap).toBeGreaterThan(-.0005);
      expect(maxGap).toBeLessThan(.008);
    }finally{disposeThreeTree(scene);}
  });
  it('each lobe reaches the real athlete and combined growth preserves local orientation',async()=>{
    const bytes=Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb'));
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer,'');
    try {
      const body=scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const pos=body.geometry.getAttribute('position');
      const matrix=new THREE.Matrix3();
      const hits=new Map(lobes.map(l=>[l.name,0]));
      const displacement=new Float64Array(3),j=new Float64Array(9);
      let minDet=Infinity,maxDisplacement=0;
      for(const group of [lobes,...Object.values(MUSCLE_LOBES)]) {
        for(let i=0;i<pos.count;i++){
          const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
          displacement.fill(0);j.fill(0);j[0]=j[4]=j[8]=1;
          for(const zone of group){
            const a=displacement[0],b=displacement[1],c=displacement[2];
            addMuscleLobe(zone,1,x,y,z,displacement,j);
            if(group===lobes && Math.hypot(displacement[0]-a,displacement[1]-b,displacement[2]-c)>.0005) {
              hits.set(zone.name,hits.get(zone.name)!+1);
            }
          }
          minDet=Math.min(minDet,matrix.set(j[0],j[1],j[2],j[3],j[4],j[5],j[6],j[7],j[8]).determinant());
          maxDisplacement=Math.max(maxDisplacement,Math.hypot(...displacement));
        }
      }
      for(const [name,count] of hits)expect(count,name).toBeGreaterThan(4);
      expect(minDet).toBeGreaterThan(.35);
      expect(maxDisplacement).toBeLessThan(.04);
      console.info('ANATOMY_FIELD',JSON.stringify({vertices:pos.count,minDet,maxDisplacement,lobeCoverage:Object.fromEntries(hits)}));
    } finally {disposeThreeTree(scene);}
  },20000);
});
