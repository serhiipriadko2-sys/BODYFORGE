import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {foundationSkinTint,createFoundationSkinMaps,tuneFoundationSkin} from './regionalFoundationSkin';

describe('V11 procedural skin material',()=>{
  it('produces deterministic bounded colors attached to rest coordinates',()=>{
    expect(()=>foundationSkinTint(NaN,1,0)).toThrow();
    const lip=foundationSkinTint(0,1.505,.145),back=foundationSkinTint(0,1.505,-.08);
    expect(lip[1]/lip[0]).toBeLessThan(.85);
    expect(back[1]/back[0]).toBeGreaterThan(.95);
    for(let i=0;i<1000;i++){
      const p:[number,number,number]=[.4*Math.sin(i*.73),1.7*(i/999),.17*Math.cos(i*.93)];
      const a=foundationSkinTint(...p),b=foundationSkinTint(...p);
      expect(a).toEqual(b);expect(a.every(x=>Number.isFinite(x)&&x>=.5&&x<=1)).toBe(true);
    }
  });
  it('makes exact deterministic detail and roughness maps with independent ownership',()=>{
    expect(()=>createFoundationSkinMaps(64)).toThrow();
    const a=createFoundationSkinMaps(128),b=createFoundationSkinMaps(128);
    try{
      for(const k of ['pigment','roughness'] as const){
        const x=a[k],y=b[k],u=x.image.data,v=y.image.data;
        if(!(u instanceof Uint8Array)||!(v instanceof Uint8Array))throw Error('Missing map');
        expect(x).not.toBe(y);expect(u).not.toBe(v);
        expect(u.length).toBe(128*128*4);expect(u.length===v.length&&u.every((n,i)=>n===v[i])).toBe(true);
        expect(x.repeat.toArray()).toEqual([8,8]);expect(x.wrapS).toBe(THREE.RepeatWrapping);
        expect(x.generateMipmaps).toBe(true);expect(x.minFilter).toBe(THREE.LinearMipmapLinearFilter);
        const vals=new Set<number>();
        for(let i=0;i<u.length;i+=4){vals.add(u[i]);if(u[i+3]!==255)throw Error('Alpha drift');}
        expect(vals.size).toBeGreaterThan(8);
      }
      expect(a.pigment.colorSpace).toBe(THREE.LinearSRGBColorSpace);expect(a.roughness.colorSpace).toBe(THREE.NoColorSpace);
    }finally{a.pigment.dispose();a.roughness.dispose();b.pigment.dispose();b.roughness.dispose();}
  });
  it('preserves donor pigment and geometry; reuses maps within one root only',()=>{
    const root=new THREE.Group(),material=new THREE.MeshPhysicalMaterial({vertexColors:true});
    material.name='BF_DonorSkin_PBR_V2';material.normalMap=new THREE.Texture();material.normalScale.set(.85,-.85);
    const p=new Float32Array([0,1.505,.145,.04,1.54,.135]),n=new Float32Array([0,0,1,0,0,1]),uv=new Float32Array([0,0,1,1]),color=new Float32Array([.8,.7,.65,.9,.85,.8]);
    const meshes=['BF_Foundation_Skin','BF_Foundation_TorsoSkin'].map(name=>{
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.slice(),3));g.setAttribute('normal',new THREE.BufferAttribute(n.slice(),3));g.setAttribute('uv',new THREE.BufferAttribute(uv.slice(),2));g.setAttribute('color',new THREE.BufferAttribute(color.slice(),3));
      const mesh=new THREE.SkinnedMesh(g,material);mesh.name=name;root.add(mesh);return mesh;
    });
    const normal=material.normalMap;
    try{
      tuneFoundationSkin(root);
      for(const mesh of meshes){
        const g=mesh.geometry;expect(g.getAttribute('position').array).toEqual(p);expect(g.getAttribute('normal').array).toEqual(n);expect(g.getAttribute('uv').array).toEqual(uv);
        for(let i=0;i<2;i++){const t=foundationSkinTint(p[i*3],p[i*3+1],p[i*3+2]);for(let j=0;j<3;j++)expect(g.getAttribute('color').array[i*3+j]).toBe(Math.fround(color[i*3+j]*t[j]));}
      }
      expect(material.normalMap).toBe(normal);expect(material.normalScale.toArray()).toEqual([.85,-.85]);
      expect(material.map).toBeInstanceOf(THREE.DataTexture);expect(material.roughnessMap).toBeInstanceOf(THREE.DataTexture);
      expect(()=>tuneFoundationSkin(root)).toThrow('scope');
    }finally{meshes.forEach(m=>m.geometry.dispose());material.map?.dispose();material.roughnessMap?.dispose();normal.dispose();material.dispose();}
  });
});
