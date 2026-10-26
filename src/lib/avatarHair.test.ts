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
      expect(meshes.length).toBe(1); // Locks and scalp share one mesh/draw call.
      const box = new THREE.Box3().setFromObject(root);
      expect(box.min.x).toBeGreaterThan(-.5);
      expect(box.max.x).toBeLessThan(.5);
      expect(box.max.y).toBeLessThan(5);
      expect(box.min.y).toBeGreaterThan(4.35);
      expect(box.max.y).toBeGreaterThan(id === 'buzz' ? 4.68 : 4.75);
      for (const mesh of meshes) {
        expect((mesh as THREE.Mesh).material).toBe(mat);
        expect((mesh as THREE.Mesh).geometry.attributes.position.count).toBeLessThan(5000);
        expect((mesh as THREE.Mesh).geometry.attributes.position.count).toBeGreaterThan(id === 'buzz' ? 400 : 1500);
        expect(Array.from((mesh as THREE.Mesh).geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      }
      disposeThreeTree(root);
    }
  });
  it('keeps the forehead boundary above the former helmet band', () => {
    for (const id of ['buzz', 'crop', 'swept'] as const) {
      const root = createAvatarHair(id, new THREE.MeshStandardMaterial());
      const mesh = root.children[0] as THREE.Mesh;
      const positions = mesh.geometry.getAttribute('position');
      const uv = mesh.geometry.getAttribute('uv');
      const fringe: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        // The cap boundary retains V=0. Locks' roots lie at the back/crown,
        // outside this frontal window, so this measures the visible hairline.
        if (uv.getY(i) === 0 && positions.getZ(i) > .24 && Math.abs(positions.getX(i)) < .14) {
          fringe.push(positions.getY(i));
        }
      }
      expect(fringe.length).toBeGreaterThan(3);
      const base = id === 'buzz' ? 4.620 : 4.576;
      expect(Math.min(...fringe) - base).toBeGreaterThan(id === 'swept' ? .055 : id === 'crop' ? .035 : .020);
      expect(Math.max(...fringe) - Math.min(...fringe)).toBeGreaterThan(.006);
      disposeThreeTree(root);
    }
  });
  it('creates deterministic, distinct silhouettes with finite normals and fibre-ready UVs', () => {
    const silhouettes = new Map<string, number>();
    for (const { id } of HAIR_STYLES) {
      const a = createAvatarHair(id, new THREE.MeshStandardMaterial());
      const b = createAvatarHair(id, new THREE.MeshStandardMaterial());
      const geometry = (a.children[0] as THREE.Mesh).geometry;
      const other = (b.children[0] as THREE.Mesh).geometry;
      expect(geometry.attributes.position.array).toEqual(other.attributes.position.array);
      const normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      expect(normal.count).toBe(geometry.attributes.position.count);
      expect(uv.count).toBe(normal.count);
      expect(Array.from(normal.array).every(Number.isFinite)).toBe(true);
      // SphereGeometry offsets its collapsed pole U by half a texel.
      expect(Array.from(uv.array).every((v) => Number.isFinite(v) && v >= -.02 && v <= 1.02)).toBe(true);
      const bounds = new THREE.Box3().setFromObject(a);
      silhouettes.set(id, bounds.max.y);
      disposeThreeTree(a); disposeThreeTree(b);
    }
    // The swept style is a short quiff, not a tall comb. Height is bounded;
    // style identity also comes from coverage, curls and root-to-tip direction.
    expect(silhouettes.get('swept')! - silhouettes.get('crop')!).toBeGreaterThan(.025);
    expect(new Set(silhouettes.values()).size).toBe(3);
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
