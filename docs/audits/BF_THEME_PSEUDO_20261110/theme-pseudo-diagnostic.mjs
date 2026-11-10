import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const origin=process.env.BODYFORGE_QA_ORIGIN||'http://127.0.0.1:5174';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Only localhost is permitted');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bf-pseudo-diag-'));
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
  '--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'
],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let socket,port,seq=0;const pending=new Map();
async function getEndpoint(){
  for(let i=0;i<95;i++){
    try{const p=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
      if(p>0){const tabs=await(await fetch('http://127.0.0.1:'+p+'/json',{signal:AbortSignal.timeout(1200)})).json();
        const page=tabs.find(t=>t.type==='page');if(page){port=p;return page.webSocketDebuggerUrl;}}
    }catch{}
    await sleep(150);
  }
  throw Error('CDP not ready; launcher '+chrome.exitCode);
}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},12000);
    pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression,label){
  for(let i=0;i<110;i++){if(await js(expression))return;await sleep(130);}
  throw Error('TIMEOUT '+label);
}
async function click(selector){
  await until('!!document.querySelector('+JSON.stringify(selector)+')',selector);
  await js('document.querySelector('+JSON.stringify(selector)+').click();true');
}
const probeExpression='(()=>{const e=document.querySelector("#challenge .bf-guide-steps li");'+
  'const r=document.documentElement;if(!e)return {mounted:false,theme:r.dataset.bfPalette};'+
  'const root=getComputedStyle(r),element=getComputedStyle(e),pseudo=getComputedStyle(e,"::before");'+
  'return {mounted:true,theme:r.dataset.bfPalette,rootVar:root.getPropertyValue("--bf-accent").trim(),'+
  'rootInline:r.style.getPropertyValue("--bf-accent").trim(),'+
  'elementVar:element.getPropertyValue("--bf-accent").trim(),'+
  'pseudoVar:pseudo.getPropertyValue("--bf-accent").trim(),pseudoBackground:pseudo.backgroundColor,'+
  'visible:!!e.getClientRects().length}})()';
async function measure(label){
  const item=await js(probeExpression);console.log('PSEUDO_THEME',label,JSON.stringify(item));return item;
}
async function palette(name){
  await click('button[aria-label="Внешний вид"]');
  await until('document.querySelector("dialog.appearance-dialog")?.open===true','dialog');
  await click('.appearance-palette [data-palette="'+name+'"]');
  await until('document.documentElement.dataset.bfPalette==='+JSON.stringify(name),'palette changed');
  await click('button[aria-label="Закрыть внешний вид"]');
  await until('document.querySelector("dialog.appearance-dialog")?.open===false','dialog closed');
}
async function closeOwned(){
  if(!port)return;
  try{const info=await(await fetch('http://127.0.0.1:'+port+'/json/version',{signal:AbortSignal.timeout(1000)})).json();
    if(!info.webSocketDebuggerUrl)return;
    const ws=new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('close connect timeout')),1300);
      ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('close error'));},{once:true});});
    ws.send(JSON.stringify({id:1,method:'Browser.close'}));await sleep(450);ws.close();
  }catch(error){console.warn('BROWSER_CLOSE_UNVERIFIED',String(error));}
}
try{
  socket=new WebSocket(await getEndpoint());
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data.toString());
    if(pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);}});
  await cdp('Runtime.enable');await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Page.navigate',{url:origin+'/'});
  await until('!!document.querySelector(".app-shell")','app shell');
  await palette('violet');
  await click('.mobile-nav button:nth-child(2)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="challenge"','camera');
  await until('!!document.querySelector("#challenge .bf-guide-trigger")','guide toggle');
  if(!await js('!!document.querySelector("#challenge .bf-guide-steps li")'))await click('#challenge .bf-guide-trigger');
  await until('!!document.querySelector("#challenge .bf-guide-steps li")','guide steps');
  const a=await measure('violet-first');await sleep(1000);const b=await measure('violet-settled');
  await palette('mint');await measure('mint');await palette('violet');await sleep(300);const c=await measure('violet-again');
  if(c.theme!=='violet'||c.rootVar!==c.pseudoVar)throw Error('Inherited custom property mismatch');
  if(b.pseudoBackground!==c.pseudoBackground)console.warn('PSEUDO_CHANGE_WITHOUT_VARIABLE_CHANGE');
  console.log('THEME_PSEUDO_DIAGNOSTIC_PASS');
}catch(error){console.error('THEME_PSEUDO_DIAGNOSTIC_FAIL',error.stack||String(error));process.exitCode=12;}
finally{socket?.close();await closeOwned();chrome.kill();await sleep(550);
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:15,retryDelay:250});}
  catch(error){console.error('PROFILE_CLEANUP_FAIL',String(error));process.exitCode=12;}
}