// Shared isolation boundary for destructive browser QA.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { ChildProcess } from 'node:child_process';
import { recoverWindowsChrome } from './owned-chrome-windows.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class OwnershipError extends Error {}
const launches = new WeakMap();
const samePath = (a,b) => process.platform==='win32'
  ? path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase()
  : path.resolve(a)===path.resolve(b);
function present(filename) {
  try { fs.lstatSync(filename); return true; }
  catch (error) { if (error.code==='ENOENT') return false; throw error; }
}
function profileKey(profile) {
  const stat=fs.lstatSync(profile,{bigint:true});
  if (stat.isSymbolicLink()||!stat.isDirectory()) throw new OwnershipError('Disposable profile link or type mismatch');
  return [stat.dev,stat.ino,stat.birthtimeNs].map(String).join(':');
}
function bindLaunch(profile,prefix,chrome) {
  if (typeof profile!=='string'||!path.isAbsolute(profile)||!samePath(path.dirname(profile),os.tmpdir())||
      typeof prefix!=='string'||!/^bf-[a-z0-9-]+-$/.test(prefix)||
      !path.basename(profile).startsWith(prefix)||!/^[a-zA-Z0-9]{6}$/.test(path.basename(profile).slice(prefix.length)))
    throw new OwnershipError('Unexpected disposable profile');
  const key=profileKey(profile);
  const canonical=fs.realpathSync.native(profile);
  if (!samePath(canonical,path.join(fs.realpathSync.native(os.tmpdir()),path.basename(profile))))
    throw new OwnershipError('Noncanonical disposable profile');
  const args=chrome?.spawnargs?.slice(1);
  const exactly=(name,value)=>Array.isArray(args)&&args.filter(x=>typeof x==='string'&&(x===name||x.startsWith(name+'='))).length===1&&args.includes(name+'='+value);
  if (!(chrome instanceof ChildProcess)||typeof chrome.spawnfile!=='string'||
      !path.isAbsolute(chrome.spawnfile)||!['chrome.exe','chromium.exe','chrome','chromium','chromium-browser','google-chrome','google-chrome-stable'].includes(path.basename(chrome.spawnfile).toLowerCase())||
      !exactly('--user-data-dir',profile)||!exactly('--remote-debugging-address','127.0.0.1')||!exactly('--remote-debugging-port','0'))
    throw new OwnershipError('Launcher profile or debug arguments mismatch');
  const old=launches.get(chrome);
  if(old){
    if (!samePath(old.profile,canonical)||old.key!==key||!samePath(old.executable,chrome.spawnfile)||old.pid!==chrome.pid)
      throw new OwnershipError('Disposable launcher or profile changed');
    return old;
  }
  const proof={profile:canonical,key,executable:chrome.spawnfile,pid:chrome.pid,identity:null};
  launches.set(chrome,proof);
  return proof;
}
function assertProfile(proof) {
  if (profileKey(proof.profile)!==proof.key||!samePath(fs.realpathSync.native(proof.profile),proof.profile))
    throw new OwnershipError('Disposable profile changed');
}
function readIdentity(proof) {
  assertProfile(proof);
  const file=path.join(proof.profile,'DevToolsActivePort');
  if(!present(file))return null;
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||stat.size>256)
    throw new OwnershipError('Invalid disposable identity file');
  return parseDevToolsIdentity(fs.readFileSync(file,'utf8'));
}
function sameIdentity(a,b) { return a?.port===b?.port&&a?.browserPath===b?.browserPath; }
function cleanupIdentity(proof,supplied) {
  const disk=readIdentity(proof);
  const prior=proof.identity;
  if(supplied){
    const checked=parseDevToolsIdentity(String(supplied.port)+'\n'+String(supplied.browserPath));
    if(!sameIdentity(supplied,checked)||(!disk&&!prior)||
      (disk&&!sameIdentity(disk,supplied))||(prior&&!sameIdentity(prior,supplied)))
      throw new OwnershipError('Disposable identity mismatch');
  }
  if(disk&&prior&&!sameIdentity(disk,prior))throw new OwnershipError('Disposable identity mismatch');
  return {identity:prior||disk||null,disk};
}
function exited(chrome) { return chrome.pid===undefined||chrome.exitCode!==null||chrome.signalCode!==null; }
async function waitExit(chrome,ms) {
  const until=Date.now()+ms;
  while(!exited(chrome)&&Date.now()<until)await sleep(100);
  return exited(chrome);
}
async function closedPort(port) {
  const until=Date.now()+2000;
  do {
    const closed=await new Promise(resolve=>{
      const socket=net.createConnection({host:'127.0.0.1',port});
      const done=value=>{socket.destroy();resolve(value)};
      socket.setTimeout(600);
      socket.once('connect',()=>done(false));
      socket.once('timeout',()=>done(false));
      socket.once('error',error=>done(error.code==='ECONNREFUSED'));
    });
    if(closed)return true;
    await sleep(100);
  }while(Date.now()<until);
  return false;
}

export function parseDevToolsIdentity(raw) {
  const [text, browserPath, ...extra] = raw.trim().split(/\r?\n/);
  const port = Number(text);
  if (!/^[1-9]\d{0,4}$/.test(text) || port > 65535 ||
      !/^\/devtools\/browser\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(browserPath || '') || extra.length) {
    throw new OwnershipError('Invalid disposable DevToolsActivePort identity');
  }
  return { port, browserPath };
}
export function checkedEndpoint(value, identity, pageId) {
  let url;
  try { url = new URL(value); } catch { throw new OwnershipError('Invalid CDP endpoint'); }
  const expected = pageId === undefined ? identity.browserPath : '/devtools/page/' + pageId;
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' ||
      url.port !== String(identity.port) || url.pathname !== expected ||
      url.username || url.password || url.search || url.hash) {
    throw new OwnershipError('CDP endpoint does not match disposable identity');
  }
  return url.href;
}
async function get(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw Error('HTTP ' + response.status + ' for ' + url);
  return response;
}
function requireLoopbackOrigin(origin) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(origin) || Number(new URL(origin).port) > 65535) {
    throw Error('QA requires explicit loopback HTTP');
  }
}
export async function requirePreviewOrigin(origin, expectedSha256) {
  requireLoopbackOrigin(origin);
  if (!/^[0-9a-f]{64}$/i.test(expectedSha256 || '')) {
    throw Error('Set BODYFORGE_QA_EXPECT_ENTRY_SHA256 to the measured production entry digest');
  }
  const html = await (await get(origin + '/')).text();
  const entries = [...html.matchAll(/<script\b[^>]*\bsrc=["'](\/assets\/index-[\w-]+\.js)["']/g)];
  if (html.includes('/@vite/client') || entries.length !== 1) {
    throw Error('QA requires a production preview with exactly one hashed entry');
  }
  const entry = entries[0][1];
  const response = await get(origin + entry);
  if (!/^(?:text|application)\/(?:javascript|ecmascript)\b/i.test(response.headers.get('content-type') || '')) {
    throw Error('Preview entry is not JavaScript');
  }
  const sha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  if (sha256 !== expectedSha256.toLowerCase()) throw Error('Production entry SHA-256 mismatch: ' + sha256);
  return { entry, sha256 };
}
export async function requireDevOrigin(origin) {
  requireLoopbackOrigin(origin);
  if (!(await (await get(origin + '/')).text()).includes('/@vite/client')) {
    throw Error('Source-module QA requires Vite dev, not production preview');
  }
  const module = await get(origin + '/src/lib/progression.ts');
  if (!/javascript/.test(module.headers.get('content-type') || '')) throw Error('Vite source module unavailable');
}
async function confirmBrowser(identity) {
  const version = await (await get('http://127.0.0.1:' + identity.port + '/json/version')).json();
  return checkedEndpoint(version.webSocketDebuggerUrl, identity);
}
export async function waitForOwnedBrowser(profile, chrome) {
  const proof=bindLaunch(profile,path.basename(profile).slice(0,-6),chrome);
  let launchError;
  chrome.on('error', error => { launchError = error; });
  const deadline = Date.now() + 15000;
  const file = path.join(profile, 'DevToolsActivePort');
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null && chrome.exitCode !== 0) throw Error('Chrome launcher exit ' + chrome.exitCode);
    assertProfile(proof);
    if (present(file)) {
      const stat=fs.lstatSync(file);
      if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||stat.size>256)throw new OwnershipError('Invalid disposable identity file');
      const raw = fs.readFileSync(file, 'utf8');
      if (raw.trim().split(/\r?\n/).length === 2) {
        const identity = parseDevToolsIdentity(raw);
        try {
          await confirmBrowser(identity);
          if(!sameIdentity(readIdentity(proof),identity))throw new OwnershipError('Disposable identity mismatch');
          proof.identity=identity;
          console.log('QA_OWNED_BROWSER', JSON.stringify(identity));
          return identity;
        } catch (error) {
          if (error instanceof OwnershipError) throw error;
          if (Date.now() >= deadline) throw error;
        }
      }
    }
    await sleep(100);
  }
  throw Error('Disposable browser identity not verified within 15s');
}
export async function newOwnedPage(identity) {
  await confirmBrowser(identity);
  const target = await (await get('http://127.0.0.1:' + identity.port + '/json/new?about:blank', { method: 'PUT' })).json();
  if (target.type !== 'page' || typeof target.id !== 'string' || !/^[\w-]+$/.test(target.id)) throw new OwnershipError('Invalid page descriptor');
  checkedEndpoint(target.webSocketDebuggerUrl, identity, target.id);
  return target;
}
export async function closeOwnedPage(identity, target) {
  checkedEndpoint(target.webSocketDebuggerUrl, identity, target.id);
  await confirmBrowser(identity);
  const response = await fetch('http://127.0.0.1:' + identity.port + '/json/close/' + target.id,
    { redirect: 'error', signal: AbortSignal.timeout(3000) });
  if (!response.ok && response.status !== 404) throw Error('Owned page close HTTP ' + response.status);
}
async function closeBrowser(identity) {
  const socket = new WebSocket(await confirmBrowser(identity));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Owned CDP open timeout')), 2000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('Owned CDP connection failed')); }, { once: true });
    });
    const closed = new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 3000);
      socket.addEventListener('close', () => { clearTimeout(timer); resolve(true); }, { once: true });
    });
    socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    if (!await closed) throw Error('Owned Chrome close unconfirmed');
  } finally { socket.close(); }
}
export async function cleanupOwnedChrome(profile, prefix, chrome, identity) {
  // All destructive paths depend on the exact launcher, directory and identity proof.
  const proof=bindLaunch(profile,prefix,chrome);
  const current=cleanupIdentity(proof,identity);
  let issue,graceful=false,recovery=null;
  if(current.disk&&current.identity){
    try { await closeBrowser(current.identity); graceful=true; }
    catch(error) {
      if(error instanceof OwnershipError)throw error;
      issue=error;
    }
  }
  await waitExit(chrome,3000);
  assertProfile(proof);
  // A missing file after a recorded close is normal; a changed identity is not.
  const after=readIdentity(proof);
  if(after&&current.identity&&!sameIdentity(after,current.identity))throw new OwnershipError('Disposable identity mismatch');
  if(process.platform==='win32'&&chrome.pid!==undefined){
    recovery=await recoverWindowsChrome(proof.profile,proof.executable);
  }else if(chrome.pid!==undefined&&!graceful){
    // No unverified process-tree kill or directory deletion on other hosts.
    throw Error('Disposable browser graceful close unconfirmed on this platform');
  }
  if(!await waitExit(chrome,2000))throw Error('Disposable launcher exit unconfirmed');
  if(current.identity&&!await closedPort(current.identity.port))throw new OwnershipError('Disposable debugging port still listening or unverified');
  // Do not touch a replaced or linked profile, including during removal retries.
  const deadline=Date.now()+15000;
  let attempts=0,lastCode;
  do {
    attempts++;
    if(!present(proof.profile))break;
    assertProfile(proof);
    try {fs.rmSync(proof.profile,{recursive:true,force:true,maxRetries:0});lastCode=undefined;}
    catch(error){lastCode=error.code;if(!['EPERM','EBUSY','ENOTEMPTY','EACCES'].includes(error.code))break;}
    if(!present(proof.profile))break;
    await sleep(350);
  }while(Date.now()<deadline);
  if(present(proof.profile))throw Error('Disposable profile removal unconfirmed'+(lastCode?' ('+lastCode+')':''));
  launches.delete(chrome);
  const mode=recovery?(issue||!graceful||recovery.terminated?'verified-windows-recovery':'graceful-windows-verified'):'graceful-or-no-spawn';
  const suffix=recovery?' exactProfileBefore='+recovery.before+' terminated='+recovery.terminated+' remaining='+recovery.remaining:'';
  console.log('QA_OWNED_CLEANUP PASS attempts='+attempts+' mode='+mode+suffix);
  return {mode,attempts,profileRemoved:true,launcherExited:true,portClosed:current.identity?true:null,
    exactProfileBefore:recovery?.before??null,terminated:recovery?.terminated??null,remaining:recovery?.remaining??null};
}
