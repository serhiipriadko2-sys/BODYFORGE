import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),rel='docs/audits/BF_AVATAR_SHOULDER_TRANSITION_20261127',dir=path.join(root,rel);
const read=file=>{const b=fs.readFileSync(path.join(dir,file));return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replace(/\x1b\[[0-9;]*m/g,'');};
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pins={
 'src/lib/avatarShoulderTransitionReview.ts':'56ABE1D0D989EA0E741108E62C75A73563352C584920C77F0D3B257E654F74C2',
 'src/lib/avatarShoulderTransitionReview.test.ts':'AD7446F561ED2E6761ED7E0CC62A01762F6CC3D9A9DB45F61A645B7F8EC082F0',
 'src/components/Avatar3D.tsx':'BA04EFBFAFC475CB2137C3B790E28DE3FB0032D1D5B333B7589FA5CF8B1E50A9',
 'qa/avatar-quality-e2e.mjs':'FC4AB8FCDA0F7BE6A59402AE9F4422A27C98624683BE6F9CA1D8189A0FF1B503',
 'src/lib/avatarPose.ts':'4B84069276E4EFF8D6B85DA2EF67C87B2E0C68FBF37F02D7FF8FE9E72D77BC09',
 'src/lib/avatarPhysique.ts':'2FCF4A0F8AAF75D9FE26A26EB4D991B983709AB3A15F6DCB1A493B9076524C15',
 'public/assets/bodyforge-athlete-efficient.glb':'DF8C4E3D0D8EBFBD6A03B83E537663BDA41DF5D0D30259AD1B530C2A2ABEFA7E'
};
for(const [p,h] of Object.entries(pins))assert.equal(digest(path.join(root,p)),h.toLowerCase(),p);
assert.match(read('full-vitest.log'),/Test Files\s+120 passed\s+\(120\)/);
assert.match(read('full-vitest.log'),/Tests\s+1226 passed\s+\|\s+1 skipped\s+\(1227\)/);
assert.match(read('collision-sweep.log'),/Tests\s+1 passed\s+\|\s+4 skipped/);
assert.match(read('final-candidate.log'),/Tests\s+1 passed\s+\|\s+4 skipped/);
assert.match(read('build.log'),/built in/);
assert.match(read('production-gate.log'),/PRODUCTION_REVIEW_MARKERS_ABSENT/);
const buildDir=path.join(root,'.bodyforge-qa/shoulder-transition-build-20261127/assets');
const js=fs.readdirSync(buildDir).filter(n=>n.endsWith('.js'));
assert.ok(js.length>0);
for(const n of js)assert.ok(!/BF_SHOULDER_TRANSITION_REVIEW_V1|avatarShoulderTransition|shoulderTransitionReview/.test(fs.readFileSync(path.join(buildDir,n),'utf8')),n);
const bundle=js.filter(n=>/^Avatar3D-/.test(n));assert.equal(bundle.length,1);
const expectedBuffers={'916':'89012c35','7036':'83e687b9','131790':'56a7c578'};
let checks=0,frames=0,draws=0;const scenarios=[];
for(const mode of ['on','off'])for(const level of ['max','neutral']){
 const name='browser-'+mode+'-'+level,log=read(name+'.log');
 const found=log.split(/\r?\n/).filter(l=>l.startsWith('ATHLETE_METRIC_SKIN_PASS '));
 assert.equal(found.length,1,name);
 const j=JSON.parse(found[0].slice('ATHLETE_METRIC_SKIN_PASS '.length));
 assert.equal(j.assertions,64);assert.equal(j.screenshots.length,8);
 assert.equal(j.shoulderMode,mode);assert.equal(j.maximum,level==='max');
 assert.match(j.webglRenderer,/NVIDIA GeForce RTX 3070.*Direct3D11/);
 assert.match(log,/PASS cosmetic skin changes preserve exact synthetic game bytes/);
 assert.match(log,/PASS reload preserves synthetic game bytes/);
 assert.match(log,/PASS no uncaught browser exceptions/);
 assert.equal((log.match(/PASS expected shoulder transition revision/g)||[]).length,2);
 assert.equal((log.match(/PASS actual clothed draw is exclusive/g)||[]).length,2);
 const seen=new Set();
 for(const shot of j.screenshots){
  assert.equal(path.dirname(path.resolve(shot.file)),path.join(dir,name));
  const b=fs.readFileSync(shot.file);assert.equal(b.length,shot.bytes);
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16),780);assert.equal(b.readUInt32BE(20),1688);
  assert.ok(!seen.has(shot.file));seen.add(shot.file);
 }
 let n=0;
 for(const v of [j.metricDraws,j.reloadedMetricDraws]){
  assert.ok(v.count>0);assert.equal(v.count,v.matched);assert.equal(v.mismatch,0);
  assert.equal(v.regional.count,v.count);assert.equal(v.regional.matched,v.count);assert.equal(v.regional.mismatch,0);
  for(const [size,h] of Object.entries(expectedBuffers))assert.equal(v.regional.buffers[size].hash,h);
  n+=v.count;
 }
 checks+=j.assertions;frames+=j.screenshots.length;draws+=n;
 scenarios.push({mode,level,checks:j.assertions,frames:8,draws:n,renderer:j.webglRenderer});
}
assert.equal(checks,256);assert.equal(frames,32);assert.equal(draws,884);
const measure=JSON.parse(read('final-candidate-clearance.json'));
const a=measure.baseline.samples,b=measure.candidate.samples;
assert.equal(Object.keys(a).length,11);assert.equal(Object.keys(b).length,11);
const keys=Object.keys(a).filter(k=>k!=='reset');
const summary={};
for(const [name,fn] of Object.entries({compressed:v=>v.compressed,severe:v=>v.severe,overlap:v=>v.selfOverlapPairs,cloth2:v=>v.shirt.belowMinus2mm,cloth5:v=>v.shirt.belowMinus5mm})){
 summary[name]={baseline:keys.reduce((s,k)=>s+fn(a[k]),0),candidate:keys.reduce((s,k)=>s+fn(b[k]),0)};
}
assert.deepEqual(summary,{compressed:{baseline:1150,candidate:709},severe:{baseline:192,candidate:114},overlap:{baseline:2248,candidate:1380},cloth2:{baseline:351,candidate:173},cloth5:{baseline:30,candidate:3}});
for(const k of keys){
 assert.equal(a[k].triangles,5994);assert.equal(b[k].triangles,5994);
 assert.ok(b[k].compressed<a[k].compressed);assert.ok(b[k].selfOverlapPairs<=a[k].selfOverlapPairs);
 assert.ok(b[k].shirt.belowMinus5mm<=a[k].shirt.belowMinus5mm);
 assert.ok(b[k].shirt.minMm>=a[k].shirt.minMm-.5);
}
assert.equal(b.neutral.selfOverlapPairs,0);assert.equal(b.max.selfOverlapPairs,258);
for(const v of Object.values(measure))assert.deepEqual(v.resetMaxDisplacementsM,[0,0,0,0]);
const comparison=JSON.parse(read('comparison.json'));assert.equal(comparison.sheets.length,8);assert.equal(comparison.pairs.length,16);
for(const s of comparison.sheets){const f=path.join(dir,s.path);assert.equal(fs.statSync(f).size,s.bytes);assert.equal(digest(f),s.sha256);}
const priv=path.join(root,'.bodyforge-qa/shoulder-transition-20261127');
for(const n of ['diagnostic','candidate','final-candidate','collision-sweep']){
 const m=JSON.parse(read(n+'.json')),f=path.join(priv,n+'.bin');
 assert.equal(fs.statSync(f).size,m.binaryBytes);assert.equal(digest(f),m.binarySha256);
}
assert.equal(digest(path.join(priv,'corrective-probe.npz')),JSON.parse(read('corrective-probe.json')).probeSha256);
const list=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{
 assert.ok(!e.isSymbolicLink(),'Unexpected symlink '+e.name);
 const f=path.join(folder,e.name);return e.isDirectory()?list(f):[f];
});
const files=[...Object.keys(pins).map(p=>path.join(root,p)),path.join(buildDir,bundle[0]),...list(priv),...list(dir).filter(p=>path.basename(p)!=='RECEIPT.json')];
const unique=[...new Set(files)].sort();
const entries=unique.map(f=>{const stat=fs.lstatSync(f);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0,f);const p=path.relative(root,f).split(path.sep).join('/');assert.ok(!p.startsWith('../'));return {path:p,bytes:stat.size,sha256:digest(f)};});
assert.equal(new Set(entries.map(e=>e.path.toLowerCase())).size,entries.length);
const secretPatterns=[/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,/\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
let patternHits=0;
for(const f of unique.filter(f=>/\.(ts|tsx|mjs|md|json|txt|log|py)$/.test(f))){
 const b=fs.readFileSync(f);const content=b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8');
 if(secretPatterns.some(r=>r.test(content)))patternHits++;
}
assert.equal(patternHits,0);
const receipt={stage:'shoulder-transition-review',date:'2026-11-27',status:'PASS_LOCAL_TECHNICAL_PARTIAL_AAA',head:'226429ae1080d000336a7430926d64e4bb54a89b',tests:{files:120,passed:1226,failed:0,skippedOptIn:1,optInExecutedSeparately:true},browser:{checks,frames,draws,scenarios},sampledGeometry:{states:10,triangles:5994,...summary},productionMarkerHits:0,credentialPatternHits:patternHits,android:'UNVERIFIED_NO_AUTHORIZED_DEVICE',artifactCount:entries.length,artifactBytes:entries.reduce((a,e)=>a+e.bytes,0),entries};
const out=path.join(dir,'RECEIPT.json');fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
const reread=JSON.parse(fs.readFileSync(out,'utf8'));
for(const e of reread.entries){const f=path.join(root,e.path);assert.equal(fs.statSync(f).size,e.bytes);assert.equal(digest(f),e.sha256);}
console.log(JSON.stringify({status:'PASS',checks,frames,draws,files:reread.artifactCount,artifactBytes:reread.artifactBytes,receiptBytes:fs.statSync(out).size,receiptSha256:digest(out)}));
