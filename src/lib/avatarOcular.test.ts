import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { applyAvatarGrowth } from './avatarGrowth';
import { installAvatarOcularDetail, ownAvatarOcularImages } from './avatarOcular';
import { disposeThreeTree } from './threeResources';

const nearby = 'public/assets/';

async function eyeSurface() {
  const bytes = Uint8Array.from(readFileSync(nearby + 'bodyforge-athlete-efficient.glb'));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer, '');
  const eyes = scene.getObjectByName('BODYFORGE_Eyes');
  if (!(eyes instanceof THREE.SkinnedMesh)) throw new Error('The pinned model needs rigged eyes');
  return { scene, eyes };
}

async function ocularDonor() {
  const bytes = readFileSync(nearby + 'bodyforge-ocular-detail.glb');
  const jsonLength = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  expect(doc.images).toHaveLength(2);
  expect(doc.materials[0].extensions.KHR_materials_clearcoat.clearcoatTexture.index).toEqual(1);
  expect(doc.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.index).toEqual(1);
  // Browser E2E covers actual image decoding and shading. For this Node
  // regression parse the exact exported mesh, with only the image slots mocked.
  delete doc.meshes[0].primitives[0].material;
  for (const key of ['materials', 'images', 'textures', 'extensionsUsed']) delete doc[key];
  const content = JSON.stringify(doc);
  const json = Buffer.from(content.padEnd((content.length + 3) & ~3, ' '));
  const bin = bytes.subarray(20 + jsonLength);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(20 + json.length + bin.length, 8);
  header.writeUInt32LE(json.length, 12);
  const glb = Uint8Array.from(Buffer.concat([header, json, bin]));
  const { scene } = await new GLTFLoader().parseAsync(glb.buffer, '');
  const surface = scene.children[0] as THREE.Mesh;
  const material = new THREE.MeshPhysicalMaterial({ map: new THREE.Texture(), clearcoatMap: new THREE.Texture() });
  material.roughnessMap = material.clearcoatRoughnessMap = material.clearcoatMap;
  (surface.material as THREE.Material).dispose();
  surface.material = material;
  return { scene, surface, material };
}

describe('BODYFORGE cornea and iris detail', () => {
  it('fits the exact exported eye geometry to the actual athlete and preserves the whole rig', async () => {
    const { scene, eyes } = await eyeSurface();
    const donor = await ocularDonor();
    try {
      const skeleton = eyes.skeleton;
      const bindMatrix = eyes.bindMatrix.clone();
      const joints = eyes.geometry.getAttribute('skinIndex');
      const weights = eyes.geometry.getAttribute('skinWeight');
      const position = eyes.geometry.getAttribute('position');
      const primaryMaterial = eyes.material;
      if (Array.isArray(primaryMaterial)) throw new Error('Expected one material');
      let released = false;
      primaryMaterial.addEventListener('dispose', () => { released = true; });
      expect(installAvatarOcularDetail(eyes, donor.scene)).toBe(true);
      expect(released).toBe(true);
      expect(donor.scene.children).toHaveLength(0);
      expect(eyes.material).toBe(donor.material);
      expect(eyes.skeleton).toBe(skeleton);
      expect(eyes.bindMatrix.equals(bindMatrix)).toBe(true);
      expect(eyes.geometry.getAttribute('skinIndex')).toBe(joints);
      expect(eyes.geometry.getAttribute('skinWeight')).toBe(weights);
      const grown = eyes.geometry.getAttribute('position');
      const lift = Array.from({ length: grown.count }, (_, i) => grown.getZ(i) - position.getZ(i));
      expect(lift.filter(value => value > .0001).length).toBeGreaterThan(100);
      expect(Math.max(...lift)).toBeLessThanOrEqual(.00084);
      const vertices = () => {
        scene.updateMatrixWorld(true);
        const points = Array.from({ length: grown.count }, (_, i) =>
          eyes.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(eyes.matrixWorld));
        const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
        return points.map(point => point.sub(center));
      };
      const before = vertices();
      applyAvatarGrowth(scene, { arms: 5, core: 5, legs: 5, back: 5 });
      expect(Math.max(...vertices().map((point, i) => point.distanceTo(before[i])))).toBeLessThan(1e-8);
    } finally {
      disposeThreeTree(donor.scene);
      disposeThreeTree(scene);
    }
  });

  it.each(['reordered triangle', 'excessive lift', 'invalid uv'] as const)('rejects %s without swapping the live mesh', async defect => {
    const { scene, eyes } = await eyeSurface();
    const donor = await ocularDonor();
    try {
      const geometry = eyes.geometry, material = eyes.material;
      const fit = donor.surface.geometry;
      if (defect === 'reordered triangle') fit.index!.setX(0, (fit.index!.getX(0) + 1) % 1076);
      if (defect === 'excessive lift') fit.getAttribute('position').setZ(0, .16);
      if (defect === 'invalid uv') fit.getAttribute('uv').setX(0, NaN);
      expect(installAvatarOcularDetail(eyes, donor.scene)).toBe(false);
      expect(eyes.geometry).toBe(geometry);
      expect(eyes.material).toBe(material);
      expect(donor.surface.parent).toBe(donor.scene);
    } finally {
      disposeThreeTree(donor.scene);
      disposeThreeTree(scene);
    }
  });

  it('closes shared source bitmaps once when their donor material is disposed', () => {
    const previous = globalThis.ImageBitmap;
    class Bitmap {
      closes = 0;
      close() { this.closes++; }
    }
    globalThis.ImageBitmap = Bitmap as unknown as typeof ImageBitmap;
    try {
      const image = new Bitmap();
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshPhysicalMaterial({
        map: new THREE.Texture(image as unknown as ImageBitmap),
        clearcoatMap: new THREE.Texture(image as unknown as ImageBitmap),
      }));
      const group = new THREE.Group();
      group.add(mesh);
      ownAvatarOcularImages(group);
      expect(image.closes).toBe(0);
      disposeThreeTree(group);
      expect(image.closes).toBe(1);
    } finally {
      if (previous) globalThis.ImageBitmap = previous;
      else Reflect.deleteProperty(globalThis, 'ImageBitmap');
    }
  });
});
