import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
const origin=process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const port=9583, profile=path.join(os.tmpdir(),'bf-e2e-tower-'+process.pid);
const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  '--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank',
],{stdio:'ignore'});
let ws,seq=0;const requests=new Map();
async function endpoint(){
 for(let i=0;i<80;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();const t=tabs.find(x=>x.type==='page');if(t)return t.webSocketDebuggerUrl;}catch{} await sleep(180);}
 throw Error('CDP unavailable');
}
function cmd(method,params={}){
 return new Promise((ok,no)=>{
  const id=++seq, timer=setTimeout(()=>{requests.delete(id);no(Error(method+' timed out'))},25000);
  requests.set(id,m=>{clearTimeout(timer);m.error?no(Error(JSON.stringify(m.error))):ok(m.result)});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function ev(expression){
 const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
 return r.result.value;
}
const obj=async exp=>JSON.parse(await ev('JSON.stringify('+exp+')'));
async function until(expression,label){
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){if(await ev(expression))return;await sleep(100);}
 throw Error('TIMEOUT '+label);
}
function assert(ok,label){if(!ok)throw Error('FAIL '+label);console.log('PASS',label)}
async function click(selector){assert(await ev("(()=>{const x=document.querySelector("+JSON.stringify(selector)+");if(!x)return false;x.click();return true;})()"),'click '+selector)}
async function shot(name){
 const r=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 const file=path.join(os.tmpdir(),name);fs.writeFileSync(file,Buffer.from(r.data,'base64'));
 console.log('SHOT',file,fs.statSync(file).size);
}
try{
 ws=new WebSocket(await endpoint());
 await new Promise((ok,no)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',no,{once:true})});
 ws.addEventListener('message',e=>{
  const m=JSON.parse(e.data);
  if(m.id&&requests.has(m.id)){requests.get(m.id)(m);requests.delete(m.id)}
  if(m.method==='Runtime.exceptionThrown')console.log('BROWSER_EXCEPTION',(m.params?.exceptionDetails?.exception?.description||'').slice(0,200));
 });
 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await cmd('Page.navigate',{url:origin+'/'});
 await sleep(2800);
 await click('#onboarding .forge-solid-button');
 await sleep(150);
 const patch=JSON.parse(await ev("(async()=>{\n const source=await(await fetch('/src/App.tsx')).text();\n const marker='/node_modules/.vite/deps/@mediapipe_tasks-vision.js?v=';\n const begin=source.indexOf(marker);\n if(begin<0)throw Error('Could not find MediaPipe module URL');\n const remaining=source.slice(begin);\n const url=remaining.split('\"')[0].split(\"'\")[0];\n const mp=await import(url);\n const rep=[170,170,170,158,144,132,125,120,119,124,138,151,165,170,172,173];\n const angles=[170,170,170,...Array.from({length:20},()=>rep).flat()];\n let index=0;\n mp.PoseLandmarker.prototype.detectForVideo=function(video){\n   const angle=angles[Math.min(index++,angles.length-1)];\n   const radians=(180-angle)*Math.PI/180;\n   const landmarks=Array.from({length:33},()=>({x:.5,y:.5,visibility:0}));\n   landmarks[23]={x:.5,y:.30,visibility:.98};\n   landmarks[25]={x:.5,y:.51,visibility:.98};\n   landmarks[27]={x:.5+.22*Math.sin(radians)/(video.videoWidth/video.videoHeight),y:.51+.22*Math.cos(radians),visibility:.98};\n   landmarks[11]={x:.46,y:.14,visibility:.98};\n   landmarks[12]={x:.54,y:.14,visibility:.98};\n   return {landmarks:[landmarks]};\n };\n window.__bfMockPoseStats=()=>({used:index,total:angles.length});\n return JSON.stringify({installed:true,total:angles.length,url});\n})()"));
 console.log('POSE_MOCK',JSON.stringify(patch));assert(patch.installed,'synthetic pose stream installed on MediaPipe module');
 await click('.mobile-nav button:nth-child(4)');
 await sleep(200);
 await click('#tower .forge-solid-button');
 console.log('TOWER_START',JSON.stringify(await obj("({screen:document.querySelector('.app-shell').dataset.screen,mode:document.querySelector('#challenge')?.textContent?.slice(0,70)})")));
 let final=null;
 for(let i=0;i<115;i++){
   await sleep(520);
   final=await obj("({mock:window.__bfMockPoseStats?.(),complete:!!document.querySelector('.completion-stage'),error:document.querySelector('.camera-error')?.textContent||null,loading:!!document.querySelector('.loading-overlay'),camera:!!document.querySelector('.camera-visible'),hud:document.querySelector('.pose-hud-angle strong')?.textContent,progress:document.querySelector('.counter-number')?.textContent,xp:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').xp||0})");
   if(i%10===0)console.log('TRACKING',JSON.stringify(final));
   if(final.complete||final.error)break;
 }
 console.log('FINAL_UI',JSON.stringify(final));
 assert(final.complete&&!final.camera&&!final.error,'camera auto-stops after twenty poses');
 await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').workouts?.length===1",'tower result acknowledged on disk');
 const profileState=await obj("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}')");
 console.log('PROFILE',JSON.stringify({xp:profileState.xp,coins:profileState.coins,floor:profileState.game?.highestClearedFloor,ghost:profileState.game?.bestGhost?.splitsMs?.length,workouts:profileState.workouts?.length,reps:profileState.workouts?.[0]?.repetitions,splits:profileState.workouts?.[0]?.splitsMs?.length}));
 assert(profileState.xp===185&&profileState.coins===65,'tower gives workout and victory bonus exactly once');
 assert(profileState.game?.highestClearedFloor===1,'one tower floor unlocked');
 await until("document.querySelector('.completion-stage [role=\"status\"]')?.textContent==='20 ЗАСЧИТАННЫХ ПОВТОРЕНИЙ'",'completion confirms the saved result');
 assert(await ev("document.querySelector('#challenge .challenge-type')?.textContent?.trim()==='БАШНЯ · ЭТАЖ 1'"),'completed tower heading retains the original floor after the next floor unlocks');
 assert(profileState.game?.bestGhost?.splitsMs?.length===20,'ghost records twenty split times');
 assert(profileState.workouts?.length===1&&profileState.workouts[0].repetitions===20,'single workout credited');
 await shot('bf-qa-tower-victory.png');
 await click('.mobile-nav button:nth-child(4)');
 await sleep(150);
 const ghost=await obj("({disabled:document.querySelector('.ghost-panel button')?.disabled, text:document.querySelector('.ghost-panel')?.textContent?.slice(0,110)})");
 console.log('GHOST',JSON.stringify(ghost));
 assert(ghost.disabled===false,'shadow race unlocks after first workout');
 await click('.mobile-nav button:nth-child(1)');
 await sleep(150);
 await until("document.querySelector('#daily-plan [data-goal-completed]')?.dataset.goalCompleted==='20'",'completed workout appears in saved daily target');
 assert(await ev("document.querySelector('#daily-plan [data-goal-target]')?.dataset.goalTarget==='20'"),'daily goal reaches 100% only from saved full camera workout');
 const questButton=await obj("({text:document.querySelectorAll('#quests .quest-button')[1]?.textContent||null,disabled:document.querySelectorAll('#quests .quest-button')[1]?.disabled})");
 console.log('QUEST',JSON.stringify(questButton));
 assert(questButton.text.includes('ЗАБРАТЬ'),'daily quest earned after completed workout');
 await click('#quests .quest-card:nth-child(2) button');
 await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').xp===240",'daily quest acknowledged on disk');
 const claimed=await obj("({xp:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').xp,coins:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').coins})");
 console.log('QUEST_CLAIMED',JSON.stringify(claimed));
 assert(claimed.xp===240&&claimed.coins===85,'daily quest claimed once');
 console.log('BODYFORGE_TOWER_20REPS_E2E_PASS');
}catch(error){console.error('BODYFORGE_TOWER_20REPS_E2E_FAIL',error.stack||String(error));process.exitCode=13}
finally{ws?.close();chrome.kill();await sleep(400);try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
