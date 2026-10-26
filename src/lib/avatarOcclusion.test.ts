import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { coveredAthleteTriangle, maskAthleteOcclusion } from './avatarOcclusion';
import { disposeThreeTree } from './threeResources';

async function fixture(file = 'bodyforge-athlete.glb') {
  const bytes = readFileSync('public/assets/' + file);
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}

function triangle(x: number, y: number, z = .05) {
  return new THREE.Float32BufferAttribute([x, y, z, x + .0001, y, z, x, y + .0001, z], 3);
}

function attributeHash(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): string {
  const data = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
  return createHash('sha256').update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)).digest('hex');
}

describe('one-time hidden skin mask for the pinned clothed athlete', () => {
  it('keeps inset boundaries, face, neck, hands, calves and feet visible', () => {
    expect(coveredAthleteTriangle(triangle(.10, 1.30), 0, 1, 2)).toBe(true);
    expect(coveredAthleteTriangle(triangle(.10, .740), 0, 1, 2)).toBe(true);
    expect(coveredAthleteTriangle(triangle(.10, .734), 0, 1, 2)).toBe(false);
    expect(coveredAthleteTriangle(triangle(.405, 1.450), 0, 1, 2)).toBe(true);
    expect(coveredAthleteTriangle(triangle(.409, 1.450), 0, 1, 2)).toBe(false);
    expect(coveredAthleteTriangle(triangle(.11, 1.520, .11), 0, 1, 2)).toBe(false);
    expect(coveredAthleteTriangle(triangle(.11, 1.515, .11), 0, 1, 2)).toBe(true);
    for (const [x, y] of [[0, 1.7], [0, 1.54], [.5, 1.1], [.1, .5], [.1, .05]]) {
      expect(coveredAthleteTriangle(triangle(x, y), 0, 1, 2)).toBe(false);
    }
    const crossingHem = new THREE.Float32BufferAttribute([.1, .72, 0, .1, .75, 0, .11, .75, 0], 3);
    expect(coveredAthleteTriangle(crossingHem, 0, 1, 2)).toBe(false);
    const crossingRadiusStep = new THREE.Float32BufferAttribute([.27, 1.149, 0, .27, 1.16, 0, .271, 1.16, 0], 3);
    expect(coveredAthleteTriangle(crossingRadiusStep, 0, 1, 2)).toBe(false);
  });

  it('removes only fully covered real body triangles, preserving every vertex attribute and other surfaces', async () => {
    const root = await fixture();
    const body = root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
    const original = body.geometry.index!;
    const attributes = { ...body.geometry.attributes };
    const otherIndices = new Map<THREE.Mesh, THREE.BufferAttribute | null>();
    const attributeBytes = new Map<THREE.Mesh, Map<string, string>>();
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        attributeBytes.set(node, new Map(Object.keys(node.geometry.attributes)
          .map((name) => [name, attributeHash(node.geometry.getAttribute(name))])));
        if (!['BODYFORGE_Body', 'BODYFORGE_SkinNipples'].includes(node.name)) otherIndices.set(node, node.geometry.index);
      }
    });
    const result = maskAthleteOcclusion(root);
    expect(result.maskedMeshes).toBe(2);
    expect(result.removedTriangles).toBeGreaterThan(10000);
    expect(result.removedTriangles).toBeLessThan(70000);
    for (const [name, attribute] of Object.entries(attributes)) expect(body.geometry.getAttribute(name)).toBe(attribute);
    // Reference equality alone cannot detect an accidental in-place mutation.
    // Hash every byte of every vertex attribute on every mesh, including UVs,
    // skin indices, normalized weights, normals and unmodified garment meshes.
    for (const [mesh, hashes] of attributeBytes) {
      expect(Object.keys(mesh.geometry.attributes).sort()).toEqual([...hashes.keys()].sort());
      for (const [name, hash] of hashes) expect(attributeHash(mesh.geometry.getAttribute(name))).toBe(hash);
    }
    for (const [mesh, indices] of otherIndices) expect(mesh.geometry.index).toBe(indices);
    const after = body.geometry.index!;
    const retained = new Set<string>();
    for (let index = 0; index < after.count; index += 3) {
      const vertices = [after.getX(index), after.getX(index + 1), after.getX(index + 2)];
      retained.add(vertices.join(','));
      expect(coveredAthleteTriangle(attributes.position, vertices[0], vertices[1], vertices[2])).toBe(false);
    }
    for (let index = 0; index < original.count; index += 3) {
      const vertices = [original.getX(index), original.getX(index + 1), original.getX(index + 2)];
      if (!retained.has(vertices.join(','))) {
        expect(coveredAthleteTriangle(attributes.position, vertices[0], vertices[1], vertices[2])).toBe(true);
      }
      // Any triangle touching the uncovered extremities remains exactly intact.
      if (vertices.some((vertex) => attributes.position.getY(vertex) > 1.55 ||
          attributes.position.getY(vertex) < .72 || Math.abs(attributes.position.getX(vertex)) > .42)) {
        expect(retained.has(vertices.join(','))).toBe(true);
      }
    }
    const maskedIndex = body.geometry.index;
    expect(maskAthleteOcclusion(root)).toEqual({ removedTriangles: 0, maskedMeshes: 0 });
    expect(body.geometry.index).toBe(maskedIndex);
    disposeThreeTree(root);
  });

  it('does not mask the legacy unclothed source', async () => {
    const root = await fixture('male-base-mesh-base_male.glb');
    const indices = new Map<THREE.Mesh, THREE.BufferAttribute | null>();
    root.traverse((node) => { if (node instanceof THREE.Mesh) indices.set(node, node.geometry.index); });
    expect(maskAthleteOcclusion(root)).toEqual({ removedTriangles: 0, maskedMeshes: 0 });
    for (const [mesh, index] of indices) expect(mesh.geometry.index).toBe(index);
    disposeThreeTree(root);
  });

  it.each(['BODYFORGE_Shirt', 'BODYFORGE_Shorts', 'BODYFORGE_Shoes'])('requires the complete known garment set: missing %s', async (name) => {
    const root = await fixture();
    const body = root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
    const index = body.geometry.index;
    const garment = root.getObjectByName(name)!;
    const parent = garment.parent!;
    garment.removeFromParent();
    expect(maskAthleteOcclusion(root)).toEqual({ removedTriangles: 0, maskedMeshes: 0 });
    expect(body.geometry.index).toBe(index);
    parent.add(garment);
    disposeThreeTree(root);
  });

  it('rejects an unknown replacement body even when garment names remain', async () => {
    const root = await fixture();
    const body = root.getObjectByName('BODYFORGE_Body') as THREE.SkinnedMesh;
    const original = body.geometry;
    body.geometry = new THREE.BoxGeometry();
    const index = body.geometry.index;
    expect(maskAthleteOcclusion(root)).toEqual({ removedTriangles: 0, maskedMeshes: 0 });
    expect(body.geometry.index).toBe(index);
    body.geometry.dispose();
    body.geometry = original;
    disposeThreeTree(root);
  });
});
