import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFoundationIdle, headWeightBlend, regularizeFoundationHead, tuneFoundationMaterials } from './regionalFoundationIdle';
import { sampleAvatarIdle } from './avatarIdle';

const names=['pelvis','spine','chest','clavicle_L','upperarm_L','forearm_L','hand_L','clavicle_R','upperarm_R','forearm_R','hand_R','neck','head','thigh_L','shin_L','foot_L','thigh_R','shin_R','foot_R'];
function fixture() {
  const root=new THREE.Group(), bones=names.map(name=>{const b=new THREE.Bone();b.name=name;root.add(b);return b;});
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([0,1.4,0,0,1.4525,0,0,1.50,0],3));
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([11,12,2,0,11,12,2,0,11,12,2,0],4));
  geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute([.25,.65,.1,0,.25,.65,.1,0,.25,.65,.1,0],4));
  const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshPhysicalMaterial());
  root.add(mesh); root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));
  return {root,mesh,bones,geo};
}
describe('regional V7 review rig',()=>{
  it('uses a bounded smooth head/neck transition',()=>{
    expect(headWeightBlend(1.425)).toBe(0);
    expect(headWeightBlend(1.48)).toBe(1);
    expect(headWeightBlend(1.4525)).toBeCloseTo(.5,8);
    expect(()=>headWeightBlend(NaN)).toThrow();
    let last=0;
    for(let i=0;i<100;i++){const b=headWeightBlend(1.4+i*.001);expect(b).toBeGreaterThanOrEqual(last-1e-12);last=b;}
  });
  it('keeps lower skinning and positions unchanged and binds the face rigidly',()=>{
    const {mesh,geo}=fixture();
    const p=Array.from(geo.getAttribute('position').array),w=geo.getAttribute('skinWeight'),j=geo.getAttribute('skinIndex');
    const beforeW=Array.from(w.array),beforeJ=Array.from(j.array);
    expect(regularizeFoundationHead(mesh)).toBe(2);
    expect(Array.from(w.array).slice(0,4)).toEqual(beforeW.slice(0,4));
    expect(Array.from(j.array).slice(0,4)).toEqual(beforeJ.slice(0,4));
    expect(Array.from(geo.getAttribute('position').array)).toEqual(p);
    for(let i=1;i<3;i++){let sum=0,head=0;for(let k=0;k<4;k++){const a=w.getComponent(i,k);sum+=a;if(j.getComponent(i,k)===12)head+=a;}expect(sum).toBeCloseTo(1,7);expect(head).toBeCloseTo(i===2?1:.825,5);}
  });
  it('poses absolute rotations without drift and resets to the lowered static pose',()=>{
    const {root,mesh,bones}=fixture();
    const idle=createFoundationIdle(root,mesh);
    const base=bones.map(b=>b.quaternion.clone());
    expect(base[names.indexOf('upperarm_L')].angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI/30,8);
    const sample=sampleAvatarIdle(2.1);
    idle.pose(sample);const moved=bones.map(b=>b.quaternion.clone());
    expect(moved[names.indexOf('head')].angleTo(base[names.indexOf('head')])).toBeGreaterThan(.001);
    for(let i=0;i<100;i++){idle.pose(sampleAvatarIdle(i/10));idle.pose(sample);}
    bones.forEach((b,i)=>expect(b.quaternion.angleTo(moved[i])).toBeLessThan(1e-6));
    idle.reset();bones.forEach((b,i)=>expect(b.quaternion.angleTo(base[i])).toBeLessThan(1e-6));
  });
  it('preserves the GLTF normal-map orientation while tuning materials',()=>{
    const root=new THREE.Group();
    for(const [name,scale,rough,sheen] of [['BF_DonorSkin_PBR_V2',.85,.63,0],['BF_Foundation_Textile_V2',.75,.94,.32]] as const){
      const m=new THREE.MeshPhysicalMaterial();m.name=name;m.normalScale.set(.5,-.5);
      const mesh=new THREE.Mesh(new THREE.BufferGeometry(),m);root.add(mesh);
      tuneFoundationMaterials(root);
      expect(m.normalScale.toArray()).toEqual([scale,-scale]);
      expect(m.roughness).toBe(rough);expect(m.sheen).toBe(sheen);
    }
  });
});
