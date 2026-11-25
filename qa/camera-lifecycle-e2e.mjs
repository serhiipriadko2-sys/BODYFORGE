// BF-201: real disposable Chrome, fake webcam, synthetic disconnect events.
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
const seed=JSON.stringify({profileId:'bf201-qa',xp:500,coins:900,workouts:[],creditedWorkoutIds:[],
  game:{created:true,nickname:'CAMERA QA',build:'lean',muscles:{arms:0,core:0,legs:0,back:0},
    outfit:'base',ownedOutfits:['base'],lastLoginDay:null,lastQuestClaimDay:null,highestClearedFloor:0,bestGhost:null}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bf-camera-owner-'));
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
async function holdPlay(){
  await js(install);
  await js("(()=>{const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this.tagName==='VIDEO'&&this.srcObject){window.__playHeld=true;return new Promise(resolve=>window.__releasePlay=resolve)}return play.call(this)};return true})()");
  await click('#challenge .primary-button');
  await until('window.__playHeld===true&&window.__tracks.length===1&&window.__tracks[0].readyState==="live"','fake video playback promise held');
}
try{
  browser=await waitForOwnedBrowser(dir,chrome);
  await fresh();
  await js("window.__tracks=[];navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('QA permission denied','NotAllowedError')};true");
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.camera-error')",'permission denied displayed');
  await clean('permission denial');

  await fresh();
  await js("(()=>{const media=navigator.mediaDevices,real=media.getUserMedia.bind(media);window.__tracks=[];media.getUserMedia=async c=>{await new Promise(resolve=>window.__releasePermission=resolve);const s=await real(c);window.__tracks.push(...s.getTracks());return s};return true})()");
  await click('#challenge .primary-button');
  await until('typeof window.__releasePermission==="function"','permission promise held');
  await click('#challenge .secondary-button');
  await js('window.__releasePermission();true');
  await until('window.__tracks.length===1&&window.__tracks[0].readyState==="ended"','late camera stream stopped after cancel');
  await clean('late permission after cancellation');

  await fresh();await holdPlay();
  // stop() alone does not emit ended; dispatch models a source disconnect/revoke.
  await js("window.__tracks[0].stop();window.__tracks[0].dispatchEvent(new Event('ended'));true");
  await until("!!document.querySelector('.camera-error')&&!document.querySelector('.loading-overlay')",'disconnect while video.play is pending',4000);
  await clean('early track disconnect');
  await js('window.__releasePlay();true');await sleep(350);
  await clean('late video.play resolution after disconnect');

  await fresh();
  await js("(()=>{const media=navigator.mediaDevices,real=media.getUserMedia.bind(media);window.__tracks=[];media.getUserMedia=async c=>{const s=await real(c);window.__tracks.push(...s.getTracks());window.__tracks.forEach(t=>t.stop());return s};return true})()");
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.camera-error')",'already ended acquisition refused',4000);
  await clean('already ended acquisition');

  await fresh();await holdPlay();
  await js("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));true");
  await until("!!document.querySelector('.camera-error')",'background during playback start');
  await clean('background while starting');
  await js('window.__releasePlay();true');await sleep(350);
  await clean('late playback after background');
  check(!resources.some(url=>/vision_bundle-[\w-]+\.js|mediapipe_tasks-vision\.js/.test(url)),'no pose runtime starts on rejected or cancelled capture');
  console.log('BODYFORGE_CAMERA_LIFECYCLE_PASS',JSON.stringify({checks}));
}catch(error){
  console.error('BODYFORGE_CAMERA_LIFECYCLE_FAIL',error.stack||String(error));
  if(ws?.readyState===1)console.error('READBACK',await js("JSON.stringify({loading:!!document.querySelector('.loading-overlay'),error:document.querySelector('.camera-error')?.textContent,live:!!document.querySelector('.live-tag'),states:window.__tracks?.map(t=>t.readyState),attached:!!document.querySelector('video.camera-feed')?.srcObject})").catch(()=>null));
  process.exitCode=16;
}finally{
  if(ws?.readyState===1)await js('window.__releasePlay?.();window.__releasePermission?.();true').catch(()=>null);
  ws?.close();
  try{await cleanupOwnedChrome(dir,'bf-camera-owner-',chrome,browser)}
  catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode||=17}
}
