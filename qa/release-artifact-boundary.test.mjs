import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {BoundaryError,verifyPublic,verifyDistribution,generatedEntries,validatePublicPolicy,buildAndVerify} from './release-artifact-boundary.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const expected=(name,value)=>({path:name,bytes:Buffer.byteLength(value),sha256:sha(value)});
const base={'favicon.svg':'<svg/>','manifest.webmanifest':'{}','assets/athlete.png':'SYNTHETIC_IMAGE','fonts/Manrope-OFL.txt':'SYNTHETIC_LICENSE'};
const policy=(files=base)=>({schemaVersion:1,scope:'public-byte-baseline-not-license-approval',sourceInventorySha256:'a'.repeat(64),files:Object.entries(files).map(([k,v])=>expected(k,v))});
const bundle={output:[
  {type:'asset',fileName:'index.html',source:'<html>APP</html>'},
  {type:'chunk',fileName:'assets/index-Abcd_123.js',code:'export {};'},
  {type:'asset',fileName:'assets/index-abcd_456.css',source:new Uint8Array(Buffer.from('body{}'))},
]};
function put(dir,name,value){
  const q=path.join(dir,...name.split('/'));fs.mkdirSync(path.dirname(q),{recursive:true});fs.writeFileSync(q,value);return q;
}
function fixture(t,withDist=false){
  const root=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'bf-artifact-boundary-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:100}));
  const pub=path.join(root,'public');for(const [n,v] of Object.entries(base))put(pub,n,v);
  const dist=path.join(root,'dist');
  if(withDist){
    for(const [n,v] of Object.entries(base))put(dist,n,v);
    for(const item of bundle.output)put(dist,item.fileName,item.type==='chunk'?item.code:item.source);
  }
  return {root,pub,dist};
}
const fails=(fn,code)=>assert.throws(fn,e=>e instanceof BoundaryError&&e.code===code);

test('public baseline and exact generated distribution verify and do not mutate contents',t=>{
  const {pub,dist}=fixture(t,true);
  const p=verifyPublic(pub,policy()),d=verifyDistribution(dist,policy(),bundle);
  assert.equal(p.count,4);assert.equal(d.count,7);assert.equal(d.publicCount,4);assert.equal(d.generatedCount,3);
  assert.deepEqual(p.files,verifyPublic(pub,policy()).files);
  assert.equal(fs.readFileSync(path.join(dist,'assets/index-Abcd_123.js'),'utf8'),'export {};');
});
test('unknown ordinary-looking asset is rejected rather than auto-approved',t=>{
  const {pub}=fixture(t);put(pub,'assets/extra.png','SYNTHETIC');
  fails(()=>verifyPublic(pub,policy()),'UNEXPECTED_ENTRY');
});
test('private-looking synthetic file is rejected without logging its name or contents',t=>{
  const {pub}=fixture(t);put(pub,'.env','CANARY_NOT_A_SECRET');
  assert.throws(()=>verifyPublic(pub,policy()),e=>e instanceof BoundaryError&&e.code==='FORBIDDEN_PATH'&&!e.message.includes('.env')&&!e.message.includes('CANARY'));
});
test('unknown directory is rejected before descent',t=>{
  const {pub}=fixture(t);put(pub,'docs/audits/example.txt','SYNTHETIC');
  fails(()=>verifyPublic(pub,policy()),'UNEXPECTED_ENTRY');
});
test('unknown empty directory is rejected',t=>{
  const {pub}=fixture(t);fs.mkdirSync(path.join(pub,'other'));
  fails(()=>verifyPublic(pub,policy()),'UNEXPECTED_ENTRY');
});
test('missing file cannot pass as empty manifest',t=>{
  const {pub}=fixture(t);fs.unlinkSync(path.join(pub,'favicon.svg'));
  fails(()=>verifyPublic(pub,policy()),'MISSING_FILE');
});
test('changed size fails before hashing',t=>{
  const {pub}=fixture(t);put(pub,'favicon.svg','different size');
  fails(()=>verifyPublic(pub,policy()),'SIZE_MISMATCH');
});
test('changed bytes of identical size are rejected',t=>{
  const {pub}=fixture(t);put(pub,'favicon.svg','<abc/>');
  fails(()=>verifyPublic(pub,policy()),'HASH_MISMATCH');
});
test('case alias cannot replace an expected filename',t=>{
  const {pub}=fixture(t);fs.renameSync(path.join(pub,'favicon.svg'),path.join(pub,'temp.svg'));fs.renameSync(path.join(pub,'temp.svg'),path.join(pub,'FAVICON.svg'));
  fails(()=>verifyPublic(pub,policy()),'UNEXPECTED_ENTRY');
});
test('policy rejects empty, missing required, malformed, and duplicate entries',()=>{
  fails(()=>validatePublicPolicy(policy({})),'MANIFEST_COUNT_INVALID');
  fails(()=>validatePublicPolicy(policy({'manifest.webmanifest':'{}'})),'PUBLIC_REQUIRED_ENTRY_MISSING');
  const p=policy();p.files[0].sha256='bad';
  fails(()=>validatePublicPolicy(p),'MANIFEST_BYTES_OR_HASH_INVALID');
  const duplicate=policy();duplicate.files.push({...duplicate.files[0]});
  fails(()=>validatePublicPolicy(duplicate),'MANIFEST_DUPLICATE_OR_CASE_COLLISION');
});
test('unsafe, alternate, reserved, and private manifest paths are rejected',()=>{
  for(const n of ['../favicon.svg','/favicon.svg','assets\\x.png','assets/a.png:stream','assets/a%2epng','assets/con.png','assets/a.png.','assets/a.png ','assets/.env','docs/audits/a.png']){
    const p=policy();p.files.push(expected(n,'SYNTHETIC'));
    fails(()=>validatePublicPolicy(p),'MANIFEST_PATH_FORBIDDEN');
  }
});
test('file hard links are rejected without reading their content',t=>{
  const {root,pub}=fixture(t);const external=put(root,'outside.txt',base['favicon.svg']);
  fs.unlinkSync(path.join(pub,'favicon.svg'));fs.linkSync(external,path.join(pub,'favicon.svg'));
  fails(()=>verifyPublic(pub,policy()),'UNEXPECTED_TYPE_OR_HARDLINK');
});
test('directory junction or symbolic link is rejected even with exact contents',t=>{
  const {root,pub}=fixture(t);const original=path.join(pub,'assets'),external=path.join(root,'outside-assets');
  fs.renameSync(original,external);fs.symlinkSync(external,original,process.platform==='win32'?'junction':'dir');
  fails(()=>verifyPublic(pub,policy()),'SYMLINK_OR_JUNCTION_FORBIDDEN');
});
test('root junction or symbolic link is rejected',t=>{
  const {root,pub}=fixture(t);const alias=path.join(root,'alias');fs.symlinkSync(pub,alias,process.platform==='win32'?'junction':'dir');
  fails(()=>verifyPublic(alias,policy()),'SYMLINK_OR_JUNCTION_FORBIDDEN');
});
test('generated-looking extra script in dist is not approved by its name',t=>{
  const {dist}=fixture(t,true);put(dist,'assets/stray-Abcd_789.js','SYNTHETIC');
  fails(()=>verifyDistribution(dist,policy(),bundle),'UNEXPECTED_ENTRY');
});
test('source maps and developer documents cannot enter dist',t=>{
  const {dist}=fixture(t,true);put(dist,'assets/index-Abcd_123.js.map','SYNTHETIC');
  fails(()=>verifyDistribution(dist,policy(),bundle),'UNEXPECTED_ENTRY');
  fails(()=>generatedEntries({output:[...bundle.output,{type:'asset',fileName:'docs/audits/example.md',source:'SYNTHETIC'}]}),'GENERATED_PATH_FORBIDDEN');
});
test('distribution detects altered generated chunk and altered copied public bytes',t=>{
  const {dist}=fixture(t,true);put(dist,'assets/index-Abcd_123.js','export [];');
  fails(()=>verifyDistribution(dist,policy(),bundle),'HASH_MISMATCH');
  put(dist,'assets/index-Abcd_123.js','export {};');put(dist,'favicon.svg','<abc/>');
  fails(()=>verifyDistribution(dist,policy(),bundle),'HASH_MISMATCH');
});
test('generated entries reject duplicate, case-collision, missing entry, wrong type and watcher',()=>{
  const item=bundle.output[1];
  fails(()=>generatedEntries({output:[...bundle.output,item]}),'MANIFEST_DUPLICATE_OR_CASE_COLLISION');
  fails(()=>generatedEntries({output:[...bundle.output,{...item,fileName:item.fileName.toUpperCase().replace(/^ASSETS\//,'assets/').replace(/\.JS$/,'.js')}]}),'MANIFEST_DUPLICATE_OR_CASE_COLLISION');
  fails(()=>generatedEntries({output:[bundle.output[0]]}),'BUILD_ENTRY_COUNT_INVALID');
  fails(()=>generatedEntries({output:[{...bundle.output[0],source:7},item]}),'BUILD_OUTPUT_TYPE_INVALID');
  fails(()=>generatedEntries({close(){}}),'BUILD_OUTPUT_INVALID');
});
test('build refuses to overwrite an existing output directory',async t=>{
  const {root,dist}=fixture(t,true);
  await assert.rejects(buildAndVerify(root,policy()),e=>e instanceof BoundaryError&&e.code==='OUTPUT_ALREADY_EXISTS');
  assert.equal(fs.readFileSync(path.join(dist,'index.html'),'utf8'),'<html>APP</html>');
});
test('build refuses local environment files before reading them or invoking Vite',async t=>{
  const {root}=fixture(t);put(root,'.env','SYNTHETIC_NOT_A_SECRET');
  await assert.rejects(buildAndVerify(root,policy()),e=>e instanceof BoundaryError&&e.code==='LOCAL_ENV_FILES_FORBIDDEN');
  assert.equal(fs.existsSync(path.join(root,'dist')),false);
});

test('build refuses dangling output links, not just paths with existing targets',async t=>{
  const {root,dist}=fixture(t);
  const target=path.join(root,'uncreated-target');
  fs.symlinkSync(target,dist,process.platform==='win32'?'junction':'dir');
  assert.equal(fs.lstatSync(dist).isSymbolicLink(),true);
  assert.equal(fs.existsSync(dist),false);
  await assert.rejects(buildAndVerify(root,policy()),e=>e instanceof BoundaryError&&e.code==='OUTPUT_ALREADY_EXISTS');
  assert.equal(fs.existsSync(target),false);
});

test('only the exact generated offline worker is allowed at root; public and unreported copies are rejected',t=>{
  const {dist}=fixture(t,true);
  const worker={type:'asset',fileName:'bodyforge-offline.js',source:'/* synthetic generated worker */'};
  const extended={output:[...bundle.output,worker]};
  put(dist,worker.fileName,worker.source);
  fails(()=>verifyDistribution(dist,policy(),bundle),'UNEXPECTED_ENTRY');
  assert.equal(verifyDistribution(dist,policy(),extended).generatedCount,4);
  fails(()=>generatedEntries({output:[...bundle.output,{...worker,fileName:'other.js'}]}),'GENERATED_PATH_FORBIDDEN');
  fails(()=>generatedEntries({output:[...bundle.output,{type:'chunk',fileName:worker.fileName,code:worker.source}]}),'BUILD_OUTPUT_TYPE_INVALID');
  fails(()=>validatePublicPolicy(policy({...base,[worker.fileName]:worker.source})),'MANIFEST_PATH_FORBIDDEN');
});

test('only the exact third-party notice path is admitted',t=>{
  const {pub}=fixture(t);put(pub,'third-party-notices.txt','PINNED_NOTICE');
  assert.equal(verifyPublic(pub,policy({...base,'third-party-notices.txt':'PINNED_NOTICE'})).count,5);
  for(const n of ['other-notices.txt','third-party-notices.md','licenses/extra.txt'])fails(()=>validatePublicPolicy(policy({...base,[n]:'x'})),'MANIFEST_PATH_FORBIDDEN');
});
