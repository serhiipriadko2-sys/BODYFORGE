import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {foundationDetailShaders,foundationGradientTexture,installFoundationDetail,decodeFoundationScan,DETAIL_REST,DETAIL_NORMAL,FOUNDATION_DETAIL_ID} from './regionalFoundationDetail';
import {disposeThreeTree} from './threeResources';
const height=()=>Uint8Array.from({length:65536},(_,i)=>(i*17+(i>>>8)*23)%256);
function fixture(){
  const source=new THREE.Group(),m=new THREE.MeshPhysicalMaterial({vertexColors:true});
  m.name='BF_DonorSkin_PBR_V2';m.normalMap=new THREE.Texture();
  m.map=new THREE.Texture();m.map.name='BF_V11_OriginalPigmentDetail';
  m.roughnessMap=new THREE.Texture();m.roughnessMap.name='BF_V11_OriginalRoughness';
  const parts=[['BF_Foundation_Skin',41476],['BF_Foundation_TorsoSkin',6870]].map(([name,count])=>{
    const n=Number(count),p=new Float32Array(n*3),normal=new Float32Array(n*3);
    for(let i=0;i<n;i++){p.set([.03,1.4,.12],i*3);normal[i*3+2]=1;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p.slice(),3));g.setAttribute('normal',new THREE.BufferAttribute(normal.slice(),3));
    const mesh=new THREE.SkinnedMesh(g,m);mesh.name=String(name);source.add(mesh);
    return {mesh,restP:p,restN:normal};
  });return {source,m,parts};
}
describe('V15 pinned scan-gradient material',()=>{
  it('patches only unique shader anchors and retains donor normal, Fresnel and GGX',()=>{
    const v=THREE.ShaderLib.physical.vertexShader,f=THREE.ShaderLib.physical.fragmentShader,r=foundationDetailShaders(v,f)!;
    expect(r.vertex).toContain(DETAIL_REST);expect(r.vertex).toContain(DETAIL_NORMAL);
    expect(r.fragment).toContain(FOUNDATION_DETAIL_ID);
    expect(r.fragment).toContain('#include <normal_fragment_maps>');
    expect(r.fragment).toContain('BRDF_GGX');expect(r.fragment).toContain('1.0 - F');
    expect(r.fragment).toContain('directLight.color*mix');expect(r.fragment).toContain('bfV15Meso = normal');
    expect(r.fragment.split('textureGrad(bfV15Gradient,')).toHaveLength(4);
    expect(foundationDetailShaders(r.vertex,r.fragment)).toBeUndefined();
    expect(foundationDetailShaders(v,f.replace('#include <normal_fragment_maps>',''))).toBeUndefined();
    expect(foundationDetailShaders(v+'\\n#include <begin_vertex>',f)).toBeUndefined();
  });
  it('packs independent filtered non-color gradients deterministically',()=>{
    const h=height(),a=foundationGradientTexture(h),b=foundationGradientTexture(h);
    try{
      const x=a.image.data as Uint8Array,y=b.image.data as Uint8Array;
      expect(a).not.toBe(b);expect(x).not.toBe(y);
      expect(x.length).toBe(262144);expect(x.every((v,i)=>v===y[i])).toBe(true);
      expect(a.colorSpace).toBe(THREE.NoColorSpace);expect(a.generateMipmaps).toBe(true);expect(a.premultiplyAlpha).toBe(false);
      expect(a.wrapS).toBe(THREE.RepeatWrapping);expect(a.minFilter).toBe(THREE.LinearMipmapLinearFilter);
      expect(()=>foundationGradientTexture(new Uint8Array(2))).toThrow();
    }finally{a.dispose();b.dispose();}
  });
  it('rejects invalid data before mutating either surface',async()=>{
    await expect(decodeFoundationScan(new ArrayBuffer(4))).rejects.toThrow('header');
    const f=fixture();
    try{
      f.parts[1].restP[0]=NaN;
      expect(()=>installFoundationDetail(f.source,f.parts,height(),2.8)).toThrow('coordinates');
      expect(f.parts.every(p=>!p.mesh.geometry.hasAttribute(DETAIL_REST))).toBe(true);
      expect(f.m.userData.foundationDetail).toBeUndefined();
    }finally{disposeThreeTree(f.source);}
  });
  it('preserves geometry, copies rest data and releases shader-owned textures exactly once',()=>{
    const f=fixture(),normal=f.m.normalMap,albedo=f.m.map,rough=f.m.roughnessMap;
    try{
      installFoundationDetail(f.source,f.parts,height(),2.8);
      expect(f.m.customProgramCacheKey()).toBe(FOUNDATION_DETAIL_ID);
      expect(f.m.normalMap).toBe(normal);expect(f.m.map).toBe(albedo);expect(f.m.roughnessMap).toBe(rough);
      for(const p of f.parts){
        const g=p.mesh.geometry,a=g.getAttribute(DETAIL_REST),b=g.getAttribute(DETAIL_NORMAL);
        expect(a.array).not.toBe(p.restP);expect(a.array.every((v,i)=>v===p.restP[i])).toBe(true);
        expect(g.getAttribute('position').array.every((v,i)=>v===p.restP[i])).toBe(true);
        expect(b.array instanceof Int16Array).toBe(true);expect(b.normalized).toBe(true);expect(b.getZ(0)).toBe(1);
      }
      const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}} as Parameters<typeof f.m.onBeforeCompile>[0];
      f.m.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
      const a=shader.uniforms.bfV15Gradient.value as THREE.DataTexture,b=shader.uniforms.bfV15Lut.value as THREE.DataTexture;
      const da=vi.spyOn(a,'dispose'),db=vi.spyOn(b,'dispose');
      if(!(a.image.data instanceof Uint8Array)||!(b.image.data instanceof Uint8Array))throw Error('Missing shader texture bytes');
      expect(a.image.data.byteLength).toBe(262144);expect(b.image.data.byteLength).toBe(17028);
      expect(()=>installFoundationDetail(f.source,f.parts,height(),2.8)).toThrow('scope');
      f.m.dispose();f.m.dispose();expect(da).toHaveBeenCalledTimes(1);expect(db).toHaveBeenCalledTimes(1);
    }finally{disposeThreeTree(f.source);}
  });
});
