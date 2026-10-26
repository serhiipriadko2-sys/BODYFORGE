import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAvatarHair } from './avatarHair';
import { HAIR_STYLES } from './avatarLook';
import { disposeThreeTree } from './threeResources';

describe('bounded low-poly haircut geometry', () => {
  it('produces finite visible geometry for all three free styles', () => {
    for (const { id } of HAIR_STYLES) {
      const mat = new THREE.MeshStandardMaterial({ color: '#543b34' });
      const root = createAvatarHair(id, mat);
      const meshes = root.children.filter((mesh) => mesh instanceof THREE.Mesh);
      expect(root.name).toBe('hair-style-' + id);
      expect(meshes.length).toBe(1); // One continuous shell, no rounded detached hair strands.
      const box = new THREE.Box3().setFromObject(root);
      expect(box.min.x).toBeGreaterThan(-.5);
      expect(box.max.x).toBeLessThan(.5);
      expect(box.max.y).toBeLessThan(5);
      expect(box.min.y).toBeGreaterThan(4.35);
      expect(box.max.y).toBeGreaterThan(id === 'buzz' ? 4.68 : 4.75);
      for (const mesh of meshes) {
        expect((mesh as THREE.Mesh).material).toBe(mat);
        expect((mesh as THREE.Mesh).geometry.attributes.position.count).toBeLessThan(700);
      }
      disposeThreeTree(root);
    }
  });
  it('repositions the hairstyle only in depth for the SVG-independent fallback', () => {
    const mat = new THREE.MeshStandardMaterial();
    const a = createAvatarHair('crop', mat, 0);
    const b = createAvatarHair('crop', mat, .064);
    const before = new THREE.Box3().setFromObject(a);
    const after = new THREE.Box3().setFromObject(b);
    expect(after.min.z - before.min.z).toBeCloseTo(.064, 3);
    disposeThreeTree(a);
    disposeThreeTree(b);
  });
});
