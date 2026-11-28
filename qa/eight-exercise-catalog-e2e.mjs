// BF-211: exercise catalog UI in an identity-bound disposable browser.
// Supports explicit loopback Vite dev or a SHA-256-pinned production preview.
// No owner profile, real camera, or workout/reward generation.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {requireDevOrigin,requirePreviewOrigin,waitForOwnedBrowser,newOwnedPage,closeOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';
const origin=process.env.BODYFORGE_QA_ORIGIN||'http://127.0.0.1:5173';
const expected=process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256;
const prefix='bf-exercise-catalog-';
const ids=['squat','lunge','pushup','jumping-jack','high-knees','crunch','leg-raise','plank'];
const seed=JSON.stringify({profileId:'bf211-catalog-qa',xp:500,coins:900,workouts:[],creditedWorkoutIds:[],
  game:{created:true,nickname:'CATALOG QA',build:'lean',muscles:{arms:0,core:0,legs:0,back:0},
  outfit:'base',ownedOutfits:['base'],lastLoginDay:null,lastQuestClaimDay:null,highestClearedFloor:0,bestGhost:null}});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let build,profile,chrome,identity,target,ws,seq=0,checks=0;
const pending=new Map(),errors=[];
function check(ok,label){if(!ok)throw Error('FAIL '+label);checks++;console.log('PASS',label);}
function rejectPending(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP disconnected'));}pending.clear();}
function cdp(method,params={}){
  if(ws?.readyState!==WebSocket.OPEN)return Promise.reject(Error('CDP not open'));
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);
    pending.set(id,{resolve,reject,timer});
    try{ws.send(JSON.stringify({id,method,params}));}
    catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
  });
}
async function js(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression,label){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    if(await js(expression))return;
    await sleep(100);
  }
  const state=await js('({sameOrigin:location.origin==='+JSON.stringify(origin)+',ready:document.readyState,shell:!!document.querySelector(".app-shell"),fighterCreated:document.querySelector(".app-shell")?.dataset.fighterCreated==="true",storageRecovery:!!document.querySelector("[data-storage-status]"),guard:window.__bfCatalogGuardInstalled===true})').catch(()=>null);
  console.error('QA_WAIT_STATE',JSON.stringify({label,state,uncaught:errors.length}));
  throw Error('TIMEOUT '+label);
}
async function click(selector){
  check(await js('(()=>{const b=document.querySelector('+JSON.stringify(selector)+');if(!b||b.disabled)return false;b.click();return true})()'),'click '+selector);
}
const stored='JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))';
try{
  if(expected!==undefined)build=await requirePreviewOrigin(origin,expected);
  else await requireDevOrigin(origin);
  profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu','--disable-webgl',
    '--disable-background-networking','--disable-component-update',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
    '--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  identity=await waitForOwnedBrowser(profile,chrome);
  target=await newOwnedPage(identity);
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('CDP open timeout')),5000);
    ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP open failed'));},{once:true});
  });
  ws.addEventListener('close',rejectPending);ws.addEventListener('error',rejectPending);
  ws.addEventListener('message',event=>{
    const m=JSON.parse(event.data),p=pending.get(m.id);
    if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin==='+JSON.stringify(origin)+'){window.__bfCatalogCameraCalls=0;const media=navigator.mediaDevices;if(media){media.getUserMedia=async()=>{window.__bfCatalogCameraCalls++;throw new Error("QA prohibits camera")};window.__bfCatalogGuardInstalled=true;}if(localStorage.getItem("bodyforge:pilot:v1")===null)localStorage.setItem("bodyforge:pilot:v1",'+JSON.stringify(seed)+');}'});
  const navigation=await cdp('Page.navigate',{url:origin+'/'});
  if(navigation.errorText){const reason=/^net::ERR_[A-Z0-9_]+$/.test(navigation.errorText)?navigation.errorText:'unclassified';throw Error('Navigation failed '+reason);}
  await until("!!document.querySelector('.app-shell[data-fighter-created=true] .mobile-nav')&&!document.querySelector('[data-storage-status]')",'created fixture');
  check(await js('location.origin==='+JSON.stringify(origin)+'&&window.__bfCatalogGuardInstalled===true'),'owned origin and camera guard');
  if(build){
    const digest=await js('(async()=>{const r=await fetch('+JSON.stringify(build.entry)+');if(!r.ok)return null;return [...new Uint8Array(await crypto.subtle.digest("SHA-256",await r.arrayBuffer()))].map(x=>x.toString(16).padStart(2,"0")).join("")})()');
    check(digest===build.sha256,'browser entry matches pinned SHA-256');
  }
  await click('.mobile-nav button:nth-child(2)');
  await until("document.querySelector('.bf-catalog-trigger')?.disabled===false&&document.querySelector('#challenge .primary-button')?.disabled===false",'catalog ready');
  const before=await js(stored);
  check(await js("(()=>{const p=JSON.parse(localStorage.getItem('bodyforge:pilot:v1'));return p.xp===500&&p.coins===900&&p.workouts.length===0&&p.creditedWorkoutIds.length===0})()"),'synthetic wallet ready');
  await click('.bf-catalog-trigger');
  await until("document.querySelectorAll('.bf-catalog-item').length===8",'eight catalog cards');
  check(JSON.stringify(await js("[...document.querySelectorAll('.bf-catalog-item')].map(e=>e.dataset.exercise)"))===JSON.stringify(ids),'exact exercise catalog inventory');
  for(const id of ids){
    const selector='[data-exercise='+JSON.stringify(id)+']';
    if(!(await js("document.querySelector('.bf-catalog-trigger')?.getAttribute('aria-expanded')==='true'")))await click('.bf-catalog-trigger');
    await click(selector);
    await until("document.querySelector("+JSON.stringify(selector)+")?.getAttribute('aria-pressed')==='true'&&!!document.querySelector("+JSON.stringify('[data-camera-guide='+JSON.stringify(id)+']')+")",'selected '+id);
    const state=await js("(()=>{const b=document.querySelector("+JSON.stringify(selector)+");return {selected:b?.getAttribute('aria-pressed'),pressed:document.querySelectorAll('.bf-catalog-item[aria-pressed=true]').length,title:document.querySelector('.challenge-heading h2')?.textContent?.trim(),recognition:document.querySelector('.bf-capability')?.dataset.recognition,capability:document.querySelector('.bf-capability')?.textContent,btn:document.querySelector('#challenge .primary-button')?.textContent,ratio:document.querySelector('.bf-guide-phone span')?.textContent}})()");
    const target=id==='plank'?30:20,ratio=['pushup','crunch','leg-raise','plank'].includes(id)?'16:9':'9:16';
    check(state.selected==='true'&&state.pressed===1&&new RegExp('^'+target+'\\b').test(state.title||'')&&state.btn?.includes('\u041d\u0410\u0427\u0410\u0422\u042c'),'selected mode and exact target '+id);
    check(state.recognition===(id==='squat'?'camera-tested':'camera-experimental')&&state.capability?.includes('\u042d\u043a\u0441\u043f\u0435\u0440\u0438\u043c\u0435\u043d\u0442\u0430\u043b\u044c\u043d\u044b\u0439'),'recognition limitation '+id);
    check(state.ratio===ratio,'camera framing '+id+' '+ratio);
    check(await js(stored)===before,'unchanged storage '+id);
  }
  for(const width of [320,390,428]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    await until('innerWidth==='+width,'viewport '+width);
    check(await js("document.documentElement.scrollWidth<=innerWidth+1"),'no horizontal overflow '+width);
  }
  check(await js('window.__bfCatalogCameraCalls===0&&!document.querySelector(".live-tag")'),'catalog never acquires camera');
  check(await js(stored)===before,'catalog leaves exact local storage');
  check(errors.length===0,'no uncaught browser exceptions');
  console.log('BODYFORGE_8_EXERCISE_CATALOG_E2E_PASS',JSON.stringify({checks}));
}catch(error){console.error('BODYFORGE_8_EXERCISE_CATALOG_E2E_FAIL',error?.message||String(error));process.exitCode=13;}
finally{
  // Close the verified page before the verified browser, even on a failed UI check.
  if(target&&identity)try{await closeOwnedPage(identity,target);}
  catch(error){console.error("QA_OWNED_PAGE_CLOSE FAIL",error?.message||String(error));process.exitCode||=17;}
  ws?.close();rejectPending();
  if(chrome)try{await cleanupOwnedChrome(profile,prefix,chrome,identity);}
  catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode=17;}
}
