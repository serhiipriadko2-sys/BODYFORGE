from pathlib import Path
from hashlib import sha256
a=Path('docs/audits/BF_107_JOURNAL_WRITE_SCALE_20261125')
p=Path('src/lib/durableJournal.ts')
q=Path('qa/durable-journal-e2e.mjs')
old=p.read_bytes()
qa=q.read_bytes()
assert sha256(old).hexdigest()=='082ab2cb783507a0273ddd244afbd1662d6b7bb7408adfe8eb0250b7ba50861f'
assert sha256(qa).hexdigest()=='7859e33cdd8a969c5ea315314c475c05bb0104e287dad530a3226d66b19251c2'
s=old.decode().replace('\r\n','\n')
t=qa.decode().replace('\r\n','\n')
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
s=once(s,"      const apply = () => {\n        for (const entry of unique.values()) {","      const apply = () => {\n        const writes: StoredEntry[] = [];\n        for (const entry of unique.values()) {")
s=once(s,"""          expected.set(entry.key, row ? { ...row, ...(state ? { state } : {}) }
            : { schemaVersion: 1, ...entry, baseProfileRaw, state: 'active' });
        }
        for (const row of expected.values()) store.put(row);""","""          const next: StoredEntry = row ? { ...row, ...(state ? { state } : {}) }
            : { schemaVersion: 1, ...entry, baseProfileRaw, state: 'active' };
          expected.set(entry.key, next);
          // Keep all original receipts in the readback contract, but avoid
          // rewriting unchanged terminal rows and their full baseline snapshots.
          // New/active rows and actual state transitions still require a put.
          if (!row || row.state === 'active' || row.state !== next.state) writes.push(next);
        }
        // Validate the entire batch before issuing any writes, even on retries.
        for (const row of writes) store.put(row);""")
anchor="  await test(\"(async()=>{const r=await mod.stageDurableResults([entry,entry],'baseline-B');return r.status==='saved'&&(await mod.readDurableJournal()).entries.length===1&&(await mod.readDurableJournal()).entries[0].baseProfileRaw==='baseline-A'})()\", 'idempotent duplicate keeps the first baseline and one row');"
t=once(t,anchor,anchor+"""
  await test("(async()=>{const put=IDBObjectStore.prototype.put;let puts=0;IDBObjectStore.prototype.put=function(...args){puts++;return put.apply(this,args)};try{const r=await mod.stageDurableResults([entry],'other');return r.status==='saved'&&r.entries[0].state==='active'&&r.entries[0].baseProfileRaw==='baseline-A'&&puts===1}finally{IDBObjectStore.prototype.put=put}})()", 'active duplicate still issues one strict put');""")
t=once(t,"let puts=0,reads=0,completed=false;IDBObjectStore.prototype.put", "let puts=0,reads=0,completed=false,strict=false;IDBObjectStore.prototype.put")
t=once(t,"if(tx.mode==='readwrite'){tx.addEventListener('complete',()=>completed=true)}else if(completed)", "if(tx.mode==='readwrite'){strict=tx.durability==='strict';tx.addEventListener('complete',()=>completed=true)}else if(completed)")
t=once(t,"r.status==='saved'&&completed&&reads>0&&puts===0", "r.status==='saved'&&strict&&completed&&reads>0&&puts===0")
for name,data in [('durableJournal.ts.before',old),('durable-journal-e2e.mjs.before-production',qa)]:
 with (a/name).open('xb') as f:f.write(data)
assert p.read_bytes()==old and q.read_bytes()==qa
p.write_bytes(s.encode())
q.write_bytes(t.encode())
for f in [p,q]:print(f, f.stat().st_size,sha256(f.read_bytes()).hexdigest())