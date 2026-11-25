from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_STORAGE_CAPACITY_20261125')
p=Path('src/lib/storageCapacity.ts')
t=Path('src/lib/storageCapacity.test.ts')
q=Path('src/components/ProgressBackupPanel.tsx')
css=Path('src/components/progressBackup.css')
qa=Path('qa/mobile-e2e.mjs')
expected={p:'a24459a7abbc04e7264a6b46f42cd9dce838c1ac3bccfa0d9e367be2650dca7d',t:'5bd74c369c13fc755ed92fee6a212d1cce63b88bf762a78b207937cf3292db3c',q:'bcf88dbe972f1c35d3f04dfed2f808b1d432cb640029780a5296f117e6ca4c3b',css:'b6ab3ea86a2938f1271aad02609ddd98546194eda4f8f41013a7d1cd3f8bf38e',qa:'d8bad97f3aef80286c619587f16e3714189a50166b390d71668ae3de804f5dc7'}
old={f:f.read_bytes() for f in expected}
for f,h in expected.items():assert sha256(old[f]).hexdigest()==h,f
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=old[p].decode('utf-8').replace('\r\n','\n')
s=once(s,"export const LOCAL_STORAGE_WARNING_BYTES = 3 * MIB;","""export const LOCAL_STORAGE_WARNING_BYTES = 3 * MIB;
export const STORAGE_OBSERVATION_TIMEOUT_MS = 2000;""")
s=once(s,"/** Origin estimate includes browser-managed storage", """/** A failed or stalled read is unknown; late results cannot change it. */
function observe<T>(read: () => T | Promise<T> | undefined): Promise<T | undefined> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(undefined), STORAGE_OBSERVATION_TIMEOUT_MS);
    Promise.resolve().then(read).then(value => {
      clearTimeout(timer);
      resolve(value);
    }, () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

/** Origin estimate includes browser-managed storage""")
start=s.index("  let origin: StorageCapacity['origin'] = null;")
end=s.index("  return { local, origin, persistent };",start)
s=s[:start]+"""  let manager: StorageManager | undefined;
  try { manager = globalThis.navigator?.storage; } catch { /* denied */ }
  const [estimate, persisted] = await Promise.all([
    observe(() => manager?.estimate?.()),
    observe(() => manager?.persisted?.()),
  ]);
  const usage = estimate?.usage, quota = estimate?.quota;
  const origin = typeof usage === 'number' && typeof quota === 'number' &&
    Number.isFinite(usage) && Number.isFinite(quota) && usage >= 0 && quota > 0
      ? { usage, quota } : null;
  const persistent = typeof persisted === 'boolean' ? persisted : null;
"""+s[end:]
v=old[t].decode('utf-8').replace('\r\n','\n')
v=once(v,"readStorageCapacity, MIB }","readStorageCapacity, MIB, STORAGE_OBSERVATION_TIMEOUT_MS }")
v=once(v,"afterEach(() => vi.unstubAllGlobals());","afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });")
anchor="  it('preserves known measurements if other APIs deny access or return invalid numbers', async () => {"
v=once(v,anchor,"""  it('bounds a stalled read, retains the other observation and ignores late completion', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', reader([['k', 'v']]));
    let finish!: (value: StorageEstimate) => void;
    vi.stubGlobal('navigator', { storage: {
      estimate: () => new Promise<StorageEstimate>(resolve => { finish = resolve; }),
      persisted: async () => true,
    } });
    const pending = readStorageCapacity();
    await vi.advanceTimersByTimeAsync(STORAGE_OBSERVATION_TIMEOUT_MS);
    const value = await pending;
    expect(value).toEqual({ local: { state: 'observed', estimatedBytes: 4, warning: false },
      origin: null, persistent: true });
    finish({ usage: MIB, quota: 10 * MIB });
    await Promise.resolve();
    expect(value.origin).toBeNull();
  });
"""+anchor)
z=old[q].decode('utf-8').replace('\r\n','\n')
z=once(z,"  async function measureCapacity() {\n    const request", "  async function measureCapacity() {\n    if (disabled || measuring) return;\n    const request")
z=once(z,"    if (!disabled) return;\n    generation.current++;\n    invalidateImport();","    if (!disabled) return;\n    generation.current++;\n    invalidateImport();\n    invalidateCapacity();")
z=once(z,"    window.addEventListener('pagehide', invalidateImport);\n    return () => {\n      window.removeEventListener('pagehide', invalidateImport);","    const pageHidden = () => { invalidateImport(); invalidateCapacity(); };\n    window.addEventListener('pagehide', pageHidden);\n    return () => {\n      window.removeEventListener('pagehide', pageHidden);")
z=once(z,"? (capacity.local.warning ? 'advisory' : 'none') : 'unknown'}>","? (capacity.local.warning ? 'advisory' : 'none') : 'unknown'}\n            data-local-storage-bytes={capacity.local.state === 'observed' ? capacity.local.estimatedBytes : undefined}>")
z=once(z,"(оценка по строкам).","(оценка по строкам на момент проверки).")
z=once(z,"История занимает много места.","Локальные записи занимают много места.")
w=old[css].decode('utf-8').replace('\r\n','\n')
for sel in ['.progress-install-help {','.progress-install-help summary {','.progress-install-help summary:focus-visible {']:
 w=once(w,sel,sel[:-2]+',\n'+sel.replace('.progress-install-help','.progress-storage-capacity'))
w+="\n/* Advisory readings are not a quota guarantee. */\n.progress-storage-capacity [data-capacity-warning='advisory'] p { color: #ffd6ab; }\n.progress-backup-actions [data-backup-capacity='near-limit'],\n.progress-backup-actions [data-backup-capacity='oversize'] { color: #ffd6ab; }\n"
j=old[qa].decode('utf-8').replace('\r\n','\n')
anchor='  const beforeBackup = await js("localStorage.getItem(\'bodyforge:pilot:v1\')");'
j=once(j,anchor,anchor+r"""
  // Capacity observation is explicit and read-only. Pad only this disposable origin.
  const capacityBytes = await js("(()=>{localStorage.setItem('bf-qa-capacity-pad','x'.repeat(1600*1024));window.__bfCapacityBefore=Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]);window.__bfPersistCalls=0;Object.defineProperty(navigator.storage,'persist',{configurable:true,value:async()=>{window.__bfPersistCalls++;return false}});return window.__bfCapacityBefore.reduce((n,[k,v])=>n+2*(k.length+v.length),0)})()");
  await js("document.querySelector('.progress-storage-capacity').open=true;true");
  await click('[data-action=measure-storage-capacity]');
  await until("document.querySelector('[data-storage-capacity]')?.dataset.storageCapacity==='observed'", 'storage observation complete', 10000);
  check(await js("document.querySelector('[data-capacity-warning]')?.dataset.capacityWarning==='advisory'&&Number(document.querySelector('[data-local-storage-bytes]')?.dataset.localStorageBytes)==="+capacityBytes),
    'storage panel measures observed string size and displays advisory warning');
  check(await js("JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))===JSON.stringify(window.__bfCapacityBefore)&&window.__bfPersistCalls===0"),
    'capacity check performs no local mutation or persistence request');
  await js("(()=>{localStorage.removeItem('bf-qa-capacity-pad');delete window.__bfCapacityBefore;window.dispatchEvent(new StorageEvent('storage',{key:'bf-qa-capacity-pad',newValue:null}));return true})()");
  await until("document.querySelector('[data-storage-capacity]')?.dataset.storageCapacity==='idle'", 'capacity invalidated after external change');
  await click('[data-action=measure-storage-capacity]');
  await until("document.querySelector('[data-capacity-warning]')?.dataset.capacityWarning==='none'", 'new low-usage observation');
  check(await js("localStorage.getItem('bf-qa-capacity-pad')===null&&window.__bfPersistCalls===0"),'refresh reports new observation without claiming quota');
  await js("document.querySelector('.progress-storage-capacity').open=false;true");
""")
anchor2="  await click('#progress-backup [data-action=download-progress]');"
j=once(j,anchor2,r"""  check(await js("document.querySelector('[data-backup-capacity]')?.dataset.backupCapacity==='within-limit'&&Number(document.querySelector('[data-backup-bytes]')?.dataset.backupBytes)>0"),
    'prepared file exposes its measured byte size and capacity classification');
"""+anchor2)
anchor3="  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});"
j=once(j,anchor3,r"""  // Oversized opaque IndexedDB evidence; only the disposable QA origin is seeded.
  const largeFixture = await js("(async()=>{const k='bodyforge:pilot:v1';return navigator.locks.request(k+':write',()=>navigator.locks.request(k+':durable-write',{mode:'exclusive'},async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('bodyforge:durable-results:v1',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});try{const row={schemaVersion:1,key:k+':result:qa-large-evidence',raw:'{}',baseProfileRaw:'я'.repeat(8*1024*1024),state:'quarantined'};await new Promise((res,rej)=>{const tx=db.transaction('results','readwrite',{durability:'strict'});tx.objectStore('results').add(row);tx.oncomplete=res;tx.onabort=tx.onerror=()=>rej(Error('large fixture failed'))});return row.baseProfileRaw.length}finally{db.close()}}))})()");
  check(largeFixture===8*1024*1024,'disposable journal contains oversized multibyte evidence');
  await click('[data-action=prepare-progress]');
  await until("document.querySelector('[data-backup-capacity]')?.dataset.backupCapacity==='oversize'",'oversize prepared warning',20000);
  check(await js("Number(document.querySelector('[data-backup-bytes]')?.dataset.backupBytes)>16*1024*1024&&document.querySelector('[data-action=download-progress]')?.textContent.includes('ДЛЯ РАЗБОРА')&&document.querySelector('[data-backup-status]')?.textContent.includes('Не очищай')"),
    'oversize evidence download is not presented as an inspectable backup');
  await click('[data-action=download-progress]');
  const largeExport = await js("(async()=>{const sample=window.__bfExportSample,value=JSON.parse(await sample.blob.text());const row=value.durableResults.find(r=>r.key==='bodyforge:pilot:v1:result:qa-large-evidence');return {name:sample.filename,size:sample.blob.size,rawPreserved:row?.raw==='{}'&&row?.baseProfileRaw==='я'.repeat(8*1024*1024),profile:value.storedProfileRaw}})()");
  check(largeExport.name.startsWith('bodyforge-backup-evidence-')&&largeExport.size>16*1024*1024&&largeExport.rawPreserved&&largeExport.profile===beforeBackup,
    'large export retains exact original evidence and unchanged wallet');
  await js("(()=>{const input=document.querySelector('[data-action=inspect-progress-file]'),transfer=new DataTransfer();transfer.items.add(new File([window.__bfExportSample.blob],'large-evidence.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
  await until("document.querySelector('.progress-backup-file-checker')?.dataset.inspectionState==='invalid'",'oversize import preflight rejected',10000);
  check(await js("!document.querySelector('[data-import-preview]')&&document.querySelector('[data-inspection-result]')?.textContent.includes('16 МБ')"),'actual selected oversize file is refused before import');
  await js("(async()=>{const k='bodyforge:pilot:v1';return navigator.locks.request(k+':write',()=>navigator.locks.request(k+':durable-write',{mode:'exclusive'},async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('bodyforge:durable-results:v1',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});try{await new Promise((res,rej)=>{const tx=db.transaction('results','readwrite',{durability:'strict'});tx.objectStore('results').delete(k+':result:qa-large-evidence');tx.oncomplete=res;tx.onabort=tx.onerror=()=>rej(Error('fixture cleanup failed'))});window.__bfExportBlobs.clear();delete window.__bfExportSample;return true}finally{db.close()}}))})()");
  check(await js("localStorage.getItem('bodyforge:pilot:v1')")===beforeBackup,'large backup and rejected import never rewrite the wallet');
"""+anchor3)
for f,data in old.items():
 with (a/(f.name+'.before-ui-qa')).open('xb') as out:out.write(data)
for f,data in old.items():assert f.read_bytes()==data
for f,content in [(p,s),(t,v),(q,z),(css,w),(qa,j)]:
 f.write_bytes(content.encode('utf-8'));print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())