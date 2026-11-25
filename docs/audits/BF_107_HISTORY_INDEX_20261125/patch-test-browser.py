from pathlib import Path
from hashlib import sha256
p=Path('src/lib/activityHistory.test.ts')
q=Path('qa/forge-home-xp-faq-e2e.mjs')
a=Path('docs/audits/BF_107_HISTORY_INDEX_20261125')
old=p.read_bytes(); browser=q.read_bytes()
assert sha256(old).hexdigest()=='f6c2ff44fb665a0109b3fed8ac59ccf347eff6ec4925ce32a65681555ebf115c'
assert sha256(browser).hexdigest()=='e9a217b21c0fdf28191bf9b5611f6e82b748a38111e5ecf7ca8e0f65ef9a78f1'
s=old.decode('utf-8').replace('\r\n','\n')
x="sessionId:'plank-old',exerciseId:'plank'"
assert s.count(x)==1
s=s.replace(x,x+',holdSeconds:30')
t=browser.decode('utf-8').replace('\r\n','\n')
x="  assert(browserErrors.length === 0, 'no uncaught exceptions while switching screens');"
assert t.count(x)==1
extra=r"""  // BF-107: all five older paid results actually exist in IndexedDB.
  // Seed only this disposable browser, under the application's lock order.
  const fullFixture = await js("(async()=>{const key='bodyforge:pilot:v1';const lock=await navigator.locks.request(key+':write',()=>navigator.locks.request(key+':durable-write',{mode:'exclusive'},async()=>{const profile=JSON.parse(localStorage.getItem(key));profile.profileId='bf107-history-qa';const now=new Date();const day=n=>new Date(now.getFullYear(),now.getMonth(),now.getDate()-n,12).toISOString();const rows=[...Array.from({length:5},(_,i)=>({id:'hidden-'+i,date:day(i===0?8:3)})),{id:'present-0',date:profile.workouts[0].finishedAt}].map(({id,date})=>({schemaVersion:1,key:key+':result:'+encodeURIComponent(id),raw:JSON.stringify({schemaVersion:1,profileId:profile.profileId,sessionId:id,mode:'training',floor:null,durationMs:65000,finishedAt:date,repetitions:20}),baseProfileRaw:null,state:'settled'}));const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('bodyforge:durable-results:v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{await new Promise((resolve,reject)=>{const tx=db.transaction('results','readwrite',{durability:'strict'});if(tx.durability!=='strict'){tx.abort();reject(Error('strict unavailable'));return}const store=tx.objectStore('results');const r=store.count();r.onsuccess=()=>{if(r.result!==0){tx.abort();return}for(const row of rows)store.add(row)};tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('fixture journal transaction failed'))});const raw=JSON.stringify(profile);localStorage.setItem(key,raw);const keys=Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]);return {raw,keys,rows}}finally{db.close()}}));return lock})()");
  assert(fullFixture.rows.length===6,'real IndexedDB fixture includes five older paid records plus one duplicate visible ID');
  await cdp('Page.reload', {ignoreCache:true});
  await until('!!document.querySelector(".app-shell[data-fighter-created=true] .mobile-nav") && !document.querySelector("[data-storage-status]")','full paid history hydrated');
  await click('.mobile-nav button:nth-child(2)');
  await until("(()=>{const d=document.querySelector('.pulse-trend-card:not([hidden])')?.dataset;return d?.historyIndex==='ready'&&d.historyLimited==='false'&&d.historyKnown==='65'&&d.historyRestored==='5'})()",'actual archive projection complete');
  for(const [range,sessions,reps,days] of [[7,64,1280,2],[30,65,1300,3]]){
    await js("(()=>{const el=document.querySelector('#pulse-activity-range');el.value='"+range+"';el.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await until("document.querySelector('[data-activity-period]')?.dataset.activityPeriod==='"+range+"'",'complete history range '+range);
    assert(await js("(()=>{const root=document.querySelector('.pulse-trend-card');return root.dataset.historyLimited==='false'&&root.querySelector('[data-period-sessions]').dataset.periodSessions==='"+sessions+"'&&root.querySelector('[data-period-reps]').textContent.trim()==='"+reps+"'&&root.querySelector('[data-active-days]').textContent.trim()==='"+days+"/"+range+"'&&root.querySelectorAll('.pulse-linechart circle').length==="+range+"&&root.querySelector('[data-pulse-delta]').dataset.pulseDelta==='"+(range===7?63:65)+"'})()"),'restored dates and exact comparison for '+range+' days');
  }
  await js('document.querySelector(".pulse-trend-card").scrollIntoView({block:"start",behavior:"instant"})');
  await snapshot('pulse-full-history-390.png');
  const afterHistory=await js("(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('bodyforge:durable-results:v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{const rows=await new Promise((resolve,reject)=>{const tx=db.transaction('results','readonly');const r=tx.objectStore('results').getAll();tx.oncomplete=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(Error('journal readback failed'))});return {keys:Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]),rows}}finally{db.close()}})()");
  assert(JSON.stringify(afterHistory.keys)===JSON.stringify(fullFixture.keys),'view and reload preserve all original localStorage bytes');
  const normalizedRows=rows=>rows.map(r=>[r.key,r.raw,r.baseProfileRaw,r.state,r.schemaVersion]).sort((a,b)=>a[0].localeCompare(b[0]));
  assert(JSON.stringify(normalizedRows(afterHistory.rows))===JSON.stringify(normalizedRows(fullFixture.rows)),'full history view leaves every IndexedDB original unchanged');
"""
t=t.replace(x,extra+x)
for f,data in [(a/'activityHistory.test.ts.before-hold-fixture',old),(a/'forge-home-xp-faq-e2e.mjs.before',browser)]:
 with f.open('xb') as out:out.write(data)
assert p.read_bytes()==old and q.read_bytes()==browser
p.write_bytes(s.encode());q.write_bytes(t.encode())
for f in [p,q]:print(f,f.stat().st_size,sha256(f.read_bytes()).hexdigest())