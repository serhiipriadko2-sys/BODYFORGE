import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describe,it,expect} from 'vitest';
import {addAvatarScanTorsoRelief} from './avatarScanTorsoRelief';
import {SCAN_TORSO_REVIEW_DATA as data} from './avatarScanTorsoReviewData';
import {createAvatarPhysique} from './avatarPhysique';
import {MUSCLE_LOBES,addMuscleLobe} from './avatarMuscleAnatomy';
import {disposeThreeTree} from './threeResources';
import type {Muscle} from './game';

const groups:Muscle[]=['arms','core','legs','back'];
const evaluate=(x:number,y:number,z:number,core=1,back=1)=>{
  const d=new Float64Array(3),j=new Float64Array([1,0,0,0,1,0,0,0,1]);
  addAvatarScanTorsoRelief(data,x,y,z,core,back,d,j);
  return {d,j};
};
describe('scan-informed local torso relief',()=>{
  it('uses symmetric, bounded, zero-padded scan residual samples',()=>{
    expect(data.width).toBe(41);expect(data.height).toBe(47);
    for(const a of [data.front,data.back]){
      expect(a.length).toBe(data.width*data.height);
      expect(a.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=12000)).toBe(true);
      expect(a.filter(n=>n!==0).length).toBeGreaterThan(500);
      for(let y=0;y<data.height;y++)for(let x=0;x<data.width;x++){
        expect(a[y*data.width+x]).toBe(a[y*data.width+data.width-1-x]);
        if(x<3||x>=data.width-3||y<3||y>=data.height-3)expect(a[y*data.width+x]).toBe(0);
      }
    }
  });
  it('matches finite differences of the analytic normal transform and has disjoint front/back gates',()=>{
    let active=0,maxError=0;
    for(let y=1.045;y<1.446;y+=.017)for(let x=-.174;x<.175;x+=.023)for(const z of [-.08,-.025,.0,.015,.048,.12]){
      const p:[number,number,number]=[x,y,z],a=evaluate(...p);
      if(Math.abs(a.d[2])>1e-5)active++;
      for(let k=0;k<3;k++){
        const u=[...p] as typeof p,v=[...p] as typeof p;u[k]+=1e-6;v[k]-=1e-6;
        const n=(evaluate(...u).d[2]-evaluate(...v).d[2])/2e-6;
        maxError=Math.max(maxError,Math.abs(n+(k===2?1:0)-a.j[6+k]));
      }
      if(z>=.025)expect(evaluate(x,y,z,1,0).d[2]).toBe(evaluate(x,y,z,1,1).d[2]);
      if(z<=.005)expect(evaluate(x,y,z,0,1).d[2]).toBe(evaluate(x,y,z,1,1).d[2]);
    }
    expect(active).toBeGreaterThan(300);expect(maxError).toBeLessThan(.0001);
    for(const p of [[0,1.65,.12],[.30,1.32,.09],[.05,.9,.12],[0,1.23,.015]] as const)
      expect([...evaluate(p[0],p[1],p[2]).d]).toEqual([0,0,0]);
    console.info('SCAN_TORSO_DERIVATIVES',JSON.stringify({active,maxError}));
  });
  it('checks the actual athlete mesh, combined field orientation, independent paid levels and exact reset',async()=>{
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb')).buffer,'');
    try{
      const body=scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const p=body.geometry.getAttribute('position'),rest=Array.from(p.array);
      const index=body.geometry.index,uv=body.geometry.getAttribute('uv'),skin=body.geometry.getAttribute('skinWeight');
      const m=new THREE.Matrix3();let minDet=Infinity,peak=0,affected=0,maxCombined=0;
      const lobes=Object.values(MUSCLE_LOBES).flat();
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),{d,j}=evaluate(x,y,z);
        const delta=Math.hypot(...d);
        if(delta>.0001)affected++;
        peak=Math.max(peak,delta);
        for(const lobe of lobes)addMuscleLobe(lobe,1,x,y,z,d,j);
        minDet=Math.min(minDet,m.set(j[0],j[1],j[2],j[3],j[4],j[5],j[6],j[7],j[8]).determinant());
        maxCombined=Math.max(maxCombined,Math.hypot(...d));
      }
      console.info('SCAN_TORSO_REAL_MESH',JSON.stringify({vertices:p.count,affected,peakMm:peak*1000,minDet,maxCombinedMm:maxCombined*1000}));
      expect(affected).toBeGreaterThan(2000);expect(peak).toBeGreaterThan(.004);expect(peak).toBeLessThanOrEqual(.012001);
      expect(minDet).toBeGreaterThan(.25);expect(maxCombined).toBeLessThan(.05);
      const sculpt=createAvatarPhysique(scene,false,false,data);
      sculpt({});
      expect(scene.userData.BODYFORGE_scanTorsoRelief).toBe(data.id);
      const moved=body.geometry.getAttribute('position'),baseline=Array.from(moved.array);
      expect(baseline).not.toEqual(rest);
      for(let i=0;i<p.count;i++)if(p.getY(i)>1.48||p.getY(i)<1.02||Math.abs(p.getX(i))>.20)
        expect(baseline.slice(i*3,i*3+3)).toEqual(rest.slice(i*3,i*3+3));
      for(const group of groups){
        let previous=0;
        for(let level=1;level<=5;level++){
          sculpt({[group]:level});let distance=0;
          for(let i=0;i<p.count;i++)distance=Math.max(distance,Math.hypot(moved.getX(i)-baseline[i*3],moved.getY(i)-baseline[i*3+1],moved.getZ(i)-baseline[i*3+2]));
          expect(distance).toBeGreaterThan(previous);previous=distance;
        }
        sculpt({});expect(Array.from(moved.array)).toEqual(baseline);
      }
      expect(body.geometry.index).toBe(index);expect(body.geometry.getAttribute('uv')).toBe(uv);expect(body.geometry.getAttribute('skinWeight')).toBe(skin);
      const normals=body.geometry.getAttribute('normal');
      expect(Array.from(normals.array).every(Number.isFinite)).toBe(true);
    }finally{disposeThreeTree(scene);}
  },30000);
});
