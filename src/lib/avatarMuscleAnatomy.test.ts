import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { MUSCLE_LOBES, addMuscleLobe, type MuscleLobe } from './avatarMuscleAnatomy';
import { disposeThreeTree } from './threeResources';

const lobes = Object.values(MUSCLE_LOBES).flat();
const evaluate = (zones: readonly MuscleLobe[], x: number, y: number, z: number, weight = 1) => {
  const displacement = new Float64Array(3);
  const jacobian = new Float64Array([1,0,0,0,1,0,0,0,1]);
  for (const zone of zones) addMuscleLobe(zone, weight, x,y,z,displacement,jacobian);
  return { displacement, jacobian };
};

describe('fitted muscle envelopes', () => {
  it('has 23 named mirrored envelopes, smooth support, and exact analytic derivatives', () => {
    expect(lobes).toHaveLength(23);
    expect(new Set(lobes.map(l => l.name)).size).toBe(23);
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
