import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MODEL_REQUIREMENT } from './offline-pose-pack.mjs';
import { MODEL_FILENAME,MODEL_GENERATION,MODEL_SOURCE,validateModelBytes,readVerifiedModel,readModelResponse } from './offline-pose-model.mjs';

function fixture(t){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'bf-model-unit-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return root;
}
test('exact source is versioned, generation-pinned and uses HTTPS',()=>{
  const url=new URL(MODEL_SOURCE);
  assert.equal(url.origin,'https://storage.googleapis.com');
  assert.equal(url.pathname,new URL(MODEL_REQUIREMENT.url).pathname);
  assert.equal(url.searchParams.get('generation'),MODEL_GENERATION);
  assert.equal(MODEL_REQUIREMENT.bytes,5777746);
  assert.match(MODEL_REQUIREMENT.sha256,/^[a-f0-9]{64}$/);
});
test('rejects short, oversized and fabricated same-size bytes',()=>{
  for(const data of [null,Buffer.alloc(0),Buffer.alloc(MODEL_REQUIREMENT.bytes+1)])assert.throws(()=>validateModelBytes(data),/model size mismatch/);
  assert.throws(()=>validateModelBytes(Buffer.alloc(MODEL_REQUIREMENT.bytes)),/model hash mismatch/);
});
test('missing, short and forged local model files fail closed',async t=>{
  const dir=fixture(t),file=path.join(dir,MODEL_FILENAME);
  await assert.rejects(readVerifiedModel(dir));
  fs.writeFileSync(file,'synthetic');await assert.rejects(readVerifiedModel(dir),/model size mismatch/);
  fs.writeFileSync(file,Buffer.alloc(MODEL_REQUIREMENT.bytes));await assert.rejects(readVerifiedModel(dir),/model hash mismatch/);
});
test('linked local model file is refused before content read',async t=>{
  const dir=fixture(t),file=path.join(dir,MODEL_FILENAME),source=path.join(dir,'synthetic');
  fs.writeFileSync(source,Buffer.alloc(MODEL_REQUIREMENT.bytes));fs.linkSync(source,file);
  await assert.rejects(readVerifiedModel(dir),/model file boundary/);
});
test('linked model directory is rejected before opening its files',async t=>{
  const dir=fixture(t),target=path.join(dir,'target'),alias=path.join(dir,'alias');
  fs.mkdirSync(target);fs.symlinkSync(target,alias,process.platform==='win32'?'junction':'dir');
  await assert.rejects(readVerifiedModel(alias),/model directory boundary/);
});
test('HTTP error, unexpected content length and compressed response are rejected',async()=>{
  await assert.rejects(readModelResponse(new Response('x',{status:404})),/HTTP response/);
  await assert.rejects(readModelResponse(new Response('x',{headers:{'content-length':'1'}})),/HTTP size mismatch/);
  await assert.rejects(readModelResponse(new Response('x',{headers:{'content-encoding':'gzip'}})),/HTTP encoding/);
});
test('HTTP stream without content length is bounded and rejects truncation and forgery',async()=>{
  await assert.rejects(readModelResponse(new Response('x')),/HTTP truncated/);
  await assert.rejects(readModelResponse(new Response(Buffer.alloc(MODEL_REQUIREMENT.bytes+1))),/HTTP size limit/);
  await assert.rejects(readModelResponse(new Response(Buffer.alloc(MODEL_REQUIREMENT.bytes))),/model hash mismatch/);
});
