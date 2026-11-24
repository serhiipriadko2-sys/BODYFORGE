import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyAvatarFabricMap, createAvatarFabric, createAvatarTextileMaterial } from './avatarFabric';
import { disposeThreeTree } from './threeResources';

describe('measured textile PBR', () => {
  it('preserves outfit tint and shares two maps only across shirt and shorts', () => {
    const weave = createAvatarFabric();
    const original = new THREE.MeshStandardMaterial({color:'#25374a',side:THREE.DoubleSide});
    const shirt = new THREE.SkinnedMesh(new THREE.BoxGeometry(), createAvatarTextileMaterial(original,weave));
    const shorts = new THREE.SkinnedMesh(new THREE.BoxGeometry(), createAvatarTextileMaterial(original,weave));
    const shoes = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({bumpMap:weave}));
    shirt.name='BODYFORGE_Shirt'; shorts.name='BODYFORGE_Shorts'; shoes.name='BODYFORGE_Shoes';
    const normal = new THREE.Texture(), roughness = new THREE.Texture();
    const group = new THREE.Group();
    group.add(shirt,shorts,shoes);
    const sm=shirt.material as THREE.MeshPhysicalMaterial, hm=shorts.material as THREE.MeshPhysicalMaterial;
    expect(sm.color.equals(original.color)).toBe(true);
    expect(sm.side).toBe(THREE.DoubleSide);
    expect(sm.sheen).toBeGreaterThan(0);
    expect(applyAvatarFabricMap([shirt,shorts,shoes],'normal',normal)).toBe(true);
    expect(applyAvatarFabricMap([shirt,shorts,shoes],'roughness',roughness)).toBe(true);
    expect(sm.normalMap).toBe(normal);
    expect(hm.normalMap).toBe(normal);
    expect(sm.roughnessMap).toBe(roughness);
    expect(hm.roughnessMap).toBe(roughness);
    expect((shoes.material as THREE.MeshStandardMaterial).normalMap).toBeNull();
    expect(normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(normal.repeat.toArray()).toEqual([8,8]);
    const disposeNormal=vi.fn(), disposeRough=vi.fn(), disposeWeave=vi.fn();
    normal.addEventListener('dispose',disposeNormal);
    roughness.addEventListener('dispose',disposeRough);
    weave.addEventListener('dispose',disposeWeave);
    disposeThreeTree(group);
    expect(disposeNormal).toHaveBeenCalledTimes(1);
    expect(disposeRough).toHaveBeenCalledTimes(1);
    expect(disposeWeave).toHaveBeenCalledTimes(1);
    original.dispose();
  });
  it('refuses a texture if the compatible garment is absent', () => {
    const texture=new THREE.Texture();
    expect(applyAvatarFabricMap([],'normal',texture)).toBe(false);
    texture.dispose();
  });
});
