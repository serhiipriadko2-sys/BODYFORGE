from pathlib import Path
from hashlib import sha256
base=Path('qa/receipt-preview-e2e.mjs')
assert sha256(base.read_bytes()).hexdigest()=='8ce311347cf7cbaf25b334df460f093e7ca32557dbcb5ef34a9107fbcc7d77cc'
s=base.read_text(encoding='utf-8')
start=s.index('async function inspect()')
end=s.index('\ntry {\n  await requireDevOrigin(origin);',start)
s=s[:start]+"""async function makeBackup() {
  const p = await import('/src/lib/progression.ts');
  const { prepareProgressBackup } = await import('/src/lib/progressBackup.ts');
  const state = p.loadProfileState();
  if (state.status !== 'ready') throw Error('Fixture not ready');
  const prepared = await prepareProgressBackup(state.profile, null, new Date('2026-11-25T12:00:00Z'));
  if (!prepared.complete) throw Error('Fixture export incomplete');
  const envelope = JSON.parse(prepared.json);
  const next = p.addCompletedWorkout(state.profile, 38000, new Date('2026-11-25T12:01:00Z'), {
    sessionId: 'preview-only-fourth', mode: 'training',
  });
  envelope.storedProfileRaw = JSON.stringify(next);
  envelope.xp = 999999; envelope.coins = 999999; // Must ignore display mirror.
  return { json: JSON.stringify(envelope), xp: next.xp, coins: next.coins, workouts: next.totals.workouts };
}
async function snapshot() {
  const { readDurableJournal } = await import('/src/lib/durableJournal.ts');
  const result = await readDurableJournal();
  return JSON.stringify({
    local: Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]),
    durable: { status: result.status, entries: [...result.entries].sort((a,b) => a.key.localeCompare(b.key)) },
  });
}
function selectFixture(payload, kind) {
  const input = document.querySelector('[data-action=inspect-progress-file]');
  const contents = kind === 'oversize' ? [new Uint8Array(16*1024*1024+1)] :
    kind === 'bad-utf8' ? [new Uint8Array([0xc3,0x28])] : [payload];
  const file = new File(contents, 'bf106-' + kind + '.json', { type: 'application/json' });
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
async function choose(payload, kind = 'valid') {
  return ev('('+selectFixture.toString()+')('+JSON.stringify(payload)+','+JSON.stringify(kind)+')');
}
async function cancel() {
  check(await ev("(()=>{const b=document.querySelector('[data-action=cancel-import-preview]');if(!b)return false;b.click();return true})()"),'explicit cancel available');
  await until("document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle' && !document.querySelector('[data-import-preview]')",'preview cleared');
}
"""+s[end:]
start=s.index('  const expected = fixture.value;')
end=s.index('} catch(error) {',start)
s=s[:start]+"""  const expected = fixture.value;
  const backup = await ev('('+makeBackup.toString()+')()');
  check(backup.xp===825 && backup.coins===335 && backup.workouts===4,'backup candidate has independent totals');
  await cdp('Fetch.disable');
  await cdp('Page.navigate',{url:origin+'/'});
  await until("!!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual fighter hydrated');
  await ev("document.querySelector('.mobile-nav button:nth-child(6)').click()");
  await until("!!document.querySelector('#progress-backup [data-action=inspect-progress-file]')",'FAQ backup panel mounted');
  await ev("document.querySelector('.progress-backup-file-checker').open=true");
  await sleep(300);
  const before = await ev('('+snapshot.toString()+')()');
  const unchanged = async label => check(await ev('('+snapshot.toString()+')()')===before,label+' exact localStorage and durable journal unchanged');
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===expected.raw,'initial primary exact');
  await choose(backup.json);
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'comparison rendered');
  const rows = await ev("Array.from(document.querySelectorAll('[data-import-preview] tbody tr')).map(row=>Array.from(row.querySelectorAll('td')).map(c=>Number(c.textContent.replace(/[^0-9.-]/g,''))))");
  check(rows.length===8 && JSON.stringify(rows.slice(0,4))===JSON.stringify([[705,825],[300,335],[3,4],[3,4]]),'visible comparison uses authoritative stored source');
  check(await ev("document.documentElement.scrollWidth===innerWidth"),'390px layout has no horizontal overflow');
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(250);
  const narrow=await ev("(()=>{const t=document.querySelector('[data-import-preview] table').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,left:t.left,right:t.right}})()");
  check(narrow.width===320&&narrow.scroll===320&&narrow.left>=0&&narrow.right<=320,'320px comparison remains inside viewport');
  await unchanged('valid preview');
  await cancel();
  await unchanged('cancel');
  await choose('{','bad-json');
  await until("document.querySelector('[data-inspection-result]')?.dataset.inspectionResult==='invalid'",'malformed JSON rejected');
  check(await ev("!document.querySelector('[data-import-preview]')"),'invalid JSON cannot show comparison');
  await unchanged('invalid JSON');
  await choose('', 'bad-utf8');
  await until("document.querySelector('[data-inspection-result]')?.dataset.inspectionResult==='invalid'",'invalid UTF-8 rejected');
  await unchanged('invalid UTF-8');
  await cancel();
  // Real file input uses the production File.size preflight.
  await ev("window.__bf106Reads=0;window.__bf106ArrayBuffer=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name.startsWith('bf106-'))window.__bf106Reads++;return window.__bf106ArrayBuffer.call(this)};true");
  await choose('', 'oversize');
  await until("document.querySelector('[data-inspection-result]')?.dataset.inspectionResult==='invalid'",'oversized file rejected');
  check(await ev('window.__bf106Reads===0'),'oversized file never read');
  await unchanged('oversize');
  await cancel();
  // Delay only the selected File; abort the UI generation while reading.
  await ev("File.prototype.arrayBuffer=function(){if(this.name==='bf106-delayed.json'){const file=this;return new Promise(resolve=>{window.__bf106Release=()=>resolve(window.__bf106ArrayBuffer.call(file))})}return window.__bf106ArrayBuffer.call(this)};true");
  await choose(backup.json,'delayed');
  await until("typeof window.__bf106Release==='function' && document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='checking'",'delayed file read pending');
  await cancel();
  await ev("window.__bf106Release();File.prototype.arrayBuffer=window.__bf106ArrayBuffer;true");
  await sleep(300);
  check(await ev("!document.querySelector('[data-import-preview]') && document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle'"),'cancelled read cannot restore stale preview');
  await unchanged('cancelled async read');
  await choose(backup.json);
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'fresh selection works after cancel');
  await ev("window.dispatchEvent(new StorageEvent('storage',{key:'bodyforge:pilot:v1'}));true");
  await until("!document.querySelector('[data-import-preview]') && document.querySelector('[data-inspection-state]')?.dataset.inspectionState==='idle'",'external revision invalidates preview');
  await unchanged('revision invalidation');
  await choose(backup.json);
  await until("document.querySelector('[data-import-preview]')?.dataset.importPreview==='preview-ready'",'preview rebuilt');
  await ev("window.__bf106BeforeReload=true");
  await cdp('Page.reload',{ignoreCache:true});
  await until("!window.__bf106BeforeReload && !!document.querySelector('.app-shell[data-fighter-created=true]') && !document.querySelector('[data-storage-status]')",'actual reload');
  await sleep(300);
  check(await ev("localStorage.getItem('bodyforge:pilot:v1')")===expected.raw,'reload preserves exact original primary');
  await unchanged('reload');
  check(errors.length===0,'no uncaught browser exceptions');
  console.log('BODYFORGE_IMPORT_PREVIEW_E2E_PASS assertions='+assertions);
"""+s[end:]
s=s.replace('// BF-105: real browser round-trip of the existing v1 wallet and receipt preview.','// BF-106: actual Settings file input and read-only import comparison.')
s=s.replace('// Deliberately seeded completions, not a claim of camera accuracy or import support.','// Synthetic fixture only; no replacement operation exists.')
s=s.replace('bf-receipt-preview-','bf-import-preview-').replace('BF105 disposable observer','BF106 disposable observer').replace('BODYFORGE_RECEIPT_PREVIEW_E2E_FAIL','BODYFORGE_IMPORT_PREVIEW_E2E_FAIL')
p=Path('qa/import-preview-e2e.mjs')
with p.open('x',encoding='utf-8',newline='\n') as f: f.write(s)
print(p,p.stat().st_size,sha256(p.read_bytes()).hexdigest())