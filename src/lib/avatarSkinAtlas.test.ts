import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { acceptsSkinAtlas, avatarSkinAtlases, DERMAL_ATLAS, PERIORAL_ATLAS } from './avatarSkinAtlas';

function dimensions(jpeg: Buffer): number[] {
  if (jpeg.readUInt16BE(0) !== 0xffd8) throw Error('Not JPEG');
  for (let p = 2; p+9 < jpeg.length;) {
    if (jpeg[p] !== 0xff) throw Error('Malformed JPEG');
    const marker = jpeg[p+1], size = jpeg.readUInt16BE(p+2);
    if (size < 2 || p+2+size > jpeg.length) throw Error('Invalid JPEG segment');
    if ([0xc0,0xc1,0xc2].includes(marker)) return [jpeg.readUInt16BE(p+7), jpeg.readUInt16BE(p+5)];
    p += 2+size;
  }
  throw Error('No JPEG dimensions');
}
describe('bounded perioral skin atlas', () => {
  it('prefers the fitted atlas only on the detailed compact rig and preserves fallback order', () => {
    expect(avatarSkinAtlases(true,true)).toEqual([PERIORAL_ATLAS, DERMAL_ATLAS, '/assets/athlete-skin-portrait.jpg', '/assets/athlete-skin-detail.jpg']);
    expect(avatarSkinAtlases(false,true)).toEqual(['/assets/athlete-skin-detail.jpg']);
    expect(avatarSkinAtlases(false,false)).toEqual(['/assets/athlete-skin.jpg']);
    expect(avatarSkinAtlases(true,false)).toEqual(['/assets/athlete-skin.jpg']);
  });
  it('accepts the correct decoded size and rejects missing or malformed images', () => {
    expect(acceptsSkinAtlas(PERIORAL_ATLAS,{width:2048,height:2048})).toBe(true);
    expect(acceptsSkinAtlas(PERIORAL_ATLAS,{width:1024,height:2048})).toBe(false);
    expect(acceptsSkinAtlas(PERIORAL_ATLAS,null)).toBe(false);
    expect(acceptsSkinAtlas('/assets/athlete-skin.jpg',{width:1024,height:1024})).toBe(true);
  });
  it('pins both the actual new JPEG and the original reserve without increasing resolution', () => {
    const candidate = readFileSync('public'+PERIORAL_ATLAS);
    const prior = readFileSync('public'+DERMAL_ATLAS);
    expect(dimensions(candidate)).toEqual([2048,2048]);
    expect(dimensions(prior)).toEqual([2048,2048]);
    expect(createHash('sha256').update(candidate).digest('hex')).toBe('8cb93dfdb95c20fcb73d5eb9b5e3f0f9e636855cf44733074cec259c87eb19c0');
    expect(createHash('sha256').update(prior).digest('hex')).toBe('3d5fd26f0241d9f21097b619421b0cca3352b4398e2bdbb0c67bc08bb0fe14ab');
    expect(candidate.length).toBeLessThan(prior.length*1.05);
  });
});
