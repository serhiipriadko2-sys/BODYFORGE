import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {decodeEyeAperture,eyeContactShaders,installFoundationEyeContact,EYE_CONTACT_ID} from './regionalFoundationEyeContact';
import {disposeThreeTree} from './threeResources';

const size=128*42*4;
function fixture(){
  const b=new Uint8Array(size);
  for(let side=0;side<2;side++)for(let f=0;f<21;f++)for(let x=0;x<128;x++){
    const i=4*((side*21+f)*128+x),valid=f<20&&x>=14&&x<114;
    b.set(valid?[80,175-4*f,255,255]:[120,120,0,255],i);
  }
  return b;
}
function root(shared=true){
  const source=new THREE.Group(),bones=Array.from({length:19},(_,i)=>{const b=new THREE.Bone();b.name=i===12?'head':'joint_'+i;source.add(b);return b;}),skeleton=new THREE.Skeleton(bones);
  function mat(){const m=new THREE.MeshPhysicalMaterial();m.name='BF_Sclera_V2';m.map=new THREE.Texture();m.map.name='BF_V8_OriginalEyePigment';return m;}
  const a=mat(),b=shared?a:mat();
  const meshes=[a,b].map((m,i)=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(578*3),3));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(3264),1));
    const mesh=new THREE.SkinnedMesh(g,m);mesh.name='BF_Foundation_Eye_'+(i?'R':'L');source.add(mesh);mesh.bind(skeleton);return mesh;
  });
  return {source,meshes,materials:[a,b]};
}
function shader(m:THREE.MeshPhysicalMaterial){
  const s={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}} as Parameters<typeof m.onBeforeCompile>[0];
  m.onBeforeCompile(s,{} as THREE.WebGLRenderer);return s;
}
describe('V20 measured dynamic eye contact',()=>{
  it('decodes an independent contiguous, monotone aperture field',()=>{
    const b=fixture(),d=decodeEyeAperture(b.buffer);
    expect(d).not.toBe(b);expect(d).toEqual(b);b[0]=0;expect(d[0]).toBe(120);
    expect(()=>decodeEyeAperture(new ArrayBuffer(4))).toThrow('length');
  });
  it('rejects invalid interval, alpha, holes and reopening',()=>{
    for(const [off,value] of [[0,250],[2,14],[3,0],[4*50+2,0],[4*128+4*20+1,255]]){
      const b=fixture();b[off]=value;expect(()=>decodeEyeAperture(b.buffer)).toThrow();
    }
    const hole=fixture();hole.set([120,120,0,255],4*50);expect(()=>decodeEyeAperture(hole.buffer)).toThrow('trajectory');
    const b=fixture();for(let x=14;x<114;x++){b[4*(128+x)]=79;b[4*(128+x)+1]=175;}
    expect(()=>decodeEyeAperture(b.buffer)).toThrow('trajectory');
  });
  it('patches exact shader anchors only and retains the standard PBR chunks',()=>{
    const v=THREE.ShaderLib.physical.vertexShader,f=THREE.ShaderLib.physical.fragmentShader,p=eyeContactShaders(v,f)!;
    expect(p.vertex).toContain(EYE_CONTACT_ID);expect(p.fragment).toContain('bfV20Aperture');
    expect(p.fragment).toContain('#include <lights_physical_pars_fragment>');expect(p.fragment).toContain('#include <normal_fragment_maps>');
    expect(p.fragment).toContain('#include <opaque_fragment>');expect(eyeContactShaders(p.vertex,p.fragment)).toBeUndefined();
    expect(eyeContactShaders(v,f.replace('#include <color_fragment>',''))).toBeUndefined();
  });
  it('rejects an invalid resource before modifying any donor material',()=>{
    const r=root();try{
      expect(()=>installFoundationEyeContact(r.source,new ArrayBuffer(4))).toThrow('length');
      expect(r.materials.every(m=>!m.userData.foundationEyeContact)).toBe(true);
      const extra=new THREE.Mesh(new THREE.BufferGeometry(),r.materials[0]);r.source.add(extra);
      expect(()=>installFoundationEyeContact(r.source,fixture().buffer)).toThrow('Shared');
      expect(r.materials.every(m=>!m.userData.foundationEyeContact)).toBe(true);
    }finally{disposeThreeTree(r.source);}
  });
  it('shares one immutable field within the root, clamps motion and disposes once',()=>{
    const r=root(false),b=fixture();try{
      const positions=r.meshes.map(m=>m.geometry.getAttribute('position').array);
      const rig=installFoundationEyeContact(r.source,b.buffer),a=shader(r.materials[0]),z=shader(r.materials[1]),t=a.uniforms.bfV20Aperture.value as THREE.DataTexture;
      expect(t).toBe(z.uniforms.bfV20Aperture.value);expect(a.uniforms.bfV20Blink).toBe(z.uniforms.bfV20Blink);
      const data=t.image.data;if(!(data instanceof Uint8Array))throw Error('Missing aperture bytes');
      expect(data.byteLength).toBe(size);expect(data).not.toBe(b);expect(t.image.width).toBe(128);expect(t.image.height).toBe(42);expect(t.generateMipmaps).toBe(false);expect(t.colorSpace).toBe(THREE.NoColorSpace);
      for(const [input,output] of [[.375,.375],[1.5,1],[-1,0],[NaN,0]]){rig.pose(input);expect(a.uniforms.bfV20Blink.value).toBe(output);}
      rig.pose(1);rig.reset();expect(z.uniforms.bfV20Blink.value).toBe(0);
      expect(r.meshes.every((m,i)=>m.geometry.getAttribute('position').array===positions[i])).toBe(true);
      expect(()=>installFoundationEyeContact(r.source,fixture().buffer)).toThrow('scope');
      const dispose=vi.spyOn(t,'dispose');r.materials[0].dispose();expect(dispose).toHaveBeenCalledTimes(0);
      r.materials[1].dispose();r.materials[1].dispose();expect(dispose).toHaveBeenCalledTimes(1);
    }finally{disposeThreeTree(r.source);}
  });
  it('does not share mutable texture or blink state across avatars',()=>{
    const a=root(),b=root();
    try{
      const ar=installFoundationEyeContact(a.source,fixture().buffer);
      installFoundationEyeContact(b.source,fixture().buffer);
      const as=shader(a.materials[0]),bs=shader(b.materials[0]);
      expect(as.uniforms.bfV20Aperture.value).not.toBe(bs.uniforms.bfV20Aperture.value);
      ar.pose(.9);expect(as.uniforms.bfV20Blink.value).toBe(.9);expect(bs.uniforms.bfV20Blink.value).toBe(0);
    }finally{disposeThreeTree(a.source);disposeThreeTree(b.source);}
  });
});
