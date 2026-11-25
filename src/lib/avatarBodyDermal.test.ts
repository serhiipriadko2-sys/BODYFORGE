import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { sampleBodyDermal, BODY_DERMAL_REVISION } from './avatarBodyDermal';
import { DERMAL_ATTRIBUTE, installDermalRegions } from './avatarDermalRegions';
import { applyAvatarFaceForm } from './avatarFace';
import { createAvatarPhysique } from './avatarPhysique';
import { applyAvatarGrowth } from './avatarGrowth';
import { disposeThreeTree } from './threeResources';

describe('regional skin response below the face', () => {
  it('distinguishes joints, calves, forearms and neck with continuous bounded masks', () => {
    const knee=sampleBodyDermal(.151,.538,.073), elbow=sampleBodyDermal(.382,1.232,-.015);
    const calf=sampleBodyDermal(.181,.396,-.045), wrist=sampleBodyDermal(.512,1.102,.218);
    const chest=sampleBodyDermal(.081,1.333,.142);
    expect(knee[2]).toBeGreaterThan(.75);
    expect(elbow[2]).toBeGreaterThan(.75);
    expect(calf[2]).toBeLessThan(.40);
    expect(wrist[1]).toBeGreaterThan(.3);
    expect(chest[0]).toBeGreaterThan(.3);
    expect(sampleBodyDermal(-.151,.538,.073)).toEqual(knee);
    expect(sampleBodyDermal(NaN,0,0)).toEqual([0,0,.5]);
    expect(sampleBodyDermal(0,0,0)).toEqual([0,0,.5]);
    expect(sampleBodyDermal(.043,1.53,.047)).toEqual([0,0,.5]);
    const edge=sampleBodyDermal(.043,1.52999,.047);
    expect(Math.abs(edge[0])+Math.abs(edge[1])+Math.abs(edge[2]-.5)).toBeLessThan(.00001);
  });
  it('changes only the existing material attribute on the real rig and survives independent growth', async () => {
    const {scene}=await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/bodyforge-athlete-efficient.glb')).buffer,'');
    try {
      const body=scene.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const ears=scene.getObjectByName('BODYFORGE_SkinEars') as THREE.SkinnedMesh;
      expect(applyAvatarFaceForm(scene)).toBeDefined();
      const p=body.geometry.getAttribute('position'),n=body.geometry.getAttribute('normal');
      const uv=body.geometry.getAttribute('uv'),weights=body.geometry.getAttribute('skinWeight'),index=body.geometry.index;
      const coordinates=Array.from(p.array);
      expect(installDermalRegions([body,ears],false)).toBe(true);
      const baseline=Array.from(body.geometry.getAttribute(DERMAL_ATTRIBUTE).array);
      const baselineEars=Array.from(ears.geometry.getAttribute(DERMAL_ATTRIBUTE).array);
      expect(installDermalRegions([body,ears])).toBe(true);
      const field=body.geometry.getAttribute(DERMAL_ATTRIBUTE);
      const values=Array.from(field.array);
      expect(body.geometry.userData.bodyDermalRevision).toBe(BODY_DERMAL_REVISION);
      expect(field.normalized).toBe(true);
      expect(field.array.byteLength).toBe(65895*3);
      expect(body.geometry.getAttribute('position')).toBe(p);
      expect(body.geometry.getAttribute('normal')).toBe(n);
      expect(body.geometry.getAttribute('uv')).toBe(uv);
      expect(body.geometry.getAttribute('skinWeight')).toBe(weights);
      expect(body.geometry.index).toBe(index);
      expect(Array.from(p.array)).toEqual(coordinates);
      expect(Array.from(ears.geometry.getAttribute(DERMAL_ATTRIBUTE).array)).toEqual(baselineEars);
      let changed=0,head=0,peak=0,knees=0,elbows=0,calves=0,hands=0;
      for(let i=0;i<p.count;i++){
        const x=Math.abs(p.getX(i)),y=p.getY(i),z=p.getZ(i);
        const delta=Math.max(...[0,1,2].map(k=>Math.abs(values[i*3+k]-baseline[i*3+k])));
        if(y>=1.53){head++;if(delta)throw Error('facial response changed '+i);}
        if(delta===0)continue;
        changed++;peak=Math.max(peak,delta);
        if(y>.47&&y<.61&&x<.24&&z>.025&&values[i*3+2]>150)knees++;
        if(y>1.16&&y<1.3&&x>.30&&z<.03&&values[i*3+2]>150)elbows++;
        if(y>.25&&y<.52&&z<-.02&&values[i*3+2]<110)calves++;
        if(y>.97&&y<1.16&&x>.45&&values[i*3+1]>25)hands++;
      }
      expect(changed).toBeGreaterThan(2000);
      expect(head).toBeGreaterThan(1000);
      expect(knees).toBeGreaterThan(10);
      expect(elbows).toBeGreaterThan(10);
      expect(calves).toBeGreaterThan(10);
      expect(hands).toBeGreaterThan(100);
      expect(peak).toBeLessThan(180);
      const sculpt=createAvatarPhysique(scene);
      for(const levels of [{arms:5},{core:5},{legs:5},{back:5},{arms:5,core:5,legs:5,back:5},{}]){
        sculpt(levels);applyAvatarGrowth(scene,levels);
        expect(body.geometry.getAttribute(DERMAL_ATTRIBUTE)).toBe(field);
        expect(Array.from(field.array)).toEqual(values);
      }
      console.info('BODY_DERMAL',JSON.stringify({changed,head,knees,elbows,calves,hands,peak,bytes:field.array.byteLength}));
    } finally { disposeThreeTree(scene); }
  });
});
