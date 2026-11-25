import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describe, expect, it} from 'vitest';
import {configureAvatarLegCamera} from './avatarViewFraming';
import {applyAthleticPose} from './avatarPose';
import {applyAvatarGrowth} from './avatarGrowth';
import {createAvatarPhysique} from './avatarPhysique';
import {createAvatarGarmentSeams} from './avatarGarmentSeams';
import {applyAvatarGarmentFit} from './avatarGarmentFit';
import {repairAvatarSleeve} from './avatarSleeveRepair';
import {installAvatarTrainers} from './avatarTrainers';
import {disposeThreeTree} from './threeResources';

const load=async(name:string)=>(await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/'+name)).buffer,'')).scene;

describe('leg view includes hip and complete footwear',()=>{
  it('frames the fitted shorts and shoes in real posed geometry across growth and orbit',async()=>{
    const source=await load('bodyforge-athlete-efficient.glb');
    const donor=await load('bodyforge-trainers.glb');
    const orbit=new THREE.Group(),root=new THREE.Group();
    orbit.add(root);root.add(source);
    try {
      source.updateWorldMatrix(true,true);
      const box=new THREE.Box3();
      source.traverse(n=>{if(n instanceof THREE.Mesh&&!n.name.startsWith('BODYFORGE_Hair_'))box.expandByObject(n);});
      const scale=4.75/box.getSize(new THREE.Vector3()).y;
      const centre=box.getCenter(new THREE.Vector3());
      source.scale.setScalar(scale);
      source.position.set(-centre.x*scale,-box.min.y*scale+.028,-centre.z*scale);
      applyAthleticPose(source);
      const shirt=source.getObjectByName('BODYFORGE_Shirt') as THREE.SkinnedMesh;
      const shorts=source.getObjectByName('BODYFORGE_Shorts') as THREE.SkinnedMesh;
      const shoes=source.getObjectByName('BODYFORGE_Shoes') as THREE.SkinnedMesh;
      const seams=createAvatarGarmentSeams([shirt,shorts])!;
      expect(seams.loopCount).toBe(7);
      expect(applyAvatarGarmentFit([shirt,shorts])).toBe(4466);
      expect(repairAvatarSleeve([shirt,shorts])).toBe(14);
      expect(installAvatarTrainers(shoes,donor)).toBe(true);
      const surfaces=[shorts,shoes,...shoes.parent!.children.filter(n=>n.name.startsWith('BF_Trainer_')) as THREE.SkinnedMesh[]];
      const sculpt=createAvatarPhysique(source,true),camera=new THREE.PerspectiveCamera(35,1,.1,60);
      configureAvatarLegCamera(camera);
      camera.updateMatrixWorld(true);
      let minY=Infinity,maxY=-Infinity,maxX=0,samples=0;
      const point=new THREE.Vector3();
      for(const muscles of [{},{legs:5},{arms:5,core:5,legs:5,back:5}]){
        sculpt(muscles);
        applyAvatarGrowth(root,muscles);seams.update(root);
        for(const bodyScale of [1,1.055]){
          root.scale.x=bodyScale;
          for(const yaw of [-Math.PI,-Math.PI/2,-.21,0,Math.PI/2,Math.PI-.21]){
            orbit.rotation.y=yaw;orbit.updateMatrixWorld(true);
            for(const aspect of [.8,1,1.5]){
              camera.aspect=aspect;camera.updateProjectionMatrix();
              for(const mesh of surfaces){
                for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){
                  mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).project(camera);
                  if(!Number.isFinite(point.x+point.y+point.z))throw Error('invalid projection');
                  minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y);
                  maxX=Math.max(maxX,Math.abs(point.x));samples++;
                }
              }
            }
          }
        }
      }
      console.info('LEG_FRAMING',JSON.stringify({minY,maxY,maxX,samples}));
      // Normalized device coordinates +/-1 are the viewport edges.
      // Keep measurable room above the waist and below the soles.
      expect(maxY).toBeLessThan(.95);
      expect(minY).toBeGreaterThan(-.95);
      expect(maxX).toBeLessThan(.95);
    }finally{disposeThreeTree(orbit);disposeThreeTree(donor);}
  },20000);
});
