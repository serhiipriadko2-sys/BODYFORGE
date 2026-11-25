// BF-211: owned browser, camera HUD and catalog.
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
const seed=JSON.stringify({profileId:'bf211-qa',xp:500,coins:900,workouts:[],creditedWorkoutIds:[],
  game:{created:true,nickname:'CAMERA QA',build:'lean',muscles:{arms:0,core:0,legs:0,back:0},
    outfit:'base',ownedOutfits:['base'],lastLoginDay:null,lastQuestClaimDay:null,highestClearedFloor:0,bestGhost:null}});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bf-workout-hud-'));
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
function makePushup(kind, ratio) {
  const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const rows={11:[.23,.45],13:[.25,.60],15:[.27,.75],23:[.50,.50],27:[.78,.56]};
  if(['left','right','hidden-active','edge'].includes(kind)) Object.assign(rows,{13:[.38,.53],15:[.29,.67]});
  if(kind==='raised-wrist') Object.assign(rows,{13:[.38,.53],15:[.29,.31]});
  if(kind==='upright') Object.assign(rows,{11:[.45,.15],13:[.45,.3],15:[.45,.45],23:[.45,.52],27:[.45,.85]});
  if(kind==='hips') rows[23]=[.50,.85];
  if(kind==='head') rows[0]=[.20,.36];
  const offset=kind==='right'?1:0;
  for(const [i,[x,y]] of Object.entries(rows)) {
    p[Number(i)+(i==='0'?0:offset)]={x:.5+(x-.5)*.55/ratio,y:.5+(y-.5)*.55,visibility:.99,presence:.99};
  }
  if(kind==='hidden-active'||kind==='hidden-stand') p[15].visibility=0;
  if(kind==='edge') p[27].x=.976;
  return p;
}

const select=async id=>{
  await until("!!document.querySelector('.bf-catalog-trigger')",'exercise catalog available');
  await js("(()=>{const e=document.querySelector('.bf-catalog-trigger');if(e.getAttribute('aria-expanded')!=='true')e.click();return true})()");
  const sel='[data-exercise='+id+']';
  await click(sel);
  await until("document.querySelector("+JSON.stringify(sel)+")?.getAttribute('aria-pressed')==='true'",id+' selected');
  check(await js("document.querySelector("+JSON.stringify(sel)+")?.getAttribute('aria-pressed')==='true'"),'catalog selects '+id);
};
const state=s=>"document.querySelector('.pose-hud')?.dataset.workoutHud==="+JSON.stringify(s);
const setPose=kind=>js('window.__hudPose='+JSON.stringify(kind)+';true');
async function stopGeometry(width,height){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await js("document.querySelector('[data-workout-stop]').scrollIntoView({block:'center',behavior:'instant'});true");
  await sleep(120);
  const r=await js("(()=>{const b=document.querySelector('[data-workout-stop]'),r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,e=document.elementFromPoint(x,y);return {x,y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,hit:!!e&&(e===b||b.contains(e)),enabled:!b.disabled}})()");
  console.log('STOP_GEOMETRY',width,height,JSON.stringify(r));
  check(r.hit&&r.enabled&&r.height>=44&&r.width>=44&&r.x>0&&r.x<r.viewportWidth&&r.y>0&&r.y<r.viewportHeight,'reachable stop control '+width+'x'+height);
  return r;
}
try{
  browser=await waitForOwnedBrowser(dir,chrome);
  await fresh();
  await js(install);
  for(const id of ['squat','pushup','lunge','jumping-jack','high-knees','crunch','leg-raise','plank'])await select(id);
  check(await js("window.__calls===0&&!document.querySelector('.live-tag')"),'catalog browsing does not open camera');
  await select('pushup');
  const entryText=await(await fetch(origin+build.entry,{redirect:'error'})).text();
  const modules=[...new Set([...entryText.matchAll(/import\(\s*["'\x60](\.\/vision_bundle-[\w-]+\.js)["'\x60]\s*\)/g)].map(m=>m[1]))];
  check(modules.length===1,'one lazy production pose module');
  const pose=new URL(modules[0],origin+build.entry).pathname;
  await js("(async()=>{const mp=await import("+JSON.stringify(pose)+");window.__hudClosed=0;window.__hudPose='missing';window.makePushup="+makePushup.toString()+";"+
    "mp.FilesetResolver.forVisionTasks=async()=>({});mp.PoseLandmarker.createFromOptions=async()=>({close(){window.__hudClosed++},detectForVideo(video){return {landmarks:window.__hudPose==='missing'?[]:[window.makePushup(window.__hudPose,video.videoWidth/video.videoHeight)]}}});return true})()");
  await js("(()=>{window.__hudEvents=[];let last='';const record=()=>{const h=document.querySelector('.pose-hud');if(!h)return;const state=h.dataset.workoutHud,remaining=h.querySelector('[data-calibration-remaining-ms]')?.getAttribute('data-calibration-remaining-ms')??null,k=JSON.stringify([state,remaining]);if(k!==last){if(window.__hudEvents.length<300)window.__hudEvents.push({state,remaining});last=k}};new MutationObserver(record).observe(document.querySelector('#challenge'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-workout-hud','data-calibration-remaining-ms']});return true})()");
  await click('#challenge .primary-button');
  await until(state('lost')+"&&!!document.querySelector('.live-tag')",'lost initial pose',30000);
  check(await js("document.querySelector('.pose-hud-angle strong')?.textContent==='\u2014'&&!document.querySelector('[data-calibration-remaining-ms]')&&document.querySelector('.pose-camera-coach')?.dataset.guidance==='no-person'"),'missing pose hides metric and countdown');
  await setPose('stand');await until(state('ready'),'observed ready');
  check(await js("window.__hudEvents.some(e=>e.state==='calibrate'&&Number(e.remaining)>0&&Number(e.remaining)<=160)"),'countdown derives from observed calibration');
  check(await js("!document.querySelector('.pose-camera-coach')&&!document.querySelector('[data-calibration-remaining-ms]')"),'ready clears warning and countdown');
  check(await js("(()=>{const h=document.querySelector('.pose-hud');return /[\u0400-\u04ff]/.test(h.textContent)&&/[\u0400-\u04ff]/.test(h.getAttribute('aria-label'))&&!/[?]{2,}|\ufffd/.test(h.textContent+h.getAttribute('aria-label'))})()"),'Russian HUD and accessibility label are readable');
  await setPose('hidden-stand');await until(state('lost'),'hidden joint invalidates observation');
  await until("document.querySelector('.pose-camera-coach')?.dataset.guidance==='angle-unavailable'",'specific framing reason');
  check(await js("!document.querySelector('[data-calibration-remaining-ms]')&&document.querySelector('.pose-hud-angle strong')?.textContent==='\u2014'"),'hidden joint does not present stale metric');
  await js('window.__hudEvents=[];true');await setPose('stand');await until(state('ready'),'recalibrated pose');
  check(await js("window.__hudEvents.some(e=>e.state==='calibrate'&&Number(e.remaining)>0&&Number(e.remaining)<=160)"),'recovered pose has fresh countdown');
  await setPose('left');await until(state('return'),'observed active pushup return prompt');
  check(await js("document.querySelector('.pose-hud-step')?.textContent.includes('\u0412\u0415\u0420\u041d\u0418\u0421\u042c')"),'return prompt matches phase');
  await sleep(450);await setPose('stand');await until(state('ready'),'completed return');
  check(await js("Number(document.querySelector('.counter-number')?.textContent)===1"),'one complete motion credited in live counter');
  for(const [w,h] of [[320,640],[390,844],[428,926],[844,390]])await stopGeometry(w,h);
  const r=await stopGeometry(390,844);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x,y:r.y,button:'left',clickCount:1});
  await until("!!document.querySelector('#challenge .primary-button')&&!document.querySelector('[data-workout-stop]')",'visible stop cancels');
  await clean('stop incomplete workout');
  check(await js('window.__hudClosed===1'),'stop closes pose model exactly once');
  console.log('BODYFORGE_WORKOUT_HUD_E2E_PASS',JSON.stringify({checks}));
}catch(error){
  console.error('BODYFORGE_WORKOUT_HUD_E2E_FAIL',error.stack||String(error));
  if(ws?.readyState===1)console.error('READBACK',await js("JSON.stringify({hud:document.querySelector('.pose-hud')?.dataset,coach:document.querySelector('.pose-camera-coach')?.dataset,error:document.querySelector('.camera-error')?.textContent,events:window.__hudEvents})").catch(()=>null));
  process.exitCode=16;
}finally{
  ws?.close();
  try{await cleanupOwnedChrome(dir,'bf-workout-hud-',chrome,browser)}catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode||=17}
}
