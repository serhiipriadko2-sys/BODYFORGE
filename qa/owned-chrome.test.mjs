import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { parseDevToolsIdentity, checkedEndpoint, requirePreviewOrigin } from './owned-chrome.mjs';
const browserPath = '/devtools/browser/11111111-2222-3333-4444-555555555555';
const identity = { port: 49152, browserPath };
test('reads both lines of a disposable Chrome identity', () => {
  assert.deepEqual(parseDevToolsIdentity('49152\r\n' + browserPath + '\r\n'), identity);
});
for (const raw of ['49152', '0\n' + browserPath, '65536\n' + browserPath, '49152\n/devtools/page/fake', '49152\n' + browserPath + '\nextra']) {
  test('rejects invalid identity ' + JSON.stringify(raw), () => assert.throws(() => parseDevToolsIdentity(raw)));
}
test('accepts only the exact browser UUID at the verified loopback port', () => {
  const good = 'ws://127.0.0.1:49152' + browserPath;
  assert.equal(checkedEndpoint(good, identity), good);
  for (const bad of [good.replace('11111111', 'aaaaaaaa'), good.replace('49152','49153'),
    good.replace('127.0.0.1','localhost'), good + '?x=1', good.replace('ws:', 'wss:')]) {
    assert.throws(() => checkedEndpoint(bad, identity));
  }
});
test('page ID cannot be substituted for another target or the browser', () => {
  const good = 'ws://127.0.0.1:49152/devtools/page/ABC123';
  assert.equal(checkedEndpoint(good, identity, 'ABC123'), good);
  assert.throws(() => checkedEndpoint(good, identity, 'OTHER'));
  assert.throws(() => checkedEndpoint(good, identity));
});

test('preview proof rejects missing, stale and fallback entry responses', async t => {
  const entry = '/assets/index-Test123.js';
  const contents = 'console.log("test build")';
  const digest = createHash('sha256').update(contents).digest('hex');
  let html = '<script type="module" src="' + entry + '"></script>';
  let mediaType = 'text/javascript';
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    if (request.url === entry) {
      response.writeHead(200, { 'Content-Type': mediaType });
      response.end(contents);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(html);
  }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  await assert.rejects(requirePreviewOrigin(origin, ''), /EXPECT_ENTRY_SHA256/);
  await assert.rejects(requirePreviewOrigin('http://localhost:' + server.address().port, digest), /loopback/);
  assert.equal(requests, 0);
  assert.deepEqual(await requirePreviewOrigin(origin, digest.toUpperCase()), { entry, sha256: digest });
  await assert.rejects(requirePreviewOrigin(origin, '0'.repeat(64)), /mismatch/);
  mediaType = 'text/html';
  await assert.rejects(requirePreviewOrigin(origin, digest), /not JavaScript/);
  html = '<script type="module" src="/@vite/client"></script>';
  await assert.rejects(requirePreviewOrigin(origin, digest), /production preview/);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChildProcess } from 'node:child_process';
import { cleanupOwnedChrome } from './owned-chrome.mjs';

function cleanupFixture(t) {
  const prefix='bf-owned-cleanup-unit-';
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
  const executable=path.join(os.tmpdir(),process.platform==='win32'?'chrome.exe':'chrome');
  const chrome=Object.assign(new ChildProcess(),{
    spawnfile:executable,spawnargs:[executable,'--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
    pid:2147483647,exitCode:0,
  });
  chrome.kill=()=>{throw Error('test must never signal a process')};
  fs.writeFileSync(path.join(profile,'canary.txt'),'SYNTHETIC_OWNED_TEST');
  return {prefix,profile,chrome};
}
test('cleanup refuses a profile not bound to the launcher arguments',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  chrome.spawnargs[3]='--user-data-dir='+profile+'-other';
  await assert.rejects(cleanupOwnedChrome(profile,prefix,chrome),/launch.*profile|profile.*launch/i);
  assert.equal(fs.readFileSync(path.join(profile,'canary.txt'),'utf8'),'SYNTHETIC_OWNED_TEST');
});
test('cleanup rejects multiple profile arguments without touching the directory',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  chrome.spawnargs.push('--user-data-dir='+profile+'-other');
  await assert.rejects(cleanupOwnedChrome(profile,prefix,chrome),/launch.*profile|profile.*launch/i);
  assert.equal(fs.existsSync(profile),true);
});
test('cleanup rejects a supplied identity different from the profile before contacting CDP',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'49152\n'+browserPath+'\n');
  const saved=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error('synthetic no network')};
  t.after(()=>{globalThis.fetch=saved});
  await assert.rejects(cleanupOwnedChrome(profile,prefix,chrome,{...identity,port:49153}),/identity.*mismatch|mismatch.*identity/i);
  assert.equal(requests,0);
  assert.equal(fs.existsSync(profile),true);
});
test('cleanup refuses a linked profile root even when the launcher arguments match',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  const target=profile+'-target';
  fs.renameSync(profile,target);
  t.after(()=>fs.rmSync(target,{recursive:true,force:true}));
  fs.symlinkSync(target,profile,process.platform==='win32'?'junction':'dir');
  await assert.rejects(cleanupOwnedChrome(profile,prefix,chrome),/profile.*link|link.*profile/i);
  assert.equal(fs.lstatSync(profile).isSymbolicLink(),true);
  assert.equal(fs.readFileSync(path.join(target,'canary.txt'),'utf8'),'SYNTHETIC_OWNED_TEST');
});

test('unlaunched child cannot authorize closing a supplied on-disk browser identity',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  chrome.pid=undefined;
  fs.writeFileSync(path.join(profile,'DevToolsActivePort'),'49152\n'+browserPath+'\n');
  const saved=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;throw Error('synthetic no network')};
  t.after(()=>{globalThis.fetch=saved});
  await assert.rejects(cleanupOwnedChrome(profile,prefix,chrome,identity),/identity.*launcher|launcher.*identity/i);
  assert.equal(requests,0);
  assert.equal(fs.existsSync(profile),true);
});
test('a different loopback browser UUID prevents cleanup and preserves the profile',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  let requests=0;
  const server=createServer((request,response)=>{
    requests++;
    response.writeHead(200,{'Content-Type':'application/json'});
    response.end(JSON.stringify({webSocketDebuggerUrl:'ws://127.0.0.1:'+server.address().port+browserPath.replace('11111111','aaaaaaaa')}));
  }).listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await once(server,'listening');
  const local={port:server.address().port,browserPath};
  fs.writeFileSync(path.join(profile,'DevToolsActivePort'),local.port+'\n'+browserPath+'\n');
  await assert.rejects(cleanupOwnedChrome(profile,prefix,chrome,local),/endpoint does not match/i);
  assert.equal(requests,1);
  assert.equal(fs.existsSync(profile),true);
});
test('identity hard link is rejected before contacting any endpoint',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  const target=path.join(profile,'identity-fixture.txt');
  fs.writeFileSync(target,'49152\n'+browserPath+'\n');
  fs.linkSync(target,path.join(profile,'DevToolsActivePort'));
  await assert.rejects(cleanupOwnedChrome(profile,prefix,chrome,identity),/identity file/i);
  assert.equal(fs.existsSync(profile),true);
});
test('failed spawn without identity can remove only its bound disposable directory',async t=>{
  const {prefix,profile,chrome}=cleanupFixture(t);
  chrome.pid=undefined;
  const result=await cleanupOwnedChrome(profile,prefix,chrome);
  assert.equal(result.mode,'graceful-or-no-spawn');
  assert.equal(result.profileRemoved,true);
  assert.equal(result.portClosed,null);
  assert.equal(fs.existsSync(profile),false);
});
