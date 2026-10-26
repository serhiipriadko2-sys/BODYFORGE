import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAvatarMaterials, importedSurfaceRole, paintAvatarEyes, tintAvatarLips, tintAvatarNails } from './avatarMaterials';
import { disposeThreeTree } from './threeResources';

describe('anatomical materials for the pinned CC0 rig', () => {
  it('recognizes actual eye, lip and nail surfaces without classifying unknown replacements', async () => {
    const bytes = readFileSync('public/assets/male-base-mesh-base_male.glb');
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(data, '');
    const roles: Record<string, string> = {};
    gltf.scene.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) roles[node.name] = importedSurfaceRole(node.name, node.geometry);
    });
    expect(roles).toEqual({
      base: 'body', base_1: 'body', base_2: 'lips', base_3: 'nails',
      base_4: 'nails', base_5: 'body', 'base_male_bodyhigh-poly': 'eyes',
    });
    const unknown = new THREE.BoxGeometry(1, 1, 1);
    expect(importedSurfaceRole('base_male_bodyhigh-poly', unknown)).toBe('body');
    expect(importedSurfaceRole('some-new-eye-mesh', unknown)).toBe('body');
    unknown.dispose();
    disposeThreeTree(gltf.scene);
  });

  it('paints independent sclera, iris and pupil while preserving UVs and skin weights', () => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      .030, 1.676, .146,
      .035, 1.676, .145,
      .041, 1.676, .141,
      -.030, 1.676, .146,
      .030, 1.676, .120,
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const weights = new THREE.BufferAttribute(new Float32Array(20), 4);
    const uvs = new THREE.BufferAttribute(new Float32Array(10), 2);
    geometry.setAttribute('skinWeight', weights);
    geometry.setAttribute('uv', uvs);
    paintAvatarEyes(geometry);
    const colors = geometry.getAttribute('color');
    expect(colors.getX(0)).toBeLessThan(colors.getX(1));
    expect(colors.getX(1)).toBeLessThan(colors.getX(2));
    expect(colors.getX(0)).toBeCloseTo(colors.getX(3), 5);
    expect(colors.getX(4)).toBeGreaterThan(colors.getX(0));
    paintAvatarEyes(geometry);
    expect(geometry.getAttribute('color')).toBe(colors);
    expect(geometry.getAttribute('position').array).toBe(positions);
    expect(geometry.getAttribute('skinWeight')).toBe(weights);
    expect(geometry.getAttribute('uv')).toBe(uvs);
    geometry.dispose();
  });

  it('uses one small local deterministic texture and disposes shared resources once', () => {
    const materials = createAvatarMaterials();
    expect(materials.body.vertexColors).toBe(true);
    expect(materials.body.bumpMap).toBeInstanceOf(THREE.DataTexture);
    const image = materials.body.bumpMap?.image as {width:number;height:number;data:Uint8Array};
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(materials.body.bumpMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(materials.body.bumpScale).toBeLessThan(.003);
    expect(materials.eyes.clearcoat).toBeGreaterThan(0);
    expect(materials.eyes.roughness).toBeLessThan(materials.body.roughness);
    expect(materials.lips.vertexColors).toBe(true);
    const second = createAvatarMaterials();
    expect(image.data).toEqual((second.body.bumpMap?.image as {data:Uint8Array}).data);

    let disposed = 0;
    materials.body.bumpMap?.addEventListener('dispose', () => { disposed++; });
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    for (const material of [...Object.values(materials), materials.body]) group.add(new THREE.Mesh(geometry, material));
    disposeThreeTree(group);
    expect(disposed).toBe(1);
    const secondGroup = new THREE.Group();
    for (const material of Object.values(second)) secondGroup.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    disposeThreeTree(secondGroup);
  });

  it('tints nails from the selected skin tone without changing the mesh', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 1, 1, 0]), 3));
    tintAvatarNails(geometry, '#c59473');
    const colors = geometry.getAttribute('color');
    const first = colors.getX(0);
    tintAvatarNails(geometry, '#50372f');
    expect(geometry.getAttribute('color')).toBe(colors);
    expect(colors.getX(0)).toBeLessThan(first);
    expect(colors.getX(0)).toEqual(colors.getX(1));
    geometry.dispose();
  });

  it('keeps the verified lip surface skin-aware instead of recoloring it as white teeth', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1.60, .16]), 3));
    tintAvatarLips(geometry, '#c59473');
    const colors = geometry.getAttribute('color');
    const initial = colors.getX(0);
    const skin = new THREE.Color('#c59473');
    expect(colors.getX(0)).toBeLessThan(skin.r);
    expect(colors.getY(0)).toBeLessThan(skin.g);
    tintAvatarLips(geometry, '#50372f');
    expect(geometry.getAttribute('color')).toBe(colors);
    expect(colors.getX(0)).toBeLessThan(initial);
    geometry.dispose();
  });

  it('actually creates both dark pupils and light sclera on the pinned eye topology', async () => {
    const bytes = readFileSync('public/assets/male-base-mesh-base_male.glb');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const eyes = gltf.scene.getObjectByName('base_male_bodyhigh-poly') as THREE.SkinnedMesh;
    paintAvatarEyes(eyes.geometry);
    const colors = eyes.geometry.getAttribute('color');
    const red = Array.from({ length: colors.count }, (_, i) => colors.getX(i));
    expect(red.filter((value) => value < .02).length).toBeGreaterThan(5);
    expect(red.filter((value) => value > .6).length).toBeGreaterThan(100);
    expect(red.filter((value) => value >= .02 && value <= .6).length).toBeGreaterThan(10);
    disposeThreeTree(gltf.scene);
  });

  it('loads the authored athlete with one compatible rig, real garments and bounded GPU geometry', async () => {
    const bytes = readFileSync('public/assets/bodyforge-athlete.glb');
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const bones = new Set<THREE.Bone>();
    const meshes = new Map<string, THREE.SkinnedMesh>();
    let triangles = 0;
    gltf.scene.traverse((node) => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      meshes.set(node.name, node);
      node.skeleton.bones.forEach((bone) => bones.add(bone));
      const positions = node.geometry.getAttribute('position');
      const weights = node.geometry.getAttribute('skinWeight');
      expect(weights.count).toBe(positions.count);
      expect(weights.itemSize).toBe(4);
      for (let index = 0; index < weights.count; index++) {
        const sum = weights.getX(index) + weights.getY(index) + weights.getZ(index) + weights.getW(index);
        expect(sum).toBeCloseTo(1, 5);
        expect(Number.isFinite(positions.getX(index) + positions.getY(index) + positions.getZ(index))).toBe(true);
      }
      triangles += (node.geometry.index?.count ?? positions.count) / 3;
    });
    expect(bones.size).toBe(163);
    expect(meshes.size).toBe(12);
    expect(triangles).toBeLessThan(125000);
    expect(bytes.length).toBeLessThan(5500000);
    for (const name of ['BODYFORGE_Shirt', 'BODYFORGE_Shorts', 'BODYFORGE_Shoes']) {
      const mesh = meshes.get(name)!;
      expect(mesh.geometry.getAttribute('uv')).toBeDefined();
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(1000);
    }
    const shoes = meshes.get('BODYFORGE_Shoes')!.geometry;
    const shoePositions = shoes.getAttribute('position');
    const shoeIndices = shoes.index!;
    // Each trainer must surround its own foot; a single hull across both feet
    // would create an opaque bridge and break the athlete's walking silhouette.
    for (let index = 0; index < shoeIndices.count; index += 3) {
      const a = Math.sign(shoePositions.getX(shoeIndices.getX(index)));
      const b = Math.sign(shoePositions.getX(shoeIndices.getX(index + 1)));
      const c = Math.sign(shoePositions.getX(shoeIndices.getX(index + 2)));
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
    const shirt = meshes.get('BODYFORGE_Shirt')!.geometry.getAttribute('position');
    let upperClavicle = 0;
    let leftShoulder = 0;
    let rightShoulder = 0;
    for (let index = 0; index < shirt.count; index++) {
      const x = shirt.getX(index), height = shirt.getY(index);
      if (height > 1.50 && Math.abs(x) < .15) upperClavicle++;
      if (height > 1.495 && x > .10 && x < .18) leftShoulder++;
      if (height > 1.495 && x < -.10 && x > -.18) rightShoulder++;
    }
    // A superficially smooth low horizontal cut still exposed both shoulders.
    // Actual source coordinates require coverage above the y=1.50 section.
    expect(upperClavicle).toBeGreaterThan(50);
    expect(leftShoulder).toBeGreaterThan(10);
    expect(rightShoulder).toBeGreaterThan(10);
    const brows = meshes.get('BODYFORGE_Brows')!.geometry;
    expect(brows.getAttribute('skinWeight')).toBeDefined();
    expect(brows.getAttribute('position').count).toBeGreaterThan(20);
    expect(brows.index!.count / 3).toBeLessThan(117);
    const browPositions = brows.getAttribute('position');
    const adjacency = new Map<number, Set<number>>();
    for (let index = 0; index < brows.index!.count; index += 3) {
      const triangle = [0, 1, 2].map((offset) => brows.index!.getX(index + offset));
      for (const vertex of triangle) {
        if (!adjacency.has(vertex)) adjacency.set(vertex, new Set());
        triangle.forEach((other) => { if (other !== vertex) adjacency.get(vertex)!.add(other); });
      }
    }
    let components = 0;
    const unseen = new Set(adjacency.keys());
    while (unseen.size > 0) {
      const queue = [unseen.values().next().value!];
      components++;
      while (queue.length > 0) {
        const vertex = queue.pop()!;
        if (!unseen.delete(vertex)) continue;
        queue.push(...adjacency.get(vertex)!);
      }
    }
    expect(components).toBe(2);
    for (let index = 0; index < browPositions.count; index++) {
      expect(browPositions.getY(index)).toBeGreaterThan(1.687);
      expect(browPositions.getY(index)).toBeLessThan(1.697);
    }
    expect(meshes.has('BODYFORGE_ChestMark')).toBe(true);
    expect(importedSurfaceRole('BODYFORGE_Eyes', meshes.get('BODYFORGE_Eyes')!.geometry)).toBe('eyes');
    expect(importedSurfaceRole('BODYFORGE_Lips', meshes.get('BODYFORGE_Lips')!.geometry)).toBe('lips');
    expect(importedSurfaceRole('BODYFORGE_NailsHands', meshes.get('BODYFORGE_NailsHands')!.geometry)).toBe('nails');
    expect(importedSurfaceRole('BODYFORGE_NailsFeet', meshes.get('BODYFORGE_NailsFeet')!.geometry)).toBe('nails');
    disposeThreeTree(gltf.scene);
  });
});
