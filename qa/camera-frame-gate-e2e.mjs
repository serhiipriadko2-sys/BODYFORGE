// BF-202: disposable browser, real frame gate, synthetic pose detector.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requirePreviewOrigin, waitForOwnedBrowser, newOwnedPage, closeOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';

const origin=process.env.BODYFORGE_QA_ORIGIN, expected=process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256;
let build;
try { build=await requirePreviewOrigin(origin,expected); }
catch(error){console.error('QA_INFRA_BLOCKED',String(error));process.exit(14)}
const key='bodyforge:pilot:v1';
const seed=JSON.stringify({profileId:'bf202-qa',xp:500,coins:900,workouts:[],creditedWorkoutIds:[],
  game:{created:true,nickname:'CAMERA QA',build:'lean',muscles:{arms:0,core:0,legs:0,back:0},
    outfit:'base',ownedOutfits:['base'],lastLoginDay:null,lastQuestClaimDay:null,highestClearedFloor:0,bestGhost:null}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bf-frame-gate-'));
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--disable-webgl','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  '--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'
],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,target,ws,seq=0,checks=0,before;
const pending=new Map(),resources=[];
function check(ok,label){if(!ok)throw Error('FAIL '+label);checks++;console.log('PASS',label)}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},12000);
    pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression,label,timeout=15000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await js(expression))return;await sleep(80)}
  throw Error('TIMEOUT '+label);
}
async function click(selector){
  const s=JSON.stringify(selector);
  check(await js('(()=>{const b=document.querySelector('+s+');if(!b||b.disabled)return false;b.click();return true})()'),'click '+selector);
}
async function closePage(){
  if(target){await closeOwnedPage(browser,target);target=null}
  ws?.close();ws=null;
}
async function fresh(){
  await closePage();
  target=await newOwnedPage(browser);ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('CDP open timeout')),5000);
    ws.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP open error'))},{once:true});
  });
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}
    if(m.method==='Network.requestWillBeSent')resources.push(m.params.request.url);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin==='+JSON.stringify(origin)+'){if(localStorage.getItem('+JSON.stringify(key)+')===null)localStorage.setItem('+JSON.stringify(key)+','+JSON.stringify(seed)+');}'});
  await cdp('Page.navigate',{url:origin+'/'});await cdp('Page.bringToFront');
  await until("!!document.querySelector('.app-shell')&&!document.querySelector('#onboarding')&&document.querySelector('.mobile-nav button:nth-child(2)')?.disabled===false",'created fixture ready',30000);
  await click('.mobile-nav button:nth-child(2)');
  await until("document.querySelector('#challenge .primary-button')?.disabled===false",'camera start available');
  check(await js('location.origin==='+JSON.stringify(origin)),'owned browser origin');
  const digest=await js('(async()=>{const b=await(await fetch('+JSON.stringify(build.entry)+')).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest("SHA-256",b))].map(x=>x.toString(16).padStart(2,"0")).join("")})()');
  check(digest===build.sha256,'browser entry matches pinned SHA-256');
  before=await js('localStorage.getItem('+JSON.stringify(key)+')');
  check(JSON.parse(before).xp===500&&JSON.parse(before).coins===900&&JSON.parse(before).workouts.length===0,'unpaid synthetic workout fixture');
}
const install="(()=>{const media=navigator.mediaDevices,real=media.getUserMedia.bind(media);window.__tracks=[];window.__calls=0;media.getUserMedia=async c=>{window.__calls++;const s=await real(c);window.__tracks.push(...s.getTracks());return s};return true})()";
async function clean(label){
  check(await js("!document.querySelector('.live-tag')&&!document.querySelector('.loading-overlay')&&[...document.querySelectorAll('video.camera-feed')].every(v=>v.srcObject===null)&&(window.__tracks||[]).every(t=>t.readyState==='ended')"),label+' releases all tracks and clears live UI');
  check(await js('localStorage.getItem('+JSON.stringify(key)+')==='+JSON.stringify(before)+'&&!Object.keys(localStorage).some(k=>k.startsWith('+JSON.stringify(key+':result:')+'))'),label+' preserves exact profile and no local pending result');
}
try{
  browser=await waitForOwnedBrowser(dir,chrome);
  await fresh();
  const entryText=await (await fetch(origin+build.entry,{redirect:'error'})).text();
  const modules=[...new Set([...entryText.matchAll(/import\(\s*["'\x60](\.\/vision_bundle-[\w-]+\.js)["'\x60]\s*\)/g)].map(m=>m[1]))];
  check(modules.length===1,'one lazy production pose module');
  const pose=new URL(modules[0],origin+build.entry).pathname;
  await js(install);
  await js("(async()=>{const mp=await import("+JSON.stringify(pose)+");window.__frameQa={calls:0,closed:0,lastMedia:null,stamps:[]};"+
    "mp.FilesetResolver.forVisionTasks=async()=>({});mp.PoseLandmarker.createFromOptions=async()=>({close(){window.__frameQa.closed++},detectForVideo(video,now){"+
    "const q=window.__frameQa;q.calls++;q.lastMedia=video.currentTime;q.stamps.push(now);const ratio=video.videoWidth/video.videoHeight;"+
    "const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));p[23]={x:.5,y:.3,visibility:.98};p[25]={x:.5,y:.5,visibility:.98};p[27]={x:.5+.18*Math.sin(10*Math.PI/180)/ratio,y:.5+.18*Math.cos(10*Math.PI/180),visibility:.98};"+
    "p[11]={x:.46,y:.15,visibility:.98};p[12]={x:.54,y:.15,visibility:.98};return {landmarks:[p]}}});return true})()");
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.live-tag')&&window.__frameQa.calls>=3",'active synthetic camera');
  await js("(()=>{const v=document.querySelector('video.camera-feed'),q=window.__frameQa;window.__frozenCalls=q.calls;const t=q.lastMedia;Object.defineProperty(v,'currentTime',{configurable:true,get:()=>t});return true})()");
  await sleep(350);
  check(await js('window.__frameQa.calls===window.__frozenCalls'),'frozen accepted frame is not decoded again');
  await js("document.querySelector('video.camera-feed').dispatchEvent(new Event('resize'));true");
  await sleep(450);
  check(await js('window.__frameQa.calls===window.__frozenCalls'),'resize cannot resurrect the same video frame');
  await js("(()=>{const t=window.__tracks[0];t.dispatchEvent(new Event('mute'));t.dispatchEvent(new Event('unmute'));return true})()");
  await sleep(450);
  check(await js('window.__frameQa.calls===window.__frozenCalls'),'mute and unmute cannot resurrect the same video frame');
  await js("delete document.querySelector('video.camera-feed').currentTime;true");
  await until('window.__frameQa.calls>window.__frozenCalls','fresh video time resumes inference');
  await js("(()=>{const v=document.querySelector('video.camera-feed');window.__beforeUnknown=window.__frameQa.calls;Object.defineProperty(v,'videoWidth',{configurable:true,get:()=>0});v.dispatchEvent(new Event('resize'));return true})()");
  await sleep(450);
  check(await js('window.__frameQa.calls===window.__beforeUnknown'),'unknown intrinsic geometry never reaches inference');
  await js("(()=>{const v=document.querySelector('video.camera-feed');delete v.videoWidth;v.dispatchEvent(new Event('resize'));return true})()");
  await until('window.__frameQa.calls>window.__beforeUnknown','valid geometry resumes inference');
  check(await js('window.__frameQa.stamps.every((n,i,a)=>Number.isFinite(n)&&(i===0||n>a[i-1]))'),'model timestamps strictly advance');
  await click('#challenge .secondary-button');
  await clean('cancel after frame interruptions');
  check(await js('window.__frameQa.closed===1'),'pose model closed exactly once');
  console.log('BODYFORGE_CAMERA_FRAME_GATE_PASS',JSON.stringify({checks}));
}catch(error){
  console.error('BODYFORGE_CAMERA_FRAME_GATE_FAIL',error.stack||String(error));process.exitCode=16;
}finally{
  ws?.close();
  try{await cleanupOwnedChrome(dir,'bf-frame-gate-',chrome,browser)}catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode||=17}
}
