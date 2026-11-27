// Screen ownership regression: disposable browser only, never camera or real player data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {requireDevOrigin,requirePreviewOrigin,waitForOwnedBrowser,newOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';

const origin=process.env.BODYFORGE_QA_ORIGIN;
const dev=process.argv.length===3&&process.argv[2]==='--dev';
const prefix='bf-screen-ownership-';
let profile,chrome,identity,ws,seq=0,checks=0,stage='preflight';
const pending=new Map(),errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label);}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},12000);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
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
const visible=s=>'[...document.querySelectorAll('+JSON.stringify(s)+')].filter(e=>e.getClientRects().length>0).length';
async function viewport(width,documentLoaded=true){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=740});
  if(documentLoaded)await until('matchMedia('+JSON.stringify('(width: '+width+'px)')+').matches','viewport '+width);
}
async function go(index,screen){
  check(await js('(()=>{const b=[document.querySelectorAll(".mobile-nav button")['+index+'],document.querySelectorAll(".nav-items button")['+index+']].find(e=>e&&e.getClientRects().length>0&&!e.disabled);if(!b)return false;b.click();return true})()'),'navigation '+screen);
  await until('document.querySelector(".app-shell")?.dataset.screen==='+JSON.stringify(screen),'screen '+screen);
}
async function snapshot(name){
  const dir=process.env.BODYFORGE_QA_ARTIFACT_DIR;
  if(!dir)return;
  const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(dir,name),Buffer.from(r.data,'base64'),{flag:'wx'});
}
async function quickDeck(width){
  await until(visible('#forge-quick-deck [data-quick-action]')+'===4','four quick cards');
  check(await js('(()=>{const grid=document.querySelector("#forge-quick-deck .forge-quick-grid");const tiles=[...grid.querySelectorAll("button[data-quick-action]")];return document.querySelectorAll("#forge-quick-deck").length===1&&getComputedStyle(grid).display==="grid"&&tiles.map(t=>t.dataset.quickAction).join(",")==="training,hero,tower,daily"&&tiles.every(t=>{const r=t.getBoundingClientRect();return !t.disabled&&r.width>=100&&r.height>=180&&r.left>=-1&&r.right<=document.documentElement.clientWidth+1&&t.getAttribute("aria-label")})})()'),'four large accessible quick cards '+width);
}
async function quickClick(id){
  const selector='[data-quick-action="'+id+'"]';
  await js('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center",behavior:"instant"})');
  await pause(180);
  const target=await js('(()=>{const b=document.querySelector('+JSON.stringify(selector)+'),r=b.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,hit:!b.disabled&&b.contains(document.elementFromPoint(x,y))}})()');
  check(target.hit,'quick card hit target '+id);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1});
}
async function home(width){
  await until(visible('.dashboard-player .pulse-xp-card')+'===1&&'+visible('#pulse-progress .pulse-ring-card')+'===1&&'+visible('#forge-quick-deck [data-quick-action]')+'===4','home complete');
  await quickDeck(width);
  check(await js(visible('.character-card .avatar-stage')+'===1&&'+visible('#forge .studio-preview')+'===0&&'+visible('#challenge')+'===0&&'+visible('#tower')+'===0&&'+visible('#online')+'===0&&'+visible('#step-log')+'===0&&'+visible('.pulse-trend-card')+'===0'),'home owns only its avatar and panels '+width);
  check(await js('(()=>{const b=s=>document.querySelector(s).getBoundingClientRect();const p=b(".dashboard-player"),a=b(".character-card"),r=b("#pulse-progress"),d=b("#forge-quick-deck"),q=b("#quests");return a.top>=p.bottom&&a.top-p.bottom<=40&&r.top>=a.bottom&&d.top>=r.bottom&&q.top>=d.bottom&&document.documentElement.scrollWidth<=document.documentElement.clientWidth+1})()'),'home XP, avatar, progress, shortcuts, missions ordered '+width);
}
async function camera(width){
  await until(visible('#challenge')+'===1&&'+visible('#step-log .bf-steps-trigger')+'===1&&'+visible('#pulse-progress .pulse-trend-card')+'===1','camera complete');
  check(await js(visible('.character-card')+'===0&&'+visible('#forge')+'===0&&'+visible('.dashboard-player')+'===0&&'+visible('#forge-quick-deck')+'===0&&'+visible('#quests')+'===0&&'+visible('.pulse-ring-card')+'===0&&'+visible('#step-log')+'===1&&'+visible('.pulse-trend-card')+'===1'),'camera owns steps and activity '+width);
  check(await js('(()=>{const b=s=>document.querySelector(s).getBoundingClientRect();return b("#step-log").top>=b("#challenge").bottom&&b("#pulse-progress").top>=b("#step-log").bottom&&document.documentElement.scrollWidth<=document.documentElement.clientWidth+1})()'),'camera steps and statistics follow controls '+width);
}
try{
  if(dev)await requireDevOrigin(origin);
  else if(process.argv.length===2)await requirePreviewOrigin(origin,process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256);
  else throw Error('expected --dev or production preview');
  const dir=process.env.BODYFORGE_QA_ARTIFACT_DIR;
  if(dir)fs.mkdirSync(dir,{recursive:false});
  stage='browser';
  profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--disable-component-update','--no-proxy-server','--enable-unsafe-swiftshader','--use-gl=angle',
    '--use-angle=swiftshader','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  identity=await waitForOwnedBrowser(profile,chrome);const tab=await newOwnedPage(identity);ws=new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('CDP open timeout')),5000);
    ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP open failed'));},{once:true});});
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data),p=pending.get(m.id);
    if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('CDP command failed')):p.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push('runtime-exception');
  });
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Network.enable');await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  // Explicit synthetic denial makes this test incapable of opening a real camera.
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'window.__bfQuickDeckCameraAttempts=0;if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,value:()=>{window.__bfQuickDeckCameraAttempts++;return Promise.reject(new DOMException("QA camera disabled","NotAllowedError"))}})'});
  await viewport(390,false);
  stage='fresh';
  const navigation=await cdp('Page.navigate',{url:origin+'/'});assert.ok(!navigation.errorText);
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="false"&&!!document.querySelector("#onboarding")','fresh onboarding');
  await viewport(390);
  check(await js(visible('#onboarding .setup-avatar-preview')+'===1&&'+visible('.character-card')+'===0&&'+visible('#forge .studio-preview')+'===0'),'uncreated profile has exactly one visible character setup');
  await quickDeck('before creation');
  const freshSaved=await js('localStorage.getItem("bodyforge:pilot:v1")');
  await quickClick('training');await until('document.querySelector(".app-shell")?.dataset.screen==="challenge"','fresh quick training');
  await camera('before creation');
  check(await js('window.__bfQuickDeckCameraAttempts===0&&!document.querySelector(".camera-error")'),'fresh training shortcut opens Camera without requesting a camera');
  await go(0,'dashboard');
  await quickClick('hero');await until('document.querySelector(".app-shell")?.dataset.screen==="forge"','fresh hero shortcut');
  check(await js(visible('#forge .studio-preview')+'===1&&'+visible('#forge-quick-deck')+'===0'),'fresh hero shortcut opens editor');
  await go(0,'dashboard');
  await quickClick('tower');await until('document.querySelector(".app-shell")?.dataset.screen==="tower"','fresh tower shortcut');
  check(await js(visible('#tower')+'===1&&'+visible('#forge-quick-deck')+'===0'),'fresh tower shortcut opens tower');
  await go(0,'dashboard');
  await quickClick('daily');
  check(await js('document.querySelector(".app-shell")?.dataset.screen==="dashboard"&&'+visible('#quests')+'===1'),'fresh missions shortcut remains on Forge');
  check(await js('localStorage.getItem("bodyforge:pilot:v1")')===freshSaved,'fresh shortcuts do not write player profile');
  await go(1,'challenge');await camera('before creation after shortcuts');
  check(await js('document.querySelector(".app-shell")?.dataset.fighterCreated==="false"'),'camera panels do not create or reset a fighter');
  await go(0,'dashboard');
  stage='create';
  await js('document.querySelector(".build-options button:nth-child(2)").click()');
  await js('document.querySelector("#onboarding .forge-solid-button").click()');
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="true"&&JSON.parse(localStorage.getItem("bodyforge:pilot:v1")||"null")?.game?.created===true','disposable created fighter persisted');
  await home(390);
  const saved=await js('localStorage.getItem("bodyforge:pilot:v1")');
  const storedState=await js('JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("bodyforge:pilot:v1")||k==="bodyforge:manual-steps:v1").sort(([a],[b])=>a.localeCompare(b)))');
  const look=await js('localStorage.getItem("bodyforge:avatar-look:v1")');
  stage='responsive';
  for(const width of [320,390,740,741,1080,1280]){
    await viewport(width);await go(0,'dashboard');await home(width);
    if(width===390||width===1280){
      await js('window.scrollTo(0,0)');await snapshot('forge-'+width+'.png');
      await js('document.querySelector("#pulse-progress").scrollIntoView({block:"start",behavior:"instant"})');await snapshot('forge-progress-'+width+'.png');
    }
    await go(1,'challenge');await camera(width);
    if(width===390||width===1280){
      await js('document.querySelector("#step-log").scrollIntoView({block:"start",behavior:"instant"})');await snapshot('camera-steps-'+width+'.png');
    }
  }
  stage='shortcuts';
  await go(0,'dashboard');await home(1280);
  await quickClick('hero');
  await until('document.querySelector(".app-shell")?.dataset.screen==="forge"','hero shortcut');
  check(await js(visible('#forge .studio-preview')+'===1&&'+visible('.character-card')+'===0&&'+visible('#pulse-progress')+'===0&&'+visible('#step-log')+'===0'),'hero shortcut opens only editor');
  await go(0,'dashboard');
  await quickClick('tower');
  await until('document.querySelector(".app-shell")?.dataset.screen==="tower"','tower shortcut');
  check(await js(visible('#tower')+'===1&&'+visible('#forge')+'===0&&'+visible('.character-card')+'===0'),'tower shortcut opens only tower');
  await go(0,'dashboard');
  await quickClick('daily');
  check(await js('document.querySelector(".app-shell")?.dataset.screen==="dashboard"&&'+visible('#quests')+'===1'),'missions shortcut stays on Forge');
  await go(1,'challenge');await camera(1280);
  await js('(()=>{const e=document.querySelector("#pulse-activity-range");e.value="30";e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await until('document.querySelector("[data-activity-period]")?.dataset.activityPeriod==="30"','statistics period');
  await go(0,'dashboard');await go(1,'challenge');await camera(1280);
  check(await js('document.querySelector("#pulse-activity-range")?.value==="30"'),'statistics range preserved');
  check(await js('localStorage.getItem("bodyforge:pilot:v1")')===saved,'all saved player bytes unchanged by navigation');
  check(await js('localStorage.getItem("bodyforge:avatar-look:v1")')===look,'all saved appearance bytes unchanged by navigation');
  check(await js('JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("bodyforge:pilot:v1")||k==="bodyforge:manual-steps:v1").sort(([a],[b])=>a.localeCompare(b)))')===storedState,'saved primary, backup and step bytes unchanged');
  await go(0,'dashboard');
  await quickClick('training');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge"&&!!document.querySelector("#challenge .camera-error")&&window.__bfQuickDeckCameraAttempts===1','created squat quick start denied synthetic camera');
  await until('document.querySelector("#challenge [data-exercise=squat]")?.getAttribute("aria-pressed")==="true"','squat selected');
  check(await js('document.querySelector("#challenge [data-exercise=squat]")?.getAttribute("aria-pressed")==="true"'),'created training shortcut starts the original squat path');
  check(await js('(()=>{const p=JSON.parse(localStorage.getItem("bodyforge:pilot:v1"));const b='+JSON.stringify(saved)+';const old=JSON.parse(b);return p.xp===old.xp&&p.coins===old.coins&&JSON.stringify(p.workouts)===JSON.stringify(old.workouts)&&JSON.stringify(p.game)===JSON.stringify(old.game)})()'),'denied synthetic camera awards no progress');
  check(errors.length===0,'no uncaught page exceptions');
  stage='complete';
}catch(error){
  console.error('BF_SCREEN_OWNERSHIP_FAIL',stage,String(error.message).slice(0,180));process.exitCode=16;
}finally{
  ws?.close();
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}pending.clear();
  if(chrome)try{await cleanupOwnedChrome(profile,prefix,chrome,identity);}
  catch{console.error('BF_SCREEN_OWNERSHIP_CLEANUP_UNVERIFIED');process.exitCode=17;}
}
if(stage==='complete'&&!process.exitCode)console.log('BF_SCREEN_OWNERSHIP_PASS',JSON.stringify({checks,mode:dev?'dev':'production-preview',widths:[320,390,740,741,1080,1280],playerBytesUnchanged:true}));
