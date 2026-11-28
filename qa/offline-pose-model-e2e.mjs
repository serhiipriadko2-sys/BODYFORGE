// BF-603 local inference QA. No user camera, profile, or distribution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {MODEL_REQUIREMENT,RUNTIME_FILES,verifyInstalledRuntime} from './offline-pose-pack.mjs';
import {MODEL_DIR,MODEL_FILENAME,readVerifiedModel} from './offline-pose-model.mjs';
import {waitForOwnedBrowser,newOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const prefix='bf-local-inference-';
const sha=b=>createHash('sha256').update(b).digest('hex');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const fixture={
  path:'.bodyforge-qa/bf703-repro-20261127-r2/mobile/screenshots/bf-qa-mobile-forge.png',
  bytes:195637,sha256:'c8afd6a636f47349acb985c24dac5ccce3149519faeb69861477c8f4ecc75b0e',
};
const modelPin={path:MODEL_FILENAME,bytes:MODEL_REQUIREMENT.bytes,sha256:MODEL_REQUIREMENT.sha256};
const fixturePin={path:'synthetic-avatar.png',bytes:fixture.bytes,sha256:fixture.sha256};
const headers={
  'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'",
};
const probeUrl='https://bf-offline-probe.invalid/canary',localCanary='/__bf603_denied_canary';
let server,chrome,profile,identity,ws,origin,stage='inputs',result,cleanup=false,seq=0;
let externalCanary=0,localDenied=0,unexpected=0,serverCanary=0,interceptError=false;
let lastPageState=null;
const pending=new Map(),assets=new Map(),served=new Set(),networkFailures=[],externalAttempts=new Set();
function put(pin,data,type){
  assert.equal(data.byteLength,pin.bytes,'asset size');
  assert.equal(sha(data),pin.sha256,'asset hash');
  assets.set('/'+pin.path,{data,type});
}
const page="window.__stage='verify-runtime';\nconst runtimePins=RUNTIME_PINS;\nconst modelPin=MODEL_PIN;\nconst fixturePin=FIXTURE_PIN;\nconst hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');\nasync function checked(pin){\n  const u=new URL('/'+pin.path,location.origin);\n  const r=await fetch(u,{cache:'no-store',redirect:'error',credentials:'omit'});\n  if(!r.ok||r.url!==u.href)throw Error('asset response');\n  const bytes=await r.arrayBuffer();\n  if(bytes.byteLength!==pin.bytes||hex(await crypto.subtle.digest('SHA-256',bytes))!==pin.sha256)throw Error('asset bytes');\n  return bytes;\n}\nfunction count(result){\n  if(!Array.isArray(result.landmarks)||!Array.isArray(result.worldLandmarks))throw Error('result shape');\n  if(result.landmarks.length!==result.worldLandmarks.length||result.landmarks.length>1)throw Error('pose count');\n  for(const poses of [result.landmarks,result.worldLandmarks]){\n    for(const points of poses){\n      if(points.length!==33||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)))throw Error('landmark shape');\n    }\n  }\n  return result.landmarks.length;\n}\nlet task;\ntry{\n  for(const p of runtimePins)await checked(p);\n  window.__stage='verify-model';\n  const model=new Uint8Array(await checked(modelPin));\n  window.__stage='verify-synthetic-fixture';\n  await checked(fixturePin);\n  const image=new Image();image.src='/'+fixturePin.path;await image.decode();\n  if(image.naturalWidth!==390||image.naturalHeight!==844)throw Error('fixture dimensions');\n  window.__stage='sdk-import';\n  const {FilesetResolver,PoseLandmarker}=await import('/vision_bundle.mjs');\n  const files=await FilesetResolver.forVisionTasks(location.origin+'/wasm');\n  function runtimePath(value,ext){\n    const u=new URL(value,location.origin);\n    if(u.origin!==location.origin||u.search||u.hash||!u.pathname.endsWith(ext)||!runtimePins.some(p=>'/'+p.path===u.pathname))throw Error('resolver path');\n    return u.pathname;\n  }\n  const loader=runtimePath(files.wasmLoaderPath,'.js'),binary=runtimePath(files.wasmBinaryPath,'.wasm');\n  if(loader.slice(0,-3)!==binary.slice(0,-5))throw Error('resolver pair');\n  window.__stage='model-init';\n  const initStart=performance.now();\n  task=await PoseLandmarker.createFromOptions(files,{\n    baseOptions:{modelAssetBuffer:model,delegate:'CPU'},runningMode:'VIDEO',numPoses:1,outputSegmentationMasks:false,\n    minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5\n  });\n  const initMs=Math.round(performance.now()-initStart);\n  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=480;\n  const ctx=canvas.getContext('2d',{alpha:false});\n  if(!ctx)throw Error('canvas unavailable');\n  ctx.fillStyle='#18202a';ctx.fillRect(0,0,320,480);\n  window.__stage='negative-frames';\n  const negative=[],positive=[],durations=[];\n  for(const t of [0,33,66]){\n    const start=performance.now();negative.push(count(task.detectForVideo(canvas,t)));durations.push(performance.now()-start);\n  }\n  if(negative.some(n=>n!==0))throw Error('blank frame false positive');\n  ctx.drawImage(image,85,35,220,330,0,0,320,480);\n  window.__stage='synthetic-frames';\n  for(const t of [100,133,166]){\n    const start=performance.now();positive.push(count(task.detectForVideo(canvas,t)));durations.push(performance.now()-start);\n  }\n  if(!positive.includes(1))throw Error('synthetic avatar not detected');\n  task.close();task=undefined;\n  window.__stage='outbound-canaries';\n  let denied=false,localDenied=false;\n  try{await fetch('https://bf-offline-probe.invalid/canary',{redirect:'error'});}catch{denied=true;}\n  try{await fetch('/__bf603_denied_canary',{redirect:'error'});}catch{localDenied=true;}\n  window.__result={ok:true,secureContext:isSecureContext,delegate:'CPU',runningMode:'VIDEO',runtimeHashes:runtimePins.length,\n    modelBytes:model.byteLength,modelSha256:modelPin.sha256,loader,binary,negative,positive,landmarksPerDetectedPose:33,\n    inferenceMs:durations.map(n=>Math.round(n*10)/10),initMs,denied,localDenied,closed:true,cameraAttempts:window.__bfCameraAttempts,\n    storageKeys:localStorage.length};\n}catch(error){window.__result={ok:false,stage:window.__stage,error:error instanceof Error?error.name:'unknown',\n  reason:error instanceof Error?error.message.slice(0,140):'unknown'};}\nfinally{if(task){try{task.close()}catch{}}}\n"
  .replace('RUNTIME_PINS',JSON.stringify(RUNTIME_FILES)).replace('MODEL_PIN',JSON.stringify(modelPin))
  .replace('FIXTURE_PIN',JSON.stringify(fixturePin));
function cdp(method,params={},timeout=15000){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},timeout);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params}));
  });
}
try{
  const sdk=path.join(root,'node_modules','@mediapipe','tasks-vision');
  await verifyInstalledRuntime(sdk);
  for(const pin of RUNTIME_FILES)put(pin,fs.readFileSync(path.join(sdk,...pin.path.split('/'))),pin.path.endsWith('.wasm')?'application/wasm':'text/javascript; charset=utf-8');
  put(modelPin,await readVerifiedModel(path.join(root,MODEL_DIR)),'application/octet-stream');
  // Fixed screenshot from the synthetic BF-703 disposable player; never a user image.
  const fp=path.join(root,...fixture.path.split('/'));
  const st=fs.lstatSync(fp,{bigint:true});
  assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1n&&st.size===BigInt(fixture.bytes),'fixture file boundary');
  assert.equal(path.resolve(fs.realpathSync.native(fp)).toLowerCase(),path.resolve(fp).toLowerCase(),'fixture canonical path');
  put(fixturePin,fs.readFileSync(fp),'image/png');
  stage='server';
  const allowed=new Set(['/','/probe.mjs','/favicon.ico',...assets.keys()]);
  server=http.createServer((req,res)=>{
    const url=req.url;
    if(url===localCanary)serverCanary++;
    if(req.method!=='GET'||!allowed.has(url)){res.writeHead(404,headers);res.end();return;}
    if(url==='/favicon.ico'){res.writeHead(204,headers);res.end();return;}
    if(url==='/'||url==='/probe.mjs'){
      const body=url==='/'?'<!doctype html><meta charset="utf-8"><title>BODYFORGE local model inference QA</title><script type="module" src="/probe.mjs"></script>':page;
      res.writeHead(200,{...headers,'Content-Type':url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body);return;
    }
    const asset=assets.get(url);served.add(url);
    res.writeHead(200,{...headers,'Content-Type':asset.type,'Content-Length':asset.data.byteLength});res.end(asset.data);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;
  stage='browser';
  profile=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),prefix));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--no-proxy-server',
    '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  identity=await waitForOwnedBrowser(profile,chrome);
  const target=await newOwnedPage(identity);ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('CDP open timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP open failed'));},{once:true});});
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data),q=pending.get(m.id);
    if(q){pending.delete(m.id);clearTimeout(q.timer);m.error?q.reject(Error('CDP command failed')):q.resolve(m.result);return;}
    if(m.method==='Network.loadingFailed'&&networkFailures.length<12)networkFailures.push({type:m.params.type||'unknown',code:/^net::ERR_[A-Z0-9_]+$/.test(m.params.errorText)?m.params.errorText:'other'});
    if(m.method==='Network.requestWillBeSent'){
      try{
        const u=new URL(m.params.request.url);
        if(['http:','https:'].includes(u.protocol)&&u.origin!==origin&&u.href!==probeUrl)externalAttempts.add(m.params.requestId);
      }catch{}
    }
    if(m.method==='Fetch.requestPaused'){
      const req=m.params.request,url=req.url;
      let local=false;
      try{const u=new URL(url);local=u.origin===origin&&allowed.has(u.pathname)&&!u.search&&!u.hash&&req.method==='GET';}catch{}
      if(!local){
        if(url===probeUrl)externalCanary++;
        else if(url===origin+localCanary)localDenied++;
        else unexpected++;
      }
      void cdp(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId:m.params.requestId}:{requestId:m.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{interceptError=true;});
    }
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});await cdp('Network.setBypassServiceWorker',{bypass:true});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'window.__bfCameraAttempts=0;if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,value:()=>{window.__bfCameraAttempts++;return Promise.reject(new DOMException("QA camera disabled","NotAllowedError"))}})'});
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  stage='inference';
  const nav=await cdp('Page.navigate',{url:origin+'/'});
  assert.ok(!nav.errorText,'navigation failed');
  const end=Date.now()+90000;
  while(Date.now()<end){
    const r=await cdp('Runtime.evaluate',{expression:'({result:window.__result||null,stage:window.__stage||null})',returnByValue:true});
    lastPageState=r.result.value||null;
    if(lastPageState?.result){result=lastPageState.result;break;}await pause(150);
  }
  assert.ok(result?.ok&&result.secureContext&&result.closed,'inference probe failed');
  assert.equal(result.modelBytes,MODEL_REQUIREMENT.bytes);assert.equal(result.modelSha256,MODEL_REQUIREMENT.sha256);
  assert.equal(result.runtimeHashes,RUNTIME_FILES.length);assert.equal(served.size,RUNTIME_FILES.length+2);
  assert.deepEqual(result.negative,[0,0,0]);assert.ok(result.positive.includes(1));assert.equal(result.landmarksPerDetectedPose,33);
  assert.equal(result.cameraAttempts,0);assert.equal(result.storageKeys,0);
  assert.ok(result.denied&&result.localDenied);assert.equal(localDenied,1);assert.equal(serverCanary,0);
  assert.equal(unexpected,0);assert.equal(externalAttempts.size,0);assert.equal(interceptError,false);
  stage='complete';
}catch(error){
  console.error('BF603_LOCAL_INFERENCE_BLOCKED',stage,JSON.stringify({error:error instanceof Error?error.message.slice(0,120):'unknown',page:lastPageState,servedAssets:[...served],networkFailures,externalCanary,localDenied,unexpected,externalAttempts:externalAttempts.size}));
  process.exitCode=16;
}finally{
  ws?.close();
  for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP closed'));}pending.clear();
  if(chrome&&profile){
    try{const r=await cleanupOwnedChrome(profile,prefix,chrome,identity);cleanup=r.profileRemoved&&r.portClosed&&r.remaining===0;}
    catch{console.error('BF603_LOCAL_INFERENCE_CLEANUP_UNVERIFIED');process.exitCode=17;}
  }
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(stage==='complete'&&cleanup&&!process.exitCode){
  console.log('BF603_LOCAL_INFERENCE_PASS',JSON.stringify({status:'model-inference-tested-local',...result,servedAssets:served.size,externalCanary,localDenied,serverCanary,unexpectedExternalRequests:unexpected,unexpectedExternalAttempts:externalAttempts.size,cleanup:true,scope:'pinned local CPU VIDEO inference on blank and synthetic avatar frames only; no real-camera, field, application-offline or redistribution claim'}));
}else process.exitCode||=16;
