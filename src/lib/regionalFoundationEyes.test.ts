import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFoundationEyeTexture, eyeAngles, foundationEyePigment, foundationEyeUV } from './regionalFoundationEyes';

describe('V8 donor eye projection and original pigment', () => {
  it('maps the optical pole, angular radius and rear pole safely', () => {
    expect(foundationEyeUV(0,0,1)).toEqual([.5,.5]);
    expect(foundationEyeUV(0,0,-1)).toEqual([.99,.5]);
    expect(() => foundationEyeUV(0,0,0)).toThrow();
    for (let i=0;i<360;i+=3) {
      const t=i*Math.PI/180;
      const uv=foundationEyeUV(Math.sin(t),0,Math.cos(t));
      expect(uv.every(x=>Number.isFinite(x)&&x>=0&&x<=1)).toBe(true);
    }
    const a=26.5*Math.PI/180;
    expect(foundationEyeUV(Math.sin(a),0,Math.cos(a))[0]).toBeCloseTo(.5+.49*26.5/110,8);
  });
  it('uses the audited pitch and bounded conjugate yaw, with slight convergence', () => {
    expect(eyeAngles('L',0)).toEqual([6,-1]);
    expect(eyeAngles('R',0)).toEqual([6,1]);
    expect(eyeAngles('L',100)).toEqual([6,5]);
    expect(eyeAngles('R',-100)).toEqual([6,-5]);
    expect(eyeAngles('L',NaN)).toEqual([6,-1]);
  });
  it('has a dark pupil, irregular brown iris, dark limbus and ivory sclera', () => {
    expect(foundationEyePigment(0,0)).toEqual([12,10,9]);
    const iris=foundationEyePigment(.3,1),rim=foundationEyePigment(.45,1),white=foundationEyePigment(.8,1);
    expect(iris[0]).toBeGreaterThan(iris[1]);
    expect(iris[1]).toBeGreaterThan(iris[2]);
    expect(rim[0]).toBeLessThan(iris[0]);
    expect(white[0]).toBeGreaterThan(170);
    expect(new Set(Array.from({length:360},(_,i)=>foundationEyePigment(.3,i*Math.PI/180).join(','))).size).toBeGreaterThan(60);
  });
  it('creates a deterministic bounded map without shared ownership between roots', () => {
    expect(()=>createFoundationEyeTexture(128)).toThrow();
    const a=createFoundationEyeTexture(256),b=createFoundationEyeTexture(256);
    try {
      const aData=a.image.data,bData=b.image.data;
      if(!(aData instanceof Uint8Array)||!(bData instanceof Uint8Array)) throw Error('Missing pigment data');
      expect(a).not.toBe(b);
      expect(aData).not.toBe(bData);
      expect(a.image.width).toBe(256);
      expect(aData.byteLength).toBe(256*256*4);
      expect(bData.byteLength).toBe(aData.byteLength);
      expect(aData.every((value,i)=>value===bData[i])).toBe(true);
      expect(a.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(a.generateMipmaps).toBe(true);
      for(let i=3;i<aData.length;i+=4) if(aData[i]!==255) throw Error('alpha drift');
    } finally { a.dispose(); b.dispose(); }
  });
});
