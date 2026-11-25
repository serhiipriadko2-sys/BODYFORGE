import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createAvatarMaterials } from './avatarMaterials';
import { applyAvatarDetailMap } from './avatarDetailMaps';
import { disposeThreeTree } from './threeResources';

describe('baked normal atlas ownership', () => {
  it('replaces only the owned normal texture and releases the superseded atlas once', () => {
    const materials = createAvatarMaterials();
    const original = new THREE.Texture(), baked = new THREE.Texture(), orm = new THREE.Texture();
    const bump = materials.body.bumpMap;
    const oldDispose = vi.spyOn(original, 'dispose');
    const newDispose = vi.spyOn(baked, 'dispose');
    const ormDispose = vi.spyOn(orm, 'dispose');
    applyAvatarDetailMap(materials, 'normal', original);
    applyAvatarDetailMap(materials, 'orm', orm);
    applyAvatarDetailMap(materials, 'normal', baked);
    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(materials.body.normalMap).toBe(baked);
    expect(materials.body.bumpMap).toBe(bump);
    expect(materials.body.aoMap).toBe(orm);
    expect(materials.body.roughnessMap).toBe(orm);
    expect(ormDispose).not.toHaveBeenCalled();
    expect(newDispose).not.toHaveBeenCalled();
    applyAvatarDetailMap(materials, 'normal', baked);
    expect(newDispose).not.toHaveBeenCalled();
    expect(baked.colorSpace).toBe(THREE.NoColorSpace);
    expect(baked.flipY).toBe(false);
    const root = new THREE.Group();
    Object.values(materials).forEach(m => root.add(new THREE.Mesh(new THREE.BoxGeometry(), m)));
    disposeThreeTree(root);
    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(newDispose).toHaveBeenCalledTimes(1);
    expect(ormDispose).toHaveBeenCalledTimes(1);
  });
});
