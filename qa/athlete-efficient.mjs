// Pure Node.js QA: pinned, compact, skinned GLB retains BODYFORGE's real scene.
// No package dependencies, network, camera or user profile access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const origPath = resolve(root, 'public/assets/bodyforge-athlete-detail.glb');
const packedPath = resolve(root, 'public/assets/bodyforge-athlete-efficient.glb');
const original = readFileSync(origPath);
const packed = readFileSync(packedPath);
const hash = (b) => createHash('sha256').update(b).digest('hex');
assert.equal(hash(original), '16d3f6110d07179d71378af462a2c0ddc99d7e73207df123b3401769f18d53d6');
assert.equal(hash(packed), 'df8c4e3d0d8ebfbd6a03b83e537663bda41df5d0d30259ad1b530c2a2abefa7e');

function openGLB(file) {
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const parts = new Map();
  let pos = 12;
  while (pos < file.length) {
    assert.ok(pos + 8 <= file.length);
    const len = file.readUInt32LE(pos);
    const type = file.readUInt32LE(pos + 4);
    pos += 8;
    assert.ok(len % 4 === 0 && pos + len <= file.length);
    assert.ok(!parts.has(type));
    parts.set(type, file.subarray(pos, pos + len));
    pos += len;
  }
  assert.deepEqual([...parts.keys()], [0x4e4f534a, 0x004e4942]);
  const doc = JSON.parse(parts.get(0x4e4f534a).toString('utf8'));
  const binary = parts.get(0x004e4942);
  assert.ok(doc.buffers[0].byteLength <= binary.length);
  assert.ok(binary.length - doc.buffers[0].byteLength <= 3);
  return { doc, binary };
}
const old = openGLB(original);
const next = openGLB(packed);
assert.equal(old.doc.meshes.length, 15);
assert.equal(old.doc.skins.length, 1);
assert.equal(old.doc.skins[0].joints.length, 163);
assert.deepEqual(next.doc.meshes, old.doc.meshes);
assert.deepEqual(next.doc.skins, old.doc.skins);
assert.deepEqual(next.doc.nodes, old.doc.nodes);
assert.deepEqual(next.doc.materials, old.doc.materials);
assert.deepEqual(next.doc.scenes, old.doc.scenes);
assert.deepEqual(next.doc.extensionsUsed, ['KHR_mesh_quantization']);
assert.deepEqual(next.doc.extensionsRequired, ['KHR_mesh_quantization']);
assert.equal(next.doc.bufferViews.length, old.doc.bufferViews.length);
assert.equal(next.doc.accessors.length, old.doc.accessors.length);

function viewBytes(asset, idx) {
  const view = asset.doc.bufferViews[idx];
  return asset.binary.subarray(view.byteOffset ?? 0,
    (view.byteOffset ?? 0) + view.byteLength);
}
const changedViews = new Set();
let packedNormals = 0, packedWeights = 0, packedUvs = 0, skippedUvs = 0;
let worstNormal = 0, worstWeight = 0, worstUv = 0;
function comp(asset, accessorId, vertex, component, bytesPerComponent) {
  const accessor = asset.doc.accessors[accessorId];
  const view = asset.doc.bufferViews[accessor.bufferView];
  return (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    + vertex * (view.byteStride ?? bytesPerComponent * Number(accessor.type.slice(3)))
    + component * bytesPerComponent;
}
const indices = new Set();
for (const mesh of old.doc.meshes) for (const primitive of mesh.primitives) {
  for (const attr of ['POSITION', 'NORMAL', 'WEIGHTS_0', 'TEXCOORD_0']) {
    const id = primitive.attributes?.[attr];
    if (id === undefined || indices.has(id)) continue;
    indices.add(id);
    const base = old.doc.accessors[id];
    const updated = next.doc.accessors[id];
    assert.equal(base.count, updated.count);
    assert.equal(base.type, updated.type);
    if (attr === 'POSITION') {
      assert.equal(updated.componentType, 5126);
      continue;
    }
    const updatedBytes = updated.componentType === 5126 ? 4 : 2;
    if (updated.componentType === 5126) {
      assert.equal(attr, 'TEXCOORD_0', 'only UV outside [0,1] may remain float');
      skippedUvs += base.count;
      continue;
    }
    assert.equal(updated.componentType, attr === 'NORMAL' ? 5122 : 5123);
    assert.equal(updated.normalized, true);
    changedViews.add(base.bufferView);
    for (let i = 0; i < base.count; i++) {
      const dimension = attr === 'NORMAL' ? 3 : attr === 'WEIGHTS_0' ? 4 : 2;
      let weightSum = 0;
      for (let k = 0; k < dimension; k++) {
        const f = old.binary.readFloatLE(comp(old, id, i, k, 4));
        const offset = comp(next, id, i, k, updatedBytes);
        const converted = attr === 'NORMAL'
          ? next.binary.readInt16LE(offset) / 32767
          : next.binary.readUInt16LE(offset) / 65535;
        const delta = Math.abs(f - converted);
        if (attr === 'NORMAL') worstNormal = Math.max(worstNormal, delta);
        else if (attr === 'WEIGHTS_0') {
          worstWeight = Math.max(worstWeight, delta);
          weightSum += next.binary.readUInt16LE(offset);
        } else worstUv = Math.max(worstUv, delta);
      }
      if (attr === 'WEIGHTS_0') assert.equal(weightSum, 65535, 'skin weight sum');
    }
    if (attr === 'NORMAL') {
      assert.equal(next.doc.bufferViews[base.bufferView].byteStride, 8);
      packedNormals += base.count;
    } else if (attr === 'WEIGHTS_0') packedWeights += base.count;
    else packedUvs += base.count;
  }
}
for (let i = 0; i < old.doc.bufferViews.length; i++) {
  if (!changedViews.has(i)) {
    assert.ok(viewBytes(old, i).equals(viewBytes(next, i)),
      'non-quantized data drift in bufferView ' + i);
  }
}
assert.equal(packedNormals, 89104);
assert.equal(packedWeights, 89104);
assert.equal(packedUvs, 82817);
assert.equal(skippedUvs, 3201);
assert.ok(worstNormal < 0.00004, 'normal quantization tolerance');
assert.ok(worstWeight < 0.00004, 'skin weight tolerance');
assert.ok(worstUv < 0.00004, 'UV texture tolerance');
assert.equal(original.length, 6038680);
assert.equal(packed.length, 4639184);
const savedPercent = Math.round((1 - packed.length / original.length) * 1000) / 10;
assert.equal(savedPercent, 23.2);
const dist = resolve(root, 'dist/assets/bodyforge-athlete-efficient.glb');
if (existsSync(dist)) {
  assert.ok(readFileSync(dist).equals(packed), 'Vite dist must preserve the compact asset bytes');
}
console.log('BODYFORGE_EFFICIENT_GLB_QA_PASS', JSON.stringify({
  originalBytes: original.length, optimizedBytes: packed.length, savedPercent,
  bones: 163, meshes: 15, packedNormals, packedWeights, packedUvs,
  skippedUvs, worstNormal, worstWeight, worstUv, builtCopyVerified: existsSync(dist),
}));
