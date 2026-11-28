// Real browser test of connection CSP on exact production HTML. No real camera.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {requirePreviewOrigin,waitForOwnedBrowser,newOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';
import {verifyPoseConnectHtml} from './pose-egress-policy.mjs';

const origin=process.env.BODYFORGE_QA_ORIGIN;
const entrySha=process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256;
const indexSha=process.env.BODYFORGE_QA_EXPECT_INDEX_SHA256;
const prefix='bf-pose-egress-';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let server,chrome,profile,identity,ws,stage='preview',seq=0,cleanup=false,hits=0,result;
const pending=new Map(),pausedExternal=new Set();
function cdp(method,params={},timeout=15000){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},timeout);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('page evaluation failed');
  return r.result.value;
}
async function until(expression,label){
  const end=Date.now()+30000;
  while(Date.now()<end){if(await js(expression))return;await pause(150);}
  throw Error('timeout '+label);
}
try{
  await requirePreviewOrigin(origin,entrySha);
  assert.match(indexSha??'',/^[a-f0-9]{64}$/i,'exact index digest required');
  const response=await fetch(origin+'/',{redirect:'error',signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),indexSha.toLowerCase(),'index digest');
  verifyPoseConnectHtml(bytes.toString('utf8'));
  stage='canary-server';
  server=http.createServer((req,res)=>{hits++;res.writeHead(200,{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','Content-Type':'text/plain'});res.end('synthetic canary');});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const canary='http://127.0.0.1:'+server.address().port+'/synthetic';
  assert.equal(await (await fetch(canary,{signal:AbortSignal.timeout(3000)})).text(),'synthetic canary');
  assert.equal(hits,1);
  stage='browser';
  profile=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),prefix));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore',windowsHide:true});
  identity=await waitForOwnedBrowser(profile,chrome);
  const target=await newOwnedPage(identity);ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('CDP open timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP open failed'));},{once:true});});
  let interceptError=false;
  ws.addEventListener('message',e=>{
    const m=JSON.parse(e.data),q=pending.get(m.id);
    if(q){pending.delete(m.id);clearTimeout(q.timer);m.error?q.reject(Error('CDP command failed')):q.resolve(m.result);return;}
    if(m.method==='Fetch.requestPaused'){
      const id=m.params.requestId,u=new URL(m.params.request.url);
      const allow=u.origin===origin||u.href===canary;
      if(!allow)pausedExternal.add(id);
      void cdp(allow?'Fetch.continueRequest':'Fetch.failRequest',allow?{requestId:id}:{requestId:id,errorReason:'BlockedByClient'}).catch(()=>{interceptError=true;});
    }
  });
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp('Network.setBypassServiceWorker',{bypass:true});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:"window.__poseCsp=[];window.__poseCameraCalls=0;addEventListener('securitypolicyviolation',e=>{window.__poseCsp.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition})});if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:()=>{window.__poseCameraCalls++;return Promise.reject(new DOMException('QA camera disabled','NotAllowedError'))}});"});
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source: '('+String(function observeEyeDraws(){
    const seen=new WeakMap();
    const drawn=new WeakSet();
    window.__poseEyeDraws=drawn;
    for(const Context of [window.WebGLRenderingContext,window.WebGL2RenderingContext]){
      if(!Context)continue;
      for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
        const original=Context.prototype[name];if(typeof original!=='function')continue;
        Context.prototype[name]=function(...args){
          const value=original.apply(this,args);
          const program=this.getParameter(this.CURRENT_PROGRAM);
          if(program&&!seen.has(program)){
            const shaders=(this.getAttachedShaders(program)||[]).map(shader=>this.getShaderSource(shader)||'').join('\n');
            const eye=this.getProgramParameter(program,this.LINK_STATUS)&&/^#define USE_CLEARCOATMAP\b/m.test(shaders)&&/^#define USE_CLEARCOAT_ROUGHNESSMAP\b/m.test(shaders);
            seen.set(program,eye);
          }
          if(program&&seen.get(program))drawn.add(this.canvas);
          return value;
        };
      }
    }
  })+')();'});
  await cdp('Fetch.enable',{patterns:[{urlPattern:'http://*',requestStage:'Request'},{urlPattern:'https://*',requestStage:'Request'}]});
  stage='application';
  const nav=await cdp('Page.navigate',{url:origin+'/'});assert.ok(!nav.errorText);
  await until('!!document.querySelector(".app-shell")&&!!document.querySelector("#onboarding")','onboarding');
  const before=await js('JSON.stringify(Object.entries(localStorage))');
  assert.ok(await js('(async()=>{const r=await fetch("/manifest.webmanifest",{cache:"no-store"});return r.ok&&(await r.json()).name.includes("BODYFORGE")})()'),'same-origin fetch');
  stage='deny';
  const denied=await js('(async()=>{const u='+JSON.stringify(canary)+';const fetchDenied=await fetch(u,{cache:"no-store"}).then(()=>false,()=>true);const xhrDenied=await new Promise(resolve=>{const x=new XMLHttpRequest();x.onload=()=>resolve(false);x.onerror=()=>resolve(true);x.ontimeout=()=>resolve(false);x.timeout=3000;x.open("GET",u);try{x.send()}catch{resolve(true)}});const beaconRejected=!navigator.sendBeacon(u,"synthetic");return {fetchDenied,xhrDenied,beaconRejected}})()');
  assert.ok(denied.fetchDenied&&denied.xhrDenied,'Fetch and XHR denied');
  await until('window.__poseCsp.filter(x=>x.directive==="connect-src"&&x.disposition==="enforce"&&x.blocked.startsWith('+JSON.stringify(new URL(canary).origin)+')).length>=3','three enforced connect-src violations');
  const events=await js('window.__poseCsp');
  assert.equal(hits,1,'no browser canary request reached reachable server');
  assert.equal(pausedExternal.size,0,'unexpected outbound attempts reached interception');
  assert.equal(interceptError,false);
  assert.equal(await js('window.__poseCameraCalls'),0);
  assert.equal(await js('JSON.stringify(Object.entries(localStorage))'),before,'no profile writes from probes');
  stage='ocular-material';
  const ocular='document.querySelector("#forge .studio-preview canvas")';
  async function click(selector){
    assert.ok(await js('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e||e.disabled)return false;e.click();return true})()'),'click '+selector);
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click('.build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="true"','synthetic fighter');
  await click('.mobile-nav button:nth-child(3)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="forge"','forge');
  await js('document.querySelector("#forge .studio-preview")?.scrollIntoView({block:"start",behavior:"instant"});true');
  await until(ocular+'?.dataset.ocularDetail==="fitted-pbr"&&window.__poseEyeDraws.has('+ocular+')','real linked ocular PBR draw');
  assert.equal(await js('performance.getEntriesByType("resource").some(e=>e.name.endsWith("/athlete-eyes.jpg"))'),false,'no fallback atlas on fitted path');
  const visualEvents=await js('window.__poseCsp');
  const expectedCanary=new URL(canary).origin;
  assert.ok(visualEvents.every(e=>e.directive==='connect-src'&&e.disposition==='enforce'&&e.blocked.startsWith(expectedCanary)),'unexpected CSP violation in actual 3D hero');
  const saved=await js('localStorage.getItem("bodyforge:pilot:v1")');
  assert.ok(saved&&JSON.parse(saved).game?.created===true,'synthetic save present');
  const artifactDir=process.env.BODYFORGE_QA_ARTIFACT_DIR;
  if(artifactDir){
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(artifactDir,'bf604-ocular-fitted.png'),Buffer.from(shot.data,'base64'),{flag:'wx'});
  }
  stage='ocular-fallback';
  await cdp('Network.setBlockedURLs',{urls:['*bodyforge-ocular-detail.glb*']});
  await cdp('Page.reload',{ignoreCache:true});
  await until('document.querySelector(".app-shell")?.dataset.fighterCreated==="true"&&!!document.querySelector(".mobile-nav button:nth-child(3)")','reloaded fighter');
  await click('.mobile-nav button:nth-child(3)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="forge"','reloaded forge');
  await js('document.querySelector("#forge .studio-preview")?.scrollIntoView({block:"start",behavior:"instant"});true');
  await until(ocular+'?.dataset.ocularDetail==="atlas"','recovered original eye atlas');
  assert.equal(await js('window.__poseCsp.length'),0,'fallback CSP remains clean');
  assert.equal(await js('localStorage.getItem("bodyforge:pilot:v1")'),saved,'eye fallback does not alter synthetic save');
  assert.equal(await js('window.__poseCameraCalls'),0,'no camera access');
  assert.equal(pausedExternal.size,0,'no new external request');
  assert.equal(interceptError,false);
  if(artifactDir){
    const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(artifactDir,'bf604-ocular-fallback.png'),Buffer.from(shot.data,'base64'),{flag:'wx'});
  }
  await cdp('Network.setBlockedURLs',{urls:[]});
  stage='complete';result={canaryRequests:0,positiveControl:1,enforcedViolations:events.filter(e=>e.directive==='connect-src'&&e.disposition==='enforce').length,fetchDenied:true,xhrDenied:true,beaconReturnRejected:denied.beaconRejected,sameOriginFetch:true,cameraCalls:0,ocularFitted:true,ocularGpuDraw:true,ocularFallback:true,ocularUnexpectedCsp:0,ocularSaveUnchanged:true,indexSha256:indexSha,entrySha256:entrySha};
}catch(error){console.error('BF604_EGRESS_FAIL',stage,String(error.message).slice(0,140));process.exitCode=16;}
finally{
  ws?.close();for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error('CDP closed'));}pending.clear();
  if(chrome&&profile){try{const r=await cleanupOwnedChrome(profile,prefix,chrome,identity);cleanup=r.profileRemoved&&r.portClosed&&r.remaining===0;}catch{console.error('BF604_EGRESS_CLEANUP_UNVERIFIED');process.exitCode=17;}}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(stage==='complete'&&cleanup&&!process.exitCode)console.log('BF604_EGRESS_PASS',JSON.stringify({...result,cleanup:true,scope:'connection CSP and actual ocular PBR/fallback on exact production HTML; not a full egress or SDK certificate'}));
else process.exitCode||=16;
