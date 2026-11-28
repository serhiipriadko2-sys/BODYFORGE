// BF-407: production-only recovery-help regression; no real user data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {requirePreviewOrigin,waitForOwnedBrowser,newOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';

const origin=process.env.BODYFORGE_QA_ORIGIN;
const prefix='bf-backup-help-';
let profile,chrome,identity,ws,seq=0,checks=0,stage='preflight';
const pending=new Map(),errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label);}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},12000);
    pending.set(id,{resolve,reject,timer,method});ws.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('page evaluation failed');
  return r.result.value;
}
async function until(expression,label){
  const end=Date.now()+30000;
  while(Date.now()<end){if(await js(expression))return;await pause(150);}
  throw Error('TIMEOUT '+label);
}
const shortcut='[data-action="open-backup-inspector"]';
const faq='[data-help-topic="backup-recovery"]';
const checker='#progress-backup-file-checker';
const stored='JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("bodyforge:")).sort(([a],[b])=>a.localeCompare(b)))';
async function viewport(width){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
}
async function go(index,screen){
  check(await js('(()=>{const b=document.querySelectorAll(".mobile-nav button")['+index+'];if(!b||b.disabled)return false;b.click();return true})()'),'navigation '+screen);
  await until('document.querySelector(".app-shell")?.dataset.screen==='+JSON.stringify(screen),'screen '+screen);
}
async function focusShortcut(){
  await js('(()=>{const b=document.querySelector('+JSON.stringify(shortcut)+');b.scrollIntoView({block:"center",behavior:"instant"});b.focus({preventScroll:true})})()');
  await pause(120);
  check(await js('(()=>{const b=document.querySelector('+JSON.stringify(shortcut)+'),r=b.getBoundingClientRect();return b===document.activeElement&&!b.disabled&&r.width>=44&&r.height>=44&&b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()'),'keyboard focus and 44px shortcut hit target');
}
async function activate(){
  await js('(()=>{window.__bfKeyEvents=[];const b=document.querySelector('+JSON.stringify(shortcut)+');for(const type of ["keydown","keyup","click"])b.addEventListener(type,e=>window.__bfKeyEvents.push({type:e.type,key:e.key,trusted:e.isTrusted}),{once:true})})()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await pause(250);
  console.log('KEY_ACTIVATION',JSON.stringify(await js('({events:window.__bfKeyEvents,open:document.querySelector('+JSON.stringify(checker)+')?.open,active:document.activeElement?.tagName})')));
  check(await js('window.__bfKeyEvents.some(e=>e.type==="click"&&e.trusted)'),'trusted keyboard activation');
  await until('(()=>{const d=document.querySelector('+JSON.stringify(checker)+');return d?.open&&d.querySelector("summary")===document.activeElement})()','open and focused inspector');
  await pause(150);
  check(await js('(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))})()'),'inspector focus visible and unobscured');
  check(await js('(()=>{const d=document.querySelector('+JSON.stringify(checker)+');return d.dataset.inspectionState==="idle"&&d.querySelector("input[type=file]").files.length===0&&!d.querySelector("[data-action=confirm-file-replacement]")})()'),'no selected file, inspection or replacement');
}
try{
  const verified=await requirePreviewOrigin(origin,process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256);
  const dir=process.env.BODYFORGE_QA_ARTIFACT_DIR;
  if(dir)fs.mkdirSync(dir,{recursive:false});
  stage='browser';
  profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--disable-component-update','--no-proxy-server','--enable-unsafe-swiftshader','--use-gl=angle',
    '--use-angle=swiftshader','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  identity=await waitForOwnedBrowser(profile,chrome);const tab=await newOwnedPage(identity);ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('CDP open timeout')),5000);
    ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP open failed'));},{once:true});});
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data),p=pending.get(m.id);
    if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('CDP command failed: '+p.method+' code='+m.error.code+' '+String(m.error.message).slice(0,100))):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push('runtime-exception');
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp('Network.setBypassServiceWorker',{bypass:true});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'window.__bfCameraAttempts=0;if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,value:()=>{window.__bfCameraAttempts++;return Promise.reject(new DOMException("QA camera disabled","NotAllowedError"))}})'});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'window.__bfOfflineRegisterAttempts=0;Object.defineProperty(navigator.serviceWorker,"register",{configurable:true,value:()=>{window.__bfOfflineRegisterAttempts++;return Promise.reject(Error("unexpected offline install in backup QA"))}})'});
  await viewport(390);
  stage='fresh';
  const navigation=await cdp('Page.navigate',{url:origin+'/'});assert.ok(!navigation.errorText);
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="false"&&!!document.querySelector("#onboarding")','fresh onboarding');
  check(await js('(async()=>{const p='+JSON.stringify(verified.entry)+';if(!document.querySelector("script[src="+JSON.stringify(p)+"]"))return false;const b=await(await fetch(p)).arrayBuffer();const h=await crypto.subtle.digest("SHA-256",b);return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,"0")).join("")})()')===verified.sha256,'browser entry SHA-256 matches build');
  await go(5,'settings');
  await until('!!document.querySelector('+JSON.stringify(faq)+')','fresh FAQ');
  check(await js('!document.querySelector('+JSON.stringify(shortcut)+')&&!document.querySelector('+JSON.stringify(checker)+')'),'fresh player has no replacement shortcut');
  await go(0,'dashboard');
  stage='created';
  await js('document.querySelector(".build-options button:nth-child(2)").click()');
  await js('document.querySelector("#onboarding .forge-solid-button").click()');
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="true"&&JSON.parse(localStorage.getItem("bodyforge:pilot:v1")||"null")?.game?.created===true','synthetic fighter saved');
  await go(5,'settings');
  await until('!!document.querySelector('+JSON.stringify(checker)+')','backup inspector loaded');
  const before=await js(stored);
  const notice='[data-help-topic="third-party-notices"]';
  await until('!!document.querySelector('+JSON.stringify(notice)+')','third-party notice panel');
  check(await js('document.querySelector('+JSON.stringify(notice)+').dataset.noticeState==="idle"'),'notices are not loaded automatically');
  await js('document.querySelector('+JSON.stringify(notice+' > summary')+').click()');
  check(await js('document.querySelector('+JSON.stringify(notice)+').dataset.noticeState==="idle"'),'opening notice panel does not fetch');
  await js('document.querySelector("[data-action=load-third-party-notices]").click()');
  await until('document.querySelector('+JSON.stringify(notice)+').dataset.noticeState==="ready"','license texts opened');
  const noticeSha=await js('(async()=>{const t=document.querySelector(".bf-third-party-notices").textContent;const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(t));return Array.from(new Uint8Array(h),x=>x.toString(16).padStart(2,"0")).join("")})()');
  check(noticeSha==='3a42112b3594638805388847f07dd8d9243322a5bfe97ac6a53dd2b6077196f6','complete displayed notice bytes match pinned public file');
  await viewport(320);check(await js('document.documentElement.scrollWidth<=innerWidth+1'),'notice viewer fits 320px');await viewport(390);
  await js('document.querySelector('+JSON.stringify(notice+' > summary')+').click()');
  check(await js(stored)===before,'license reading preserves all synthetic game bytes');
  const offline='[data-help-topic="offline-readiness"]';
  await until('document.querySelector('+JSON.stringify(offline)+')?.dataset.offlineState==="unobserved"','offline readiness mounted without observation');
  check(await js('!document.querySelector('+JSON.stringify(offline)+').open&&window.__bfOfflineRegisterAttempts===0'),'offline panel initially closed and no automatic registration');
  await js('document.querySelector('+JSON.stringify(offline+' > summary')+').click()');
  check(await js('document.querySelector('+JSON.stringify(offline)+').dataset.offlineState==="unobserved"&&window.__bfOfflineRegisterAttempts===0'),'opening offline panel does not install');
  await js('document.querySelector("[data-action=offline-check]").click()');
  await until('document.querySelector('+JSON.stringify(offline)+')?.dataset.offlineState==="unprepared"','read-only offline check');
  check(await js('(async()=>window.__bfOfflineRegisterAttempts===0&&(await navigator.serviceWorker.getRegistrations()).length===0)()'),'read-only check does not register');
  stage='offline-capacity-fixture';
  const fakeNames=['bodyforge-offline-v1-'+'a'.repeat(64),'bodyforge-offline-v1-'+'b'.repeat(64)];
  check(await js('(async()=>{const names='+JSON.stringify(fakeNames)+';const before=await caches.keys();if(names.some(n=>before.includes(n)))return false;for(const n of names)await caches.open(n);return true})()'),'created only fresh disposable cache fixtures');
  stage='offline-capacity-warning';
  await js('document.querySelector("[data-action=offline-check]").click()');
  await until('!!document.querySelector("[data-offline-capacity=full]")','capacity warning');
  check(await js('!document.querySelector("[data-action=offline-cleanup]")'),'uncontrolled page cannot clean caches');
  check(await js('(async()=>(await caches.keys()).filter(n=>'+JSON.stringify(fakeNames)+'.includes(n)).length===2)()'),'unidentified cache names preserved');
  check(await js('(async()=>{const names='+JSON.stringify(fakeNames)+';for(const n of names)if(!await caches.delete(n))return false;return !(await caches.keys()).some(n=>names.includes(n))})()'),'removed only disposable cache fixtures');
  stage='offline-low-quota';
  await js('Object.defineProperty(navigator.storage,"estimate",{configurable:true,value:async()=>({usage:0,quota:1})});true');
  await js('document.querySelector("[data-action=offline-prepare]").click()');
  await until('document.querySelector('+JSON.stringify(offline)+')?.dataset.offlineState==="space-low"','insufficient storage blocks preparation');
  check(await js('(async()=>window.__bfOfflineRegisterAttempts===0&&(await navigator.serviceWorker.getRegistrations()).length===0)()'),'low quota does not install or register');
  check(await js(stored)===before,'offline check and denied preparation preserve all synthetic game bytes');
  await js('delete navigator.storage.estimate;document.querySelector('+JSON.stringify(offline+' > summary')+').click();true');
  check(await js('!document.querySelector('+JSON.stringify(checker)+').open'),'inspector initially closed');
  await js('document.querySelector('+JSON.stringify(faq+' > summary')+').click()');
  for(const width of [320,390,428]){
    stage='viewport-'+width;
    await viewport(width);
    await until('matchMedia("(width: '+width+'px)").matches','viewport '+width);
    await focusShortcut();await activate();
    check(await js('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1'),'no horizontal overflow '+width);
    if(width===390&&dir){const s=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,'inspector-390.png'),Buffer.from(s.data,'base64'),{flag:'wx'});}
    await js('document.querySelector('+JSON.stringify(checker)+').querySelector("summary").click()');
    await until('!document.querySelector('+JSON.stringify(checker)+').open','inspector closes normally');
  }
  check(await js(stored)===before,'all synthetic BODYFORGE local storage bytes unchanged');
  check(await js('window.__bfOfflineRegisterAttempts===0'),'no offline registration in backup QA');
  check(await js('window.__bfCameraAttempts===0'),'no real camera request');
  check(errors.length===0,'no uncaught page exceptions');
  stage='complete';
}catch(error){
  console.error('BF_BACKUP_HELP_FAIL',stage,String(error.message).slice(0,200));process.exitCode=16;
}finally{
  ws?.close();
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}pending.clear();
  if(chrome)try{await cleanupOwnedChrome(profile,prefix,chrome,identity);}
  catch{console.error('BF_BACKUP_HELP_CLEANUP_UNVERIFIED');process.exitCode=17;}
}
if(stage==='complete'&&!process.exitCode)console.log('BF_BACKUP_HELP_PASS',JSON.stringify({checks,widths:[320,390,428],playerBytesUnchanged:true}));
