import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent ||= class ProgressEvent {constructor(type,init){Object.assign(this,{type,...init});}};
const file=fs.readFileSync(new URL('../public/assets/male-base-mesh-base_male.glb',import.meta.url));
const asset=await new Promise((resolve,reject)=>new GLTFLoader().parse(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'',resolve,reject));
const scene=asset.scene;
scene.updateMatrixWorld(true);
const world = new THREE.Box3().setFromObject(scene), dimension=world.getSize(new THREE.Vector3()), centre=world.getCenter(new THREE.Vector3());
const norm=(v)=>v.map(x=>+x.toFixed(4));
const bones=[], meshes=[];
scene.traverse(node=>{
 if(node instanceof THREE.Bone && /^(head|neck0[1-3]|spine0[1-5]|pelvis\.([LR])|foot\.([LR])|upperarm0[1-3]\.([LR])|upperleg0[1-3]\.([LR]))$/i.test(node.name)){
   const pos=node.getWorldPosition(new THREE.Vector3());
   bones.push({name:node.name,point:norm(pos.toArray()),normalized:norm([pos.x*4.75/dimension.y,(pos.y-world.min.y)*4.75/dimension.y,(pos.z-centre.z)*4.75/dimension.y])});
 }
 if(node instanceof THREE.SkinnedMesh){
   const pos=node.geometry.getAttribute('position');
   const weights=node.geometry.getAttribute('skinWeight');
   const indices=node.geometry.getAttribute('skinIndex');
   const name=node.name;
   const rows={};
   for(let i=0;i<pos.count;i++){
     const y=pos.getY(i);
     const k=Math.floor(y*10)/10;
     const label=k.toFixed(1);
     if(!rows[label])rows[label]={count:0,x0:1e9,x1:-1e9,z0:1e9,z1:-1e9};
     const row=rows[label];row.count++;
     row.x0=Math.min(row.x0,pos.getX(i));row.x1=Math.max(row.x1,pos.getX(i));
     row.z0=Math.min(row.z0,pos.getZ(i));row.z1=Math.max(row.z1,pos.getZ(i));
   }
   meshes.push({name,verts:pos.count,indices:node.geometry.index?.count,skinned:!!indices,
     bounds:(()=>{const b=node.geometry.boundingBox??(node.geometry.computeBoundingBox(),node.geometry.boundingBox);return{min:norm(b.min.toArray()),max:norm(b.max.toArray())}})(),
     bones:node.skeleton?.bones.length, materials:Array.isArray(node.material)?node.material.map(m=>m.name):[node.material?.name],
     rows:Object.entries(rows).filter(([k,v])=>+k>=.1).map(([k,v])=>[k,v.count,...[v.x0,v.x1,v.z0,v.z1].map(x=>+x.toFixed(3))])
   });
 }
});
console.log('ASSET_INSPECTION',JSON.stringify({height:dimension.y,normalizedScale:4.75/dimension.y,min:norm(world.min.toArray()),max:norm(world.max.toArray()),center:norm(centre.toArray()),bones,meshes},null,2));
