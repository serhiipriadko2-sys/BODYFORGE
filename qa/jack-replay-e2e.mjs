// BF-206: owned browser, finite synthetic jack evidence.
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
const seed=JSON.stringify({profileId:'bf206-qa',xp:500,coins:900,workouts:[],creditedWorkoutIds:[],
  game:{created:true,nickname:'CAMERA QA',build:'lean',muscles:{arms:0,core:0,legs:0,back:0},
    outfit:'base',ownedOutfits:['base'],lastLoginDay:null,lastQuestClaimDay:null,highestClearedFloor:0,bestGhost:null}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bf-jack-replay-'));
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
// Deliberately finite, observed-time fixture. Never reads the game counter
// or alters the app's timestamps. The UI must independently accept a cycle.
function makeJack(kind, ratio) {
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows={11:[.42,.27],12:[.58,.27],23:[.43,.50],24:[.57,.50],15:[.43,.58],16:[.57,.58],27:[.45,.85],28:[.55,.85]};
  if(['open','arms-only','hidden-open','edge','inverted'].includes(kind)) Object.assign(rows,{15:[.28,.08],16:[.72,.08]});
  if(['open','legs-only','one-arm','hidden-open','edge','inverted'].includes(kind)) Object.assign(rows,{27:[.25,.83],28:[.75,.83]});
  if(kind==='one-arm') rows[15]=[.28,.08];
  if(kind==='inverted') Object.assign(rows,{27:[.25,.40],28:[.75,.40]});
  for(const [i,[x,y]] of Object.entries(rows)) p[Number(i)]={x:.5+(x-.5)*.55/ratio,y:.5+(y-.5)*.55,visibility:.99,presence:.99};
  if(kind==='hidden-open'||kind==='hidden-stand') p[15].visibility=0;
  if(kind==='edge') p[16].y=.02;
  return p;
}
function makeRig(plan) {
  let i=0,first=null,previous=null,samples=0,advance=false;
  const q={frames:0,done:false,failure:null,maxGap:0,index:0,initialRestarts:0};
  q.sample=(now,ratio)=>{
    q.frames++;
    if(q.done) return makeJack('stand',ratio);
    if(previous!==null) {
      const gap=now-previous;
      q.maxGap=Math.max(q.maxGap,gap);
      // Cold startup can delay calibration. Start the initial standing
      // observation interval again, without skipping or repeating a motion.
      if(gap>400&&i===0&&plan[0][0]==='stand'){
        first=null;samples=0;advance=false;q.initialRestarts++;
      } else if(gap<=0||gap>400) q.failure??='unusable observation interval: '+gap;
    }
    if(!Number.isFinite(now)) q.failure??='invalid observation time';
    previous=now;
    if(q.failure||q.done) return makeJack('stand',ratio);
    if(advance){i++;first=null;samples=0;advance=false;q.index=i}
    if(i>=plan.length){q.done=true;return makeJack('stand',ratio)}
    const [pose,dwell,minSamples]=plan[i];
    first??=now;samples++;
    if(samples>=minSamples&&now-first>=dwell)advance=true;
    return makeJack(pose,ratio);
  };
  return q;
}
const stand=['stand',300,4], opened=['open',220,3];
const negatives=[stand,['arms-only',240,3],stand,['legs-only',240,3],stand,['one-arm',240,3],stand,
  ['arms-only',220,3],['legs-only',220,3],stand,['edge',240,3],stand,['hidden-open',240,3],stand,
  ['inverted',240,3],stand,opened,['hidden-stand',440,5],stand];
function cycles(n){return [stand,...Array.from({length:n},()=>[opened,['stand',420,5]]).flat()]}
async function plan(rows){
  await js('window.__jackRig=('+makeRig.toString()+')('+JSON.stringify(rows)+');true');
}
const score=()=>js("Number(document.querySelector('.counter-number')?.textContent||0)");
async function finishFixture(label, completion=false){
  const expr=completion?"document.querySelector('.completion-stage')?.dataset.resultPersistence==='credited'":"window.__jackRig.done";
  await until('('+expr+')||!!window.__jackRig.failure||!!document.querySelector(".camera-error")'+(completion?'||window.__jackRig.done':''),label,65000);
  const info=await js("({frames:window.__jackRig.frames,index:window.__jackRig.index,maxGap:window.__jackRig.maxGap,failure:window.__jackRig.failure,error:document.querySelector('.camera-error')?.textContent})");
  console.log('JACK_TIMING',label,JSON.stringify(info));
  check(info.frames>0&&!info.failure&&!info.error,label+' valid fixture timing');
  if(completion) { await until(expr,label+' saved',6000); check(await js(expr),label+' durable credited completion'); }
}
try{
  browser=await waitForOwnedBrowser(dir,chrome);
  await fresh();
  await until("!!document.querySelector('.bf-catalog-trigger')",'exercise catalog available');
  await js("(()=>{const e=document.querySelector('.bf-catalog-trigger');if(e.getAttribute('aria-expanded')!=='true')e.click();return true})()");
  await click('[data-exercise=jumping-jack]');
  check(await js("document.querySelector('[data-exercise=jumping-jack]')?.getAttribute('aria-pressed')==='true'"),'jack selected');
  const entryText=await (await fetch(origin+build.entry,{redirect:'error'})).text();
  const modules=[...new Set([...entryText.matchAll(/import\(\s*["'\x60](\.\/vision_bundle-[\w-]+\.js)["'\x60]\s*\)/g)].map(m=>m[1]))];
  check(modules.length===1,'one lazy production pose module');
  const pose=new URL(modules[0],origin+build.entry).pathname;
  await js(install);
  await js("(async()=>{const mp=await import("+JSON.stringify(pose)+");window.__jackClosed=0;window.makeJack="+makeJack.toString()+";"+
    "mp.FilesetResolver.forVisionTasks=async()=>({});mp.PoseLandmarker.createFromOptions=async()=>({close(){window.__jackClosed++},detectForVideo(video,now){"+
    "return {landmarks:[window.__jackRig.sample(now,video.videoWidth/video.videoHeight)]}}});return true})()");
  await plan(negatives);
  await click('#challenge .primary-button');
  await until("!!document.querySelector('.live-tag')&&window.__jackRig.frames>=3",'jack live camera',30000);
  await finishFixture('negative jack patterns');
  check(await score()===0,'arms-only, legs-only, one-arm, asynchronous, cropped and hidden joint patterns credit zero');
  check(await js('localStorage.getItem('+JSON.stringify(key)+')==='+JSON.stringify(before)),'negative patterns preserve profile');
  await plan(cycles(2));
  await finishFixture('two complete jumping jacks');
  check(await score()===2,'two complete visible jumping jacks credited in counter');
  await click('#challenge .secondary-button');
  await until("!!document.querySelector('#challenge .primary-button')",'jack cancellation');
  await clean('cancel incomplete jack workout');
  check(await js('window.__jackClosed===1'),'cancel closes first pose model');

  await plan(cycles(20));
  await click('#challenge .primary-button');
  await finishFixture('twenty complete jumping jacks',true);
  const after=await js('JSON.parse(localStorage.getItem('+JSON.stringify(key)+'))');
  const prior=JSON.parse(before);
  check(after.xp===prior.xp+120&&after.coins===prior.coins+35,'full jack pays exact ordinary reward');
  check(after.workouts.length===1&&after.workouts[0].exerciseId==='jumping-jack'&&after.workouts[0].repetitions===20,'one persisted jack workout with twenty repetitions');
  check(after.creditedWorkoutIds.length===1,'exactly one workout reward identity');
  check(await js("!document.querySelector('.live-tag')&&(window.__tracks||[]).every(t=>t.readyState==='ended')&&window.__jackClosed===2"),'completion releases camera and second model');
  const paidRaw=await js('localStorage.getItem('+JSON.stringify(key)+')');
  await js('window.__jackReloadMarker=true;true');
  await cdp('Page.reload');
  await until("!window.__jackReloadMarker&&document.readyState==='complete'&&!!document.querySelector('.app-shell')&&!document.querySelector('#onboarding')&&document.querySelector('.mobile-nav button:nth-child(2)')?.disabled===false",'jack reload',30000);
  check(await js('localStorage.getItem('+JSON.stringify(key)+')==='+JSON.stringify(paidRaw)),'reload retains exact paid profile');
  console.log('BODYFORGE_JACK_REPLAY_E2E_PASS',JSON.stringify({checks}));
}catch(error){
  console.error('BODYFORGE_JACK_REPLAY_E2E_FAIL',error.stack||String(error));
  if(ws?.readyState===1)console.error('READBACK',await js("JSON.stringify({count:document.querySelector('.counter-number')?.textContent,phase:document.querySelector('.pose-hud-step')?.textContent,error:document.querySelector('.camera-error')?.textContent,rig:window.__jackRig})").catch(()=>null));
  process.exitCode=16;
}finally{
  ws?.close();
  try{await cleanupOwnedChrome(dir,'bf-jack-replay-',chrome,browser)}catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode||=17}
}
