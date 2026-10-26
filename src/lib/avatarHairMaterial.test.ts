import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createAvatarHairMaterial } from './avatarHairMaterial';
import { createAvatarHair } from './avatarHair';
import { disposeThreeTree } from './threeResources';

describe('local opaque hair fibres', () => {
  it('keeps a bounded deterministic non-color relief map without alpha or texture requests', () => {
    const a = createAvatarHairMaterial('#d0d6e1');
    const b = createAvatarHairMaterial('#191b21');
    const map = a.bumpMap as THREE.DataTexture;
    const image = map.image as { data: Uint8Array; width: number; height: number };
    expect(image.data.byteLength).toBeLessThanOrEqual(32768);
    expect(image.data).toEqual((b.bumpMap as THREE.DataTexture).image.data);
    expect(map.colorSpace).toBe(THREE.NoColorSpace);
    expect(map.generateMipmaps).toBe(true);
    expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(new Set(image.data.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(20);
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    expect(a.transparent).toBe(false);
    expect(a.alphaMap).toBeNull();
    expect(a.bumpScale).toBeGreaterThan(0);
    expect(a.bumpScale).toBeLessThan(.003);
    expect(a.roughness).toBeGreaterThan(.7);
    expect(a.color.getHexString()).toBe('d0d6e1');
    a.bumpMap!.dispose(); b.bumpMap!.dispose(); a.dispose(); b.dispose();
  });

  it('releases the one shared texture once including hidden haircut meshes', () => {
    const material = createAvatarHairMaterial('#191b21');
    const textureDispose = vi.spyOn(material.bumpMap!, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const root = new THREE.Group();
    for (const style of ['crop', 'swept', 'buzz'] as const) {
      const hair = createAvatarHair(style, material);
      hair.visible = style === 'crop';
      root.add(hair);
    }
    disposeThreeTree(root);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
