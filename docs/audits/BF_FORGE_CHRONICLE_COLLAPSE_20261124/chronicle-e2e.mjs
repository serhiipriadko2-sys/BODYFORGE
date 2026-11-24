import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5176';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Only local QA origins allowed');
const output = path.dirname(fileURLToPath(import.meta.url));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-chronicle-'));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
], {stdio:'ignore'});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, port, seq=0, checks=0;
const pending = new Map(), errors=[];
function check(ok, label) { if (!ok) throw Error('FAIL '+label); checks++; console.log('PASS '+label); }
function cdp(method, params={}) {
  return new Promise((resolve,reject)=>{
    const id=++seq, timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},15000);
    pending.set(id, m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression) {
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, label, ms=20000) {
  const end=Date.now()+ms;
  while(Date.now()<end) {
    try { if(await js(expression)) return; }
    catch(e) { if(!/Inspected target navigated or closed|Execution context was destroyed|Cannot find context/.test(String(e))) throw e; }
    await sleep(140);
  }
  throw Error('TIMEOUT '+label);
}
const selector='#progress .records-toggle';
const inspect = () => js('(()=>{const b=document.querySelector("#progress .records-toggle"),c=document.getElementById("forge-records-content"),r=document.querySelector("#progress .records-card"),h=r.querySelector(".lower-card-header"),s=r.querySelector(".record-list"),p=b.getBoundingClientRect(),box=r.getBoundingClientRect();return {expanded:b.getAttribute("aria-expanded"),hidden:c.hidden,display:getComputedStyle(c).display,visible:s.getClientRects().length>0,buttonW:p.width,buttonH:p.height,cardW:box.width,cardScroll:r.scrollWidth,headerW:h.clientWidth,headerScroll:h.scrollWidth,width:innerWidth,documentWidth:document.documentElement.scrollWidth,height:box.height,records:[...s.querySelectorAll(".record-item strong")].map(x=>x.textContent),history:r.querySelectorAll(".recent-history li").length}})()');
async function viewport(width) { await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(250); }
async function pointerClick() {
  const p=await js('(()=>{const b=document.querySelector('+JSON.stringify(selector)+');b.scrollIntoView({block:"center",behavior:"instant"});const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:b.contains(document.elementFromPoint(x,y))}})()');
  if(!p.hit) throw Error('Toggle is obscured');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
}
async function snapshot(name) {
  await js('document.querySelector("#progress .records-card").scrollIntoView({block:"center",behavior:"instant"})');
  await sleep(180);
  const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,name),Buffer.from(r.data,'base64'));
}
try {
  for(let i=0;i<150;i++){try{port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port>0)break;}catch{} await sleep(100);}
  if(!port) throw Error('Own Chrome did not start');
  const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
  ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await viewport(390);
  const key='bodyforge:pilot:v1';
  const fixture={xp:120,coins:35,workouts:[{id:'qa-chronicle',finishedAt:new Date().toISOString(),durationMs:65000,repetitions:20,xp:120,mode:'training',exerciseId:'squat'}],game:{created:true,nickname:'QA ONLY',build:'lean',muscles:{arms:0,core:0,legs:0,back:0},outfit:'base',ownedOutfits:['base'],lastLoginDay:null,lastQuestClaimDay:null,highestClearedFloor:0,bestGhost:null}};
  const init=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin==='+JSON.stringify(origin)+'){if(!localStorage.getItem('+JSON.stringify(key)+'))localStorage.setItem('+JSON.stringify(key)+','+JSON.stringify(JSON.stringify(fixture))+');}'});
  await cdp('Page.navigate',{url:origin+'/'});
  await until('!!document.querySelector('+JSON.stringify(selector)+') && document.querySelector(".app-shell")?.dataset.screen==="dashboard"','Forge ready');
  await sleep(350);
  await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
  const saved=await js('localStorage.getItem('+JSON.stringify(key)+')');
  check(!!saved,'synthetic profile exists');
  let a=await inspect();check(a.expanded==='false'&&a.hidden&&a.display==='none'&&!a.visible,'closed by default');
  check(a.buttonW>=44&&a.buttonH>=44,'44px touch target');
  await snapshot('chronicle-collapsed-390.png');
  await pointerClick();await until('document.querySelector('+JSON.stringify(selector)+').getAttribute("aria-expanded")==="true"','expanded');
  a=await inspect();check(!a.hidden&&a.visible&&a.records[0]==='20'&&a.records[1]==='1'&&a.history===1,'actual saved workout and totals visible');
  console.log('OPEN_STATE',JSON.stringify(a));
  await snapshot('chronicle-expanded-390.png');
  for(const width of [320,360,390,428]) {
    await viewport(width);a=await inspect();
    console.log("LAYOUT",JSON.stringify(a));
    check(a.cardW>0&&a.cardScroll<=a.cardW+2&&a.headerScroll<=a.headerW+1&&a.documentWidth<=width+1&&a.buttonW>=44&&a.buttonH>=44,'expanded layout '+width+'px');
  }
  await pointerClick();await until('document.getElementById("forge-records-content").hidden','collapsed by pointer');
  a=await inspect();check(a.expanded==='false'&&!a.visible,'second click collapses');
  await cdp('Page.bringToFront');
  await js('document.querySelector('+JSON.stringify(selector)+').focus()');
  check(await js('document.activeElement===document.querySelector('+JSON.stringify(selector)+')'),'toggle receives keyboard focus');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await until('!document.getElementById("forge-records-content").hidden','Enter expands');
  check(await js('document.querySelector('+JSON.stringify(selector)+').getAttribute("aria-expanded")==="true"'),'keyboard and aria state');
  check(await js('localStorage.getItem('+JSON.stringify(key)+')')===saved,'toggle never rewrites profile');
  await js('window.__qaOldDocument=true');
  await cdp('Page.reload',{ignoreCache:true});
  await until('!window.__qaOldDocument && !!document.querySelector('+JSON.stringify(selector)+')','new document');
  a=await inspect();check(a.expanded==='false'&&a.hidden&&!a.visible,'real reload resets disclosure');
  check(await js('localStorage.getItem('+JSON.stringify(key)+')')===saved,'progress unchanged after reload');
  check(errors.length===0,'no uncaught browser exceptions');
  console.log('BODYFORGE_CHRONICLE_PASS checks='+checks);
} catch(error) {console.error('BODYFORGE_CHRONICLE_FAIL',error.stack);process.exitCode=17;}
finally {
  try {if(ws?.readyState===WebSocket.OPEN)await cdp('Browser.close').catch(()=>{});}catch{}
  ws?.close();chrome.kill();await sleep(800);
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('bf-chronicle-')) {
    try {fs.rmSync(profile,{recursive:true,force:true,maxRetries:15,retryDelay:200});}catch(e){console.error('TEMP_CLEANUP_FAIL',String(e));process.exitCode ||=18;}
  }
}
