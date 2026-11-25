// Actual production preview; isolated Chrome profile only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requirePreviewOrigin, waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';

const origin=process.env.BODYFORGE_QA_ORIGIN;
await requirePreviewOrigin(origin,process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256);
const matches=fs.readdirSync('dist/assets').filter(x=>/^AppearanceDialogContent-[\w-]+\.js$/.test(x));
if(matches.length!==1)throw Error('Expected one appearance editor chunk');
const chunk=origin+'/assets/'+matches[0];
const prefix='bf-appearance-lazy-', profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
  '--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{stdio:'ignore'});
let browser,socket,seq=0,checks=0,paused=null;
const pending=new Map(),requests=[],exceptions=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(ok,label){if(!ok)throw Error('FAIL '+label);checks++;console.log('PASS '+label)}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},20000);
    pending.set(id,{timer,resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
}
async function until(test,label,timeout=20000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await test())return;await sleep(80)}
  throw Error('TIMEOUT '+label);
}
const q=selector=>'document.querySelector('+JSON.stringify(selector)+')';
const trigger='button[aria-label="Внешний вид"]',close='button[aria-label="Закрыть внешний вид"]';
const dialog='dialog.appearance-dialog',game='JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("bodyforge:pilot:v1")).sort())';
const pref='localStorage.getItem("bodyforge:appearance:v1")';
const click=async selector=>{await until(()=>js(q(selector)+'&&!'+q(selector)+'.disabled'),'control '+selector);await js(q(selector)+'.focus();'+q(selector)+'.click();true')};
const state=s=>()=>js(q(dialog)+'?.dataset.appearanceLoad==='+JSON.stringify(s));
try{
  browser=await waitForOwnedBrowser(profile,chrome);
  const target=await newOwnedPage(browser);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data.toString()),req=pending.get(msg.id);
    if(req){clearTimeout(req.timer);pending.delete(msg.id);msg.error?req.reject(Error(JSON.stringify(msg.error))):req.resolve(msg.result)}
    if(msg.method==='Network.requestWillBeSent'&&msg.params.request.url===chunk)requests.push(msg.params.requestId);
    if(msg.method==='Fetch.requestPaused'&&msg.params.request.url===chunk)paused=msg.params.requestId;
    if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Fetch.enable',{patterns:[{urlPattern:chunk,requestStage:'Request'}]});
  const fixture=JSON.stringify({version:1,palette:'violet',customAccent:'#65ead0',material:'solid',highContrast:false});
  const seed=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("bodyforge:appearance:v1",'+JSON.stringify(fixture)+')'});
  await cdp('Page.navigate',{url:origin+'/'});
  await until(()=>js('!!'+q(trigger)+'&&document.documentElement.dataset.bfPalette==="violet"&&document.documentElement.dataset.bfMaterial==="solid"'),'app and saved theme ready');
  await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed.identifier});
  await sleep(300);
  const gameBefore=await js(game);
  check(requests.length===0&&paused===null&&await state('idle')(),'saved appearance applied before any editor request');
  check(await js(pref)===fixture,'startup preserves exact preference bytes');
  await click(trigger);
  await until(async()=>paused!==null&&await state('loading')(),'editor request held');
  check(await js(q(dialog)+'?.matches(":modal")&&!'+q('[data-palette=violet]')),'native modal opens with loading state before controls arrive');
  await click(close);
  check(await js('!'+q(dialog)+'.open'),'modal can close during module download');
  const first=paused;paused=null;await cdp('Fetch.continueRequest',{requestId:first});
  await until(state('ready'),'editor loaded after close');
  check(await js('!'+q(dialog)+'.open')&&await js(pref)===fixture&&await js(game)===gameBefore,'late editor load neither reopens dialog nor mutates storage');
  await click(trigger);
  await until(()=>js(q('[data-palette=violet]')+'?.getAttribute("aria-pressed")==="true"'),'loaded editor matches saved appearance');
  check(requests.length===1,'reopening uses loaded module without another request');
  await click('[data-palette=copper]');
  await until(()=>js('document.documentElement.dataset.bfPalette==="copper"&&JSON.parse('+pref+').palette==="copper"'),'palette persisted');
  check(await js(game)===gameBefore,'appearance edit leaves game storage exact');
  await click(close);
  await until(()=>js('!'+q(dialog)+'.open'),'close');
  check(await js('document.activeElement==='+q(trigger)),'native close restores opener focus');
  const current=await js(pref);
  await cdp('Page.reload',{ignoreCache:true});
  await until(()=>js('!!'+q(trigger)+'&&'+q(dialog)+'?.dataset.appearanceLoad==="idle"&&document.documentElement.dataset.bfPalette==="copper"'),'new page applies saved appearance');
  check(paused===null&&requests.length===1,'new page still waits for explicit editor intent');
  await click(trigger);
  await until(async()=>paused!==null&&await state('loading')(),'second request held');
  const second=paused;paused=null;await cdp('Fetch.failRequest',{requestId:second,errorReason:'Failed'});
  await until(state('error'),'handled unavailable editor');
  check(await js(q(dialog)+'?.open&&'+q('[data-appearance-load-error]')+'!==null'),'download failure shows explicit recoverable error');
  await click(close);
  check(await js('!'+q(dialog)+'.open&&!!'+q('.app-shell')),'editor failure does not crash app and dialog closes');
  check(await js(pref)===current&&await js(game)===gameBefore,'failed editor import changes neither preferences nor game');
  check(exceptions.length===0,'no uncaught browser exception');
  console.log('BODYFORGE_APPEARANCE_LAZY_PASS assertions='+checks);
}catch(error){console.error('BODYFORGE_APPEARANCE_LAZY_FAIL',error.stack||String(error));process.exitCode=24}
finally{
  if(paused&&socket?.readyState===WebSocket.OPEN)try{await cdp('Fetch.failRequest',{requestId:paused,errorReason:'Aborted'})}catch{}
  socket?.close();
  for(const r of pending.values()){clearTimeout(r.timer);r.reject(Error('QA stopped'))}
  pending.clear();
  try{await cleanupOwnedChrome(profile,prefix,chrome,browser)}catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode||=25}
}
