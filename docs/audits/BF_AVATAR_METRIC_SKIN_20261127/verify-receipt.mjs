import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd();
const rel='docs/audits/BF_AVATAR_METRIC_SKIN_20261127';
const dir=path.join(root,rel);
const read=(file)=>{const b=fs.readFileSync(path.join(dir,file));return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replace(/\x1b\[[0-9;]*m/g,'');};
const digest=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pins={
'src/lib/avatarMetricSkinReview.ts':'CFBD684F20CFECF1B108008F161F81A6BBF466E54F45CE9890A7DF9D81DF43A9',
'src/lib/avatarMetricSkinReview.test.ts':'707385C880B879671E4B2EE6E4CF908342EC4886320B5326A3DE2DEB704EC71C',
'src/lib/avatarSkinLighting.ts':'952EF00FDAA39F83A9196B475CEEEBFAD64B434A54898D44B50461C9134FFF7E',
'src/components/Avatar3D.tsx':'61F8943606CD02CEDDBA04111A149E1A68F11E535953B37458E98E60935D79A3',
'qa/avatar-quality-e2e.mjs':'48E5E821F8ABCED69EF2382409DAF255312F8AF579F077AC414B840826B60994',
'public/assets/bodyforge-athlete-efficient.glb':'DF8C4E3D0D8EBFBD6A03B83E537663BDA41DF5D0D30259AD1B530C2A2ABEFA7E',
'public/assets/athlete-scan-pores.png':'56628FEC1902669F0CABB7B2DCDA7F5BC7837D042DB81F068805AA2A3CAE0685'};
for(const [p,h] of Object.entries(pins))assert.equal(digest(path.join(root,p)),h.toLowerCase(),p);
assert.match(read('full-vitest.log'),/Test Files\s+117 passed\s+\(117\)/);
assert.match(read('full-vitest.log'),/Tests\s+1214 passed\s+\(1214\)/);
assert.match(read('targeted.log'),/Tests\s+22 passed\s+\(22\)/);
assert.match(read('build-final.log'),/built in/);
assert.match(read('production-gate.log'),/PRODUCTION_REVIEW_MARKER_HITS=0/);
const tile=JSON.parse(read('tile-verified.json'));
assert.equal(tile.status,'PASS');assert.equal(tile.texels,65536);assert.equal(tile.fnv1a,'624768ed');
assert.equal(tile.packedSha256,'4bccf6e5a656428e263f1ca92615352a5a3ce74b500e8375877a10d1bf7860cf');
const scenarios=[];let checks=0,draws=0,frames=0;
for(const [name,n] of Object.entries({'on-max':50,'off-max':44,'on-neutral':50,'off-neutral':44,'fallback-max':45,'hardware-max':51})){
 const log=read(name+'.log');
 const found=log.split(/\r?\n/).filter(l=>l.startsWith('ATHLETE_METRIC_SKIN_PASS '));
 assert.equal(found.length,1,name);
 const j=JSON.parse(found[0].slice('ATHLETE_METRIC_SKIN_PASS '.length));
 assert.equal(j.assertions,n,name);
 assert.equal(j.screenshots.length,6,name);
 assert.match(log,/PASS cosmetic skin changes preserve exact synthetic game bytes/);
 assert.match(log,/PASS no uncaught browser exceptions/);
 if(name==='hardware-max')assert.match(j.webglRenderer,/NVIDIA GeForce RTX 3070.*Direct3D11/);
 for(const s of j.screenshots){
  assert.equal(path.dirname(path.resolve(s.file)),path.join(dir,name));
  const b=fs.readFileSync(s.file);assert.equal(b.length,s.bytes);
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 }
 for(const v of [j.metricDraws,j.reloadedMetricDraws].filter(Boolean)){
  assert.equal(v.mismatch,0);assert.equal(v.count,v.matched);draws+=v.count;
 }
 if(j.mode==='on'){assert.ok(j.metricDraws?.count>0);assert.ok(j.textureHashes.includes(tile.fnv1a));}
 else{assert.equal(j.metricDraws,null);assert.ok(!j.textureHashes.includes(tile.fnv1a));}
 checks+=n;frames+=j.screenshots.length;
 scenarios.push({name,assertions:n,frames:6,renderer:j.webglRenderer??'SwiftShader',metricDraws:(j.metricDraws?.count??0)+(j.reloadedMetricDraws?.count??0)});
}
assert.equal(checks,284);assert.equal(draws,579);assert.equal(frames,36);
const comp=JSON.parse(read('comparison.json'));assert.equal(comp.sheets.length,4);assert.equal(comp.pairs.filter(p=>!p.region).length,12);
for(const s of comp.sheets){const f=path.join(dir,s.path);assert.equal(fs.statSync(f).size,s.bytes);assert.equal(digest(f),s.sha256);}
const report=path.join(dir,'REPORT.md');
const original=fs.readFileSync(report,'utf8');
fs.writeFileSync(report,original.replace('Full final test counts in full-vitest.log and RECEIPT.json.','Full final suite: 1,214/1,214 tests, 117/117 test files; final build exit 0. See full-vitest.log and RECEIPT.json.'));
const list=(folder)=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{
 assert.ok(!e.isSymbolicLink(),'Unexpected symlink '+e.name);
 const f=path.join(folder,e.name);return e.isDirectory()?list(f):[f];
});
const files=[...Object.keys(pins).map(p=>path.join(root,p)),path.join(root,'public/assets/athlete-scan-source.md'),...list(dir).filter(p=>path.basename(p)!=='RECEIPT.json')];
const unique=[...new Set(files)].sort();
const entries=unique.map(f=>{const stat=fs.lstatSync(f);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0,f);return {path:path.relative(root,f).split(path.sep).join('/'),bytes:stat.size,sha256:digest(f)};});
const receipt={stage:'metric-skin-review',date:'2026-11-27',status:'PASS_LOCAL_TECHNICAL_PARTIAL_AAA',tests:{files:117,passed:1214,failed:0,initialTargeted:22},browser:{checks,draws,frames,scenarios},productionMarkerHits:0,android:'UNVERIFIED_NO_AUTHORIZED_DEVICE',artifactCount:entries.length,artifactBytes:entries.reduce((a,e)=>a+e.bytes,0),entries};
const out=path.join(dir,'RECEIPT.json');fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');
const reread=JSON.parse(fs.readFileSync(out,'utf8'));
for(const e of reread.entries){const f=path.join(root,e.path);assert.equal(fs.statSync(f).size,e.bytes);assert.equal(digest(f),e.sha256);}
console.log(JSON.stringify({status:'PASS',checks,draws,frames,files:reread.artifactCount,artifactBytes:reread.artifactBytes,receiptBytes:fs.statSync(out).size,receiptSha256:digest(out)}));
