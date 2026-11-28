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


// Execute the actual read-only scope wrapper with synthetic enumerations.
// No real process enumeration or termination occurs in these tests.
test('Windows scope retries only incomplete reads, discards partial results and remains fail-closed', {skip:process.platform!=='win32'}, async()=>{
  const {execFileSync}=await import('node:child_process');
  const source=fs.readFileSync(new URL('./owned-chrome-windows.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const wrapper=source.match(/function Find-Owned \{[\s\S]*?\n\}\n\n\$before=@\(Find-Owned\)/)?.[0]?.replace(/\n\n\$before=@\(Find-Owned\)$/,'');
  assert.ok(wrapper);
  const setup="$ErrorActionPreference='Stop'\n$script:calls=0\n$script:kind='transient'\nfunction Start-Sleep {param([int]$Milliseconds)}\nfunction Find-OwnedOnce {\n  $script:calls++\n  if($script:kind -eq 'other'){throw 'Ambiguous exact-profile process'}\n  if($script:kind -eq 'transient' -and $script:calls -gt 1){return 222}\n  111\n  throw 'Chrome process scope uninspectable'\n}\n";
  const checks="$r=@(Find-Owned)\nif($script:calls -ne 2 -or $r.Count -ne 1 -or $r[0] -ne 222){throw 'partial enumeration leaked'}\n$script:kind='persistent';$script:calls=0\n$failed=$false\ntry{$r=@(Find-Owned)}catch{if($_.Exception.Message -eq 'Chrome process scope uninspectable'){$failed=$true}}\nif(-not $failed -or $script:calls -ne 3){throw 'persistent unknown scope not bounded'}\n$script:kind='other';$script:calls=0\n$failed=$false\ntry{$r=@(Find-Owned)}catch{if($_.Exception.Message -eq 'Ambiguous exact-profile process'){$failed=$true}}\nif(-not $failed -or $script:calls -ne 1){throw 'ambiguous scope retried'}\n[Console]::WriteLine('BF_SCOPE_READ_RETRY_PASS')\n";
  const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const output=execFileSync(shell,['-NoProfile','-NonInteractive','-Command',setup+'\n'+wrapper+'\n'+checks],{encoding:'utf8',windowsHide:true,timeout:15000});
  assert.match(output,/^BF_SCOPE_READ_RETRY_PASS\s*$/);
});

// Compile the exact production handle-decision code with synthetic native calls.
// This test cannot open, inspect or terminate any real process.
test('Windows native recovery distinguishes exited handles, unreadable images, actual mismatches and termination races', {skip:process.platform!=='win32'}, async()=>{
  const {execFileSync}=await import('node:child_process');
  const source=fs.readFileSync(new URL('./owned-chrome-windows.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const methods=source.match(/  static bool IsExited\(IntPtr h,uint milliseconds=0\) \{[\s\S]*?\n\}\n'@/)?.[0]?.replace(/\n\}\n'@$/,'');
  assert.ok(methods);
  const csharp="using System;\nusing System.Text;\nusing System.Runtime.InteropServices;\npublic static class BfSyntheticReap {\n  static uint[] waits;\n  static int index, term, closed, grace;\n  static bool timesOk, imageOk, terminateOk;\n  static long creation;\n  static string image;\n  static IntPtr OpenProcess(uint a,bool i,int p){return new IntPtr(123);}\n  static bool GetProcessTimes(IntPtr h,out long c,out long e,out long k,out long u){c=creation;e=k=u=0;return timesOk;}\n  static bool QueryFullProcessImageName(IntPtr h,int f,StringBuilder b,ref int n){if(imageOk)b.Append(image);return imageOk;}\n  static bool TerminateProcess(IntPtr h,uint c){term++;return terminateOk;}\n  static uint WaitForSingleObject(IntPtr h,uint m){if(m==500)grace++;else if(m!=0&&m!=3000)throw new Exception(\"unexpected wait duration\");if(index>=waits.Length)throw new Exception(\"unexpected wait\");return waits[index++];}\n  static bool CloseHandle(IntPtr h){closed++;return true;}\n  static void Case(uint[] w,bool t,bool q,string img,long stamp,bool kill,bool result,string error,int expectedTerm) {\n    waits=w;index=term=closed=grace=0;timesOk=t;imageOk=q;image=img;creation=stamp;terminateOk=kill;\n    string actual=null;bool returned=false;\n    try{returned=Reap(123,1000,\"chrome.exe\");}catch(InvalidOperationException e){actual=e.Message;}\n    if(actual!=error || (actual==null && returned!=result) || term!=expectedTerm || closed!=1 || index!=w.Length || grace!=(((w[0]==258 && (!t || !q) && (stamp==1000 || !t)) || (!kill && expectedTerm==1)) ? 1 : 0))\n      throw new Exception(\"synthetic outcome mismatch\");\n  }\n  public static int Run(){\n    Case(new uint[]{0},true,true,\"chrome.exe\",1000,true,false,null,0);\n    Case(new uint[]{258,0},false,true,\"chrome.exe\",1000,true,false,null,0);\n    Case(new uint[]{258,258},false,true,\"chrome.exe\",1000,true,false,\"creation time unavailable\",0);\n    Case(new uint[]{258},true,true,\"chrome.exe\",2000,true,false,\"process creation mismatch\",0);\n    Case(new uint[]{258,0},true,false,\"\",1000,true,false,null,0);\n    Case(new uint[]{258,258},true,false,\"\",1000,true,false,\"process image unavailable\",0);\n    Case(new uint[]{258},true,true,\"other.exe\",1000,true,false,\"process image mismatch\",0);\n    Case(new uint[]{4294967295},true,true,\"chrome.exe\",1000,true,false,\"owned wait state unavailable\",0);\n    Case(new uint[]{258,4294967295},true,false,\"\",1000,true,false,\"owned wait state unavailable\",0);\n    Case(new uint[]{258,0},true,true,\"chrome.exe\",1000,true,false,null,0);\n    Case(new uint[]{258,258,0},true,true,\"CHROME.EXE\",1000,true,true,null,1);\n    Case(new uint[]{258,258,0},true,true,\"chrome.exe\",1000,false,false,null,1);\n    Case(new uint[]{258,258,258},true,true,\"chrome.exe\",1000,false,false,\"owned termination failed\",1);\n    Case(new uint[]{258,258,258},true,true,\"chrome.exe\",1000,true,false,\"owned exit unconfirmed\",1);\n    Case(new uint[]{258,258,4294967295},true,true,\"chrome.exe\",1000,false,false,\"owned wait state unavailable\",1);\n    return 15;\n  }\n"+methods+'\n}';
  const script="$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:BF_SYNTHETIC_CSHARP)))\n[Console]::WriteLine([BfSyntheticReap]::Run())";
  const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const output=execFileSync(shell,['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,BF_SYNTHETIC_CSHARP:Buffer.from(csharp).toString('base64')}});
  assert.match(output,/^15\s*$/);
});
