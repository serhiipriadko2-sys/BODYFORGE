import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {describe,it,expect} from 'vitest';
import {applyAvatarFaceForm} from './avatarFace';
import {applyAvatarFaceContour} from './avatarFaceContour';
import {applyAvatarScanTransfer,sampleScanDepth} from './avatarScanTransfer';
import {createAvatarPhysique} from './avatarPhysique';
import {createAvatarLashes} from './avatarLashes';
import {installAvatarBrows} from './avatarBrows';
import {disposeThreeTree} from './threeResources';
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const load=async(name:string)=>(await new GLTFLoader().parseAsync(Uint8Array.from(readFileSync('public/assets/'+name)).buffer,'')).scene;

describe('experimental scan registration',()=>{
  it('pins the donor-derived field and both baseline profiles',()=>{
    expect(hash('src/lib/avatarScanTransferField.json')).toBe('b9c06e31e43aaa794cd8f3752157a123cf228647f278ff10d5e2c1b56e8068a8');
    expect(hash('src/lib/avatarFaceProfile.json')).toBe('e51dc7b5631443400da7e04022aa9bf696b27a99ebec200c531e87390dc243f9');
    expect(hash('src/lib/avatarFaceContour.json')).toBe('4d7c2665c0abe5428c10f88274b23708007506b4ee1bd21daf88690e148f6330');
    for(const p of [[0,1.60,.16],[.01,1.67,.15],[.06,1.55,.12],[.08,1.63,.12],[.04,1.62,.04]])
      expect(sampleScanDepth(p[0],p[1],p[2])).toBe(0);
  });
  it('transfers the bounded scan geometry atomically and preserves the live rig and growth baseline',async()=>{
    const root=await load('bodyforge-athlete-efficient.glb'),donor=await load('bodyforge-brows-v3.glb');
    try{
      const body=root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
      const g=body.geometry;
      expect(applyAvatarScanTransfer(root)).toBe(0);
      expect(applyAvatarFaceForm(root)).toBeDefined();
      expect(applyAvatarFaceContour(root)).toBeGreaterThan(1000);
      const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv'),weights=g.getAttribute('skinWeight'),index=g.index;
      const protectedMeshes=['Lips','Eyes','SkinEars','Brows','Shirt','Hair_crop'].map(name=>{
        const m=root.getObjectByName('BODYFORGE_'+name) as THREE.SkinnedMesh;
        return [m,m.geometry.getAttribute('position')] as const;
      });
      const changed=applyAvatarScanTransfer(root);
      expect(changed).toBeGreaterThan(3500);
      expect(changed).toBeLessThan(4500);
      expect(applyAvatarScanTransfer(root)).toBe(0);
      const q=g.getAttribute('position'),norm=g.getAttribute('normal');
      expect(g.getAttribute('uv')).toBe(uv);expect(g.getAttribute('skinWeight')).toBe(weights);expect(g.index).toBe(index);
      for(const [mesh,attribute] of protectedMeshes)expect(mesh.geometry.getAttribute('position')).toBe(attribute);
      let peak=0,count=0;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),delta=q.getZ(i)-z;
        if(q.getX(i)!==x||q.getY(i)!==y)throw Error('lateral vertex drift '+i);
        if(sampleScanDepth(x,y,z)===0){
          if(delta!==0||n.getX(i)!==norm.getX(i)||n.getY(i)!==norm.getY(i)||n.getZ(i)!==norm.getZ(i))throw Error('protected vertex drift '+i);
        }else{
          expect(Math.hypot(norm.getX(i),norm.getY(i),norm.getZ(i))).toBeCloseTo(1,5);
        }
        if(Math.abs(delta)>.00005)count++;
        peak=Math.max(peak,Math.abs(delta));
      }
      expect(peak).toBeGreaterThan(.001);
      expect(peak).toBeLessThan(.00211);
      expect(Math.abs(changed-count)).toBeLessThan(5);
      expect(createAvatarLashes(body)).toBeDefined();
      const brow=root.getObjectByName('BODYFORGE_Brows') as THREE.SkinnedMesh;
      expect(installAvatarBrows(body,brow,donor)).toBe(true);
      const grow=createAvatarPhysique(root);
      for(const levels of [{arms:5},{core:5},{legs:5},{back:5},{arms:5,core:5,legs:5,back:5},{}]){
        grow(levels);
        const out=g.getAttribute('position');
        for(let i=0;i<p.count;i++)if(q.getY(i)>1.554&&(q.getX(i)!==out.getX(i)||q.getY(i)!==out.getY(i)||q.getZ(i)!==out.getZ(i)))throw Error('growth drift '+i);
      }
      console.info('SCAN_RUNTIME',JSON.stringify({changed,count,peakMm:peak*1000}));
    }finally{disposeThreeTree(root);disposeThreeTree(donor);}
  });
});
