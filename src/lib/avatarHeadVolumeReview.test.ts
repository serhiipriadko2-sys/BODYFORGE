import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { applyAvatarFaceForm } from './avatarFace';
import { applyAvatarFaceContour } from './avatarFaceContour';
import { applyAvatarHeadVolume, HEAD_VOLUME_REVIEW_ID, parseHeadVolumeRecipe, protectedHeadVolumePoint, sampleHeadVolume } from './avatarHeadVolumeReview';
import { createAvatarPhysique } from './avatarPhysique';
import { SCAN_TORSO_REVIEW_DATA } from './avatarScanTorsoReviewData';
import { applyAvatarGrowth } from './avatarGrowth';
import { createAvatarLashes } from './avatarLashes';
import { createAvatarIdle } from './avatarIdle';
import { applyAthleticPose } from './avatarPose';
import { disposeThreeTree } from './threeResources';

const asset = 'public/assets/bodyforge-athlete-efficient.glb';
const bodyHash = 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e';
const local = '.bodyforge-qa/scan-reference-artec/head-volume-review-v4.json';
function synthetic() {
  return { id: HEAD_VOLUME_REVIEW_ID, bodySha256: bodyHash, baseline: 'lower-face-contour-v3',
    field: 'normalized-gaussian-protected-v1',
    zones: [1.566, 1.604, 1.640].flatMap(y => [0, .038, .068].map(x => ({
      center: [x,y,.129], radius: [.037,.034,.060], offset: [x===0?0:-.0028,0,-.0012],
    }))) };
}
async function load() {
  const bytes = readFileSync(asset);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(bodyHash);
  return (await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '')).scene;
}

describe('protected normalized head volume', () => {
  it('rejects unknown revisions, altered control centres, malformed numbers and excess magnitude', () => {
    expect(parseHeadVolumeRecipe(synthetic())).toHaveLength(9);
    expect(parseHeadVolumeRecipe({ ...synthetic(), id: 'unknown' })).toBeUndefined();
    const drift = synthetic(); drift.zones[1].center[0] += .001;
    expect(parseHeadVolumeRecipe(drift)).toBeUndefined();
    const excess = synthetic(); excess.zones[1].offset = [0,0,.007];
    expect(parseHeadVolumeRecipe(excess)).toBeUndefined();
    const invalid = synthetic(); invalid.zones[1].offset = [NaN,0,0];
    expect(parseHeadVolumeRecipe(invalid)).toBeUndefined();
    const midline = synthetic(); midline.zones[0].offset = [.001,0,0];
    expect(parseHeadVolumeRecipe(midline)).toBeUndefined();
    const vertical = synthetic(); vertical.zones[1].offset = [0,.001,0];
    expect(parseHeadVolumeRecipe(vertical)).toBeUndefined();
  });

  it('preserves mouth, eyes, neck, scalp and symmetry with smooth transitions', () => {
    const offsets = parseHeadVolumeRecipe(synthetic())!;
    for (const [x,y,z] of [[0,1.6,.16],[.029,1.586,.13],[.031,1.616,.12],[.033,1.678,.14],[.05,1.54,.12],[.08,1.62,.12],[.04,1.62,.06],[NaN,1.62,.15]]) {
      expect(protectedHeadVolumePoint(x,y,z)).toBe(true);
      expect(sampleHeadVolume(x,y,z,offsets).toArray()).toEqual([0,0,0]);
    }
    for (let y=1.553;y<1.658;y+=.003) for(let x=0;x<.077;x+=.003) {
      const a=sampleHeadVolume(x,y,.129,offsets), b=sampleHeadVolume(-x,y,.129,offsets);
      expect(a.x).toBeCloseTo(-b.x,10); expect(a.z).toBeCloseTo(b.z,10);
      expect(a.y).toBe(0);
      expect(Number.isFinite(a.length())).toBe(true);
    }
    expect(sampleHeadVolume(.054,1.606,.125,offsets).length()).toBeGreaterThan(.001);
    const a=sampleHeadVolume(.031,1.600,.14,offsets);
    const b=sampleHeadVolume(.03101,1.600,.14,offsets);
    expect(a.distanceTo(b)).toBeLessThan(1e-7);
  });

  async function verify(recipe: unknown) {
    const offsets = parseHeadVolumeRecipe(recipe)!;
    expect(offsets).toHaveLength(9);
    const root=await load();
    try {
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const g=body.geometry;
      expect(applyAvatarHeadVolume(root,offsets)).toBe(0);
      applyAthleticPose(root);
      expect(applyAvatarFaceForm(root)).toBeDefined();
      expect(applyAvatarFaceContour(root)).toBeGreaterThan(1000);
      const p=g.getAttribute('position'), n=g.getAttribute('normal'), uv=g.getAttribute('uv'),
        weights=g.getAttribute('skinWeight'), joints=g.getAttribute('skinIndex'), index=g.index;
      const meshes=['Lips','Eyes','SkinEars','Brows','Shirt','Shorts'].map(name=>{
        const mesh=root.getObjectByName('BODYFORGE_'+name) as THREE.SkinnedMesh;
        return [mesh,mesh.geometry.getAttribute('position')] as const;
      });
      const invalid = offsets.map(([x,z],i) => [i===1?.01:x,z] as const);
      expect(applyAvatarHeadVolume(root,invalid)).toBe(0);
      expect(g.getAttribute('position')).toBe(p);
      const changed=applyAvatarHeadVolume(root,offsets);
      expect(changed).toBeGreaterThan(1500);
      expect(applyAvatarHeadVolume(root,offsets)).toBe(0);
      expect(g.userData.headVolumeReview).toBe(HEAD_VOLUME_REVIEW_ID);
      const q=g.getAttribute('position'), normal=g.getAttribute('normal');
      expect(g.getAttribute('uv')).toBe(uv);expect(g.getAttribute('skinWeight')).toBe(weights);
      expect(g.getAttribute('skinIndex')).toBe(joints);expect(g.index).toBe(index);
      let peak=0, protectedCount=0, affected=0;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
        const length=Math.hypot(q.getX(i)-x,q.getY(i)-y,q.getZ(i)-z);
        if(protectedHeadVolumePoint(x,y,z)){
          if(length!==0||n.getX(i)!==normal.getX(i)||n.getY(i)!==normal.getY(i)||n.getZ(i)!==normal.getZ(i))throw Error('Protected vertex changed '+i);
          protectedCount++;
        }
        if(length>.00005)affected++;
        if(length>0&&Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)>.00001)throw Error('Invalid normal '+i);
        if(q.getY(i)!==y)throw Error('Unexpected vertical shift '+i);
        peak=Math.max(peak,length);
      }
      expect(peak).toBeGreaterThan(.001);expect(peak).toBeLessThan(.0042);
      expect(protectedCount).toBeGreaterThan(60000);expect(Math.abs(affected-changed)).toBeLessThan(5);
      for(const [mesh,attr] of meshes)expect(mesh.geometry.getAttribute('position')).toBe(attr);
      expect(createAvatarLashes(body)).toBeDefined();
      const idle=createAvatarIdle(root);expect(idle).toBeDefined();
      const headAtRest=Float32Array.from(q.array), normalAtRest=Float32Array.from(normal.array);
      for(const athletic of [false,true]){
        const grow=createAvatarPhysique(root,false,false,athletic?SCAN_TORSO_REVIEW_DATA:undefined,athletic);
        for(const levels of [{arms:5},{core:5},{legs:5},{back:5},{arms:5,core:5,legs:5,back:5},{}]){
          grow(levels);applyAvatarGrowth(root,levels);
          const result=g.getAttribute('position'), resultNormal=g.getAttribute('normal');
          for(let i=0;i<q.count;i++)if(headAtRest[3*i+1]>1.552){
            for(let axis=0;axis<3;axis++){
              const k=3*i+axis;
              if(headAtRest[k]!==result.array[k]||normalAtRest[k]!==resultNormal.array[k])throw Error('Growth changed head '+i);
            }
          }
        }
      }
      idle?.pose({breath:1,lean:.5,headYaw:.5,headTilt:.5,gaze:1,blink:1});idle?.reset();
      expect(g.getAttribute('skinWeight')).toBe(weights);
      console.info('HEAD_VOLUME_RUNTIME', JSON.stringify({ changed, affected, peakMm:peak*1000, protectedCount }));
    }finally{disposeThreeTree(root);}
  }

  it('runs the complete rig and growth contract with a synthetic portable recipe',async()=>verify(synthetic()));
  it.skipIf(!existsSync(local))('validates the exact private Blender candidate against the actual live mesh',async()=>{
    const bytes=readFileSync(local);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('185ec8ce1c6cc0e9c77de12dd5c7bfeeffc274bb7af816a8fc4ba81b0c4cc0b6');
    await verify(JSON.parse(bytes.toString('utf8')));
  });
});
