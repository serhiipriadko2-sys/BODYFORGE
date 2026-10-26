import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyAvatarGrowth } from './avatarGrowth';
import { applyAthleticPose } from './avatarPose';
import { disposeThreeTree } from './threeResources';

const MAX = { arms: 5, core: 5, legs: 5, back: 5 };
const PROTECTED = ['head', 'wristL', 'wristR', 'footL', 'footR'];
const LINEAR = [0, 1, 2, 4, 5, 6, 8, 9, 10];

async function fixture(file: string) {
  const bytes = readFileSync('public/assets/' + file);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  applyAthleticPose(gltf.scene);
  const parent = new THREE.Group();
  parent.add(gltf.scene);
  return { root: gltf.scene, parent };
}

function matrices(root: THREE.Object3D): Map<string, THREE.Matrix4> {
  root.updateWorldMatrix(true, true);
  return new Map(PROTECTED.map((name) => [name, root.getObjectByName(name)!.matrixWorld.clone()]));
}

function expectLinear(actual: THREE.Matrix4, expected: THREE.Matrix4) {
  for (const index of LINEAR) expect(actual.elements[index]).toBeCloseTo(expected.elements[index], 9);
}

function eyeShape(root: THREE.Object3D): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const eyes = root.getObjectByName('BODYFORGE_Eyes') ?? root.getObjectByName('base_male_bodyhigh-poly');
  if (!(eyes instanceof THREE.SkinnedMesh)) throw new Error('Pinned eye surface unavailable');
  const vertices = Array.from({ length: eyes.geometry.getAttribute('position').count }, (_, index) =>
    eyes.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(eyes.matrixWorld));
  const centre = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).divideScalar(vertices.length);
  return vertices.map((vertex) => vertex.sub(centre));
}

describe.each(['bodyforge-athlete.glb', 'male-base-mesh-base_male.glb'])('protected anatomy growth: %s', (file) => {
  it('grows torso and arms while preserving the complete head, wrist and foot world basis', async () => {
    const { root } = await fixture(file);
    applyAvatarGrowth(root, {});
    const before = matrices(root);
    const chest = root.getObjectByName('spine03')!.matrixWorld.determinant();
    const arm = root.getObjectByName('upperarm01L')!.matrixWorld.determinant();
    applyAvatarGrowth(root, MAX);
    for (const [name, matrix] of matrices(root)) expectLinear(matrix, before.get(name)!);
    expect(root.getObjectByName('spine03')!.matrixWorld.determinant() / chest).toBeGreaterThan(1.1);
    expect(root.getObjectByName('upperarm01L')!.matrixWorld.determinant() / arm).toBeGreaterThan(1.1);
    expect(new THREE.Vector3().setFromMatrixPosition(root.getObjectByName('head')!.matrixWorld)
      .distanceTo(new THREE.Vector3().setFromMatrixPosition(before.get('head')!))).toBeGreaterThan(.001);
    disposeThreeTree(root);
  });

  it('does not accumulate compensation and restores zero growth', async () => {
    const { root } = await fixture(file);
    applyAvatarGrowth(root, {});
    const before = matrices(root);
    applyAvatarGrowth(root, MAX);
    const grown = matrices(root);
    for (let repeat = 0; repeat < 4; repeat++) applyAvatarGrowth(root, MAX);
    for (const [name, matrix] of matrices(root)) {
      matrix.elements.forEach((value, index) => expect(value).toBeCloseTo(grown.get(name)!.elements[index], 9));
    }
    applyAvatarGrowth(root, {});
    for (const [name, matrix] of matrices(root)) {
      matrix.elements.forEach((value, index) => expect(value).toBeCloseTo(before.get(name)!.elements[index], 9));
    }
    disposeThreeTree(root);
  });

  it('preserves the actual skinned eye shape through growth, not only the head scale property', async () => {
    const { root } = await fixture(file);
    applyAvatarGrowth(root, {});
    const before = eyeShape(root);
    applyAvatarGrowth(root, MAX);
    const after = eyeShape(root);
    expect(after.length).toBe(before.length);
    after.forEach((vertex, index) => expect(vertex.distanceTo(before[index])).toBeLessThan(1e-8));
    disposeThreeTree(root);
  });

  it('recomputes the baseline under changed yaw, build and normalization without changing geometry or bind weights', async () => {
    const { root, parent } = await fixture(file);
    const source = new Map<THREE.SkinnedMesh, { positions: number[]; weights: number[] }>();
    root.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) source.set(node, {
        positions: Array.from(node.geometry.getAttribute('position').array),
        weights: Array.from(node.geometry.getAttribute('skinWeight').array),
      });
    });
    applyAvatarGrowth(root, MAX);
    parent.rotation.set(.13, 1.2, -.09);
    parent.scale.set(1.055, 1, .97);
    root.scale.setScalar(2.6);
    root.position.set(.2, .3, -.4);
    applyAvatarGrowth(root, {});
    const before = matrices(root);
    applyAvatarGrowth(root, MAX);
    for (const [name, matrix] of matrices(root)) expectLinear(matrix, before.get(name)!);
    for (const [mesh, original] of source) {
      expect(Array.from(mesh.geometry.getAttribute('position').array)).toEqual(original.positions);
      expect(Array.from(mesh.geometry.getAttribute('skinWeight').array)).toEqual(original.weights);
    }
    disposeThreeTree(root);
  });
});
