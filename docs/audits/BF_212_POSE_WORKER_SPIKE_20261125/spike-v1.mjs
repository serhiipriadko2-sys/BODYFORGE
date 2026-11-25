// BF-212: isolated API/transport spike, NOT an accuracy study or app mode.
// Only deterministic non-person pixel fixtures. No webcam, storage or user profile.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {waitForOwnedBrowser,newOwnedPage,cleanupOwnedChrome} from './owned-chrome.mjs';

const modelUrl='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const pkg=path.resolve('node_modules/@mediapipe/tasks-vision');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const assets=new Map();
function asset(url,body,type){assets.set(url,{body:Buffer.from(body),type});}
const version=JSON.parse(fs.readFileSync(path.join(pkg,'package.json'),'utf8')).version;
if(version!=='1.1.1')throw Error('Expected the pinned app package version 1.1.1, got '+version);
const app=fs.readFileSync('src/App.tsx','utf8');
if(!app.includes(modelUrl)||!app.includes('@mediapipe/tasks-vision@'+version+'/wasm'))throw Error('App model/runtime drift; re-evaluate spike');
async function modelBytes(){
  const response=await fetch(modelUrl,{redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok||!response.body)throw Error('Model download HTTP '+response.status);
  const max=12*1024*1024;let size=0;const parts=[];
  for await(const part of response.body){size+=part.byteLength;if(size>max)throw Error('Model exceeds bounded download');parts.push(Buffer.from(part));}
  if(size<1000000)throw Error('Unexpected model size '+size);
  return Buffer.concat(parts,size);
}
const options=delegate=>({baseOptions:{modelAssetPath:location.origin+'/pose.task',delegate},runningMode:'VIDEO',
  numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55,outputSegmentationMasks:false,
  canvas:new OffscreenCanvas(320,240)});

async function workerMain(){
  let model=null,active=false,last=-1;
  self.onmessage=async({data:m})=>{
    const reply=value=>self.postMessage({id:m.id,...value});
    try{
      if(m.type==='init'){
        if(model||active)throw Error('invalid init');
        active=true;
        const {FilesetResolver,PoseLandmarker}=await import('/vision_bundle.mjs');
        const vision=await FilesetResolver.forVisionTasks(location.origin+'/wasm');
        model=await PoseLandmarker.createFromOptions(vision,options(m.delegate));
        active=false;reply({ok:true});return;
      }
      if(m.type==='close'){
        if(active)throw Error('busy close');
        model?.close();model=null;reply({ok:true,closed:true});return;
      }
      if(m.type!=='frame'||!model||active||!Number.isFinite(m.timestamp)||m.timestamp<=last)
        throw Error('invalid frame state or timestamp');
      active=true;last=m.timestamp;
      const start=performance.now();
      let landmarks;
      try{landmarks=model.detectForVideo(m.bitmap,m.timestamp).landmarks;}
      finally{m.bitmap.close();}
      const inferenceMs=performance.now()-start;
      active=false;reply({ok:true,landmarks,inferenceMs,closedBitmap:m.bitmap.width===0});
    }catch(error){
      active=false;m.bitmap?.close();reply({ok:false,error:String(error)});
    }
  };
}

async function pageMain(){
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const {FilesetResolver,PoseLandmarker}=await import('/vision_bundle.mjs');
  const n=24, warm=4, width=320,height=240;
  const pixels=i=>{
    const p=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const k=(y*width+x)*4, block=((x+3*i)>>5)^((y+2*i)>>5);
      p[k]=20+(block&7)*8;p[k+1]=32+(i%6)*5;p[k+2]=40+(block&3)*10;p[k+3]=255;
    }
    return p;
  };
  const frames=Array.from({length:n+warm},(_,i)=>pixels(i));
  // Hash exact ordered fixture bytes, not a summary or seed.
  const all=new Uint8Array(frames.length*width*height*4);
  frames.forEach((p,i)=>all.set(p,i*p.length));
  const fixtureSha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',all))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const bitmap=i=>createImageBitmap(new ImageData(frames[i],width,height));
  const percentile=(v,p)=>{if(!v.length)return null;const a=v.slice().sort((x,y)=>x-y);return Math.round(a[Math.max(0,Math.ceil(p*a.length)-1)]*100)/100;};
  const summary=v=>({count:v.length,p50:percentile(v,.5),p95:percentile(v,.95),max:percentile(v,1)});
  function monitor(){
    const lag=[],tasks=[];let last=performance.now(),ob;
    const timer=setInterval(()=>{const now=performance.now();lag.push(Math.max(0,now-last-10));last=now;},10);
    if(PerformanceObserver.supportedEntryTypes.includes('longtask')){
      ob=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>e.duration)));
      ob.observe({type:'longtask'});
    }
    return async()=>{await delay(60);clearInterval(timer);ob?.disconnect();return {timerLagMs:summary(lag),longTasksMs:summary(tasks)}};
  }
  function client(){
    const w=new Worker('/worker.js');let busy=false,closed=false,seq=0,pending=null,dropped=0;
    function call(m,transfer=[],timeout=12000){
      if(closed||busy)return Promise.reject(Error('worker not available'));
      busy=true;
      return new Promise((resolve,reject)=>{
        const id=++seq;
        const timer=setTimeout(()=>{pending=null;busy=false;reject(Error('worker timeout '+m.type));},timeout);
        pending={id,resolve,reject,timer};
        try{w.postMessage({id,...m},transfer);}
        catch(error){clearTimeout(timer);pending=null;busy=false;reject(error);}
      });
    }
    w.onmessage=({data:m})=>{
      if(!pending||pending.id!==m.id)return;
      const q=pending;pending=null;busy=false;clearTimeout(q.timer);
      m.ok?q.resolve(m):q.reject(Error(m.error||'worker error'));
    };
    w.onerror=e=>{
      if(pending){const q=pending;pending=null;busy=false;clearTimeout(q.timer);q.reject(Error(e.message||'worker error'));}
    };
    return {
      init:delegate=>call({type:'init',delegate},[],25000),
      submit:(image,timestamp)=>{
        if(closed||busy){image.close();dropped++;return Promise.resolve({dropped:true,closedBitmap:image.width===0});}
        const start=performance.now();
        return call({type:'frame',bitmap:image,timestamp},[image]).then(value=>({...value,roundTripMs:performance.now()-start})).finally(()=>image.close());
      },
      close:()=>call({type:'close'}),
      abort:()=>{closed=true;if(pending){const q=pending;pending=null;clearTimeout(q.timer);q.reject(Error('worker aborted'));}busy=false;w.terminate();},
      dropped:()=>dropped,
    };
  }
  const variants=[];
  for(const [mode,delegate] of [['main','CPU'],['worker','CPU'],['main','GPU'],['worker','GPU']]){
    const result={mode,delegate,status:'ERROR',fixtureSha};let m=null,c=null,stop=null;
    try{
      const init=performance.now();
      if(mode==='main'){
        const vision=await FilesetResolver.forVisionTasks(location.origin+'/wasm');
        m=await PoseLandmarker.createFromOptions(vision,options(delegate));
      }else{c=client();await c.init(delegate);}
      result.initMs=performance.now()-init;
      const infer=[],round=[],prep=[],counts=[],digests=[];
      stop=monitor();
      for(let i=0;i<frames.length;i++){
        const t=performance.now(),image=await bitmap(i),created=performance.now()-t;
        let value;const timestamp=i*34;
        if(mode==='main'){
          const started=performance.now();
          try{const landmarks=m.detectForVideo(image,timestamp).landmarks;value={landmarks,inferenceMs:performance.now()-started,roundTripMs:performance.now()-started};}
          finally{image.close();}
        }else value=await c.submit(image,timestamp);
        if(value.dropped||!Array.isArray(value.landmarks)||image.width!==0||mode==='worker'&&!value.closedBitmap)throw Error('frame/bitmap lifecycle mismatch');
        if(i>=warm){infer.push(value.inferenceMs);round.push(value.roundTripMs);prep.push(created);counts.push(value.landmarks.length);
          digests.push(JSON.stringify(value.landmarks));}
        await delay(15);
      }
      result.timing=await stop();stop=null;
      result.inferenceMs=summary(infer);result.roundTripMs=summary(round);result.prepareBitmapMs=summary(prep);result.poseCounts=counts;
      result.negativeFixtureNoPoses=counts.every(x=>x===0);
      result.outputSha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(digests.join('\n'))))].map(x=>x.toString(16).padStart(2,'0')).join('');
      if(c){
        const [a,b]=await Promise.all([bitmap(0),bitmap(1)]);
        const first=c.submit(a,frames.length*34);
        const dropped=await c.submit(b,(frames.length+1)*34);
        await first;
        result.oneInFlightDrop=dropped.dropped===true&&dropped.closedBitmap===true&&c.dropped()===1;
        if(!result.oneInFlightDrop)throw Error('bounded worker drop failed');
        const closed=await c.close();if(!closed.closed)throw Error('worker close not acknowledged');
        c.abort();c=null;
      }else{m.close();m=null;}
      result.gracefulCleanup=true;result.status='MEASURED_NEGATIVE_ONLY';
    }catch(error){result.error=String(error);}
    finally{if(stop)result.timing=await stop();if(m)try{m.close()}catch{};if(c)c.abort();}
    variants.push(result);window.__spikeProgress=variants;
  }
  return {fixture:{kind:'deterministic abstract blocks; no person',sha256:fixtureSha,width,height,warmup:warm,measured:n},variants,
    browser:navigator.userAgent,capabilities:{worker:typeof Worker==='function',offscreen:typeof OffscreenCanvas==='function',bitmap:typeof createImageBitmap==='function'},
    scope:'desktop headless API comparison only; no field quality, render FPS, mobile WebView or thermal evidence',productionDecision:'retain-main-thread'};
}
let server,chrome,identity,dir,ws;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  const model=await modelBytes();
  asset('/pose.task',model,'application/octet-stream');
  asset('/vision_bundle.mjs',fs.readFileSync(path.join(pkg,'vision_bundle.mjs')),'text/javascript');
  for(const name of fs.readdirSync(path.join(pkg,'wasm'))){
    if(!/^vision_wasm_(?:internal|module_internal|nosimd_internal)\.(?:js|wasm)$/.test(name))continue;
    asset('/wasm/'+name,fs.readFileSync(path.join(pkg,'wasm',name)),name.endsWith('.wasm')?'application/wasm':'text/javascript');
  }
  if(assets.size!==8)throw Error('Unexpected pinned runtime asset set: '+assets.size);
  console.log('MODEL_RUNTIME',JSON.stringify({modelUrl,version,files:[...assets].map(([url,v])=>({url,bytes:v.body.length,sha256:sha(v.body)}))}));
  asset('/worker.js','const options='+options.toString()+';\n('+workerMain.toString()+')();','text/javascript');
  asset('/page.mjs','const options='+options.toString()+';\nwindow.runExperiment=('+pageMain.toString()+');','text/javascript');
  asset('/','<!doctype html><meta charset="utf-8"><title>BODYFORGE isolated pose spike</title><script type="module" src="/page.mjs"></script>','text/html');
  server=http.createServer((req,res)=>{
    const a=assets.get(req.url);
    if(req.method!=='GET'||!a){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':a.type,'Content-Length':a.body.length,'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'});res.end(a.body);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'bf-pose-spike-'));
  chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
    '--headless=new','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
  identity=await waitForOwnedBrowser(dir,chrome);
  const target=await newOwnedPage(identity);ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('CDP open timeout')),5000);ws.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP open error'))},{once:true});});
  let seq=0;const pending=new Map();
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data),q=pending.get(m.id);if(q){pending.delete(m.id);clearTimeout(q.timer);m.error?q.reject(Error(JSON.stringify(m.error))):q.resolve(m.result)}});
  const cdp=(method,params={},timeout=8000)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},timeout);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  await cdp('Page.enable');await cdp('Runtime.enable');
  await cdp('Page.navigate',{url:origin+'/'});await cdp('Page.bringToFront');
  for(let i=0;i<60;i++){
    const r=await cdp('Runtime.evaluate',{expression:"typeof window.runExperiment==='function'&&location.origin==="+JSON.stringify(origin),returnByValue:true});
    if(r.result.value)break;if(i===59)throw Error('isolated page failed to initialize');await sleep(100);
  }
  const r=await cdp('Runtime.evaluate',{expression:'window.runExperiment()',awaitPromise:true,returnByValue:true},150000);
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  const value=r.result.value;console.log('BF212_SPIKE_RESULT',JSON.stringify(value));
  if(value?.variants?.length!==4)throw Error('incomplete variant results');
  if(!value.variants.some(v=>v.mode==='main'&&v.status==='MEASURED_NEGATIVE_ONLY'))process.exitCode=14;
}catch(error){console.error('BF212_SPIKE_BLOCKED',String(error));process.exitCode=14;}
finally{
  ws?.close();
  try{if(chrome&&dir)await cleanupOwnedChrome(dir,'bf-pose-spike-',chrome,identity);}
  catch(error){console.error('BF212_CLEANUP_ERROR',String(error));process.exitCode=17;}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
