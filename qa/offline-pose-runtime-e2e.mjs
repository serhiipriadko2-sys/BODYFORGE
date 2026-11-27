// BF-603: browser verification of the local SDK/WASM only, without any pose model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareRuntimePack,RUNTIME_FILES} from './offline-pose-pack.mjs';
import {waitForOwnedBrowser,newOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const prefix='bf-local-runtime-';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,profile,identity,ws,pack,stage='pack',result,cleanup=false;
let seq=0,unexpected=0,blockedProbe=0,blockedLocalCanary=0;
const localCanary='/__bf603_denied_canary';
let serverCanary=0;
const localRequests=new Set(),networkFailures=[];
let lastPageState=null;
const pending=new Map(),served=new Set();
const probeUrl='https://bf-offline-probe.invalid/canary';
const routes=new Map(RUNTIME_FILES.map(x=>['/'+x.path,x]));
const allowed=new Set(['/','/probe.mjs','/favicon.ico',...routes.keys()]);
const headers={'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'"};
const page=String.raw`
window.__stage='probe-module';
const pins=PIN_PLACEHOLDER;
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const localPath=value=>{
  const u=new URL(value,location.origin);
  if(u.origin!==location.origin||u.search||u.hash||!pins.some(p=>'/'+p.path===u.pathname))throw Error('resolver path');
  return u.pathname;
};
try{
  window.__stage='sdk-import';
  const {FilesetResolver}=await import('/vision_bundle.mjs');
  window.__stage='resolver';
  const variants=[];
  for(const module of [false,true]){
    const f=await FilesetResolver.forVisionTasks(location.origin+'/wasm',module);
    const loader=localPath(f.wasmLoaderPath),binary=localPath(f.wasmBinaryPath);
    if(!loader.endsWith('.js')||!binary.endsWith('.wasm')||loader.slice(0,-3)!==binary.slice(0,-5))throw Error('resolver pair');
    variants.push({module,loader,binary});
  }
  let bytes=0,hashes=0;const compiled=[];
  const selected=new Set(variants.map(v=>v.binary));
  for(const p of pins){
    window.__stage='asset:'+p.path;
    const response=await fetch('/'+p.path,{cache:'no-store',redirect:'error'});
    if(!response.ok||new URL(response.url).origin!==location.origin)throw Error('asset response');
    const data=await response.arrayBuffer();
    if(data.byteLength!==p.bytes||hex(await crypto.subtle.digest('SHA-256',data))!==p.sha256)throw Error('asset bytes');
    bytes+=data.byteLength;hashes++;
    if(selected.has('/'+p.path)){
      window.__stage='compile:'+p.path;
      const module=await WebAssembly.compile(data);
      if(!(module instanceof WebAssembly.Module))throw Error('wasm compile');
      compiled.push('/'+p.path);
    }
  }
  window.__stage='external-canary';
  let denied=false;
  try{await fetch('https://bf-offline-probe.invalid/canary',{redirect:'error'});}catch{denied=true;}
  let localDenied=false;
  try{await fetch('/__bf603_denied_canary',{redirect:'error'});}catch{localDenied=true;}
  window.__result={ok:true,hashes,bytes,variants,compiled,denied,localDenied,secureContext:isSecureContext,modelLoaded:false};
}catch(error){window.__result={ok:false,stage:window.__stage,errorName:error instanceof Error?error.name:'unknown'};}
`.replace('PIN_PLACEHOLDER',JSON.stringify(RUNTIME_FILES));

function cdp(method,params={},timeout=8000){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout'));},timeout);
    pending.set(id,{resolve,reject,timer});
    ws.send(JSON.stringify({id,method,params}));
  });
}
try{
  const prepared=await prepareRuntimePack(root);pack=prepared.pack;
  assert.equal(prepared.manifest.status,'runtime-only-verified');
  assert.equal(prepared.manifest.model.state,'license-and-model-bytes-required');
  stage='server';
  server=http.createServer((req,res)=>{
    const url=req.url;
    if(url===localCanary)serverCanary++;
    if(req.method!=='GET'||!allowed.has(url)){res.writeHead(404,headers);res.end();return;}
    if(url==='/favicon.ico'){res.writeHead(204,headers);res.end();return;}
    if(url==='/'||url==='/probe.mjs'){
      const body=url==='/'?'<!doctype html><meta charset="utf-8"><title>BODYFORGE local runtime probe</title><script type="module" src="/probe.mjs"></script>':page;
      res.writeHead(200,{...headers,'Content-Type':url==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Content-Length':Buffer.byteLength(body)});res.end(body);return;
    }
    const pin=routes.get(url);
    served.add(url);
    res.writeHead(200,{...headers,'Content-Type':url.endsWith('.wasm')?'application/wasm':'text/javascript','Content-Length':pin.bytes});
    const stream=fs.createReadStream(path.join(pack,...pin.path.split('/')));
    stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  stage='browser';
  profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  identity=await waitForOwnedBrowser(profile,chrome);
  const target=await newOwnedPage(identity);ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('CDP open timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP open failed'));},{once:true});});
  let interceptError=false;
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data),q=pending.get(m.id);
    if(q){pending.delete(m.id);clearTimeout(q.timer);m.error?q.reject(Error('CDP command failed')):q.resolve(m.result);return;}
    if(m.method==='Network.loadingFailed'&&networkFailures.length<8){
      networkFailures.push({type:m.params.type||'unknown',errorCode:/^net::ERR_[A-Z0-9_]+$/.test(m.params.errorText)?m.params.errorText:'other'});
    }
    if(m.method==='Fetch.requestPaused'){
      const req=m.params.request,url=req.url;
      let local=false;
      try{const u=new URL(url);local=u.origin===origin&&allowed.has(u.pathname)&&!u.search&&!u.hash&&req.method==='GET';if(local)localRequests.add(u.pathname);}catch{}
      if(!local){if(url===probeUrl)blockedProbe++;else if(url===origin+localCanary)blockedLocalCanary++;else unexpected++;}
      void cdp(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId:m.params.requestId}:{requestId:m.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{interceptError=true;});
    }
  });
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Network.enable');await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp('Network.setBypassServiceWorker',{bypass:true});
  await cdp('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  stage='local-runtime';
  const nav=await cdp('Page.navigate',{url:origin+'/'});
  if(nav.errorText)throw Error('navigation failed: '+(/^net::ERR_[A-Z0-9_]+$/.test(nav.errorText)?nav.errorText:'other'));
  const until=Date.now()+60000;
  while(Date.now()<until){
    const r=await cdp('Runtime.evaluate',{expression:'({result:window.__result||null,stage:window.__stage||null,ready:document.readyState})',returnByValue:true});
    lastPageState=r.result.value||null;
    if(lastPageState?.result){result=lastPageState.result;break;}await pause(150);
  }
  assert.ok(result?.ok&&result.secureContext&&result.denied&&result.localDenied&&!result.modelLoaded,'local runtime probe failed');
  assert.equal(blockedLocalCanary,1);assert.equal(serverCanary,0);
  assert.equal(result.hashes,7);assert.equal(result.bytes,prepared.manifest.bytes);assert.equal(served.size,7);
  assert.equal(result.variants.length,2);
  assert.equal(result.compiled.length,new Set(result.variants.map(x=>x.binary)).size);
  assert.ok(result.compiled.length>=1);
  assert.equal(unexpected,0);assert.equal(interceptError,false);
  stage='complete';
}catch(error){console.error('BF603_LOCAL_RUNTIME_BLOCKED',stage,JSON.stringify({error:error instanceof Error?error.message.slice(0,100):'unknown',page:lastPageState,localRequests:[...localRequests],served:[...served],networkFailures,unexpected,blockedProbe}));process.exitCode=16;}
finally{
  ws?.close();
  for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP closed'))}pending.clear();
  if(chrome&&profile){
    try{const r=await cleanupOwnedChrome(profile,prefix,chrome,identity);cleanup=r.profileRemoved&&r.portClosed&&r.remaining===0;}
    catch{console.error('BF603_LOCAL_RUNTIME_CLEANUP_UNVERIFIED');process.exitCode=17;}
  }
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(stage==='complete'&&cleanup&&!process.exitCode){
  console.log('BF603_LOCAL_RUNTIME_PASS',JSON.stringify({status:'runtime-only-tested-local',pack:path.relative(root,pack).split(path.sep).join('/'),...result,servedAssets:served.size,unexpectedExternalRequests:unexpected,blockedProbe,blockedLocalCanary,serverCanary,cleanup:true,scope:'local SDK and selected WASM compilation only; no model, inference, field or redistribution claim'}));
}else process.exitCode||=16;
