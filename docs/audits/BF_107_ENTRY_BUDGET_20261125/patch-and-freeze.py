from pathlib import Path
import hashlib,json,subprocess,shutil,stat
root=Path.cwd()
a=root/'docs/audits/BF_107_ENTRY_BUDGET_20261125'
dest=root/'.bodyforge-qa/bf107-entry-budget'
expected={'src/components/AppearancePanel.tsx':'42c976ba363159c034dac566c0f491134acd83ab3cb0bfa8c7f7d4f01ffd5059','qa/appearance-e2e.mjs':'7116d481bfa0ce749213c4e02d93b4e2428abda7ee32e6d107fbe9687a5be89d','qa/bundle-on-demand.mjs':'6feea6e2701a19ea12e815983cb28a36ef278388a2dea6b293e1093b3da882dd'}
def sha(b):return hashlib.sha256(b).hexdigest()
def filehash(p):return sha(p.read_bytes())
old={p:(root/p).read_bytes() for p in expected}
for p,h in expected.items():assert sha(old[p])==h,p
new_panel='src/components/AppearanceDialogContent.tsx'
new_qa='qa/appearance-lazy-e2e.mjs'
assert not (root/new_panel).exists() and not (root/new_qa).exists()
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
def norm(p):return old[p].decode('utf-8').replace('\r\n','\n')
p,q,b=expected.keys()
s=norm(p)
start=s.index('      <p className="appearance-intro">')
end=s.index('    </dialog>',start)
body=s[start:end]
content="""import { Check } from 'lucide-react';
import { DEFAULT_APPEARANCE, PALETTES, isHexColor, type Appearance } from '../lib/appearance';

export interface AppearanceDialogContentProps {
  settings: Appearance;
  draft: string;
  setDraft: (value: string) => void;
  choose: (value: Appearance) => void;
  message: string;
}

/** Only loaded on explicit appearance-editor intent. No persistence authority. */
export default function AppearanceDialogContent({ settings, draft, setDraft, choose, message }: AppearanceDialogContentProps) {
  const validDraft = isHexColor(draft);
  return <>
"""+body+"""  </>;
}
"""
s=s[:start]+"""      {Editor ? <Editor settings={settings} draft={draft} setDraft={setDraft} choose={choose} message={message}/>
        : loadState === 'error' ? <div data-appearance-load-error role="status" className="appearance-message">
            Не удалось загрузить редактор оформления. Закрой окно и открой его снова; если ошибка повторится, обнови страницу.
            Текущий стиль и прогресс не изменены.
          </div> : <p role="status" className="appearance-message">Загружаем настройки оформления…</p>}
"""+s[end:]
s=once(s,"import { useEffect, useRef, useState } from 'react';","import { useEffect, useRef, useState, type ComponentType } from 'react';")
s=once(s,"import { Check, Palette as PaletteIcon, X } from 'lucide-react';","import { Palette as PaletteIcon, X } from 'lucide-react';")
s=once(s,"import { APPEARANCE_KEY, DEFAULT_APPEARANCE, PALETTES, applyAppearance, isHexColor, loadAppearance, saveAppearance, type Appearance } from '../lib/appearance';","import { APPEARANCE_KEY, applyAppearance, loadAppearance, saveAppearance, type Appearance } from '../lib/appearance';\nimport type { AppearanceDialogContentProps } from './AppearanceDialogContent';")
s=once(s,"  const validDraft = isHexColor(draft);","""  const [Editor, setEditor] = useState<ComponentType<AppearanceDialogContentProps> | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const loading = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function loadEditor() {
    if (Editor || loading.current) return;
    loading.current = true;
    setLoadState('loading');
    try {
      const module = await import('./AppearanceDialogContent');
      if (!mounted.current) return;
      setEditor(() => module.default);
      setLoadState('ready');
    } catch {
      if (mounted.current) setLoadState('error');
    } finally { loading.current = false; }
  }

  function openEditor() {
    if (disabled || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    void loadEditor();
  }""")
s=once(s,"onClick={() => dialog.current?.showModal()}","onClick={openEditor}")
s=once(s,'<dialog ref={dialog} className="appearance-dialog"','<dialog ref={dialog} className="appearance-dialog" data-appearance-load={loadState}')
v=norm(q)
anchor="""  await tab.until('document.querySelector("dialog.appearance-dialog")?.open===true', 'native appearance dialog opened');"""
v=once(v,anchor,anchor+"""
  await tab.until('document.querySelector("dialog.appearance-dialog")?.dataset.appearanceLoad==="ready"', 'appearance editor loaded');""")
w=norm(b)
w=once(w,"const cameraControlsName = only(/^CameraControls-[\\w-]+\\.js$/, 'Camera controls');","const cameraControlsName = only(/^CameraControls-[\\w-]+\\.js$/, 'Camera controls');\nconst appearanceName = only(/^AppearanceDialogContent-[\\w-]+\\.js$/, 'Appearance editor');")
w=once(w,"if (html.includes(cameraControlsName)) throw Error('Mobile camera controls were preloaded in index.html');","""if (html.includes(cameraControlsName)) throw Error('Mobile camera controls were preloaded in index.html');
if (html.includes(appearanceName)) throw Error('Appearance editor was preloaded in index.html');
if (!entryBytes.toString('utf8').includes(appearanceName)) throw Error('Appearance editor lacks dynamic entry reference');""")
updates={p:s.encode(),q:v.encode(),b:w.encode(),new_panel:content.encode(),new_qa:r"""// Actual production preview; isolated Chrome profile only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requirePreviewOrigin, waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';

const origin=process.env.BODYFORGE_QA_ORIGIN;
await requirePreviewOrigin(origin,process.env.BODYFORGE_QA_EXPECT_ENTRY_SHA256);
const matches=fs.readdirSync('dist/assets').filter(x=>/^AppearanceDialogContent-[\w-]+\.js$/.test(x));
if(matches.length!==1)throw Error('Expected one appearance editor chunk');
const chunk=origin+'/assets/'+matches[0];
const prefix='bf-appearance-lazy-', profile=fs.mkdtempSync(path.join(os.tmpdir(),prefix));
const chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',[
  '--headless=new','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
  '--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank',
],{stdio:'ignore'});
let browser,socket,seq=0,checks=0,paused=null;
const pending=new Map(),requests=[],exceptions=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(ok,label){if(!ok)throw Error('FAIL '+label);checks++;console.log('PASS '+label)}
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'))},20000);
    pending.set(id,{timer,resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
}
async function js(expression){
  const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result.value;
}
async function until(test,label,timeout=20000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){if(await test())return;await sleep(80)}
  throw Error('TIMEOUT '+label);
}
const q=selector=>'document.querySelector('+JSON.stringify(selector)+')';
const trigger='button[aria-label="Внешний вид"]',close='button[aria-label="Закрыть внешний вид"]';
const dialog='dialog.appearance-dialog',game='JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith("bodyforge:pilot:v1")).sort())';
const pref='localStorage.getItem("bodyforge:appearance:v1")';
const click=async selector=>{await until(()=>js(q(selector)+'&&!'+q(selector)+'.disabled'),'control '+selector);await js(q(selector)+'.focus();'+q(selector)+'.click();true')};
const state=s=>()=>js(q(dialog)+'?.dataset.appearanceLoad==='+JSON.stringify(s));
try{
  browser=await waitForOwnedBrowser(profile,chrome);
  const target=await newOwnedPage(browser);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
  socket.addEventListener('message',event=>{
    const msg=JSON.parse(event.data.toString()),req=pending.get(msg.id);
    if(req){clearTimeout(req.timer);pending.delete(msg.id);msg.error?req.reject(Error(JSON.stringify(msg.error))):req.resolve(msg.result)}
    if(msg.method==='Network.requestWillBeSent'&&msg.params.request.url===chunk)requests.push(msg.params.requestId);
    if(msg.method==='Fetch.requestPaused'&&msg.params.request.url===chunk)paused=msg.params.requestId;
    if(msg.method==='Runtime.exceptionThrown')exceptions.push(msg.params.exceptionDetails.text);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
  await cdp('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp('Fetch.enable',{patterns:[{urlPattern:chunk,requestStage:'Request'}]});
  const fixture=JSON.stringify({version:1,palette:'violet',customAccent:'#65ead0',material:'solid',highContrast:false});
  const seed=await cdp('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("bodyforge:appearance:v1",'+JSON.stringify(fixture)+')'});
  await cdp('Page.navigate',{url:origin+'/'});
  await until(()=>js('!!'+q(trigger)+'&&document.documentElement.dataset.bfPalette==="violet"&&document.documentElement.dataset.bfMaterial==="solid"'),'app and saved theme ready');
  await cdp('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed.identifier});
  await sleep(300);
  const gameBefore=await js(game);
  check(requests.length===0&&paused===null&&await state('idle')(),'saved appearance applied before any editor request');
  check(await js(pref)===fixture,'startup preserves exact preference bytes');
  await click(trigger);
  await until(async()=>paused!==null&&await state('loading')(),'editor request held');
  check(await js(q(dialog)+'?.matches(":modal")&&!'+q('[data-palette=violet]')),'native modal opens with loading state before controls arrive');
  await click(close);
  check(await js('!'+q(dialog)+'.open'),'modal can close during module download');
  const first=paused;paused=null;await cdp('Fetch.continueRequest',{requestId:first});
  await until(state('ready'),'editor loaded after close');
  check(await js('!'+q(dialog)+'.open')&&await js(pref)===fixture&&await js(game)===gameBefore,'late editor load neither reopens dialog nor mutates storage');
  await click(trigger);
  await until(()=>js(q('[data-palette=violet]')+'?.getAttribute("aria-pressed")==="true"'),'loaded editor matches saved appearance');
  check(requests.length===1,'reopening uses loaded module without another request');
  await click('[data-palette=copper]');
  await until(()=>js('document.documentElement.dataset.bfPalette==="copper"&&JSON.parse('+pref+').palette==="copper"'),'palette persisted');
  check(await js(game)===gameBefore,'appearance edit leaves game storage exact');
  await click(close);
  await until(()=>js('!'+q(dialog)+'.open'),'close');
  check(await js('document.activeElement==='+q(trigger)),'native close restores opener focus');
  const current=await js(pref);
  await cdp('Page.reload',{ignoreCache:true});
  await until(()=>js('!!'+q(trigger)+'&&'+q(dialog)+'?.dataset.appearanceLoad==="idle"&&document.documentElement.dataset.bfPalette==="copper"'),'new page applies saved appearance');
  check(paused===null&&requests.length===1,'new page still waits for explicit editor intent');
  await click(trigger);
  await until(async()=>paused!==null&&await state('loading')(),'second request held');
  const second=paused;paused=null;await cdp('Fetch.failRequest',{requestId:second,errorReason:'Failed'});
  await until(state('error'),'handled unavailable editor');
  check(await js(q(dialog)+'?.open&&'+q('[data-appearance-load-error]')+'!==null'),'download failure shows explicit recoverable error');
  await click(close);
  check(await js('!'+q(dialog)+'.open&&!!'+q('.app-shell')),'editor failure does not crash app and dialog closes');
  check(await js(pref)===current&&await js(game)===gameBefore,'failed editor import changes neither preferences nor game');
  check(exceptions.length===0,'no uncaught browser exception');
  console.log('BODYFORGE_APPEARANCE_LAZY_PASS assertions='+checks);
}catch(error){console.error('BODYFORGE_APPEARANCE_LAZY_FAIL',error.stack||String(error));process.exitCode=24}
finally{
  if(paused&&socket?.readyState===WebSocket.OPEN)try{await cdp('Fetch.failRequest',{requestId:paused,errorReason:'Aborted'})}catch{}
  socket?.close();
  for(const r of pending.values()){clearTimeout(r.timer);r.reject(Error('QA stopped'))}
  pending.clear();
  try{await cleanupOwnedChrome(profile,prefix,chrome,browser)}catch(error){console.error('QA_OWNED_CLEANUP FAIL',String(error));process.exitCode||=25}
}
""".encode()}
# Backups and exact source compare before any worktree write.
for path,data in old.items():
 with (a/(Path(path).name+'.before')).open('xb') as f:f.write(data)
for path,data in old.items():assert (root/path).read_bytes()==data,path
for path,data in updates.items():
 target=root/path
 if path in old:target.write_bytes(data)
 else:
  with target.open('xb') as f:f.write(data)
 assert filehash(target)==sha(data)
 print('PATCH',path,len(data),sha(data),flush=True)
owned={p:sha(data) for p,data in updates.items()}
with (a/'owned.json').open('x',encoding='utf-8') as f:json.dump(owned,f,indent=2)
# Freeze all current tracked/untracked source inputs without private config or owner storage.
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
rows=[];seen=set()
for path in sorted(set(filter(None,files))):
 source=root/path;rel=Path(path)
 assert not rel.is_absolute() and '..' not in rel.parts and path.casefold() not in seen,path
 seen.add(path.casefold())
 assert source.is_file() and not source.is_symlink() and not getattr(source.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,path
 assert not any(x.startswith('.env') or x in ('.npmrc','.yarnrc') for x in rel.parts),path
 assert source.suffix.lower() not in ('.key','.pem','.p12','.pfx','.jks','.keystore','.apk','.aab'),path
 rows.append(dict(path=path,bytes=source.stat().st_size,sha256=filehash(source)))
assert set(owned).issubset({row['path'] for row in rows})
dest.mkdir(exist_ok=False)
for row in rows:
 target=dest/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/row['path'],target)
 assert filehash(target)==row['sha256'],row['path']
for row in rows:assert filehash(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
for name,content in [('source.json',json.dumps(rows,indent=2)),('head.txt',head+'\n')]:
 with (a/name).open('x',encoding='utf-8') as f:f.write(content)
print('SNAPSHOT',len(rows),filehash(a/'source.json'),flush=True)