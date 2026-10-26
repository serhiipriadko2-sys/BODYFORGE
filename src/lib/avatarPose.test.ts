import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyAthleticPose } from './avatarPose';

async function actualRig(filename:string) {
  const bytes = readFileSync(new URL('../../public/assets/' + filename, import.meta.url));
  const { scene:root } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  root.updateMatrixWorld(true);
  return root;
}

describe('athletic stance on the actual pinned rig', () => {
  it.each(['male-base-mesh-base_male.glb','bodyforge-athlete.glb'])('lowers both wrists without translating bones or changing feet/bind structure: %s', async (filename) => {
    const root = await actualRig(filename);
    const hands:THREE.Bone[] = [];
    root.traverse((node) => { if(node instanceof THREE.Bone && /^wrist[lr]$/i.test(node.name.replace(/[^a-z0-9]/gi,''))) hands.push(node); });
    expect(hands).toHaveLength(2);
    expect(hands.every(Boolean)).toBe(true);
    const before = hands.map((bone) => bone!.getWorldPosition(new THREE.Vector3()));
    const local = new Map<THREE.Object3D, THREE.Vector3>();
    root.traverse((node) => local.set(node, node.position.clone()));
    expect(applyAthleticPose(root)).toBe(true);
    const after = hands.map((bone) => bone!.getWorldPosition(new THREE.Vector3()));
    after.forEach((point, index) => {
      expect(point.y).toBeLessThan(before[index].y - .04);
      expect(Math.abs(point.x)).toBeLessThan(Math.abs(before[index].x));
      expect(point.toArray().every(Number.isFinite)).toBe(true);
    });
    root.traverse((node) => expect(node.position.equals(local.get(node)!)).toBe(true));
    const once = after.map((point) => point.clone());
    expect(applyAthleticPose(root)).toBe(false);
    hands.forEach((bone, index) => expect(bone!.getWorldPosition(new THREE.Vector3()).distanceTo(once[index])).toBeLessThan(1e-9));
  });
  it('leaves an incompatible replacement rig untouched', () => {
    const root = new THREE.Group();
    expect(applyAthleticPose(root)).toBe(false);
    expect(root.children).toHaveLength(0);
  });
});
