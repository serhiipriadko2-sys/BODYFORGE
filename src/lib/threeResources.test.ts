import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeThreeTree } from './threeResources';

describe('Three.js resources of a removed avatar tree', () => {
  it('releases shared geometry, materials, textures, and skeleton once', () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    const first = new THREE.SkinnedMesh(geometry, material);
    const second = new THREE.SkinnedMesh(geometry, material);
    first.bind(skeleton);
    second.bind(skeleton);
    const root = new THREE.Group();
    root.add(first, second);
    const textureDisposal = vi.spyOn(texture, 'dispose');
    const materialDisposal = vi.spyOn(material, 'dispose');
    const geometryDisposal = vi.spyOn(geometry, 'dispose');
    const skeletonDisposal = vi.spyOn(skeleton, 'dispose');
    disposeThreeTree(root);
    expect(textureDisposal).toHaveBeenCalledTimes(1);
    expect(materialDisposal).toHaveBeenCalledTimes(1);
    expect(geometryDisposal).toHaveBeenCalledTimes(1);
    expect(skeletonDisposal).toHaveBeenCalledTimes(1);
  });

  it('does not dispose resources belonging to a different scene', () => {
    const inside = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const outside = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const outsideDispose = vi.spyOn(outside.geometry, 'dispose');
    const ownDispose = vi.spyOn(inside.geometry, 'dispose');
    const root = new THREE.Group();
    root.add(inside);
    disposeThreeTree(root);
    expect(ownDispose).toHaveBeenCalledOnce();
    expect(outsideDispose).not.toHaveBeenCalled();
    outside.geometry.dispose();
    (outside.material as THREE.Material).dispose();
  });
});
