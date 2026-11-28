import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),rel='docs/audits/BF_AVATAR_ARM_TAPER_20261127',dir=path.join(root,rel);
const read=file=>{const b=fs.readFileSync(path.join(dir,file));return b.toString(b[0]===255&&b[1]===254?'utf16le':'utf8').replace(/^\uFEFF/,'').replace(/\x1b\[[0-9;]*m/g,'');};
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pins={
 'src/lib/avatarPoseCorrectiveReview.ts':'17FD97DACF631CC699E613A56C735CF332581B2E1ACFD6971522B4FC0BC84B25',
 'src/lib/avatarArmTaperReview.test.ts':'2B6B399406E81AF573F2F1DDE39A320E4EBCEBAAB0386E0045C14F5DD51F31BC',
 'src/lib/avatarArmContourReview.test.ts':'C45C2B1AF875EB2AD7937652B4C2FC2AA2AB829D2B7F3FCC3F2C557C29082910',
 'src/lib/avatarPoseCorrectiveReview.test.ts':'5DA0061C00A2D63F32E5ABD6E5A602CBC43330C83EFCB2342BC8BC6273C3728A',
 'src/components/Avatar3D.tsx':'EDA7D92EF8ABB09D50F7A45A4047AA62330F841BA026A734136A19524220064E',
 'qa/avatar-quality-e2e.mjs':'75C296D28E5EF9751A380D98E5ECB21E5B0DC541DC1610E13E18646EF88EEA7E',
 'src/lib/avatarPose.ts':'4B84069276E4EFF8D6B85DA2EF67C87B2E0C68FBF37F02D7FF8FE9E72D77BC09',
 'src/lib/avatarPhysique.ts':'2FCF4A0F8AAF75D9FE26A26EB4D991B983709AB3A15F6DCB1A493B9076524C15',
 'src/lib/avatarShoulderTransitionReview.ts':'56ABE1D0D989EA0E741108E62C75A73563352C584920C77F0D3B257E654F74C2',
 'public/assets/bodyforge-athlete-efficient.glb':'DF8C4E3D0D8EBFBD6A03B83E537663BDA41DF5D0D30259AD1B530C2A2ABEFA7E',
 'docs/audits/BF_AVATAR_POSE_CORRECTIVE_20261127/runtime.json':'39F7C164758D543AA3954C0A410865F76F30D4BB38AD136313C2E05E4C61FBA1',
 '.bodyforge-qa/pose-corrective-20261127/runtime.bin':'FFAE5EF86BE158145737C87791879F57AAE9E8AF238AB0E6F9EBF3186BD87E47',
 [rel+'/avatarPoseCorrectiveReview.ts.before.txt']:'8F07052D9D863664AAF88A3FF1749033B34275ADFAF681B3151AA169A7A1DC62',
 [rel+'/Avatar3D.tsx.before.txt']:'7BF48452CE771B9B751B12F28DFA68EC5411E36204528BFC2CAF710AD4CA571A',
 [rel+'/avatar-quality-e2e.mjs.before.txt']:'E5491B6EBADBBA511D745DE7EC17C0CB50C72764C26852F0F2231B360EC8725C',
 [rel+'/avatarPoseCorrectiveReview.ts.axial.txt']:'2945C7938DE7ED88C3213ABF3F169F6EB685EC649C432B767C0398D7B25F4064',
 [rel+'/Avatar3D.tsx.axial.txt']:'EA40CB3423A9B2FCCEDD04A570157FDF06484462392910736B358D8DBFA67B64',
 [rel+'/avatar-quality-e2e.mjs.axial.txt']:'3B0AE68E45F7415EF880B9BA4A4FFDB9F8B6BBE4C28C43EA4DE06E37989E55E8'
};
for(const [p,h] of Object.entries(pins))assert.equal(digest(path.join(root,p)),h.toLowerCase(),p);
assert.match(read('runtime.log'),/Tests\s+5 passed\s+\(5\)/);
assert.match(read('contour-runtime.log'),/Tests\s+8 passed\s+\(8\)/);
assert.match(read('full-vitest.log'),/Test Files\s+122 passed\s+\(122\)/);
assert.match(read('full-vitest.log'),/Tests\s+1231 passed\s+\|\s+1 skipped\s+\(1232\)/);
assert.match(read('contour-full-vitest.log'),/Test Files\s+123 passed\s+\(123\)/);
assert.match(read('contour-full-vitest.log'),/Tests\s+1234 passed\s+\|\s+1 skipped\s+\(1235\)/);
const bundles=[];
for(const [stage,folder] of [['axial','arm-taper'],['contour','arm-contour']]){
 const prefix=stage==='axial'?'':'contour-';
 assert.match(read(prefix+'build.log'),/built in/);
 assert.match(read(prefix+'production-gate.log'),/PRODUCTION_REVIEW_MARKERS_ABSENT/);
 const build=path.join(root,'.bodyforge-qa/'+folder+'-build-20261127/assets');
 const js=fs.readdirSync(build).filter(n=>n.endsWith('.js'));
 assert.ok(js.length>0);
 for(const n of js)assert.ok(!/BF_ARM_CONTOUR_REVIEW_V1|BF_ARM_TAPER_REVIEW_V1|avatarArmTaper|BF_POSE_CORRECTIVE_REVIEW_V1|avatarPoseCorrective/.test(fs.readFileSync(path.join(build,n),'utf8')),n);
 const b=js.filter(n=>/^Avatar3D-/.test(n));assert.equal(b.length,1);bundles.push(path.join(build,b[0]));
}
assert.equal(digest(bundles[0]),digest(bundles[1]),'production avatar bundle parity');
const expectedBuffers={'916':'89012c35','7036':'83e687b9','131790':'56a7c578'};
let checks=0,frames=0,draws=0;const scenarios=[];
for(const mode of ['on','off','contour'])for(const level of ['max','neutral']){
 const name='browser-'+mode+'-'+level,log=read(name+'.log');
 const found=log.split(/\r?\n/).filter(l=>l.startsWith('ATHLETE_METRIC_SKIN_PASS '));
 assert.equal(found.length,1,name);const j=JSON.parse(found[0].slice('ATHLETE_METRIC_SKIN_PASS '.length));
 assert.equal(j.assertions,66);assert.equal(j.screenshots.length,8);
 assert.equal(j.poseMode,'on');assert.equal(j.shoulderMode,'off');assert.equal(j.armTaperMode,mode);assert.equal(j.maximum,level==='max');
 assert.match(j.webglRenderer,/NVIDIA GeForce RTX 3070.*Direct3D11/);
 assert.match(log,/PASS cosmetic skin changes preserve exact synthetic game bytes/);
 assert.match(log,/PASS reload preserves synthetic game bytes/);
 assert.match(log,/PASS no uncaught browser exceptions/);
 assert.equal((log.match(/PASS expected narrow pose corrective revision/g)||[]).length,2);
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
assert.equal(checks,396);assert.equal(frames,48);assert.equal(draws,1335);
const sweep=JSON.parse(read('taper-sweep.json')),contourSweep=JSON.parse(read('contour-sweep.json'));
assert.deepEqual(sweep.region,{shoulderTriangles:5994,expandedTriangles:14088,elbowTriangles:3188,distalUniqueVertices:1288});
assert.equal(Object.keys(sweep.results).length,12);assert.equal(Object.keys(contourSweep).length,10);
const axial=JSON.parse(read('runtime-clearance.json')),contour=JSON.parse(read('contour-runtime-clearance.json'));
const a=axial.v1.states,b=axial.v2.states,c=contour.states;
assert.equal(Object.keys(a).length,19);assert.equal(Object.keys(b).length,19);assert.equal(Object.keys(c).length,19);
const keys=Object.keys(a).filter(k=>k!=='reset'),summary={};
for(const k of ['comp','severe','expandedComp','expandedOverlap','elbowComp','elbowSevere','elbowOverlap','shirt2','shirt5']){
 summary[k]={prior:keys.reduce((s,n)=>s+a[n][k],0),axial:keys.reduce((s,n)=>s+b[n][k],0),contour:keys.reduce((s,n)=>s+c[n][k],0)};
 for(const n of keys){assert.ok(b[n][k]<=a[n][k],k+' '+n+' axial');assert.ok(c[n][k]<=a[n][k],k+' '+n+' contour');}
}
assert.deepEqual(summary,{comp:{prior:1388,axial:1388,contour:1388},severe:{prior:219,axial:219,contour:219},expandedComp:{prior:1388,axial:1388,contour:1388},expandedOverlap:{prior:2772,axial:2772,contour:2772},elbowComp:{prior:0,axial:0,contour:0},elbowSevere:{prior:0,axial:0,contour:0},elbowOverlap:{prior:0,axial:0,contour:0},shirt2:{prior:338,axial:337,contour:335},shirt5:{prior:8,axial:8,contour:8}});
for(const k of keys){assert.ok(c[k].minDepth>=a[k].minDepth-.001);assert.ok(c[k].predictionMaxErrorMm<.001);assert.ok(b[k].predictionMaxErrorMm<.001);}
assert.ok(Math.abs(contour.summary.distalRms-13.476869265238443)<1e-8);
assert.ok(contour.summary.bendRms<contourSweep['0'].summary.bendRms);
const seamEvidence={};
for(const prefix of ['', 'contour-']){
 const s=JSON.parse(read(prefix+'seam-clearance.json'));
 assert.equal(Object.keys(s.states).length,19);
 for(const x of Object.values(s.summary))assert.equal(x.maxIncreaseMm,0);
 assert.equal(s.states.neutral.body.pairedDuplicates,17397);
 assert.equal(s.states.neutral.shirt.pairedDuplicates,88);
 assert.equal(s.states.neutral.nippleRim.anchors,68);
 seamEvidence[prefix||'axial']=s.summary;
 const comparison=JSON.parse(read(prefix+'comparison.json'));assert.equal(comparison.sheets.length,8);assert.equal(comparison.pairs.length,16);
 for(const s of comparison.sheets){const f=path.join(dir,s.path);assert.equal(fs.statSync(f).size,s.bytes);assert.equal(digest(f),s.sha256);}
}
const priv=path.join(root,'.bodyforge-qa/arm-taper-20261127');
for(const prefix of ['', 'contour-']){
 const runtime=JSON.parse(read(prefix+'runtime.json')),bin=path.join(priv,prefix+'runtime.bin');
 assert.equal(fs.statSync(bin).size,runtime.binaryBytes);assert.equal(digest(bin),runtime.binarySha256);
 for(const state of Object.values(runtime.report.candidate.deltas)){
  assert.equal(state.length,4);for(const d of state){assert.equal(d.outside,0);assert.ok(d.peak<=.035001);}
 }
}
const list=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{
 assert.ok(!e.isSymbolicLink(),'Unexpected symlink '+e.name);
 const f=path.join(folder,e.name);return e.isDirectory()?list(f):[f];
});
const files=[...Object.keys(pins).map(p=>path.join(root,p)),...bundles,...list(priv),...list(dir).filter(p=>path.basename(p)!=='RECEIPT.json')];
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
const receipt={stage:'arm-taper-and-contour',date:'2026-11-27',status:'PASS_LOCAL_TECHNICAL_PARTIAL_VISUAL',head:'226429ae1080d000336a7430926d64e4bb54a89b',tests:{files:123,passed:1234,failed:0,skippedOptIn:1,targeted:8},browser:{checks,frames,draws,scenarios},sampledGeometry:{states:18,region:sweep.region,...summary,distalRmsMm:{prior:axial.v1.summary.distalRms,axial:axial.v2.summary.distalRms,contour:contour.summary.distalRms},displacementSecondDifferenceRmsMm:{prior:contourSweep.v1.summary.bendRms,axial:contourSweep['0'].summary.bendRms,contour:contour.summary.bendRms}},seams:seamEvidence,productionMarkerHits:0,productionAvatarBundleParity:true,credentialPatternHits:patternHits,android:'UNVERIFIED_NO_AUTHORIZED_DEVICE',artifactCount:entries.length,artifactBytes:entries.reduce((a,e)=>a+e.bytes,0),entries};
const out=path.join(dir,'RECEIPT.json');fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
const reread=JSON.parse(fs.readFileSync(out,'utf8'));
for(const e of reread.entries){const f=path.join(root,e.path);assert.equal(fs.statSync(f).size,e.bytes);assert.equal(digest(f),e.sha256);}
console.log(JSON.stringify({status:'PASS',checks,frames,draws,files:reread.artifactCount,artifactBytes:reread.artifactBytes,receiptBytes:fs.statSync(out).size,receiptSha256:digest(out)}));
