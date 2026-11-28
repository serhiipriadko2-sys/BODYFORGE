// Real saved values and avatar readiness on the verified production preview.
// All writes are synthetic and confined to a disposable Chrome profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {requirePreviewOrigin,waitForOwnedBrowser,newOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';

const origin=process.env.BODYFORGE_QA_ORIGIN;
const prefix='bf-screen-content-';
let profile,chrome,identity,ws,seq=0,checks=0,stage='preflight',visual='not-requested';
const pending=new Map(),errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label);}
function cdp(method,params={},timeout=15000){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},timeout);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('page evaluation failed');
  return r.result.value;
}
async function until(expression,label,timeout=30000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await js(expression))return;await pause(150);}
  throw Error('TIMEOUT '+label);
}
async function go(index,screen){
  await js('document.querySelectorAll(".mobile-nav button")['+index+'].click()');
  await until('document.querySelector(".app-shell")?.dataset.screen==='+JSON.stringify(screen),'screen '+screen);
}
async function pressKey(key, virtualKey, text) {
  const params = {key, code: key, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey};
  await cdp('Input.dispatchKeyEvent', {type: 'keyDown', ...params, ...(text && {text, unmodifiedText: text})});
  await cdp('Input.dispatchKeyEvent', {type: 'keyUp', ...params});
}
async function checkKeyboardBypass(width, mobile) {
  await cdp('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile});
  const navigation = await cdp('Page.navigate', {url: origin + '/?keyboard=' + width});
  assert.ok(!navigation.errorText);
  await until(`location.search === '?keyboard=${width}' && !!document.querySelector('#onboarding')`, 'onboarding at ' + width);
  const before = await js(savedBytes);
  await pressKey('Tab', 9);
  const firstFocus = await js('document.activeElement?.textContent?.trim()');
  check(firstFocus === 'К основному содержимому', 'first Tab offers content bypass at ' + width + ' CSS px (received: ' + firstFocus + ')');
  check(await js(`(() => {
    const e = document.activeElement, r = e.getBoundingClientRect();
    return e.matches('a[href="#main-content"]:focus-visible') && r.width >= 44 && r.height >= 44 &&
      r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight &&
      e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  })()`), 'focused link is visible, unobscured and at least 44 px at ' + width);
  await pressKey('Enter', 13, '\r');
  await until("document.activeElement === document.querySelector('main#main-content')", 'focus moved to main at ' + width);
  await pressKey('Tab', 9);
  check(await js("document.activeElement.closest('main#main-content') !== null"),
    'next Tab stays inside the page content at ' + width);
  check(await js(savedBytes) === before, 'keyboard bypass leaves saved progress bytes unchanged at ' + width);
}
const savedBytes='JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("bodyforge:pilot:v1")).sort(([a],[b])=>a.localeCompare(b)))';
try{
  const verified=await requirePreviewOrigin(origin,process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256);
  if(process.argv.length!==2)throw Error('unexpected arguments');
  const output=process.env.BODYFORGE_QA_ARTIFACT_DIR;
  if(output)fs.mkdirSync(output,{recursive:false});
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
  await cdp('Network.setBypassServiceWorker',{bypass:true});
  stage='keyboard-bypass';
  await cdp('Page.bringToFront');
  for (const width of [320, 360, 390, 428, 1280]) {
    await checkKeyboardBypass(width, width < 740);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  stage='fixture';
  const navigation=await cdp('Page.navigate',{url:origin+'/'});assert.ok(!navigation.errorText);
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="false"&&!!document.querySelector("#onboarding")','fresh onboarding');
  const digest=await js('(async()=>{const p='+JSON.stringify(verified.entry)+';if(!document.querySelector("script[src="+JSON.stringify(p)+"]"))return null;const r=await fetch(p,{redirect:"error",cache:"no-store"});if(!r.ok)return null;return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await r.arrayBuffer())),b=>b.toString(16).padStart(2,"0")).join("")})()');
  check(digest===verified.sha256,'browser received measured production entry');
  await js('document.querySelector("#onboarding .forge-solid-button").click()');
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="true"&&JSON.parse(localStorage.getItem("bodyforge:pilot:v1")||"null")?.game?.created===true','test profile persisted');
  const fixture=await js('(async()=>navigator.locks.request("bodyforge:pilot:v1:write",()=>{const key="bodyforge:pilot:v1",p=JSON.parse(localStorage.getItem(key));const id="qa-screen-content-workout";p.xp=320;p.coins=43;p.workouts=[{id,finishedAt:new Date().toISOString(),durationMs:65000,repetitions:20,xp:120,mode:"training",exerciseId:"squat"}];p.creditedWorkoutIds=[id];p.totals={workouts:1,repetitions:20,bestDurationMs:65000};p.game.muscles={arms:1,core:1,legs:2,back:0};const raw=JSON.stringify(p);localStorage.setItem(key,raw);localStorage.setItem(key+":backup",raw);return raw}))()');
  check(typeof fixture==='string'&&JSON.parse(fixture).workouts.length===1,'one explicit synthetic saved workout seeded');
  await cdp('Page.reload',{ignoreCache:true});
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="true"&&document.querySelector(".pulse-xp-track")?.getAttribute("aria-valuenow")==="70"','saved XP hydrated');
  await until('document.querySelector("[data-pulse-percent]")?.dataset.pulsePercent==="20"','saved muscle upgrades hydrated');
  check(await js('document.querySelector(".pulse-xp-heading strong")?.textContent.includes("2")&&document.querySelector(".pulse-xp-heading span")?.textContent.includes("70 / 250 XP")'),'saved XP 320 maps to level 2 and 70/250');
  check(await js('document.querySelector("[data-pulse-percent]")?.dataset.pulsePercent==="20"'),'four saved upgrades display 20 percent');
  const before=await js(savedBytes),look=await js('localStorage.getItem("bodyforge:avatar-look:v1")');
  check(await js('localStorage.getItem("bodyforge:pilot:v1")')===fixture,'mount did not rewrite saved profile');
  stage='avatar';
  await js('document.querySelector(".character-card .avatar-stage").scrollIntoView({block:"center",behavior:"instant"})');
  await until('(()=>{const root=document.querySelector(".character-card [data-avatar-source=cc0][data-avatar-asset=athlete]");const c=root?.querySelector("canvas");return !!c&&c.getClientRects().length>0&&c.width>1&&c.height>1&&Number(c.dataset.renderScale)>0})()','real GLB and rendered canvas',45000);
  check(await js('document.querySelectorAll(".character-card canvas").length===1&&document.querySelector("#forge")?.getClientRects().length===0'),'one loaded GLB canvas on Forge, editor hidden');
  if(output){
    // Snapshot is separate from the functional assertion. Preserve a typed failure
    // rather than declaring a missing screenshot to be a successful visual review.
    try{
      const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},22000);
      fs.writeFileSync(path.join(output,'forge-loaded-avatar-390.png'),Buffer.from(shot.data,'base64'),{flag:'wx'});
      visual='captured';
    }catch{visual='capture-failed';console.error('BF_SCREEN_CONTENT_VISUAL_BLOCKED');}
  }
  stage='camera';
  await go(1,'challenge');
  await until('document.querySelector(".pulse-trend-card:not([hidden])")?.getClientRects().length>0&&document.querySelector("[data-period-sessions]")?.dataset.periodSessions==="1"&&document.querySelector("[data-period-reps]")?.dataset.periodReps==="20"&&document.querySelector("[data-period-active-days]")?.dataset.periodActiveDays==="1"','nonzero saved history');
  check(await js('document.querySelector(".pulse-trend-card")?.dataset.historyLimited==="false"'),'saved 1 workout, 20 reps and 1 active day are not invented or partial');
  await until('document.querySelector("#step-log summary")?.getClientRects().length>0','web steps');
  check(await js('document.querySelector("#step-log summary")?.dataset.syncState==="unavailable"&&[...document.querySelectorAll("#step-log [data-step-auto]")].every(e=>e.textContent==="\\u2014")'),'web does not invent automatic step readings');
  await js('document.querySelector("#step-log summary").click()');
  await until('document.querySelector("#bf-steps-today")?.getClientRects().length>0','manual step editor');
  await js('(()=>{const e=document.querySelector("#bf-steps-today");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"4321");e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await js('document.querySelector("#step-log .bf-step-input-row button").click()');
  await until('JSON.parse(localStorage.getItem("bodyforge:manual-steps:v1")||"null")?.count===4321&&document.querySelector("[data-manual-steps]")?.dataset.manualSteps==="4321"','explicit manual step saved');
  const steps=await js('localStorage.getItem("bodyforge:manual-steps:v1")');
  check(JSON.parse(steps).source==='manual','step source recorded honestly');
  check(await js(savedBytes)===before,'manual steps did not award XP or rewrite game data');
  await go(0,'dashboard');await go(1,'challenge');
  check(await js('document.querySelector("[data-period-reps]")?.dataset.periodReps==="20"'),'nonzero workout history survives navigation');
  await cdp('Page.reload',{ignoreCache:true});
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="true"','saved profile reopened');
  await go(1,'challenge');
  await until('document.querySelector("[data-manual-steps]")?.dataset.manualSteps==="4321"&&document.querySelector("[data-period-reps]")?.dataset.periodReps==="20"','saved steps and activity after reload');
  check(await js('localStorage.getItem("bodyforge:manual-steps:v1")')===steps,'manual step bytes survive reload');
  check(await js(savedBytes)===before,'all saved player and backup bytes remain identical');
  check(await js('localStorage.getItem("bodyforge:avatar-look:v1")')===look,'appearance bytes unchanged');
  check(errors.length===0,'no uncaught page exceptions');
  stage='complete';
}catch(error){
  console.error('BF_SCREEN_CONTENT_FAIL',stage,String(error.message).slice(0,180));process.exitCode=16;
}finally{
  ws?.close();
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}pending.clear();
  if(chrome)try{await cleanupOwnedChrome(profile,prefix,chrome,identity);}
  catch{console.error('BF_SCREEN_CONTENT_CLEANUP_UNVERIFIED');process.exitCode=17;}
}
if(stage==='complete'&&!process.exitCode)console.log('BF_SCREEN_CONTENT_PASS',JSON.stringify({checks,visual,profileBytesUnchanged:true,manualSteps:4321,savedReps:20,avatar:'cc0'}));
