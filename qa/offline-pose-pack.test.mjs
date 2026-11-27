import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RUNTIME_FILES,MODEL_REQUIREMENT,verifyPinnedFile,verifyInstalledRuntime,SDK_VERSION} from './offline-pose-pack.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'bf-runtime-unit-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}
test('exact runtime pins include all three WASM variants and distinguish missing model',()=>{
  assert.equal(SDK_VERSION,'1.1.1');
  assert.equal(RUNTIME_FILES.length,7);
  assert.equal(new Set(RUNTIME_FILES.map(x=>x.path)).size,7);
  assert.equal(RUNTIME_FILES.filter(x=>x.path.endsWith('.wasm')).length,3);
  assert.equal(RUNTIME_FILES.reduce((n,x)=>n+x.bytes,0),40825735);
  assert.ok(RUNTIME_FILES.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)&&Object.isFrozen(x)));
  assert.equal(MODEL_REQUIREMENT.state,'license-and-model-bytes-required');
  assert.equal(RUNTIME_FILES.some(x=>x.path.endsWith('.task')),false);
});
test('unknown, traversal, and modified pin descriptors fail before reading',async t=>{
  const root=fixture(t),p=RUNTIME_FILES[0];
  for(const x of [null,{...p,path:'../private'},{...p,sha256:'0'.repeat(64)},{...p,bytes:0}])
    await assert.rejects(verifyPinnedFile(root,x),/unknown runtime pin/);
});
test('missing pinned file and size mismatch fail',async t=>{
  const root=fixture(t),p=RUNTIME_FILES[0];
  await assert.rejects(verifyPinnedFile(root,p));
  fs.writeFileSync(path.join(root,p.path),'synthetic');
  await assert.rejects(verifyPinnedFile(root,p),/runtime size mismatch/);
});
test('same-sized fabricated runtime does not pass its hash pin',async t=>{
  const root=fixture(t),p=RUNTIME_FILES[0];
  fs.writeFileSync(path.join(root,p.path),Buffer.alloc(p.bytes));
  await assert.rejects(verifyPinnedFile(root,p),/runtime hash mismatch/);
});
test('hard linked pinned filename is rejected',async t=>{
  const root=fixture(t),p=RUNTIME_FILES[0],source=path.join(root,'synthetic');
  fs.writeFileSync(source,Buffer.alloc(p.bytes));fs.linkSync(source,path.join(root,p.path));
  await assert.rejects(verifyPinnedFile(root,p),/runtime file boundary/);
});
test('wrong SDK version is rejected before runtime verification',async t=>{
  const root=fixture(t);fs.mkdirSync(path.join(root,'wasm'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'@mediapipe/tasks-vision',version:'0.0.0',license:'Apache-2.0'}));
  await assert.rejects(verifyInstalledRuntime(root),/version\/license metadata mismatch/);
});
test('SDK license metadata alone does not permit an incomplete WASM set',async t=>{
  const root=fixture(t);fs.mkdirSync(path.join(root,'wasm'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'@mediapipe/tasks-vision',version:SDK_VERSION,license:'Apache-2.0'}));
  await assert.rejects(verifyInstalledRuntime(root),/WASM set mismatch/);
});
test('linked WASM directory is rejected before opening its files',async t=>{
  const root=fixture(t),external=path.join(root,'other');fs.mkdirSync(external);
  fs.symlinkSync(external,path.join(root,'wasm'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(verifyInstalledRuntime(root),/runtime directory boundary/);
});
