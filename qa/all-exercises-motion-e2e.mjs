// Full React + fake camera + MediaPipe landmark integration; synthetic evidence only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const origin = process.env.BODYFORGE_QA_ORIGIN || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9683, dir = path.join(os.tmpdir(), 'bf-motion-' + process.pid);
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', '--enable-unsafe-swiftshader', '--use-gl=angle',
  '--use-angle=swiftshader', '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream', '--no-first-run', '--no-default-browser-check',
  '--remote-allow-origins=*', '--remote-debugging-port=' + port,
  '--user-data-dir=' + dir, 'about:blank',
], { stdio: 'ignore' });
let ws, seq = 0;
const waiting = new Map();
async function endpoint() {
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
      const page = tabs.find((p) => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* waiting */ }
    await sleep(180);
  }
  throw Error('Chrome unavailable');
}
function cmd(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => {
      waiting.delete(id); reject(Error('CDP timeout ' + method));
    }, 30000);
    waiting.set(id, (message) => {
      clearTimeout(timer);
      message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await cmd('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const obj = async (expression) => JSON.parse(await ev('JSON.stringify(' + expression + ')'));
async function until(expression, label, timeout = 16000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await ev(expression)) return;
    await sleep(110);
  }
  throw Error('TIMEOUT ' + label);
}
function assert(value, label) {
  if (!value) throw Error('FAIL ' + label);
  console.log('PASS', label);
}
async function click(selector) {
  assert(await ev('(()=>{const el=document.querySelector(' + JSON.stringify(selector) +
    ');if(!el)return false;el.click();return true})()'), 'click ' + selector);
}
function frame(id, state, side, ratio) {
  const points = Array.from({length:33},()=>({x:.5,y:.5,visibility:0,presence:0}));
  const set = (rows) => {
    for (const [k,[x,y]] of Object.entries(rows)) {
      points[Number(k)] = {
        x: Math.max(.001,Math.min(.999,.5+(x-.5)/ratio)),
        y, visibility:.99,presence:.99,
      };
    }
  };
  if (id === 'squat') {
    const a = (180-(state==='active'?117:170))*Math.PI/180;
    set({11:[.46,.14],12:[.54,.14],23:[.5,.3],25:[.5,.51],
      27:[.5+.22*Math.sin(a),.51+.22*Math.cos(a)]});
  }
  if (id === 'lunge') {
    set({23:[.40,.35],25:[.40,.55],27:[.40,.75],24:[.60,.35],26:[.60,.55],28:[.60,.75]});
    if(state==='active') {
      if(side==='left')set({23:[.35,.49],25:[.52,.55],27:[.48,.73]});
      else set({24:[.65,.49],26:[.48,.55],28:[.52,.73]});
    }
  }
  if(id==='pushup') {
    set({11:[.23,.45],13:[.25,.60],15:[.27,.75],23:[.50,.50],27:[.78,.56]});
    if(state==='active')set({13:[.38,.53],15:[.29,.67]});
  }
  if(id==='jumping-jack')set({11:[.42,.27],12:[.58,.27],23:[.43,.50],24:[.57,.50],
    15:state==='ready'?[.43,.58]:[.28,.08],16:state==='ready'?[.57,.58]:[.72,.08],
    27:state==='ready'?[.45,.85]:[.25,.83],28:state==='ready'?[.55,.85]:[.75,.83]});
  if(id==='high-knees') {
    set({23:[.43,.45],24:[.57,.45],25:[.43,.64],26:[.57,.64],27:[.43,.82],28:[.57,.82]});
    if(state==='active') {
      if(side==='left')set({25:[.44,.44],27:[.46,.66]});
      else set({26:[.56,.44],28:[.54,.66]});
    }
  }
  if(id==='crunch')set({11:state==='ready'?[.29,.69]:[.46,.42],23:[.52,.69],25:[.68,.55],27:[.74,.75]});
  if(id==='leg-raise')set({11:[.25,.65],23:[.48,.65],
    25:state==='ready'?[.65,.65]:[.535,.45],27:state==='ready'?[.78,.65]:[.59,.25]});
  if(id==='plank')set({11:[.22,.55],13:[.24,.68],23:[.50,.56],27:[.80,.57]});
  return points;
}
async function install() {
  // Support the Vite dev server and the frozen production preview. The latter
  // has no HMR and is suitable for long camera-hold regression tests.
  const mainScript = await ev("document.querySelector('script[type=module][src]')?.getAttribute('src')");
  const sourcePath = mainScript?.startsWith('/assets/') ? mainScript : '/src/App.tsx';
  const source = await ev("(async()=>await(await fetch(" + JSON.stringify(sourcePath) + ")).text())()");
  const devMatch = source.match(/\/node_modules\/\.vite\/deps\/@mediapipe_tasks-vision\.js\?v=[a-z0-9]+/i);
  const buildMatch = source.match(/vision_bundle-[a-z0-9_-]+\.js/i);
  const modulePath = devMatch?.[0] ?? (buildMatch ? '/assets/' + buildMatch[0] : null);
  if (!modulePath) throw Error('MediaPipe module URL missing from dev or built app');
  const script =
    '(async()=>{const mp=await import(' + JSON.stringify(modulePath) + ');' +
    'const make=' + frame.toString() + ';window.__bfMakeFrame=make;' +
    'window.__rig={id:"squat",t:null,frames:0,freeze:false,hiddenJoint:-1,select(id){this.id=id;this.t=null;this.frames=0;this.freeze=false;this.hiddenJoint=-1;}};' +
    'mp.PoseLandmarker.prototype.detectForVideo=function(video,t){' +
    'const r=window.__rig;if(r.t===null)r.t=t;r.frames++;' +
    'const elapsed=t-r.t,cycle=Math.floor(elapsed/1300),p=elapsed%1300;' +
    'const state=r.id==="plank"||r.freeze||p<400||p>=740?"ready":"active";' +
    'const side=r.id==="high-knees"&&cycle%2?"right":"left";' +
    'const points=make(r.id,state,side,video.videoWidth/video.videoHeight);' +
    'const scale=r.id==="high-knees" ? 0.45 : ["jumping-jack","pushup","crunch","leg-raise","plank"].includes(r.id) ? 0.40 : 1;' +
    'return {landmarks:[points.map((p,i)=>({...p,x:.5+(p.x-.5)*scale,y:.5+(p.y-.5)*scale,visibility:i===r.hiddenJoint?0:p.visibility}))]};};' +
    'return true;})()';
  assert(await ev(script), 'MediaPipe synthetic landmark rig installed');
}
async function select(id) {
  await ev('window.__rig.select(' + JSON.stringify(id) + ')');
  await ev("(()=>{const t=document.querySelector('.bf-catalog-trigger');if(t.getAttribute('aria-expanded')!=='true')t.click()})()");
  await click('[data-exercise=' + JSON.stringify(id) + ']');
  assert(await ev('document.querySelector("[data-exercise=' + id + ']")?.getAttribute("aria-pressed")')==='true',
    'selected ' + id);
}
const score = async () => Number(await ev("document.querySelector('.counter-number')?.textContent || '0'"));
const saved = async () => obj("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}')");
try {
  ws = new WebSocket(await endpoint());
  await new Promise((resolve,reject)=>{
    ws.addEventListener('open',resolve,{once:true});
    ws.addEventListener('error',reject,{once:true});
  });
  ws.addEventListener('message', e => {
    const m=JSON.parse(e.data);
    if(m.id&&waiting.has(m.id)){waiting.get(m.id)(m);waiting.delete(m.id);}
    if(m.method==='Runtime.exceptionThrown')console.log('BROWSER_EXCEPTION',
      (m.params?.exceptionDetails?.exception?.description||'').slice(0,180));
  });
  await cmd('Page.enable');await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cmd('Page.navigate',{url:origin+'/'});
  await until("document.querySelector('#onboarding .forge-solid-button')!==null",'onboarding',20000);
  await click('#onboarding .forge-solid-button');
  await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').game?.created===true",'fighter created');
  await install();
  await click('.mobile-nav button:nth-child(2)');
  await until("document.querySelector('.bf-catalog-trigger')!==null", 'catalog loaded', 12000);
  const modes=process.env.BODYFORGE_QA_ONLY ? [process.env.BODYFORGE_QA_ONLY] :
    ['squat','lunge','pushup','jumping-jack','high-knees','crunch','leg-raise','plank'];
  let completed=0;
  for(const id of modes){
    await select(id);
    await click('#challenge .primary-button');
    await until('window.__rig?.frames>=5',id+' camera started',30000);
    if(id==='plank'){
      try {
        await until("!!document.querySelector('.completion-stage')",'30s plank held',43000);
      } catch (error) {
        const state = await obj(
          "({frames:window.__rig?.frames,videoTime:document.querySelector('video')?.currentTime," +
          "videoReady:document.querySelector('video')?.readyState,stage:!!document.querySelector('.completion-stage')," +
          "count:document.querySelector('.counter-number')?.textContent,feedback:document.querySelector('.feedback-text')?.textContent," +
          "guidance:document.querySelector('.pose-camera-coach')?.textContent,mode:document.querySelector('#challenge')?.dataset?.mode," +
          "error:document.querySelector('.camera-error')?.textContent,profile:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').workouts?.length})"
        );
        console.log('PLANK_CAPTURE_DIAGNOSTICS',JSON.stringify(state));
        throw error;
      }
      completed++;
      await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').workouts?.length==="+completed,
        'plank saved',15000);
      const p=await saved();
      assert(p.workouts[0].exerciseId==='plank'&&p.workouts[0].repetitions===0&&p.workouts[0].holdSeconds===30,
        'plank saved correctly without fake reps');
      continue;
    }
    try {
      await until("Number(document.querySelector('.counter-number')?.textContent||0)>=1",
        id+' counted first repetition',12000);
    } catch (failure) {
      console.log('POSE_FAILURE_DIAGNOSTICS',JSON.stringify(await obj(
        "({frames:window.__rig?.frames,activeId:window.__rig?.id,vw:document.querySelector('video')?.videoWidth,vh:document.querySelector('video')?.videoHeight," +
        "phase:document.querySelector('.pose-hud-step')?.textContent,angle:document.querySelector('.pose-hud-angle strong')?.textContent," +
        "count:document.querySelector('.counter-number')?.textContent,error:document.querySelector('.camera-error')?.textContent," +
        "feedback:document.querySelector('.live-feedback')?.textContent})"
      )));
      try {
        console.log('GEOMETRY',JSON.stringify(await obj(
          "(async()=>{const m=await import('/src/lib/exerciseCounter.ts');const v=document.querySelector('video');" +
          "const ratio=v.videoWidth/v.videoHeight;return {ratio,ready:m.measureExercise(" + JSON.stringify(id) + "," +
          "window.__bfMakeFrame(" + JSON.stringify(id) + ",'ready','left',ratio),ratio)," +
          "active:m.measureExercise(" + JSON.stringify(id) + "," +
          "window.__bfMakeFrame(" + JSON.stringify(id) + ",'active','left',ratio),ratio)}})()"
        )));
      } catch (e) { console.log('GEOMETRY_DIAGNOSTICS_FAILED',String(e)); }
      throw failure;
    }
    assert(await score()>=1,id+' 1+ repetitions visible');
    if(id==='pushup'){
      await ev('window.__rig.hiddenJoint=13');
      await until("document.querySelector('.pose-camera-coach')?.textContent.includes('НЕ ВИЖУ ЛОКОТЬ И КИСТЬ')",
        'pushup camera shows missing elbow instead of generic message',5000);
      assert(true,'pushup camera provides an actionable missing-elbow hint');
      await ev('window.__rig.hiddenJoint=-1');
      await until("!document.querySelector('.pose-camera-coach')",
        'pushup hint recovers after elbow returns',6000);
      await until("!!document.querySelector('.completion-stage')",'20 pushups completed',50000);
      completed++;
      await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').workouts?.length==="+completed,
        'pushup saved',12000);
      const p=await saved();
      assert(p.workouts[0].exerciseId==='pushup'&&p.workouts[0].repetitions===20,'20 pushups persist');
    } else {
      await ev('window.__rig.freeze=true');
      const before=await score();
      await sleep(850);
      assert(await score()===before,id+' no stationary phantom repetitions');
      await click('#challenge .secondary-button');
      await until("!!document.querySelector('#challenge .primary-button')",id+' cancelled');
      const p=await saved();
      assert((p.workouts?.length||0)===completed,id+' no rewards on cancellation');
    }
  }
  const expectedCompleted = process.env.BODYFORGE_QA_ONLY
    ? (['pushup','plank'].includes(process.env.BODYFORGE_QA_ONLY) ? 1 : 0) : 2;
  assert(completed===expectedCompleted,'completed workouts saved exactly once');
  await click('.mobile-nav button:nth-child(1)');
  if (!process.env.BODYFORGE_QA_ONLY) {
    await until("document.querySelector('#daily-plan [data-goal-completed]') !== null",
      'daily plan loaded', 13000);
    assert(await ev("document.querySelector('#daily-plan [data-goal-completed]')?.dataset.goalCompleted") === '0',
      'pushups and plank do not count as the squat daily target');
    await until("document.querySelector('#pulse-progress [data-period-sessions]') !== null",
      'pulse progress loaded', 13000);
    assert(await ev("document.querySelector('#pulse-progress [data-period-sessions]')?.dataset.periodSessions") === '2',
      'activity graph includes both saved exercises');
    assert(await ev("document.querySelector('[data-period-plank-seconds]')?.dataset.periodPlankSeconds") === '30',
      'activity graph includes 30 seconds of plank');
    assert(await ev("document.querySelector('[data-period-reps]')?.dataset.periodReps") === '20',
      'activity graph excludes plank seconds from repetitions');
  }
  await click('[aria-label="Начать тренировку приседаний"]');
  await until("!!document.querySelector('#challenge .challenge-heading h2')",'home quick start heading');
  const heading=await ev("document.querySelector('#challenge .challenge-heading h2')?.textContent");
  assert(heading?.includes('ПРИСЕД'),'home quick start selects squat instead of previously selected exercise');
  await click('#challenge .secondary-button');
  console.log(process.env.BODYFORGE_QA_ONLY ? 'BODYFORGE_SINGLE_MOTION_E2E_PASS' : 'BODYFORGE_ALL_MOTION_E2E_PASS',JSON.stringify({modes:modes.length,completed,
    evidence:'synthetic landmarks and fake browser camera'}));
}catch(error){
  console.error('BODYFORGE_ALL_MOTION_E2E_FAIL',error.stack||String(error));
  process.exitCode=13;
}finally{
  ws?.close();chrome.kill();await sleep(400);
  try{fs.rmSync(dir,{recursive:true,force:true})}catch{}
}
