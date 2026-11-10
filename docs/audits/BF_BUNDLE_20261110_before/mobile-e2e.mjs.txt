import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const chromePath='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const origin=process.env.BODYFORGE_QA_ORIGIN||'http://127.0.0.1:5173';
const width=390, height=844;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'bf-mobile-'));
const chrome=spawn(chromePath,[
  '--headless=new','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
  '--no-first-run','--no-default-browser-check','--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,
  '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
  'about:blank',
],{stdio:'ignore'});
const sleep=(ms)=>new Promise(ok=>setTimeout(ok,ms));
let socket,seq=0,pageLoads=0;const pending=new Map();
async function endpoint(){
  for(let i=0;i<75;i++){
    if(chrome.exitCode!==null)throw Error('Owned Chrome exited '+chrome.exitCode);
    try{const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
      const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();
      const tab=tabs.find(t=>t.type==='page');
      if(tab){console.log('CDP_OWNER',process.pid,port);return tab.webSocketDebuggerUrl;}
    }catch{} await sleep(200);
  }throw Error('Chrome DevTools unavailable');
}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},18000);
    pending.set(id,(m)=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result)});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
}
async function until(expression,label,timeoutMs=20000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){if(await js(expression))return;await sleep(150);}
  throw Error('TIMEOUT '+label);
}
async function read(expression){return JSON.parse(await js('JSON.stringify('+expression+')'));}
async function reloadApp(){
  const previous=pageLoads;
  await cdp('Page.reload',{ignoreCache:true});
  const deadline=Date.now()+30000;
  while(pageLoads<=previous){if(Date.now()>=deadline)throw Error('TIMEOUT new document load');await sleep(80);}
  await until('!!document.querySelector(".app-shell .mobile-nav button:nth-child(3)")','profile hydrated and navigation ready after reload',30000);
}
async function screenshot(name){
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const file=path.join(os.tmpdir(),name);
  fs.writeFileSync(file,Buffer.from(shot.data,'base64'));
  console.log('SHOT',file,fs.statSync(file).size);
}
function check(ok,message){if(!ok)throw Error('FAIL '+message);console.log('PASS',message);}
async function click(selector){
  const found=await js('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');if(!el)return false;el.click();return true;})()');
  check(found,'click '+selector);
  await sleep(300);
}
async function snapshot(){
 return await read("({screen:document.querySelector('.app-shell')?.dataset.screen,scroll:document.documentElement.scrollWidth,viewport:innerWidth,setup:!!document.querySelector('#onboarding'), coins:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').coins,game:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').game,three:[...document.querySelectorAll('[data-3d-status]')].map(x=>x.dataset['3dStatus'])})");
}
try{
  const url=await endpoint();
  socket=new WebSocket(url);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',e=>{
    const m=JSON.parse(e.data.toString());
    if(m.method==='Page.loadEventFired')pageLoads++;
    if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}
    if(m.method==='Runtime.exceptionThrown')console.log('BROWSER_EXCEPTION',(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text||'').slice(0,270));
    if(m.method==='Runtime.consoleAPICalled'&&m.params?.type==='error')
      console.log('BROWSER_ERROR',JSON.stringify(m.params.args?.map(a=>a.value??a.description).slice(0,2)).slice(0,440));
  });
  await cdp('Runtime.enable');await cdp('Page.enable');
  // Disposable fake Wake Lock: prove the actual app requests and releases it.
  // No system-wide settings or the owner's real screen state are changed.
  await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__bfWakeLog = {requests: 0, releases: 0};
    Object.defineProperty(navigator, 'wakeLock', {configurable: true, value: {
      request: async (type) => {
        if (type !== 'screen') throw Error('Unexpected Wake Lock request');
        window.__bfWakeLog.requests++;
        let released = false;
        return {release: async () => {
          if (!released) { released = true; window.__bfWakeLog.releases++; }
        }};
      },
    }});
  `});
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await cdp('Page.navigate',{url:origin+'/'});
  await sleep(3400);
  // A cold lazy chunk can take longer than a fixed sleep under CPU/GPU load.
  // Wait for a terminal 3D status; fallback still fails the active-WebGL check.
  await until("!!document.querySelector('#onboarding [data-3d-status]')",'initial 3D character');
  let s=await snapshot();
  console.log('INITIAL',JSON.stringify(s).slice(0,470));
  check(s.setup&&s.scroll<=width,'fresh mobile onboarding no overflow');
  check(s.three.includes('active'),'WebGL 3D hero active');
  const initialPanels = await read("({catalog:performance.getEntriesByType('resource').some(e=>e.name.includes('/src/components/ExerciseCatalog.tsx')),diagnostics:performance.getEntriesByType('resource').some(e=>e.name.includes('/src/components/RuntimeDiagnosticsPanel.tsx')),controls:performance.getEntriesByType('resource').some(e=>e.name.includes('/src/components/CameraControls.tsx'))})");
  check(!initialPanels.catalog && !initialPanels.diagnostics && !initialPanels.controls,
    'training-only panels are not downloaded on mobile home');
  let photoHuman=false;
  for(let i=0;i<70;i++){
    photoHuman=await js("document.querySelector('#onboarding [data-avatar-source]')?.dataset.avatarSource==='cc0'");
    if(photoHuman)break;
    await sleep(200);
  }
  check(photoHuman,'licensed anatomical CC0 human 3D loaded instead of procedural fallback');
  check(await js("document.querySelector('#onboarding canvas')?.dataset.renderLoop==='on-demand'"),
    'visible static 3D hero uses on-demand GPU rendering without an idle animation loop');
  await js("document.querySelector('#onboarding canvas').style.display='none'");
  await until("document.querySelector('#onboarding canvas')?.dataset.renderLoop==='paused'", 'hidden 3D rendering suspended', 4500);
  check(await js("document.querySelector('#onboarding canvas')?.dataset.renderLoop==='paused'"),
    'off-screen or hidden avatar suspends rendering');
  await js("document.querySelector('#onboarding canvas').style.removeProperty('display')");
  await until("document.querySelector('#onboarding canvas')?.dataset.renderLoop==='on-demand'", 'visible 3D redraw enabled', 4500);
  check(await js("document.querySelector('#onboarding canvas')?.dataset.renderLoop==='on-demand'"),
    'avatar redraws after returning to the screen without perpetual RAF');
  await screenshot('bf-qa-mobile-setup.png');
  // First launch: tapping Camera before fighter setup must not silently jump
  // to the home screen. The user should see why they cannot train yet.
  await click('.mobile-nav button:nth-child(2)');
  await until("!!document.querySelector('#challenge .bf-catalog-trigger') && !!document.querySelector('#challenge .perf-toggle')", 'training panels loaded', 6000);
  const requestedPanels = await read("({catalog:performance.getEntriesByType('resource').some(e=>e.name.includes('/src/components/ExerciseCatalog.tsx')),diagnostics:performance.getEntriesByType('resource').some(e=>e.name.includes('/src/components/RuntimeDiagnosticsPanel.tsx')),controls:performance.getEntriesByType('resource').some(e=>e.name.includes('/src/components/CameraControls.tsx'))})");
  check(requestedPanels.catalog && requestedPanels.diagnostics && requestedPanels.controls,
    'training-only panels are downloaded after opening the camera tab');
  await click('#challenge .primary-button');
  const notCreated=await read("({screen:document.querySelector('.app-shell').dataset.screen,error:document.querySelector('.camera-error[role=alert]')?.textContent||'',cta:document.querySelector('#challenge .primary-button')?.textContent||''})");
  console.log('NO_FIGHTER_CAMERA',JSON.stringify(notCreated));
  check(notCreated.screen==='challenge'&&notCreated.error.includes('создай бойца')&&notCreated.cta.includes('СОЗДАТЬ БОЙЦА'),
    'camera stays open and offers fighter creation instead of redirecting');
  await click('#challenge .primary-button');
  const returned=await snapshot();
  check(returned.screen==='dashboard'&&returned.setup,'explicit fighter creation button returns to onboarding');
  await click('.build-options button:nth-child(2)');
  await click('#onboarding .forge-solid-button');
  await until("JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').game?.created===true", 'fighter creation acknowledged on disk');
  s=await snapshot();
  console.log('CREATED',JSON.stringify(s).slice(0,440));
  check(!s.setup&&s.game?.created&&s.game.build==='solid','fighter creation persisted');
  // The local backup is opt-in. Prepare asynchronously, then download from a
  // second direct click; inspect only this disposable browser's fake export.
  await until("!!document.querySelector('#progress-backup [data-action=prepare-progress]:not(:disabled)')", 'backup panel ready', 12000);
  const beforeBackup = await js("localStorage.getItem('bodyforge:pilot:v1')");
  await js(`(()=>{
    const actualUrl = URL.createObjectURL.bind(URL);
    const actualClick = HTMLAnchorElement.prototype.click;
    window.__bfExportBlobs = new Map();
    URL.createObjectURL = (blob) => {
      const uri = actualUrl(blob);
      if (blob.type.includes('application/json')) window.__bfExportBlobs.set(uri, blob);
      return uri;
    };
    HTMLAnchorElement.prototype.click = function() {
      if (this.download.startsWith('bodyforge-backup-')) {
        window.__bfExportSample = { filename: this.download, blob: window.__bfExportBlobs.get(this.href) };
        return;
      }
      return actualClick.call(this);
    };
    return true;
  })()`);
  await click('#progress-backup [data-action=prepare-progress]');
  await until("document.querySelector('#progress-backup')?.dataset.backupStage==='ready'", 'backup data assembled', 12000);
  check(!!(await js("document.querySelector('#progress-backup .progress-install-help summary')?.textContent.includes('УСТАНОВИТЬ')")),
    'mobile app offers an accessible install guide');
  await js("window.dispatchEvent(new StorageEvent('storage', {key:'bodyforge:avatar-look:v1',newValue:'changed-in-another-tab'}));true");
  await sleep(240);
  console.log('BACKUP_CROSS_TAB_STATE',JSON.stringify(await read("({stage:document.querySelector('#progress-backup')?.dataset.backupStage,message:document.querySelector('#progress-backup .progress-backup-actions [role=status]')?.textContent||'',exists:!!document.querySelector('#progress-backup')})")));
  // React may already be in 'idle' while an earlier profile revision settles.
  // Wait for the actual cross-tab warning before asserting invalidation.
  await until("document.querySelector('#progress-backup .progress-backup-actions [role=status]')?.textContent.includes('другой вкладке')", 'cross-tab stale-backup warning rendered', 4000);
  check(await js("document.querySelector('#progress-backup')?.dataset.backupStage==='idle'"),
    'changed settings invalidate a prepared download');
  await click('#progress-backup [data-action=prepare-progress]');
  await until("document.querySelector('#progress-backup')?.dataset.backupStage==='ready'", 'refreshed backup assembled', 12000);
  await click('#progress-backup [data-action=download-progress]');
  const saved = JSON.parse(await js(`(async()=>{
    const sample = window.__bfExportSample;
    const value = JSON.parse(await sample.blob.text());
    return JSON.stringify({name:sample.filename,format:value.exportFormat,version:value.exportSchemaVersion,
      rawProfile:value.storedProfileRaw,lookStatus:value.auxiliaryReadStatus?.avatarLook,
      profileQuarantineStatus:value.profileQuarantineReadStatus,
      profileQuarantineCount:value.storedProfileQuarantineRaw?.length,
      durableStatus:value.durableReadStatus, complete:value.complete});
  })()`));
  check(saved.name.startsWith('bodyforge-backup-') && saved.format==='bodyforge-manual-backup'
    && saved.version===1 && saved.rawProfile===beforeBackup && saved.lookStatus==='ready'
    && saved.profileQuarantineStatus==='ready' && saved.profileQuarantineCount===0,
    'two-click local backup preserves the actual profile and settings');
  check((await js("localStorage.getItem('bodyforge:pilot:v1')"))===beforeBackup,
    'export does not rewrite user progress or rewards');
  // Inspect the actual exported Blob using a local File input; never upload or
  // restore it. Exercise success, broken JSON and a moving-source warning.
  await js("document.querySelector('.progress-backup-file-checker').open=true;true");
  await js(`(async()=>{
    const blob=window.__bfExportSample.blob;
    const input=document.querySelector('[data-action=inspect-progress-file]');
    const transfer=new DataTransfer();
    transfer.items.add(new File([blob], 'saved-bodyforge.json', {type:'application/json'}));
    input.files=transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  })()`);
  await until("document.querySelector('.progress-backup-file-checker')?.dataset.inspectionState==='readable'",
    'downloaded backup inspection succeeds', 10000);
  check(!!(await js("document.querySelector('.progress-backup-file-checker [role=status]')?.textContent.includes('Структура резервной копии BODYFORGE проверена')")),
    'manual selected-file inspection confirms structure without claiming a restore');
  await js(`(()=>{
    const input=document.querySelector('[data-action=inspect-progress-file]');
    const transfer=new DataTransfer();
    transfer.items.add(new File(['{broken backup'], 'broken.json', {type:'application/json'}));
    input.files=transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  })()`);
  await until("document.querySelector('.progress-backup-file-checker')?.dataset.inspectionState==='invalid'",
    'invalid local JSON detected', 10000);
  check(!!(await js("document.querySelector('.progress-backup-file-checker [role=status]')?.textContent.includes('не является корректным JSON')")),
    'broken backup cannot be presented as verified');
  await js(`(async()=>{
    const payload=JSON.parse(await window.__bfExportSample.blob.text());
    payload.complete=false;
    payload.sourcesChangedDuringRead=true;
    const input=document.querySelector('[data-action=inspect-progress-file]');
    const transfer=new DataTransfer();
    transfer.items.add(new File([JSON.stringify(payload)],'stale.json',{type:'application/json'}));
    input.files=transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  })()`);
  await until("document.querySelector('.progress-backup-file-checker')?.dataset.inspectionState==='incomplete'",
    'outdated export detected', 10000);
  check(!!(await js("document.querySelector('.progress-backup-file-checker [role=status]')?.textContent.includes('изменялись во время экспорта')")),
    'cross-tab race is never presented as a complete backup');
  check((await js("localStorage.getItem('bodyforge:pilot:v1')"))===beforeBackup,
    'inspecting downloaded, broken or stale backup never rewrites wallet and rewards');
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await sleep(300);
  const narrowBackup=await read("(()=>{const card=document.querySelector('#progress-backup');card.scrollIntoView({block:'start',behavior:'instant'});const box=card.querySelector('[data-action=inspect-progress-file]').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,inputRight:box.right,inputLeft:box.left}})()");
  check(narrowBackup.width===320&&narrowBackup.scroll<=320&&narrowBackup.inputRight<=321&&narrowBackup.inputLeft>=-1,
    'backup JSON file picker fits a narrow 320px phone without horizontal overflow');
  await screenshot('bf-qa-mobile-backup-json-inspection.png');
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await js("document.querySelector('.dashboard-player')?.scrollIntoView({block:'start',behavior:'instant'});true");
  await sleep(260);
  const premium=await read("({player:!!document.querySelector('.dashboard-player'),dark:!!document.querySelector('link[href*=premium]')||getComputedStyle(document.body).backgroundColor,firstRect:document.querySelector('.character-card')?.getBoundingClientRect().top})");
  console.log('PREMIUM_HOME',JSON.stringify(premium));
  check(premium.player && premium.firstRect>0,'home has real fighter status and 3D hero');
  const primaryCta=await read("(()=>{const c=document.querySelector('.dashboard-player .profile-training-cta')?.getBoundingClientRect(),n=document.querySelector('.mobile-nav')?.getBoundingClientRect();return {visible:!!c,withinViewport:!!c&&!!n&&c.top>=0&&c.bottom<n.top,bodyBg:getComputedStyle(document.body).backgroundColor}})()");
  check(primaryCta.visible&&primaryCta.withinViewport&&primaryCta.bodyBg==='rgb(10, 16, 24)',
    'training CTA visible above bottom navigation on configurable dark home');
  await screenshot('bf-qa-mobile-home-premium.png');
  await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
  await sleep(280);
  const compact=await read("(()=>{const c=document.querySelector('.dashboard-player .profile-training-cta')?.getBoundingClientRect(),n=document.querySelector('.mobile-nav')?.getBoundingClientRect();return {viewport:innerWidth,scroll:document.documentElement.scrollWidth,cta:!!c&&!!n&&c.bottom<n.top}})()");
  check(compact.viewport===360&&compact.scroll<=360&&compact.cta,'360 px first screen keeps training button visible and has no horizontal overflow');
  await screenshot('bf-qa-mobile-home-360-premium.png');
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await sleep(280);
  await click('.mobile-nav button:nth-child(3)');
  const nav=await read("({screen:document.querySelector('.app-shell').dataset.screen,studioTop:document.querySelector('#forge')?.getBoundingClientRect().top,introDisplay:getComputedStyle(document.querySelector('.intro')).display,studioDisplay:getComputedStyle(document.querySelector('#forge')).display})");
  console.log('FORGE_NAV',JSON.stringify(nav));
  check(nav.screen==='forge'&&nav.studioTop>=0&&nav.studioTop<340&&nav.introDisplay==='none'&&nav.studioDisplay!=='none','mobile tab reveals actual forge screen');
  await sleep(1600);
  const studio=await read("({three:document.querySelector('#forge [data-3d-status]')?.dataset['3dStatus'],canvas:!!document.querySelector('#forge canvas'),scroll:document.documentElement.scrollWidth})");
  console.log('STUDIO_3D',JSON.stringify(studio));
  check(studio.three==='active'&&studio.canvas,'studio renders real 3D avatar');
  // The expanded dashboard defers heavy 3D offscreen. Require a real GLB
  // while the editor is visible before asserting a nonzero load diagnostic.
  await js('document.querySelector("#forge .studio-preview")?.scrollIntoView({block:"start",behavior:"instant"});true');
  await until('document.querySelector("#forge [data-avatar-source]")?.dataset.avatarSource==="cc0"', 'studio CC0 asset fully loaded', 30000);
  await screenshot('bf-qa-mobile-forge.png');
  await click('.mobile-nav button:nth-child(1)');
  await click('#quests .quest-button');
  s=await snapshot();
  check(s.coins===10&&s.game.lastLoginDay,'daily login reward once');
  // QA-only wallet top-up in this disposable Chrome profile. Never changes actual user data.
  await js("(()=>{const key='bodyforge:pilot:v1',p=JSON.parse(localStorage.getItem(key));p.coins=180;localStorage.setItem(key,JSON.stringify(p));return true})()");
  await reloadApp();
  await click('.mobile-nav button:nth-child(3)');
  await until('document.querySelector("#forge .muscle-card button")?.disabled===false', 'purchased improvement available after profile reload');
  await click('#forge .muscle-card button');
  await until('(()=>{const p=JSON.parse(localStorage.getItem("bodyforge:pilot:v1")||"{}");return p.game?.muscles?.arms===1&&p.coins===155})()', 'persisted muscle upgrade confirmed');
  s=await snapshot();
  check(s.game.muscles.arms===1&&s.coins===155,'muscle upgrade spends coins and changes state');
  await until("document.querySelector('#forge .outfit-item:nth-child(2)')?.disabled===false", 'outfit purchase enabled after muscle save');
  await click('#forge .outfit-item:nth-child(2)');
  await until('(()=>{const p=JSON.parse(localStorage.getItem("bodyforge:pilot:v1")||"{}");return p.game?.outfit==="ember"&&p.coins===95})()', 'outfit purchase acknowledged and persisted');
  s=await snapshot();
  check(s.game.outfit==='ember'&&s.coins===95,'outfit purchase persists color choice');
  await screenshot('bf-qa-mobile-forge-upgraded.png');
  await reloadApp();
  s=await snapshot();
  check(!s.setup&&s.game.muscles.arms===1&&s.game.outfit==='ember'&&s.coins===95,'save survives reload');
  // Session-only diagnostics reset on Page.reload, by design. Open the hero
  // again and measure a NEW GLB load before navigating back to the camera.
  await click('.mobile-nav button:nth-child(3)');
  await js('document.querySelector("#forge .studio-preview")?.scrollIntoView({block:"start",behavior:"instant"});true');
  await until('document.querySelector("#forge [data-avatar-source]")?.dataset.avatarSource==="cc0"', 'GLB measured after full reload', 30000);
  await click('.mobile-nav button:nth-child(4)');
  const tower=await read("({screen:document.querySelector('.app-shell').dataset.screen,top:document.querySelector('#tower').getBoundingClientRect().top,floors:document.querySelectorAll('.tower-floor').length,challengeDisplay:getComputedStyle(document.querySelector('#tower')).display})");
  console.log('TOWER',JSON.stringify(tower));
  check(tower.screen==='tower'&&tower.floors===5&&tower.top<340&&tower.challengeDisplay!=='none','solo tower shown on its own tab');
  await screenshot('bf-qa-mobile-tower.png');
  await click('.mobile-nav button:nth-child(5)');
  const online=await read("({visible:getComputedStyle(document.querySelector('#online')).display,body:document.querySelector('#online')?.textContent?.includes('ОНЛАЙН ЕЩЁ НЕ ПОДКЛЮЧЁН')})");
  check(online.visible!=='none'&&online.body,'online properly marked upcoming');
  await click('.mobile-nav button:nth-child(2)');
  const camera=await read("({screen:document.querySelector('.app-shell').dataset.screen,card:document.querySelector('#challenge')?.getBoundingClientRect().top,button:!!document.querySelector('#challenge .primary-button'),ratio:(()=>{const b=document.querySelector('.training-visual').getBoundingClientRect();return b.width/b.height})()})");
  console.log('CAMERA_TAB',JSON.stringify(camera));
  check(camera.screen==='challenge'&&camera.card<340&&camera.button&&Math.abs(camera.ratio-9/16)<.006,'mobile camera tab with portrait stage');
  const framingCopy = await js("document.querySelector('.framing-primer')?.textContent || ''");
  check(/боком|сбоку|45°/i.test(framingCopy) && /колен/i.test(framingCopy) && /стоп/i.test(framingCopy),
    'camera offers side-view and full-leg framing before the workout');
  await click('.perf-toggle');
  const preflightDiagnostics = await read("({open:!!document.querySelector('[data-diagnostics=open]'),glb:document.querySelector('[data-glb-load]')?.dataset.glbLoad,privacy:document.querySelector('.perf-body')?.textContent.includes('Никакие кадры камеры')})");
  console.log('PREFLIGHT_DIAGNOSTICS',JSON.stringify(preflightDiagnostics));
  check(preflightDiagnostics.open&&Number(preflightDiagnostics.glb)>0&&preflightDiagnostics.privacy,
    'device diagnostics offers a locally measured GLB load and privacy notice');
  check((await read('window.__bfWakeLog')).requests === 0,
    'screen lock remains off before starting a workout');
  await click('#challenge .primary-button');
  await until('window.__bfWakeLog.requests >= 1', 'screen wake lock requested', 10000);
  check((await read('window.__bfWakeLog')).releases === 0,
    'phone screen wake lock stays held during camera startup');
  for(let i=0;i<60;i++){await sleep(250);const mode=await read("({active:!!document.querySelector('.camera-visible'),error:document.querySelector('.camera-error')?.textContent||'',loading:!!document.querySelector('.loading-overlay')})");if(mode.active||mode.error){console.log('CAMERA_START',JSON.stringify(mode));check(mode.active&&!mode.error,'camera starts after 3D navigation');break;}if(i===59)throw Error('Camera did not start after 15 s');}
  const context=await read("({active3d:[...document.querySelectorAll('[data-3d-status=active]')].length,stageRatio:(()=>{const b=document.querySelector('.training-visual').getBoundingClientRect();return b.width/b.height})()})");
  console.log('CAMERA_GPU',JSON.stringify(context));
  check(context.active3d===0,'3D renderer suspends during camera inference');
  let framing={visible:false,guidance:'',text:''};
  for(let i=0;i<90;i++){
    await sleep(300);
    const live=await js("!!document.querySelector('#challenge .live-tag')");
    framing=await read("({visible:!!document.querySelector('.pose-camera-coach'),guidance:document.querySelector('.pose-camera-coach')?.dataset.guidance||'',text:document.querySelector('.pose-camera-coach')?.textContent||''})");
    if(live && framing.visible && framing.text.length>12) break;
  }
  console.log('POSE_GUIDANCE',JSON.stringify(framing));
  check(framing.visible && framing.guidance && framing.text.length>12,
    'on-screen camera coach explains tracking problem once pose model is running');
  await sleep(1200);
  const performanceReport=await read("(()=>{const metrics=JSON.parse(document.querySelector('#perf-report').value);return {frames:metrics.camera.frames,p95:metrics.camera.p95Ms,private:!/landmarks|nickname|deviceId|workouts|video/i.test(JSON.stringify(metrics)),scroll:document.documentElement.scrollWidth}})()");
  console.log('PERF_DIAGNOSTICS',JSON.stringify(performanceReport));
  check(performanceReport.frames>0 && (performanceReport.p95===null ? performanceReport.frames<20 : performanceReport.p95>=0) && performanceReport.private && performanceReport.scroll<=390,
    'live MediaPipe timings appear on mobile without video or profile data');
  const renderPolicy=await js("({mode:document.querySelector('[data-avatar-render-mode]')?.dataset.avatarRenderMode,help:document.querySelector('.perf-hint')?.textContent||''})");
  check(renderPolicy.mode==='off' && renderPolicy.help.includes('Неподвижный 3D-боец'),
    'diagnostics explain event-driven 3D and disabled GPU during camera inference');
  await js("document.querySelector('.perf-panel').scrollIntoView({block:'start'});true");
  await sleep(200);
  await screenshot('bf-qa-mobile-performance-panel.png');
  const controls=await read("({lenses:document.querySelectorAll('.camera-lenses button').length,wideDisabled:document.querySelector('.camera-lenses button:nth-child(3)')?.disabled,zoom:!!document.querySelector('.camera-zoom-control')})");
  console.log('CAMERA_CONTROLS',JSON.stringify(controls));
  check(controls.lenses===3,'front, rear and ultra-wide controls visible on mobile');
  await click('.camera-frame-toggle');
  const fit=await read("({whole:document.querySelector('.training-visual')?.classList.contains('camera-fit-whole'),ratio:(()=>{const b=document.querySelector('.training-visual').getBoundingClientRect();return b.width/b.height})()})");
  check(fit.whole&&Math.abs(fit.ratio-9/16)<.006,'full-frame option preserves the portrait 9:16 container');
  await click('.camera-frame-toggle');
  check(await js("!document.querySelector('.training-visual')?.classList.contains('camera-fit-whole')"),'cover mode can be restored');
  let detectorReady=false;
  for(let i=0;i<80;i++){
    await sleep(300);
    detectorReady=await js("!!document.querySelector('#challenge .live-tag') && !document.querySelector('.camera-lenses button:nth-child(2)').disabled");
    if(detectorReady)break;
  }
  check(detectorReady,'pose model fully active before switching lens');
  // Chrome's fake webcam is a single camera. Switching to the rear-facing
  // preference must keep inference alive without wiping a workout reward.
  await click('.camera-lenses button:nth-child(2)');
  let changed=false;
  for(let i=0;i<40;i++){
    await sleep(350);
    const status=await read("({active:!!document.querySelector('.camera-visible'),error:document.querySelector('.camera-error')?.textContent||'',selected:document.querySelector('.camera-lenses button:nth-child(2)')?.getAttribute('aria-pressed'),front:document.querySelector('.camera-lenses button:nth-child(1)')?.getAttribute('aria-pressed'),verification:document.querySelector('.camera-control-deck')?.dataset.cameraSourceVerification,message:document.querySelector('.camera-control-help')?.textContent?.trim().slice(0,170)||'',busy:!!document.querySelector('.camera-switch-overlay')})");
    if(status.error)throw Error('Camera switch broke capture: '+status.error);
    if(i%5===0)console.log('REAR_SWITCH_STEP',i,JSON.stringify(status));
    if(status.active&&!status.busy&&(
      (status.verification==='mismatch'&&status.selected==='false'&&status.message.includes('другой объектив'))||
      (status.verification!=='mismatch'&&status.selected==='true'&&status.message.includes(status.verification==='confirmed'?'подтвердил':'не подтвердил'))
    )){changed=true;break;}
  }
  check(changed,'live switch to rear camera resumes tracking');
  await screenshot('bf-qa-mobile-lenses.png');
  await click('.camera-lenses button:nth-child(1)');
  changed=false;
  for(let i=0;i<40;i++){
    await sleep(350);
    const status=await read("({active:!!document.querySelector('.camera-visible'),error:document.querySelector('.camera-error')?.textContent||'',selected:document.querySelector('.camera-lenses button:nth-child(1)')?.getAttribute('aria-pressed'),busy:!!document.querySelector('.camera-switch-overlay')})");
    if(status.error)throw Error('Returning to front camera broke capture: '+status.error);
    if(status.active&&status.selected==='true'&&!status.busy){changed=true;break;}
  }
  check(changed,'live switch back to front camera resumes tracking');
  // Force a browser that ignores ideal facingMode, and verify the UI refuses
  // to claim the rear lens is selected. Do not expose deviceId to the UI.
  await js(`(()=>{
    const proto=MediaStreamTrack.prototype;
    const original=proto.getSettings;
    window.__bfRestoreCameraSettings=()=>{proto.getSettings=original};
    proto.getSettings=function(){return {...original.call(this),facingMode:'user',deviceId:'qa-wrong-device'}};
    return true;
  })()`);
  await click('.camera-lenses button:nth-child(2)');
  await until("document.querySelector('.camera-control-deck')?.dataset.cameraSourceVerification==='mismatch'", 'ignored lens preference detected', 14000);
  const mismatch=await read("({pressed:document.querySelector('.camera-lenses button:nth-child(2)')?.getAttribute('aria-pressed'),message:document.querySelector('.camera-control-help')?.textContent||'',active:!!document.querySelector('.camera-visible')})");
  check(mismatch.active&&mismatch.pressed==='false'&&mismatch.message.includes('другой объектив')&&!mismatch.message.includes('qa-wrong-device'),
    'ignored camera preference warns without claiming a rear lens or leaking device ID');
  await js("window.__bfRestoreCameraSettings();true");
  // A privacy-restricted browser may reject getSettings(). A working video
  // stream must not be discarded just because camera metadata is unavailable.
  await js(`(()=>{
    const proto=MediaStreamTrack.prototype;
    const original=proto.getSettings;
    window.__bfRestoreCameraSettings=()=>{proto.getSettings=original};
    proto.getSettings=function(){throw new DOMException('metadata denied','SecurityError')};
    return true;
  })()`);
  await click('.camera-lenses button:nth-child(1)');
  await until("document.querySelector('.camera-control-deck')?.dataset.cameraSourceVerification==='unverified' && document.querySelector('.camera-control-help')?.textContent.includes('не подтвердил')", 'privacy-hidden camera settings allowed', 14000);
  check(await js("!!document.querySelector('.camera-visible') && document.querySelector('.camera-lenses button:nth-child(1)')?.getAttribute('aria-pressed')==='true'"),
    'missing camera metadata does not interrupt capture or invent a verified lens');
  await js("window.__bfRestoreCameraSettings();true");
  await click('#challenge .secondary-button');
  await until('window.__bfWakeLog.releases >= window.__bfWakeLog.requests', 'wake lock released on stop', 10000);
  check((await read('window.__bfWakeLog')).releases >= 1,
    'stopping the camera releases the screen wake lock');
  const stopped=await read("({video:!!document.querySelector('.camera-visible'),rewards:JSON.parse(localStorage.getItem('bodyforge:pilot:v1')||'{}').xp})");
  check(!stopped.video&&stopped.rewards===0,'manual camera stop grants no XP');
  await cdp('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});
  await sleep(500);
  const small=await read("({viewport:innerWidth,scroll:document.documentElement.scrollWidth})");
  console.log('SMALL_VIEWPORT',JSON.stringify(small));
  check(small.viewport===360&&small.scroll<=360,'360 px mobile no horizontal overflow');
  await screenshot('bf-qa-mobile-360-premium.png');
  console.log('BODYFORGE_MOBILE_E2E_PASS');
}catch(error){
  console.error('BODYFORGE_MOBILE_E2E_FAIL',error.stack||String(error));process.exitCode=12;
  if(socket?.readyState===1)try{
    console.log('FAILURE_STATE',await js("JSON.stringify({url:location.href,screen:document.querySelector('.app-shell')?.dataset.screen,storageStatus:document.querySelector('[data-storage-status]')?.dataset.storageStatus,loading:!!document.querySelector('.avatar-3d-wait'),message:document.body.innerText.slice(0,2000)})"));
  }catch{}
}
finally{socket?.close();chrome.kill();await sleep(400);try{fs.rmSync(profile,{recursive:true,force:true})}catch{}}
