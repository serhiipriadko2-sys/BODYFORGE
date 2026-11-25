import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {addTorsoLandmarks,TORSO_LANDMARKS} from './avatarTorsoLandmarks';
import {createAvatarPhysique} from './avatarPhysique';
import {disposeThreeTree} from './threeResources';
import {MUSCLE_LOBES,addMuscleLobe} from './avatarMuscleAnatomy';
import type {Muscle} from './game';

function field(x:number,y:number,z:number){
  const d=new Float64Array(3),j=new Float64Array([1,0,0,0,1,0,0,0,1]);
  addTorsoLandmarks(x,y,z,d,j);return {d,j};
}
describe('structural torso anatomy review',()=>{
  it('has symmetric signed geometry and an analytic Jacobian',()=>{
    for(const region of TORSO_LANDMARKS){
      const [x,y,z]=region.center,p:[number,number,number]=[x+.003,y+.006,z+.003];
      const a=field(...p),b=field(-p[0],p[1],p[2]);
      expect(a.d[2]).toBeCloseTo(b.d[2],10);
      for(let axis=0;axis<3;axis++){
        const u=[...p] as typeof p,v=[...p] as typeof p;u[axis]+=1e-6;v[axis]-=1e-6;
        const num=(field(...u).d[2]-field(...v).d[2])/2e-6;
        expect(num+(axis===2?1:0)).toBeCloseTo(a.j[6+axis],5);
      }
    }
    for(const p of [[0,1.65,.13],[.32,1.32,.08],[.1,.8,.1]] as const)
      expect([...field(p[0],p[1],p[2]).d]).toEqual([0,0,0]);
  });
  it('checks the actual pinned mesh, combined growth orientation and reversible four-group progression',async()=>{
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb')).buffer,'');
    try{
      const body=scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const p=body.geometry.getAttribute('position'),rest=Array.from(p.array);
      const index=body.geometry.index,uv=body.geometry.getAttribute('uv'),weights=body.geometry.getAttribute('skinWeight');
      const m=new THREE.Matrix3();let minDet=Infinity,affected=0,peak=0;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),{d,j}=field(x,y,z);
        const delta=Math.hypot(...d);if(delta>.0005)affected++;
        peak=Math.max(peak,delta);
        for(const lobe of Object.values(MUSCLE_LOBES).flat())addMuscleLobe(lobe,1,x,y,z,d,j);
        minDet=Math.min(minDet,m.set(j[0],j[1],j[2],j[3],j[4],j[5],j[6],j[7],j[8]).determinant());
      }
      console.info('TORSO_LANDMARKS',JSON.stringify({vertices:p.count,affected,peakMm:peak*1000,minCombinedDet:minDet}));
      expect(affected).toBeGreaterThan(200);expect(peak).toBeGreaterThan(.003);expect(peak).toBeLessThan(.015);expect(minDet).toBeGreaterThan(.25);
      const sculpt=createAvatarPhysique(scene,false,true);
      sculpt({});
      const moved=body.geometry.getAttribute('position'),baseline=Array.from(moved.array);
      expect(baseline).not.toEqual(rest);
      for(let i=0;i<p.count;i++)if(p.getY(i)>1.51||p.getY(i)<1.20)
        expect(baseline.slice(i*3,i*3+3)).toEqual(rest.slice(i*3,i*3+3));
      for(const group of ['arms','core','legs','back'] as Muscle[]){
        let prior=0;
        for(let level=1;level<=5;level++){
          sculpt({[group]:level});let max=0;
          for(let i=0;i<p.count;i++)max=Math.max(max,Math.hypot(moved.getX(i)-baseline[i*3],moved.getY(i)-baseline[i*3+1],moved.getZ(i)-baseline[i*3+2]));
          expect(max).toBeGreaterThan(prior);prior=max;
        }
        sculpt({});expect(Array.from(moved.array)).toEqual(baseline);
      }
      expect(body.geometry.index).toBe(index);expect(body.geometry.getAttribute('uv')).toBe(uv);expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
    }finally{disposeThreeTree(scene);}
  },30000);
});
