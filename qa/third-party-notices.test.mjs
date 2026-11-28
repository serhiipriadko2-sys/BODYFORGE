import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {renderThirdPartyNotices,verifyThirdPartyNotices,NOTICE_PATH} from './third-party-notices.mjs';
const root=path.resolve(import.meta.dirname,'..');
test('all six pinned package license texts and model license match public bytes',()=>{
  const b=renderThirdPartyNotices(root),r=verifyThirdPartyNotices(root);assert.equal(r.packages,6);assert.equal(r.model,1);assert.equal(r.bytes,b.length);
  assert.equal(r.licenseReview,'incomplete-transitive-native-and-assets');assert.ok(b.toString('utf8').includes('Lucent Technologies'));
});
test('altered public text, upstream text, and unexpected dependency fail closed',t=>{
  const dir=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'bf-notices-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true,maxRetries:4,retryDelay:100}));
  const files=['package-lock.json','public/'+NOTICE_PATH,'qa/license-inputs/mediapipe-1.1.1-LICENSE.txt','qa/license-inputs/apache-2.0.txt'];
  for(const n of ['@mediapipe/tasks-vision','lucide-react','react','react-dom','scheduler','three']){files.push('node_modules/'+n+'/package.json');if(n!=='@mediapipe/tasks-vision')files.push('node_modules/'+n+'/LICENSE');}
  for(const n of files){const dst=path.join(dir,n);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(path.join(root,n),dst);}
  const notice=path.join(dir,'public',NOTICE_PATH),original=fs.readFileSync(notice);fs.appendFileSync(notice,'tampered');assert.throws(()=>verifyThirdPartyNotices(dir),/notice bytes mismatch/);fs.writeFileSync(notice,original);
  const license=path.join(dir,'qa/license-inputs/apache-2.0.txt');fs.appendFileSync(license,'tampered');assert.throws(()=>verifyThirdPartyNotices(dir),/source pin mismatch/);fs.copyFileSync(path.join(root,'qa/license-inputs/apache-2.0.txt'),license);
  const lock=path.join(dir,'package-lock.json'),data=JSON.parse(fs.readFileSync(lock,'utf8'));data.packages['node_modules/foreign']={version:'1',license:'MIT'};fs.writeFileSync(lock,JSON.stringify(data));assert.throws(()=>verifyThirdPartyNotices(dir),/inventory mismatch/);
});
