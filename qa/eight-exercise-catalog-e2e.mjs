import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base=process.env.BODYFORGE_QA_ORIGIN||'http://127.0.0.1:5173';
const port=9654, dir=path.join(os.tmpdir(),'bf-exercise-catalog-'+process.pid);
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-gpu',
 '--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+dir,'about:blank',
],{stdio:'ignore'});
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
let ws,number=0;const pending=new Map();
async function getWs(){for(let i=0;i<80;i++){try{const pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();const page=pages.find(x=>x.type==='page');if(page)return page.webSocketDebuggerUrl;}catch{}await sleep(200);}throw Error('Chrome CDP not responding');}
function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++number,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout: '+method))},12000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});ws.send(JSON.stringify({id,method,params}));})}
async function evalJs(expression){const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value}
async function until(expr,label){for(let i=0;i<90;i++){if(await evalJs(expr))return;await sleep(120);}throw Error(label)}
const ids=['squat','lunge','pushup','jumping-jack','high-knees','crunch','leg-raise','plank'];
try {
 ws=new WebSocket(await getWs());await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}});
 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await cmd('Page.navigate',{url:base});await until("document.querySelector('#challenge')!==null",'Challenge not loaded');
 await evalJs("document.querySelector('.mobile-nav button:nth-child(2)').click()");
 await until("document.querySelector('.bf-catalog-trigger')!==null",'Catalogue not loaded');
 for(const id of ids){
  await evalJs("(()=>{const t=document.querySelector('.bf-catalog-trigger');if(t?.getAttribute('aria-expanded')!=='true')t.click();})()");
  const changed=await evalJs("(()=>{const b=document.querySelector('[data-exercise="+JSON.stringify(id)+"]');if(!b)return false;b.click();return true})()");
  if(!changed)throw Error('missing card '+id);
  await sleep(80);
  const result=await evalJs("(()=>{const b=document.querySelector('[data-exercise="+JSON.stringify(id)+"]');const title=document.querySelector('.challenge-heading h2')?.textContent;const capability=document.querySelector('.bf-capability')?.textContent;const btn=document.querySelector('#challenge .primary-button')?.textContent;return JSON.stringify({selected:b?.getAttribute('aria-pressed'),title,capability,btn})})()");
  const state=JSON.parse(result);
  if(state.selected!=='true'||!state.title||!state.btn?.includes('НАЧАТЬ')||state.capability?.includes('не считает'))throw Error('failed '+id+' '+result);
  if(id==='plank'&&!state.title.includes('30'))throw Error('plank incorrectly treated as repetitions');
  const ratio=await evalJs("document.querySelector('.bf-guide-phone span')?.textContent");
  const expected=['pushup','crunch','leg-raise','plank'].includes(id)?'16:9':'9:16';
  if(ratio!==expected)throw Error('incorrect camera framing '+id+' '+ratio+' expected '+expected);
  console.log('PASS '+id+' '+state.title+' · '+ratio);
 }
 console.log('BODYFORGE_8_EXERCISE_CATALOG_E2E_PASS');
}catch(e){console.error('BODYFORGE_8_EXERCISE_CATALOG_E2E_FAIL',e.stack||String(e));process.exitCode=13}
finally {ws?.close();chrome.kill();await sleep(350);try{fs.rmSync(dir,{recursive:true,force:true})}catch{}}
