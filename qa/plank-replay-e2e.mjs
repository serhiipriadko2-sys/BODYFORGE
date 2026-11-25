// BF-210: owned browser, finite synthetic plank evidence.
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
const seed=JSON.stringify({profileId:'bf210-qa',xp:500,coins:900,workouts:[],creditedWorkoutIds:[],
  game:{created:true,nickname:'CAMERA QA',build:'lean',muscles:{arms:0,core:0,legs:0,back:0},
    outfit:'base',ownedOutfits:['base'],lastLoginDay:null,lastQuestClaimDay:null,highestClearedFloor:0,bestGhost:null}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bf-plank-replay-'));
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
// Finite synthetic poses, real frame timestamps. No counter feedback or fake time.
function makePlank(kind,ratio){
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  if(kind==='missing')return p;
  const rows={11:[.22,.55],13:[.24,.68],23:[.50,.56],27:[.80,.57]};
  if(kind==='bent')rows[23]=[.50,.83];
  if(kind==='upright')for(const [i,[x,y]] of Object.entries(rows))rows[i]=[y,1-x];
  for(const [i,[x,y]] of Object.entries(rows))p[Number(i)+(kind==='right'?1:0)]={x:.5+(x-.5)*.55/ratio,y:.5+(y-.5)*.55,visibility:.99,presence:.99};
  if(kind==='edge')p[27].x=.976;
  return p;
}
function makeRig(plan,terminal='missing'){
  let i=0,first=null,previous=null,samples=0,advance=false;
  const q={frames:0,index:0,done:false,failure:null,maxGap:0,initialRestarts:0,validFirst:null,validLast:null,maxValidGap:0};
  q.sample=(now,ratio)=>{
    q.frames++;
    if(q.done)return makePlank(terminal,ratio);
    if(!Number.isFinite(now))q.failure??='invalid observation time';
    if(previous!==null){
      const gap=now-previous;
      q.maxGap=Math.max(q.maxGap,gap);
      if(gap>450&&i===0&&plan[0][0]==='missing'){
        first=null;samples=0;advance=false;q.initialRestarts++;
      }else if(gap<=0||gap>450)q.failure??='unusable observation interval: '+gap;
    }
    previous=now;
    if(q.failure)return makePlank('missing',ratio);
    if(advance){i++;first=null;samples=0;advance=false;q.index=i}
    if(i>=plan.length){q.done=true;return makePlank(terminal,ratio)}
    const [pose,dwell,minSamples]=plan[i];first??=now;samples++;
    if(pose==='valid'){
      if(q.validLast!==null)q.maxValidGap=Math.max(q.maxValidGap,now-q.validLast);
      q.validFirst??=now;q.validLast=now;
    }
    if(samples>=minSamples&&now-first>=dwell)advance=true;
    return makePlank(pose,ratio);
  };
  return q;
}
const warm=['missing',450,4], valid=ms=>['valid',ms,5];
const score=()=>js("Number(document.querySelector('.counter-number')?.textContent||0)");
async function plan(rows,terminal='missing'){
  await js('window.__plankRig=('+makeRig.toString()+')('+JSON.stringify(rows)+','+JSON.stringify(terminal)+');true');
}
async function finishFixture(label,completion=false){
  const expr=completion?"document.querySelector('.completion-stage')?.dataset.resultPersistence==='credited'":"window.__plankRig.done";
  await until('('+expr+')||!!window.__plankRig.failure||!!document.querySelector(".camera-error")'+(completion?'||window.__plankRig.done':''),label,50000);
  const info=await js("({frames:window.__plankRig.frames,index:window.__plankRig.index,maxGap:window.__plankRig.maxGap,initialRestarts:window.__plankRig.initialRestarts,validFirst:window.__plankRig.validFirst,validLast:window.__plankRig.validLast,maxValidGap:window.__plankRig.maxValidGap,failure:window.__plankRig.failure,error:document.querySelector('.camera-error')?.textContent})");
  console.log('PLANK_TIMING',label,JSON.stringify(info));
  check(info.frames>0&&!info.failure&&!info.error,label+' valid fixture timing');
  if(completion){await until(expr,label+' saved',6000);check(await js(expr),label+' durable credited completion')}
  return info;
}
async function setup(){
  await fresh();
  await until("!!document.querySelector('.bf-catalog-trigger')",'exercise catalog available');
  await js("(()=>{const e=document.querySelector('.bf-catalog-trigger');if(e.getAttribute('aria-expanded')!=='true')e.click();return true})()");
  await click('[data-exercise=plank]');
  check(await js("document.querySelector('[data-exercise=plank]')?.getAttribute('aria-pressed')==='true'"),'plank selected');
  const entryText=await(await fetch(origin+build.entry,{redirect:'error'})).text();
  const modules=[...new Set([...entryText.matchAll(/import\(\s*["'\x60](\.\/vision_bundle-[\w-]+\.js)["'\x60]\s*\)/g)].map(m=>m[1]))];
  check(modules.length===1,'one lazy production pose module');
  const pose=new URL(modules[0],origin+build.entry).pathname;
  await js(install);
  await js("(async()=>{const mp=await import("+JSON.stringify(pose)+");window.__plankClosed=0;window.makePlank="+makePlank.toString()+";"+
    "mp.FilesetResolver.forVisionTasks=async()=>({});mp.PoseLandmarker.createFromOptions=async()=>({close(){window.__plankClosed++},detectForVideo(video,now){"+
    "return {landmarks:[window.__plankRig.sample(now,video.videoWidth/video.videoHeight)]}}});return true})()");
}
async function start(rows,terminal='missing'){
  await plan(rows,terminal);await click('#challenge .primary-button');
  await until("!!document.querySelector('.live-tag')&&window.__plankRig.frames>=3",'plank live camera',30000);
}
const unchanged=()=>js('localStorage.getItem('+JSON.stringify(key)+')==='+JSON.stringify(before));
try{
  browser=await waitForOwnedBrowser(dir,chrome);
  await setup();
  await start([warm,['bent',700,5],['upright',700,5],['edge',700,5]]);
  await finishFixture('invalid poses');
  check(await score()===0&&await unchanged(),'invalid or cropped positions accrue no seconds or reward');

  await plan([valid(3600)],'valid');await finishFixture('observed partial hold');
  check(await score()>=3&&await score()<30,'partial aligned hold accrues observed seconds');
  await plan([['missing',650,5]]);await finishFixture('prolonged lost pose');
  check(await score()===0&&await unchanged(),'prolonged loss resets hold without reward');

  await plan([valid(2200)],'valid');await finishFixture('hold before side replacement');
  check(await score()>=1,'calibrated before side replacement');
  await plan([['right',650,5]],'right');await finishFixture('opposite side only');
  check(await score()===0,'replacement side cannot inherit prior hold');
  await plan([['missing',650,5]]);await finishFixture('clear replacement calibration');

  await plan([valid(2200)],'valid');await finishFixture('hold before resize');
  check(await score()>=1,'calibrated before resize');
  await js("document.querySelector('video.camera-feed').dispatchEvent(new Event('resize'));true");
  await plan([['missing',650,5]]);await finishFixture('after resize');
  check(await score()===0&&await js("!!document.querySelector('.live-tag')"),'resize resets hold and capture remains live');
  await plan([valid(2200)],'valid');await finishFixture('hold before cancel');
  check(await score()>=1,'partial hold before cancellation');
  await click('#challenge .secondary-button');
  await until("!!document.querySelector('#challenge .primary-button')",'cancel plank');
  await clean('cancel incomplete plank');
  check(await js('window.__plankClosed===1'),'cancel closes first pose model');

  await start([warm,valid(2200)],'valid');await finishFixture('hold before pagehide');
  check(await score()>=1,'partial hold before simulated pagehide');
  await js("window.dispatchEvent(new Event('pagehide'));true");
  await until("!!document.querySelector('.camera-error')&&!document.querySelector('.live-tag')",'pagehide interruption');
  await clean('pagehide interrupts unpaid plank');
  check(await js('window.__plankClosed===2'),'pagehide closes second pose model');

  await setup();
  await start([warm,valid(35000)],'valid');
  const timing=await finishFixture('thirty-second continuous observed plank',true);
  const measured=timing.validLast-timing.validFirst;
  check(Number.isFinite(measured)&&measured>=30300&&measured<=31300,'independent observed duration includes calibration and 30s hold');
  check(timing.maxValidGap<=180,'validated timing cadence within existing credit cap');
  const after=await js('JSON.parse(localStorage.getItem('+JSON.stringify(key)+'))');
  const prior=JSON.parse(before),work=after.workouts[0];
  check(after.xp===prior.xp+120&&after.coins===prior.coins+35,'plank pays exact ordinary reward');
  check(after.workouts.length===1&&work.exerciseId==='plank'&&work.repetitions===0&&work.holdSeconds===30,'one persisted plank with thirty seconds and zero repetitions');
  check(Number.isFinite(work.durationMs)&&work.durationMs>=30000&&work.durationMs<=31000,'recorded duration within one second of thirty-second goal');
  check(after.creditedWorkoutIds.length===1,'exactly one reward identity');
  check(await js("!document.querySelector('.live-tag')&&(window.__tracks||[]).every(t=>t.readyState==='ended')&&window.__plankClosed===1"),'completion releases camera and model');
  const paidRaw=await js('localStorage.getItem('+JSON.stringify(key)+')');
  await js('window.__plankReloadMarker=true;true');
  await cdp('Page.reload');
  await until("!window.__plankReloadMarker&&document.readyState==='complete'&&!!document.querySelector('.app-shell')&&!document.querySelector('#onboarding')&&document.querySelector('.mobile-nav button:nth-child(2)')?.disabled===false",'plank reload',30000);
  check(await js('localStorage.getItem('+JSON.stringify(key)+')==='+JSON.stringify(paidRaw)),'reload retains exact paid profile');
  console.log('BODYFORGE_PLANK_REPLAY_E2E_PASS',JSON.stringify({checks,measured,recordedDurationMs:work.durationMs}));
}catch(error){
  console.error('BODYFORGE_PLANK_REPLAY_E2E_FAIL',error.stack||String(error));
  if(ws?.readyState===1)console.error('READBACK',await js("JSON.stringify({count:document.querySelector('.counter-number')?.textContent,phase:document.querySelector('.pose-hud-step')?.textContent,error:document.querySelector('.camera-error')?.textContent,rig:window.__plankRig})").catch(()=>null));
  process.exitCode=16;
}finally{
  ws?.close();
  try{await cleanupOwnedChrome(dir,'bf-plank-replay-',chrome,browser)}catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode||=17}
}
