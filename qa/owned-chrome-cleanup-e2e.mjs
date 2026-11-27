// BF-005: two independently owned disposable browsers; one simulated CDP transport failure.
// No application, actual user profile, camera, or non-loopback target.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {waitForOwnedBrowser,cleanupOwnedChrome,newOwnedPage,closeOwnedPage} from './owned-chrome.mjs';
import {recoveryFailureCode} from './release-gate-diagnostics.mjs';

const prefix='bf-owned-cleanup-e2e-';
const owned=[];
const originalFetch=globalThis.fetch;
let checks=0,stage='launch-first';
const enter=value=>{stage=value;console.log('BF005_RECOVERY_STAGE',stage)};
const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS',label)};
async function launch(){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  const executable=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome=spawn(executable,[
    '--headless=new','--disable-gpu','--disable-webgl','--disable-background-networking',
    '--disable-component-update','--no-first-run','--no-default-browser-check',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  const item={profile,chrome,identity:null,attempted:false,cleaned:false};
  owned.push(item);
  item.identity=await waitForOwnedBrowser(profile,chrome);
  return item;
}
async function clean(item){
  item.attempted=true;
  const receipt=await cleanupOwnedChrome(item.profile,prefix,item.chrome,item.identity);
  item.cleaned=true;
  check(!fs.existsSync(item.profile),'owned profile removed');
  check(item.chrome.exitCode!==null||item.chrome.signalCode!==null,'owned launcher exited');
  return receipt;
}
try{
  assert.equal(process.platform,'win32','This process-recovery integration is Windows-only');
  enter('launch-first');const first=await launch();
  enter('launch-second');const second=await launch();
  enter('verify-distinct');
  check(first.identity.port!==second.identity.port,'two distinct disposable debug ports');
  check(first.identity.browserPath!==second.identity.browserPath,'two distinct browser identities');
  // Simulate only the close transport failure for the first exact loopback endpoint.
  const endpoint='http://127.0.0.1:'+first.identity.port+'/json/version';
  let injected=0;
  globalThis.fetch=(input,options)=>String(input)===endpoint
    ? (injected++,Promise.reject(new TypeError('synthetic close transport unavailable')))
    : originalFetch(input,options);
  let recovered;
  enter('recover-first');
  try{recovered=await clean(first)}finally{globalThis.fetch=originalFetch}
  enter('verify-recovery');
  check(injected===1,'one simulated graceful-close transport failure');
  check(recovered.mode==='verified-windows-recovery'&&recovered.exactProfileBefore>0&&recovered.terminated>0&&recovered.remaining===0,'exact Windows profile recovery verified');
  enter('verify-second');
  check(fs.existsSync(second.profile),'unrelated disposable profile preserved');
  const page=await newOwnedPage(second.identity);
  check(page.type==='page','second disposable browser still responds');
  await closeOwnedPage(second.identity,page);
  enter('close-second');
  const graceful=await clean(second);
  enter('verify-final');
  check(graceful.remaining===0&&graceful.profileRemoved===true,'second cleanup verified');
  console.log('BF005_OWNED_CHROME_RECOVERY_PASS',JSON.stringify({checks,first:recovered,second:graceful}));
}catch(error){
  console.error('BF005_RECOVERY_FAILURE',stage,recoveryFailureCode(error));
  process.exitCode=16;
}finally{
  globalThis.fetch=originalFetch;
  for(const item of owned){
    if(item.cleaned||item.attempted)continue;
    try{await clean(item)}catch{console.error('QA_OWNED_CLEANUP FAIL unverified disposable cleanup');process.exitCode||=17}
  }
  for(const item of owned)if(!item.cleaned){
    console.error('BF005_RECOVERY_CLEANUP_UNVERIFIED');
    console.error('BF005_OWNED_RESOURCE_UNVERIFIED',JSON.stringify({profileSuffix:path.basename(item.profile),identity:item.identity}));
    process.exitCode||=17;
  }
}
