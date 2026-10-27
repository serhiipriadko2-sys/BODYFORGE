// Explicitly owned Android QA target only. No target discovery, device emulation,
// camera access, owner storage, global browser settings or system clipboard writes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = process.env.BODYFORGE_ANDROID_TARGET_WS;
const endpointMatch = endpoint?.match(/^ws:\/\/127\.0\.0\.1:(9223|9224)\/devtools\/page\/([a-f0-9]{32})$/i);
if (!endpointMatch) throw Error('Set BODYFORGE_ANDROID_TARGET_WS to the explicitly owned QA page WebSocket on loopback 9223/9224.');
const targetId = endpointMatch[2];
if (process.env.BODYFORGE_ANDROID_TARGET_ID && process.env.BODYFORGE_ANDROID_TARGET_ID !== targetId) {
  throw Error('Explicit QA target ID does not match its WebSocket.');
}
const origin = 'http://localhost:5187';
const reportRoot = path.join(repo, '.iskra', 'reports');
const reportDir = path.resolve(process.env.BODYFORGE_ANDROID_REPORT_DIR || reportRoot);
if (reportDir !== reportRoot && !reportDir.startsWith(reportRoot + path.sep)) throw Error('Reports must stay inside .iskra/reports.');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const resumeToken = process.env.BODYFORGE_ANDROID_RESUME_TOKEN;
const markerKey = 'bodyforge:qa:realme-usb:v1';
const nickname = 'QA REALME USB';
const profileKey = 'bodyforge:pilot:v1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = {
  schema: 'bodyforge.realme-usb-qa.v1', startedAt: new Date().toISOString(), status: 'PARTIAL',
  scope: { targetId, origin, camera: 'not tested; blocked in this QA realm', discovery: false, emulation: false },
  checks: [], measurements: {}, artifacts: [], limitations: [
    'WebGL counters count invoked draw calls, not rendered frames, FPS or completed GPU time.',
    'Runtime diagnostics are copied after opening the inactive camera tab, without starting a camera.',
    'Cosmetic checks prove UI state, persistence and redraw; shader pixel color is not numerically measured.',
  ],
};
let socket, sequence = 0, scriptId;
const pending = new Map();
const check = (condition, label) => {
  report.checks.push({ label, pass: Boolean(condition) });
  console.log(condition ? 'PASS' : 'FAIL', label);
  if (!condition) throw Error(label);
};
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function js(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression, label, timeout = 35000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await js(expression)) return; await sleep(150); }
  throw Error('TIMEOUT ' + label);
}
async function click(selector) {
  check(await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)return false;e.click();return true})()`), 'UI click ' + selector);
}
async function requireOrigin() {
  check(await js(`location.origin===${JSON.stringify(origin)} && sessionStorage.getItem(${JSON.stringify(markerKey)})===${JSON.stringify(runId)}`), 'only this run owns the QA origin');
}
async function drawSample() {
  return js(`(()=>{const c=document.querySelector('.studio-preview canvas');const q=window.__bfRealmeQa;
    return {atMs:performance.now(),sameCanvas:!!c&&c===q?.heroCanvas,drawCalls:c?(q.draws.get(c)||0):null,
      renderLoop:c?.dataset.renderLoop||null,yaw:c?Number(c.dataset.avatarYaw):null,hidden:document.hidden,
      visible:!!c&&c.getBoundingClientRect().bottom>0&&c.getBoundingClientRect().top<innerHeight,
      cameraBlockedAttempts:q?.mediaCalls??null}})()`);
}
async function copyDiagnostics() {
  await js('window.__bfRealmeQa.copied=null;true');
  await click('#challenge .perf-copy');
  await until('typeof window.__bfRealmeQa.copied==="string"', 'owned UI diagnostics copy', 5000);
  const raw = await js('window.__bfRealmeQa.copied');
  const value = JSON.parse(raw);
  check(value.schema === 'bodyforge.runtime-diagnostics.v1', 'actual runtime diagnostics schema');
  return value;
}
async function screenshot(label) {
  if (process.env.BODYFORGE_ANDROID_SCREENSHOT !== '1') return;
  await requireOrigin();
  const clip = await js(`(()=>{const c=document.querySelector('.studio-preview canvas');const r=c?.getBoundingClientRect();
    if(document.querySelector('.app-shell')?.dataset.screen!=='forge'||!r||[...document.querySelectorAll('video')].some(v=>v.srcObject))return null;
    const x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
    return right>x&&bottom>y?{x:x+scrollX,y:y+scrollY,width:right-x,height:bottom-y,scale:1}:null})()`);
  check(!!clip, 'screenshot contains only the owned 3D canvas');
  try {
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
    const buffer = Buffer.from(shot.data, 'base64');
    fs.mkdirSync(reportDir, { recursive: true });
    const file = path.join(reportDir, `realme-${runId}-${label}.png`);
    fs.writeFileSync(file, buffer);
    report.artifacts.push({ file, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') });
  } catch (error) {
    report.limitations.push('Optional owned 3D screenshot unavailable: ' + error.message);
  }
}

try {
  socket = new WebSocket(endpoint);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    const item = pending.get(message.id);
    if (!item) return; // No discovery or unsolicited target/page data is collected.
    pending.delete(message.id); clearTimeout(item.timer);
    message.error ? item.reject(Error(JSON.stringify(message.error))) : item.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Owned QA WebSocket connection timeout')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('Owned QA WebSocket unavailable')); }, { once: true });
  });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.bringToFront');
  if (resumeToken) {
    check(await js(`location.origin===${JSON.stringify(origin)}&&sessionStorage.getItem(${JSON.stringify(markerKey)})===${JSON.stringify(resumeToken)}`), 'retry belongs to the exact previous QA run and target');
    check(await js(`(()=>{try{const p=JSON.parse(localStorage.getItem(${JSON.stringify(profileKey)})||'null');return p?.game?.nickname===${JSON.stringify(nickname)}&&p.workouts.length===0&&p.xp===0&&p.coins===0}catch{return false}})()`), 'retry contains only the known synthetic zero-workout profile');
  } else check(await js('location.href==="about:blank"'), 'explicitly owned target starts at about:blank');

  // A static image is an origin-bearing document without the application code.
  // Inspect counts before app startup. Never read/export/clear existing values.
  await cdp('Page.navigate', { url: origin + '/assets/athlete-eyes.jpg' });
  await until(`location.origin===${JSON.stringify(origin)}&&document.contentType==='image/jpeg'`, 'static isolation document');
  const isolation = await js(`(async()=>({origin:location.origin,localKeys:localStorage.length,sessionKeys:sessionStorage.length,
    indexedDatabases:typeof indexedDB.databases==='function'?(await indexedDB.databases()).length:null,
    cacheStores:typeof caches!=='undefined'?(await caches.keys()).length:null,
    serviceWorkers:navigator.serviceWorker?(await navigator.serviceWorker.getRegistrations()).length:null}))()`);
  report.measurements.isolation = isolation;
  if (!resumeToken) check(isolation.localKeys === 0 && isolation.sessionKeys === 0 && isolation.indexedDatabases === 0 &&
    isolation.cacheStores === 0 && isolation.serviceWorkers === 0, 'fresh origin has no existing browser storage or service worker');
  await js(`sessionStorage.setItem(${JSON.stringify(markerKey)},${JSON.stringify(runId)});true`);

  const script = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    if(location.origin===${JSON.stringify(origin)} && sessionStorage.getItem(${JSON.stringify(markerKey)})===${JSON.stringify(runId)}) {
      const q=window.__bfRealmeQa={draws:new WeakMap(),heroCanvas:null,copied:null,mediaCalls:0,restore:[]};
      for(const type of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) {
        if(!type)continue;
        for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']) {
          const original=type.prototype[name]; if(!original||original.__bfRealmeWrapped)continue;
          const descriptor=Object.getOwnPropertyDescriptor(type.prototype,name);
          const wrapped=function(...args){q.draws.set(this.canvas,(q.draws.get(this.canvas)||0)+1);return original.apply(this,args)};
          Object.defineProperty(wrapped,'__bfRealmeWrapped',{value:true}); type.prototype[name]=wrapped;
          q.restore.push(()=>{if(descriptor)Object.defineProperty(type.prototype,name,descriptor);else delete type.prototype[name]});
        }
      }
      const clipboard=navigator.clipboard;
      if(clipboard){const descriptor=Object.getOwnPropertyDescriptor(clipboard,'writeText');
        Object.defineProperty(clipboard,'writeText',{configurable:true,value:async text=>{q.copied=String(text)}});
        q.restore.push(()=>{if(descriptor)Object.defineProperty(clipboard,'writeText',descriptor);else delete clipboard.writeText});}
      if(navigator.mediaDevices){const media=navigator.mediaDevices,descriptor=Object.getOwnPropertyDescriptor(media,'getUserMedia');
        Object.defineProperty(media,'getUserMedia',{configurable:true,value:async()=>{q.mediaCalls++;throw new DOMException('Camera excluded from this QA stage','NotAllowedError')}});
        q.restore.push(()=>{if(descriptor)Object.defineProperty(media,'getUserMedia',descriptor);else delete media.getUserMedia});}
    }
  ` });
  scriptId = script.identifier;
  await cdp('Page.navigate', { url: origin + '/' });
  await until('!!document.querySelector(".app-shell")&&!!window.__bfRealmeQa', 'real app document');
  await until('document.visibilityState==="visible"', 'real phone must be foreground and unlocked', 60000);
  await requireOrigin();
  report.measurements.device = await js(`({userAgent:navigator.userAgent,platform:navigator.userAgentData?.platform||navigator.platform,
    userAgentBrands:navigator.userAgentData?.brands||null,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
    screenWidth:screen.width,screenHeight:screen.height,visualViewport:visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null,
    secureContext:isSecureContext,visibility:document.visibilityState})`);
  check(await js('document.documentElement.scrollWidth<=innerWidth+1'), 'actual phone onboarding has no horizontal overflow');
  if (!resumeToken) {
  await until('!!document.querySelector("#onboarding .forge-solid-button")', 'real fresh onboarding');
  await js(`(()=>{const e=document.querySelector('#onboarding input[aria-label="Имя персонажа"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(nickname)});
    e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await until(`document.querySelector('#onboarding input')?.value===${JSON.stringify(nickname)}`, 'synthetic onboarding nickname');
  await click('#onboarding .build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  }
  await until(`(()=>{try{const p=JSON.parse(localStorage.getItem(${JSON.stringify(profileKey)})||'null');return p?.game?.created&&p.game.nickname===${JSON.stringify(nickname)}&&p.workouts.length===0&&p.xp===0&&p.coins===0}catch{return false}})()`, 'only synthetic zero-workout profile persisted');
  const profileBefore = await js(`localStorage.getItem(${JSON.stringify(profileKey)})`);
  await click('.mobile-nav button:nth-child(3)');
  await until('document.querySelector(".app-shell")?.dataset.screen==="forge"&&!!document.querySelector("#avatar-lab")', 'Hero screen and ordinary editor controls');
  await js('document.querySelector(".studio-preview").scrollIntoView({block:"center",behavior:"instant"});true');
  await until(`(()=>{const e=document.querySelector('.studio-preview [data-avatar-source]');return e?.dataset.avatarSource==='cc0'&&e.dataset.avatarAsset==='athlete'&&e.dataset.avatarRevision==='detail-v2'&&e.dataset.skinMap==='ready'&&e.dataset.detailMaps==='3'&&e.dataset.hairMaps==='2'})()`, 'compact anatomical model and all maps ready', 60000);
  report.measurements.assets = await js(String.raw`performance.getEntriesByType('resource').filter(e=>/\/(bodyforge-athlete[^/]*\.glb|athlete-[^/]+\.(?:png|jpg))$/.test(new URL(e.name).pathname)).map(e=>({file:new URL(e.name).pathname.split('/').at(-1),durationMs:e.duration,transferBytes:e.transferSize,encodedBytes:e.encodedBodySize}))`);
  check(report.measurements.assets.some((asset) => asset.file === 'bodyforge-athlete-efficient.glb') &&
    !report.measurements.assets.some((asset) => asset.file === 'bodyforge-athlete-detail.glb'), 'compact GLB loaded without older large-model fallback');
  await until('document.querySelector(".studio-preview canvas")?.dataset.renderLoop==="on-demand"', 'Hero uses on-demand rendering');
  await sleep(1000);
  await js('window.__bfRealmeQa.heroCanvas=document.querySelector(".studio-preview canvas");true');
  const idleBefore = await drawSample(); await sleep(3000); const idleAfter = await drawSample();
  report.measurements.activeHeroIdle = { unit: 'invoked WebGL draw calls', before: idleBefore, after: idleAfter,
    elapsedMs: idleAfter.atMs - idleBefore.atMs, delta: idleAfter.drawCalls - idleBefore.drawCalls };
  check(idleBefore.sameCanvas && idleAfter.sameCanvas && idleBefore.drawCalls > 0 && idleBefore.visible && idleAfter.visible && !idleBefore.hidden && !idleAfter.hidden,
    'idle samples belong to the same visible real-phone Hero canvas');
  check(idleAfter.drawCalls === idleBefore.drawCalls, 'visible Hero adds zero WebGL draw calls during measured 3-second idle');
  await click('#avatar-lab button[aria-label="Повернуть бойца вправо"]');
  await until('Number(document.querySelector(".studio-preview canvas")?.dataset.avatarYaw)!==' + JSON.stringify(idleAfter.yaw), 'Hero rotation changes ordinary canvas yaw');
  await sleep(250); const yawAfter = await drawSample();
  report.measurements.rotation = { before: idleAfter, after: yawAfter, drawCallDelta: yawAfter.drawCalls - idleAfter.drawCalls };
  check(yawAfter.sameCanvas && yawAfter.drawCalls > idleAfter.drawCalls, 'rotation invokes real WebGL redraw on the same canvas');
  await screenshot('hero-before-dye');
  await click('#avatar-lab [data-skin="deep"]'); await click('#avatar-lab [data-hair="silver"]');
  await until('document.querySelector(".studio-preview [data-look-skin]")?.dataset.lookSkin==="deep"&&document.querySelector(".studio-preview [data-look-hair]")?.dataset.lookHair==="silver"', 'dye choices reach the rendered model props');
  await sleep(250); const dyeAfter = await drawSample();
  report.measurements.dye = { before: yawAfter, after: dyeAfter, drawCallDelta: dyeAfter.drawCalls - yawAfter.drawCalls };
  check(dyeAfter.sameCanvas && dyeAfter.drawCalls > yawAfter.drawCalls, 'dye choices invoke real WebGL redraw');
  await until('(()=>{try{const s=JSON.parse(localStorage.getItem("bodyforge:avatar-look:v1"));return s?.skin==="deep"&&s?.hair==="silver"}catch{return false}})()', 'synthetic cosmetic preferences persist');
  check(await js(`localStorage.getItem(${JSON.stringify(profileKey)})===${JSON.stringify(profileBefore)}`), 'rotation and dye preserve synthetic game bytes');
  await screenshot('hero-after-dye');

  // This opens the camera SCREEN only. Never click its start/training controls.
  await click('.mobile-nav button:nth-child(2)');
  await until('!!document.querySelector("#challenge .perf-toggle")', 'actual diagnostics UI loaded without camera startup');
  await click('#challenge .perf-toggle');
  await until('!!document.querySelector("#challenge .perf-copy")', 'ordinary diagnostics copy control');
  const diagnosticsBefore = await copyDiagnostics(); await sleep(3000); const diagnosticsAfter = await copyDiagnostics();
  report.measurements.runtimeDiagnostics = { before: diagnosticsBefore, after: diagnosticsAfter,
    avatarFrameDelta: diagnosticsAfter.avatar.frames - diagnosticsBefore.avatar.frames,
    note: 'Last scene after navigating away from Hero; not active-scene FPS.' };
  check(diagnosticsBefore.camera.frames === 0 && diagnosticsAfter.camera.frames === 0, 'no camera frames processed');
  check(diagnosticsAfter.avatar.glbLoadMs !== null, 'actual UI reports numeric completed GLB load duration');
  check(diagnosticsAfter.avatar.observedFps === null && !diagnosticsAfter.avatar.animating, 'static/hidden scene does not claim continuous FPS');
  report.measurements.mediaGuard = await js('({blockedAttempts:window.__bfRealmeQa.mediaCalls,liveVideos:[...document.querySelectorAll("video")].filter(v=>v.srcObject).length})');
  check(report.measurements.mediaGuard.blockedAttempts === 0 && report.measurements.mediaGuard.liveVideos === 0, 'scenario never requested or started a camera');
  await requireOrigin();
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = error.message;
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      if (scriptId) await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
      await js('(()=>{const q=window.__bfRealmeQa;if(!q)return false;for(const undo of q.restore.reverse())undo();q.restore=[];return true})()');
      report.instrumentationRestored = true;
    } catch { report.instrumentationRestored = false; }
    socket.close();
  }
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('QA connection closed')); }
  pending.clear();
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(reportDir, { recursive: true });
  const file = path.join(reportDir, `realme-usb-${runId}.json`);
  const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n'); fs.writeFileSync(file, bytes);
  console.log('REPORT', JSON.stringify({ file, status: report.status, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
}
