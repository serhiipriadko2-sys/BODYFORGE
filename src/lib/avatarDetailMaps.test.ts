import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createAvatarMaterials } from './avatarMaterials';
import { applyAvatarDetailMap } from './avatarDetailMaps';
import { disposeThreeTree } from './threeResources';

describe('bounded skin and eye PBR maps', () => {
  it('uses glTF UV orientation and separates color from numeric maps', () => {
    const materials = createAvatarMaterials();
    const normal = new THREE.Texture(), orm = new THREE.Texture(), eyes = new THREE.Texture();
    applyAvatarDetailMap(materials, 'normal', normal);
    applyAvatarDetailMap(materials, 'orm', orm);
    applyAvatarDetailMap(materials, 'eyes', eyes);
    expect(normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(orm.colorSpace).toBe(THREE.NoColorSpace);
    expect(eyes.colorSpace).toBe(THREE.SRGBColorSpace);
    expect([normal, orm, eyes].every((texture) => texture.flipY === false)).toBe(true);
    expect(materials.body.normalMap).toBe(normal);
    expect(materials.body.normalScale.x).toBeLessThan(1);
    expect(materials.body.aoMap).toBe(orm);
    expect(materials.body.roughnessMap).toBe(orm);
    expect(materials.body.roughness).toBe(1);
    expect(materials.body.aoMapIntensity).toBeLessThan(1);
    expect(materials.eyes.map).toBe(eyes);
    expect(materials.eyes.vertexColors).toBe(false);
    const root = new THREE.Group();
    Object.values(materials).forEach((material) => root.add(new THREE.Mesh(new THREE.BoxGeometry(), material)));
    const sharedDispose = vi.spyOn(orm, 'dispose');
    disposeThreeTree(root);
    expect(sharedDispose).toHaveBeenCalledTimes(1);
  });
});
