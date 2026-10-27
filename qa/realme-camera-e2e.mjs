// Real hardware lifecycle QA in an explicitly owned USB target. No pixels,
// landmarks, audio, screenshots, recordings or owner browser storage exported.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const endpoint=process.env.BODYFORGE_ANDROID_TARGET_WS;
if(!/^ws:\/\/127\.0\.0\.1:9224\/devtools\/page\/[a-f0-9]{32}$/i.test(endpoint||''))throw Error('Explicit owned QA target required');
const token=process.env.BODYFORGE_ANDROID_RESUME_TOKEN;
if(!token)throw Error('Exact preceding QA session token required');
const origin='http://localhost:5187',key='bodyforge:pilot:v1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={schema:'bodyforge.realme-camera-qa.v1',startedAt:new Date().toISOString(),status:'PARTIAL',checks:[],measurements:{},limitations:['Human repetition accuracy is NOT VERIFIED by this lifecycle test.','Inference timing is CPU wall time around detectForVideo, not completed GPU time.']};
let socket,seq=0;const pending=new Map();
function check(value,label){report.checks.push({label,pass:!!value});console.log(value?'PASS':'FAIL',label);if(!value)throw Error(label)}
function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))})}
async function js(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
async function until(expression,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await js(expression))return;await sleep(200)}throw Error('TIMEOUT '+label)}
async function click(selector){const point=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return null;e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);check(!!point,'UI tap '+selector);await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
async function sample(){return js(`(()=>{const video=document.querySelector('#challenge video'),s=video?.srcObject,t=s?.getVideoTracks()[0],settings=t?.getSettings()||{};
 const q=window.__bfUsbCameraQa;return {visible:!document.hidden,videoTime:video?.currentTime,videoWidth:video?.videoWidth,videoHeight:video?.videoHeight,
 width:settings.width??null,height:settings.height??null,frameRate:settings.frameRate??null,facingMode:settings.facingMode??null,zoom:settings.zoom??null,
 live:q.tracks.filter(t=>t.readyState==='live').length,ended:q.tracks.filter(t=>t.readyState==='ended').length,
 sourceVerification:document.querySelector('.camera-control-deck')?.dataset.cameraSourceVerification,
 wideEnabled:document.querySelector('.camera-lenses button:nth-child(3)')?.disabled===false,
 cameraError:document.querySelector('.camera-error')?.textContent??null}})()`)}
async function diagnostics(){await js('window.__bfUsbCameraQa.copied=null;true');if(!await js('!!document.querySelector("#challenge .perf-copy")'))await click('#challenge .perf-toggle');await click('#challenge .perf-copy');await until('typeof window.__bfUsbCameraQa.copied==="string"','diagnostics copied',5000);return JSON.parse(await js('window.__bfUsbCameraQa.copied'))}
try{
 socket=new WebSocket(endpoint);socket.addEventListener('message',event=>{const m=JSON.parse(event.data.toString()),p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)});
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(Error('Owned bridge unavailable')),{once:true})});
 await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Page.bringToFront');
 check(await js(`location.origin===${JSON.stringify(origin)}&&sessionStorage.getItem('bodyforge:qa:realme-usb:v1')===${JSON.stringify(token)}`),'exact owned origin and preceding run');
 check(await js(`(()=>{try{const p=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));return p.game.nickname==='QA REALME USB'&&p.workouts.length===0&&p.xp===0&&p.coins===0}catch{return false}})()`),'only known synthetic zero-workout profile');
 await until('!document.hidden','real phone foreground',60000);
 report.browser=await cdp('Browser.getVersion');
 await js(`(()=>{const q=window.__bfUsbCameraQa={tracks:[],copied:null,restore:[],events:[]};
 const media=navigator.mediaDevices,original=media.getUserMedia,desc=Object.getOwnPropertyDescriptor(media,'getUserMedia');
 Object.defineProperty(media,'getUserMedia',{configurable:true,value:async function(...args){q.events.push({kind:'gum-start',atMs:performance.now()});try{const stream=await original.apply(this,args);q.events.push({kind:'gum-resolved',atMs:performance.now()});q.tracks.push(...stream.getTracks());return stream}catch(error){q.events.push({kind:'gum-error',name:error.name,atMs:performance.now()});throw error}}});
 q.restore.push(()=>{if(desc)Object.defineProperty(media,'getUserMedia',desc);else delete media.getUserMedia});
 const clipboard=navigator.clipboard,clipDesc=Object.getOwnPropertyDescriptor(clipboard,'writeText');Object.defineProperty(clipboard,'writeText',{configurable:true,value:async text=>{q.copied=String(text)}});
 q.restore.push(()=>{if(clipDesc)Object.defineProperty(clipboard,'writeText',clipDesc);else delete clipboard.writeText});return true})()`);
 if(!await js('document.querySelector(".app-shell")?.dataset.screen==="challenge"'))await click('.mobile-nav button:nth-child(2)');
 await until('!!document.querySelector(".camera-lenses")','camera controls mounted');
 await click('.camera-lenses button:nth-child(1)');
 await click('#challenge .primary-button');
 await until(`(()=>{const error=document.querySelector('.camera-error')?.textContent;if(error)throw Error(error);return !!document.querySelector('.live-tag')&&!document.querySelector('.loading-overlay')})()`,'real camera and MediaPipe startup',90000);
 const first=await sample();await sleep(5000);const second=await sample();
 report.measurements.front={first,second,diagnostics:await diagnostics()};
 check(first.live===1&&second.live===1&&second.videoTime>first.videoTime,'real front stream supplies fresh frames');
 check(second.facingMode==='user'&&second.sourceVerification==='confirmed','front lens verified from actual track settings');
 check(report.measurements.front.diagnostics.camera.frames>0,'real MediaPipe inference ran on the phone');
 report.measurements.videoInputCount=await js('(async()=>(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==="videoinput").length)()');
 await click('.camera-lenses button:nth-child(2)');
 await until('!document.querySelector(".camera-switch-overlay")&&document.querySelector("video")?.srcObject?.getVideoTracks()[0]?.getSettings().facingMode==="environment"','rear switch',30000);
 const rear=await sample();report.measurements.rear=rear;
 check(rear.live===1&&rear.ended>=1&&rear.sourceVerification==='confirmed','rear selection ends previous front stream and verifies actual lens');
 await sleep(3000);
 report.measurements.rearDiagnostics=await diagnostics();
 // Leave a real stream active for an optional owner-driven background/return check.
 if(process.argv.includes('--await-background')){
   console.log('READY_FOR_REAL_BACKGROUND');
   await until('document.hidden','owner backgrounds Chrome',120000);
   await until('window.__bfUsbCameraQa.tracks.every(t=>t.readyState==="ended")','background releases real tracks',15000);
   report.measurements.background=await sample();
   check(report.measurements.background.live===0,'real background releases every captured track');
   await until('!document.hidden','owner returns to Chrome',120000);
   check(await js('!document.querySelector("video")?.srcObject&&!document.querySelector(".live-tag")'),'return does not silently restart capture');
 }else{
   await click('#challenge .secondary-button');
   await until('window.__bfUsbCameraQa.tracks.every(t=>t.readyState==="ended")','manual stop releases real tracks');
 }
 report.measurements.stopped=await sample();
 check(report.measurements.stopped.live===0,'no owned camera track survives stop');
 check(await js(`(()=>{const p=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));return p.xp===0&&p.coins===0&&p.workouts.length===0})()`),'unfinished physical session credits no XP, coins or workout');
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.message;process.exitCode=1;
}finally{
 if(socket?.readyState===1){try{report.measurements.events=await js('window.__bfUsbCameraQa?.events??[]');report.measurements.final=await sample();await js(`(()=>{const q=window.__bfUsbCameraQa;if(!q)return;document.querySelector('#challenge .secondary-button')?.click();for(const t of q.tracks)t.stop();for(const undo of q.restore.reverse())undo();q.restore=[];return true})()`);report.measurements.afterCleanup=await sample();report.cleanup=report.measurements.afterCleanup.live===0}catch{report.cleanup=false}socket.close()}
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Owned QA closed'))}pending.clear();
 report.finishedAt=new Date().toISOString();const output=path.resolve('.iskra/reports/realme-camera-'+report.startedAt.replace(/[:.]/g,'-')+'.json');const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');fs.writeFileSync(output,bytes);console.log('REPORT',JSON.stringify({path:output,status:report.status,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
}
