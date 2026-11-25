import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { avatarLookDev } from './avatarLookDev';

describe('controlled avatar studio look development',()=>{
  it('retains the complete existing production light configuration',()=>{
    expect(avatarLookDev(undefined)).toEqual({
      id:'base',toneMapping:THREE.ACESFilmicToneMapping,exposure:1.05,
      sky:0xe0e8f2,ground:0x4a3e38,hemisphere:.25,keyColor:0xfff7ef,key:2.25,
      fillColor:0xd2e2f4,fill:.60,rimColor:0xdce8f4,rim:1.6,
      fallbackIbl:.28,measuredIbl:.78,iblRotation:-.45,accentRim:true,
    });
    for(const invalid of [null,'BASE','unknown','__proto__',{},NaN])expect(avatarLookDev(invalid)).toBe(avatarLookDev('base'));
  });
  it('compares the two native tone mappers under identical achromatic direct lighting',()=>{
    const f=avatarLookDev('filmic'),n=avatarLookDev('neutral');
    expect(f.toneMapping).toBe(THREE.AgXToneMapping);
    expect(n.toneMapping).toBe(THREE.NeutralToneMapping);
    const { id:fi, toneMapping:fm, exposure:fe,...flights }=f;
    const { id:ni, toneMapping:nm, exposure:ne,...nlights }=n;
    expect(flights).toEqual(nlights);
    for(const p of [f,n]){
      expect(p.keyColor).toBe(0xffffff);expect(p.fillColor).toBe(0xffffff);
      expect(p.accentRim).toBe(false);
      expect(p.exposure).toBeGreaterThan(0);expect(p.exposure).toBeLessThan(1.5);
      expect(p.key).toBeGreaterThan(p.fill);
      expect(p.measuredIbl).toBeGreaterThan(p.fallbackIbl);
      expect(Object.isFrozen(p)).toBe(true);
    }
    expect(fi).not.toBe(ni);expect(fm).not.toBe(nm);expect(fe).not.toBe(ne);
  });
});
