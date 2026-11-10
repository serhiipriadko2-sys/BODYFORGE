import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5237';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Only local preview is authorized');
const mode = process.env.BODYFORGE_QA_MODE === 'verify' ? 'verify' : 'audit';
const shots = process.env.BODYFORGE_QA_ARTIFACT_DIR ||
  path.resolve('docs/audits/BF_UI_POLISH_20261110_'+mode.toUpperCase());
if(fs.existsSync(shots)) throw Error('Artifacts folder exists: refusing overwrite');
fs.mkdirSync(shots,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bf-ui-polish-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check',
  '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0','--user-data-dir='+profile,
  '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','about:blank',
],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map(),errors=[];
let socket,seq=0;
function check(condition,message){if(!condition)throw Error('FAIL '+message); console.log('PASS '+message);}
async function endpoint(){
  for(let i=0;i<95;i++){try{
    const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
    const pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
    const tab=pages.find(t=>t.type==='page');
    if(tab)return tab.webSocketDebuggerUrl;
  }catch{}await sleep(200)}
  throw Error('Browser CDP endpoint missing');
}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},18000);
    pending.set(id,msg=>{clearTimeout(timer);msg.error?reject(Error(JSON.stringify(msg.error))):resolve(msg.result)});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const result=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression,label,timeout=22000){
  const limit=Date.now()+timeout;
  while(Date.now()<limit){if(await js(expression))return;await sleep(150)}
  throw Error('TIMEOUT '+label);
}
async function viewport(width){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:760,mobile:true,deviceScaleFactor:1});
  await sleep(150);
}
async function click(selector){
  check(await js('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e)return false;e.click();return true})()'),
    'click '+selector);
}
async function screenshot(filename){
  const result=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const full=path.join(shots,filename);
  fs.writeFileSync(full,Buffer.from(result.data,'base64'));
  console.log('SCREENSHOT',filename,fs.statSync(full).size);
}
function gatherMetrics(){
  const visible=e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
  const nav=document.querySelector('.mobile-nav'),nr=nav?.getBoundingClientRect();
  const buttons=[...document.querySelectorAll('.mobile-nav button')].filter(visible);
  const controls=[...document.querySelectorAll('main button,main summary,main select,main input')]
    .filter(visible);
  const undersized=controls.filter(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44})
    .slice(0,8).map(e=>({tag:e.tagName,cls:String(e.className).slice(0,45),text:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,35),w:Math.round(e.getBoundingClientRect().width),h:Math.round(e.getBoundingClientRect().height)}));
  const labels=buttons.map(e=>{const t=e.querySelector('span'),r=e.getBoundingClientRect(),tr=t?.getBoundingClientRect();return {text:(t?.textContent||'').trim(),font:parseFloat(getComputedStyle(e).fontSize),width:r.width,height:r.height,labelWidth:tr?.width,clipped:t?tr.width>r.width-2:false}});
  const targetSelectors={start:'.dashboard-player-stats .profile-training-cta',pulseTraining:'#pulse-progress .pulse-metric button',pulseHero:'#pulse-progress .pulse-metric button:nth-of-type(2)',sound:'#challenge .sound-toggle',cameraRefresh:'#challenge .camera-refresh',wholeFrame:'#challenge .camera-frame-toggle',avatarView:'#forge .armory-view-tabs button',avatarYaw:'#forge .armory-yaw-controls button',lookReset:'#forge [data-action="avatar-look-reset"]',installGuide:'#settings .progress-install-help>summary',backupChecker:'#settings .progress-backup-file-checker>summary'};
  const targets=Object.fromEntries(Object.entries(targetSelectors).map(([key,selector])=>{const e=document.querySelector(selector);const r=e?.getBoundingClientRect();return [key,r&&r.width>0&&r.height>0?{width:r.width,height:r.height}:null]}));
  return {targets,screen:document.querySelector('.app-shell')?.dataset.screen,viewport:innerWidth,docWidth:document.documentElement.scrollWidth,
    height:innerHeight,navTop:nr?.top,navBottom:nr?.bottom,navWidth:nr?.width,buttons:labels,
    undersized,mainCount:controls.length,smallCount:controls.filter(e=>{const r=e.getBoundingClientRect();return r.height<44||r.width<44}).length,
    scrollBottom:parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom)||0};
}
const sections=['dashboard','challenge','forge','tower','online','settings'];
let report=[];
try{
  socket=new WebSocket(await endpoint());
  await new Promise((resolve,reject)=>{
    socket.addEventListener('open',resolve,{once:true});
    socket.addEventListener('error',reject,{once:true});
  });
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data.toString());
    if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params?.exceptionDetails?.text||'exception');
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await viewport(390);
  await cdp('Page.navigate',{url:origin});
  await until('!!document.querySelector("#onboarding .forge-solid-button")','setup');
  await click('.build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  await until('document.querySelector(".app-shell")?.dataset.screen==="dashboard" && !document.querySelector("#onboarding")','fighter dashboard');
  for(const width of [320,360,390,428]){
    await viewport(width);
    for(let i=0;i<sections.length;i++){
      await click('.mobile-nav button:nth-child('+(i+1)+')');
      await until('document.querySelector(".app-shell")?.dataset.screen==='+JSON.stringify(sections[i]),'tab '+sections[i]);
      if(sections[i]==='forge')await until('!!document.querySelector("#avatar-lab")','Avatar Lab loaded');
      if(sections[i]==='settings')await until('!!document.querySelector("#settings .progress-install-help")','settings backup loaded');
      await sleep(140);
      const data=JSON.parse(await js('JSON.stringify(('+gatherMetrics.toString()+')())'));
      report.push(data);
      console.log('UI_AUDIT',JSON.stringify(data));
      if(width===390){
        await js('window.scrollTo(0,0)');
        await screenshot('screen-'+sections[i]+'-390.png');
      }
      if(mode==='verify'){
        check(data.docWidth<=data.viewport+1,'No page horizontal overflow: '+width+' '+sections[i]);
        check(data.buttons.length===6 && data.buttons.every(x=>x.width>=44&&x.height>=44),'Navigation touch areas >=44 px: '+width+' '+sections[i]);
        check(data.buttons.every(x=>x.font>=9.5),'Navigation labels >=9.5px: '+width+' '+sections[i]);
        check(data.buttons.every(x=>!x.clipped),'Navigation labels fit: '+width+' '+sections[i]);
        check(data.scrollBottom>=90,'Bottom scroll-padding reserves navigation: '+width+' '+sections[i]);
        const activeTargets=Object.entries(data.targets).filter(([,r])=>r!==null);
        check(activeTargets.every(([,r])=>r.height>=44&&r.width>=44),'Primary controls and disclosure targets >=44 px: '+width+' '+sections[i]);
      }
    }
  }
  await viewport(390);
  await click('.mobile-nav button:nth-child(6)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="settings"','settings for focus');
  const focus=JSON.parse(await js('JSON.stringify((()=>{const nav=document.querySelector(".mobile-nav").getBoundingClientRect();const all=[...document.querySelectorAll("#settings button,#settings summary,#settings select")];const e=all.filter(e=>{const r=e.getBoundingClientRect();return r.height>=24&&r.width>=24}).at(-1);if(!e)return null;e.scrollIntoView({block:"end",behavior:"instant"});const r=e.getBoundingClientRect();return {tag:e.tagName,text:(e.innerText||"").slice(0,60),targetBottom:r.bottom,navTop:nav.top,visibleAboveNav:r.bottom<=nav.top,scrollY,scrollHeight:document.documentElement.scrollHeight}})())'));
  console.log('FOCUS_BOTTOM_CASE',JSON.stringify(focus));report.push({focus});
  await screenshot('settings-last-control-scroll-end.png');
  if(mode==='verify')check(focus?.visibleAboveNav===true,'Last FAQ control scrolls above fixed navigation');
  check(errors.length===0,'No uncaught React/JavaScript errors on screen tour');
  fs.writeFileSync(path.join(shots,'audit.json'),JSON.stringify({origin,mode,report},null,2));
  console.log('BODYFORGE_UI_POLISH_'+mode.toUpperCase()+'_PASS');
}catch(e){
  console.error('BODYFORGE_UI_POLISH_'+mode.toUpperCase()+'_FAIL',e?.stack||String(e));
  process.exitCode=1;
}finally{
  if(socket?.readyState===WebSocket.OPEN)try{await cdp('Browser.close')}catch{}
  socket?.close();chrome.kill();await sleep(200);
  try{fs.rmSync(profile,{recursive:true,force:true})}catch{}
}
