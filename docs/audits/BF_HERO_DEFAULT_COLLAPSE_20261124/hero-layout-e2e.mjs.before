import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5236';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Only local frozen preview allowed');
const screenshots = process.env.BODYFORGE_QA_ARTIFACT_DIR ||
  path.resolve('docs/audits/BF_HERO_LAYOUT_20261110');
if (fs.existsSync(screenshots)) throw Error('Screenshot folder exists: refusing overwrite');
fs.mkdirSync(screenshots, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-hero-layout-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Map();
const exceptions = [];
let socket, seq=0;
function check(ok, label) { if (!ok) throw Error('FAIL ' + label); console.log('PASS ' + label); }
async function endpoint() {
  for(let i=0;i<95;i++) {
    try {
      const port = Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
      const pages = await(await fetch('http://127.0.0.1:' + port + '/json')).json();
      const tab = pages.find(page => page.type === 'page');
      if (tab) return tab.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw Error('Chrome CDP port did not open');
}
function cdp(method, params={}) {
  return new Promise((resolve, reject) => {
    const id=++seq;
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},18000);
    pending.set(id,msg=>{clearTimeout(timeout);msg.error?reject(Error(JSON.stringify(msg.error))):resolve(msg.result);});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression) {
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression,label,timeout=24000) {
  const limit=Date.now()+timeout;
  while(Date.now()<limit){if(await js(expression))return;await sleep(150);}
  throw Error('TIMEOUT '+label);
}
async function click(selector) {
  const found=await js('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)return false;e.click();return true})()');
  check(found,'click '+selector);
}
async function viewport(width) {
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:960,mobile:width<=428,deviceScaleFactor:1});
  await sleep(220);
}
async function screenshot(name) {
  const data=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const filename=path.join(screenshots,name);
  fs.writeFileSync(filename,Buffer.from(data.data,'base64'));
  console.log('SCREENSHOT '+filename+' '+fs.statSync(filename).size);
}
async function layout() {
  return JSON.parse(await js('JSON.stringify((()=>{const box=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,top:b.top,bottom:b.bottom,height:b.height,display:getComputedStyle(e).display}};const a=document.querySelector("#forge [data-studio-panel=appearance]"),w=document.querySelector("#forge [data-studio-panel=wardrobe]");return {width:innerWidth,scroll:document.documentElement.scrollWidth,screen:document.querySelector(".app-shell")?.dataset.screen,preview:box("#forge .studio-preview"),muscles:box("#forge .studio-muscle-panel"),appearance:box("#forge [data-studio-panel=appearance]"),wardrobe:box("#forge [data-studio-panel=wardrobe]"),muscleCards:document.querySelectorAll("#forge .muscle-card").length,outfits:document.querySelectorAll("#forge .outfit-item").length,labOpen:a?.open,wardrobeOpen:w?.open,labVisible:!!document.querySelector("#avatar-lab")?.getClientRects().length,outfitVisible:!!document.querySelector("#forge .outfit-grid")?.getClientRects().length,summaryHeight:box("#forge [data-studio-panel=appearance]>summary")?.height}})())'));
}
try {
  socket=new WebSocket(await endpoint());
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  socket.addEventListener('message',ev=>{
    const msg=JSON.parse(ev.data.toString());
    if(msg.id && pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);}
    if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params?.exceptionDetails?.text||'exception');
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await viewport(360);
  await cdp('Page.navigate',{url:origin});
  await until('!!document.querySelector("#onboarding .forge-solid-button")','onboarding');
  await click('.build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard" && !document.querySelector("#onboarding")','fighter created');
  await click('.mobile-nav button:nth-child(3)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="forge" && !!document.querySelector("#forge .studio-muscle-panel")','hero tab loaded');
  await until('!!document.querySelector("#avatar-lab")','lazy Avatar Lab visible');
  const profileBefore = await js('localStorage.getItem("bodyforge:pilot:v1")');
  const lookBefore = await js('localStorage.getItem("bodyforge:avatar-look:v1")');
  for(const width of [320,360,390,428,1080]) {
    await viewport(width);
    const data=await layout();
    console.log('HERO_LAYOUT_'+width,JSON.stringify(data));
    check(data.screen==='forge' && data.preview && data.muscles,'Hero renders model and muscles at '+width);
    check(data.muscleCards===4 && data.outfits===3,'four muscles and three outfits at '+width);
    check(data.muscles.top >= data.preview.bottom && data.muscles.top-data.preview.bottom <= 40,
      'muscles directly below 3D card at '+width);
    check(Math.abs(data.muscles.x-data.preview.x) < 4,'muscles align to 3D model at '+width);
    check(data.scroll<=width+1,'no horizontal scroll at '+width);
    check(data.summaryHeight>=44,'accordion touch target at least 44px at '+width);
    if(width<=428) check(data.appearance.top >= data.muscles.bottom,
      'mobile cosmetics follow muscle upgrades at '+width);
    check(data.labOpen && data.wardrobeOpen && data.labVisible && data.outfitVisible,
      'cosmetic panels initially accessible at '+width);
    await js('document.querySelector("#forge")?.scrollIntoView({block:"start",behavior:"instant"})');
    await sleep(100);
    await screenshot('hero-'+width+'-initial.png');
  }

  await viewport(390);
  await click('[data-studio-panel="appearance"]>summary');
  let snap=await layout();
  check(!snap.labOpen && !snap.labVisible && snap.wardrobeOpen && snap.outfitVisible,
    'appearance folds while wardrobe independently stays open');
  await click('[data-studio-panel="wardrobe"]>summary');
  snap=await layout();
  check(!snap.labOpen && !snap.wardrobeOpen && !snap.labVisible && !snap.outfitVisible,
    'both panels can be fully hidden');
  check(snap.muscleCards===4,'muscle upgrades stay present when cosmetics are closed');
  await js('document.querySelector("[data-studio-panel=appearance]")?.scrollIntoView({block:"center",behavior:"instant"})');
  await sleep(150);
  await screenshot('hero-390-both-closed.png');

  await cdp('Page.bringToFront');
  const focused=JSON.parse(await js('JSON.stringify((()=>{const el=document.querySelector("[data-studio-panel=wardrobe]>summary");el.focus();return {active:document.activeElement===el,tag:el.tagName,tabIndex:el.tabIndex}})())'));
  console.log('SUMMARY_FOCUS',JSON.stringify(focused));
  check(focused.active && focused.tag==='SUMMARY','native summary can receive keyboard focus');
  await cdp('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent',{type:'char',text:'\r',unmodifiedText:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await until('document.querySelector("[data-studio-panel=wardrobe]")?.open===true','keyboard opens wardrobe');
  snap=await layout();
  check(snap.wardrobeOpen && snap.outfitVisible && !snap.labOpen,
    'Enter expands only wardrobe using keyboard');
  await click('[data-studio-panel="appearance"]>summary');
  await until('document.querySelector("[data-studio-panel=appearance]")?.open===true','appearance reopened');
  snap=await layout();
  check(snap.labOpen && snap.labVisible && snap.wardrobeOpen,
    'appearance reopens without losing wardrobe');
  check(await js('localStorage.getItem("bodyforge:pilot:v1")') === profileBefore,
    'disclosure actions never rewrite saved XP, coins, outfits or workout history');
  check(await js('localStorage.getItem("bodyforge:avatar-look:v1")') === lookBefore,
    'disclosure actions never rewrite cosmetic selections');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  check(await js('getComputedStyle(document.querySelector("#forge .studio-accordion-chevron")).transitionDuration')==='0s',
    'reduced-motion preference disables arrow animation');
  check(exceptions.length===0,'no uncaught browser exceptions on Hero');
  console.log('BODYFORGE_HERO_ACCORDION_E2E_PASS');
} catch(error) {
  console.error('BODYFORGE_HERO_ACCORDION_E2E_FAIL',error?.stack||String(error));
  console.error('BROWSER_EXCEPTIONS',JSON.stringify(exceptions.slice(-5)));
  process.exitCode=1;
} finally {
  if(socket?.readyState===WebSocket.OPEN)try{await cdp('Browser.close');}catch{}
  socket?.close();
  chrome.kill();
  await sleep(250);
  try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
}
