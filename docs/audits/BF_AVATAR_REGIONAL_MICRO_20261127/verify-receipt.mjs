import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),rel='docs/audits/BF_AVATAR_REGIONAL_MICRO_20261127',dir=path.join(root,rel);
const read=file=>{const b=fs.readFileSync(path.join(dir,file));return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replace(/\x1b\[[0-9;]*m/g,'');};
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pins={
 'src/lib/avatarRegionalMicroReview.ts':'7025B9F2C7BEC406F5B1FE0E8DEDFCF9BDE583E19ECEC0D11E17A9077E29D758',
 'src/lib/avatarRegionalMicroReview.test.ts':'11BB77417ECCD7E75B1F8B19DA8645B22B04E05315B4992ED0927E32DF8965A3',
 'src/lib/avatarSkinLighting.ts':'982569262C75D85983B3CD094690D5AF992BA808EEAB92816452F72D55788E47',
 'src/components/Avatar3D.tsx':'7673D2F3BC1A79C49708CFC2A7B03F69A10F6B7907EFA37BFABD8883D713CE16',
 'qa/avatar-quality-e2e.mjs':'BBD7DD1BFE98363992B9D4A1A10DE1D22DF8F769908A33B453B3C20E3DFB6D33',
 'src/lib/avatarMetricSkinReview.ts':'CFBD684F20CFECF1B108008F161F81A6BBF466E54F45CE9890A7DF9D81DF43A9',
 'public/assets/bodyforge-athlete-efficient.glb':'DF8C4E3D0D8EBFBD6A03B83E537663BDA41DF5D0D30259AD1B530C2A2ABEFA7E',
 'public/assets/athlete-scan-pores.png':'56628FEC1902669F0CABB7B2DCDA7F5BC7837D042DB81F068805AA2A3CAE0685'
};
for(const [p,h] of Object.entries(pins))assert.equal(digest(path.join(root,p)),h.toLowerCase(),p);
assert.match(read('targeted.log'),/Tests\s+23 passed\s+\(23\)/);
assert.match(read('full-vitest.log'),/Test Files\s+118 passed\s+\(118\)/);
assert.match(read('full-vitest.log'),/Tests\s+1219 passed\s+\(1219\)/);
assert.match(read('build.log'),/built in/);
assert.match(read('production-gate.log'),/PRODUCTION_REVIEW_MARKER_HITS=0/);
const buildDir=path.join(root,'.bodyforge-qa/regional-micro-build-20261127/assets');
const js=fs.readdirSync(buildDir).filter(n=>n.endsWith('.js'));
assert.ok(js.length>0);
for(const n of js)assert.ok(!/BF_REGIONAL_MICRO_V1|avatarRegionalMicro|bfRegionalMicro|bfMesoNormal|BF_METRIC_SKIN_GRADIENT_V1|avatarMetricSkin/.test(fs.readFileSync(path.join(buildDir,n),'utf8')),n);
const bundle=js.filter(n=>/^Avatar3D-/.test(n));assert.equal(bundle.length,1);
const expectedBuffers={'916':'89012c35','7036':'83e687b9','131790':'56a7c578'};
const cases={'regional-max':56,'metric-max':53,'regional-neutral':55,'metric-neutral':52,'regional-fallback':46,'no-diffusion':56};
let checks=0,frames=0,metricDraws=0,regionalDraws=0;const scenarios=[];
for(const [name,n] of Object.entries(cases)){
 const log=read(name+'.log');
 const found=log.split(/\r?\n/).filter(l=>l.startsWith('ATHLETE_METRIC_SKIN_PASS '));
 assert.equal(found.length,1,name);
 const j=JSON.parse(found[0].slice('ATHLETE_METRIC_SKIN_PASS '.length));
 assert.equal(j.assertions,n,name);assert.equal(j.screenshots.length,6,name);
 assert.match(log,/PASS cosmetic skin changes preserve exact synthetic game bytes/);
 assert.match(log,/PASS no uncaught browser exceptions/);
 const enabled=['regional-max','regional-neutral','no-diffusion'].includes(name);
 const hardware=name.endsWith('-max')||name==='no-diffusion';
 assert.equal(Boolean(j.webglRenderer),hardware,name);
 if(hardware)assert.match(j.webglRenderer,/NVIDIA GeForce RTX 3070.*Direct3D11/);
 if(name==='no-diffusion')assert.match(log,/matched current rig, no angular diffusion|PASS every observed metric draw binds the regional profile/);
 const views=new Set();
 for(const shot of j.screenshots){
  assert.equal(path.dirname(path.resolve(shot.file)),path.join(dir,name));
  const b=fs.readFileSync(shot.file);assert.equal(b.length,shot.bytes);
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(b.readUInt32BE(16),780);assert.equal(b.readUInt32BE(20),1688);
  assert.ok(!views.has(shot.file));views.add(shot.file);
 }
 let md=0,rd=0;
 if(name==='regional-fallback'){
   assert.equal(j.metricDraws,null);assert.ok(!j.textureHashes.includes('624768ed'));
 }else{
   assert.ok(j.metricDraws.count>0&&j.reloadedMetricDraws.count>0);
   assert.ok(j.textureHashes.includes('624768ed'));
   for(const v of [j.metricDraws,j.reloadedMetricDraws]){
     assert.equal(v.mismatch,0);assert.equal(v.count,v.matched);md+=v.count;
     if(enabled){
       const r=v.regional;assert.equal(r.count,v.count);assert.equal(r.matched,r.count);assert.equal(r.mismatch,0);
       assert.deepEqual(Object.keys(r.buffers).sort(),Object.keys(expectedBuffers).sort());
       for(const [size,h] of Object.entries(expectedBuffers)){
         assert.equal(r.buffers[size].hash,h);assert.equal(r.buffers[size].bytes,Number(size));
       }
       rd+=r.count;
     }else assert.equal(v.regional,undefined);
   }
 }
 checks+=n;frames+=j.screenshots.length;metricDraws+=md;regionalDraws+=rd;
 scenarios.push({name,assertions:n,frames:6,renderer:j.webglRenderer??'SwiftShader',metricDraws:md,regionalDraws:rd});
}
assert.equal(checks,318);assert.equal(frames,36);assert.equal(metricDraws,970);assert.equal(regionalDraws,576);
const comparison=JSON.parse(read('comparison.json'));
assert.equal(comparison.sheets.length,4);assert.equal(comparison.pairs.filter(p=>!p.region).length,12);
const micro= comparison.pairs.filter(p=>p.region).map(p=>({level:p.level,region:p.region,neighborRmsReduction:1-p.decodedLocalNeighborRms.regional/p.decodedLocalNeighborRms.metric}));
assert.equal(micro.length,8);for(const m of micro)assert.ok(m.neighborRmsReduction>0&&m.neighborRmsReduction<1);
for(const s of comparison.sheets){const f=path.join(dir,s.path);assert.equal(fs.statSync(f).size,s.bytes);assert.equal(digest(f),s.sha256);}
const parity=JSON.parse(read('baseline-parity.json'));assert.equal(parity.length,12);assert.equal(parity.filter(p=>p.identicalBytes).length,10);assert.equal(parity.reduce((n,p)=>n+p.changedPixels,0),4);assert.equal(Math.max(...parity.map(p=>p.maxChannelDelta8bit)),1);
const list=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{
 assert.ok(!e.isSymbolicLink(),'Unexpected symlink '+e.name);
 const f=path.join(folder,e.name);return e.isDirectory()?list(f):[f];
});
const files=[...Object.keys(pins).map(p=>path.join(root,p)),path.join(root,'public/assets/athlete-scan-source.md'),path.join(buildDir,bundle[0]),...list(dir).filter(p=>path.basename(p)!=='RECEIPT.json')];
const unique=[...new Set(files)].sort();
const entries=unique.map(f=>{const stat=fs.lstatSync(f);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0,f);const p=path.relative(root,f).split(path.sep).join('/');assert.ok(!p.startsWith('../'));return {path:p,bytes:stat.size,sha256:digest(f)};});
assert.equal(new Set(entries.map(e=>e.path.toLowerCase())).size,entries.length);
const secretPatterns=[/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/,/\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
let patternHits=0;
for(const f of unique.filter(f=>/\.(ts|tsx|mjs|md|json|txt|log|py)$/.test(f))){
 const b=fs.readFileSync(f);const content=b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8');
 if(secretPatterns.some(r=>r.test(content)))patternHits++;
}
assert.equal(patternHits,0,'Credential-pattern review');
const receipt={stage:'regional-micro-review',date:'2026-11-27',status:'PASS_LOCAL_TECHNICAL_PARTIAL_AAA',head:'226429ae1080d000336a7430926d64e4bb54a89b',tests:{files:118,passed:1219,failed:0,targeted:23},browser:{checks,frames,metricDraws,regionalDraws,scenarios,profileHashes:expectedBuffers},baseline:{byteIdenticalFrames:10,comparedFrames:12,changedPixels:4,maxChannelDelta8bit:1},microContrast:micro,productionMarkerHits:0,credentialPatternHits:patternHits,android:'UNVERIFIED_NO_AUTHORIZED_DEVICE',artifactCount:entries.length,artifactBytes:entries.reduce((a,e)=>a+e.bytes,0),entries};
const out=path.join(dir,'RECEIPT.json');fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
const reread=JSON.parse(fs.readFileSync(out,'utf8'));
for(const e of reread.entries){const f=path.join(root,e.path);assert.equal(fs.statSync(f).size,e.bytes);assert.equal(digest(f),e.sha256);}
console.log(JSON.stringify({status:'PASS',checks,frames,metricDraws,regionalDraws,files:reread.artifactCount,artifactBytes:reread.artifactBytes,receiptBytes:fs.statSync(out).size,receiptSha256:digest(out)}));
