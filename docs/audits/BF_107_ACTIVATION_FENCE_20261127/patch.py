from pathlib import Path
import hashlib,json,subprocess,shutil,stat,tempfile
root=Path.cwd()
a=root/'docs/audits/BF_107_ACTIVATION_FENCE_20261127'
expected={'src/lib/durableJournalV2.ts':'8e4cb526cae1545cd18dd613a1b0c931434d9411dd19892c774784d81d386834','qa/durable-journal-e2e.mjs':'ad488ff4f9a39bc719f8adc40cff1c521e897d769a680b1073c22e86c487597a'}
def sha(b):return hashlib.sha256(b).hexdigest()
def hashfile(p):return sha(p.read_bytes())
def once(s,x,y):
 assert s.count(x)==1,x
 return s.replace(x,y)
def staged(f):
 s=(a/f).read_text(encoding='utf-8-sig')
 assert s.strip() and '\x00' not in s
 return s.rstrip()+'\n'
old={p:(root/p).read_bytes() for p in expected}
for p,h in expected.items():assert sha(old[p])==h,p
p,q=expected
s=old[p].decode().replace('\r\n','\n')
s=once(s,"import { withProfileWriteLock } from './profileLock';",
"""import { withProfileWriteLock } from './profileLock';
import { proveJournalActivation, type JournalActivationProof } from './journalActivationProof';""")
s=once(s,'function upgrade(signal?: AbortSignal): Promise<PrepareVersionedResult> {','function upgrade(signal?: AbortSignal, proof?: JournalActivationProof): Promise<PrepareVersionedResult> {')
s=once(s,"    if (signal?.aborted || typeof indexedDB === 'undefined') { resolve(failed('unavailable')); return; }",
"""    if (signal?.aborted || typeof indexedDB === 'undefined') { resolve(failed('unavailable')); return; }
    if (proof && !proof.matchesLocal()) { resolve(failed('invalid')); return; }""")
s=once(s,"          const cursor = store.openCursor();\n          cursor.onsuccess = () => {",
"""          let count = 0;
          const cursor = store.openCursor();
          cursor.onsuccess = () => {""")
s=once(s,"              if (!row) { meta.add(marker(0)); return; }\n              if (!original(row.value)) { invalid=true; tx?.abort(); return; }\n              row.continue();",
"""              if (!row) {
                if (proof && (count !== proof.rows.size || !proof.matchesLocal())) { invalid=true; tx?.abort(); return; }
                meta.add(marker(0)); return;
              }
              const value = original(row.value);
              if (!value || (proof && !matchesProofRow(proof,value))) { invalid=true; tx?.abort(); return; }
              count++; row.continue();""")
s=once(s,"            const checked = await readVersionedJournal<never>(db,()=>undefined,signal);\n            finish(checked.status==='ready' && !signal?.aborted",
"""            const checked = await readVersionedJournal<DurableJournalEntry>(db,row=>proof?row:undefined,signal);
            const exact = !proof || (checked.entries.length === proof.rows.size &&
              checked.entries.every(row=>matchesProofRow(proof,row)) && proof.matchesLocal());
            finish(checked.status==='ready' && exact && !signal?.aborted""")
s=s.rstrip()+'\n'+staged('activation.stage')
s=once(s,"    return upgraded.status==='invalid' ? activationFailure('stale') : upgraded;",
"""    if (upgraded.status==='prepared' || upgraded.status==='already-prepared') {
      return {status:upgraded.status,versionConfirmed:2};
    }
    return activationFailure(upgraded.status==='invalid'?'stale':upgraded.status);""")
z=old[q].decode().replace('\r\n','\n')
anchor="  console.log('BODYFORGE_DURABLE_JOURNAL_PASS',"
z=once(z,anchor,staged('qa.stage')+anchor)
new='src/lib/journalActivationProof.ts'
assert not (root/new).exists()
updates={p:s.encode(),q:z.encode(),new:staged('proof.stage').encode()}
adr="""# BF-107 - activation fence
Status: accepted for local implementation and disposable-profile QA only; no owner activation or UI call site.
Context: raw v2 preparation validates structure but is not bound to a selected backup. Version upgrade is irreversible for older v1 clients.
Decision: require bounded strict backup preview, exact primary/fallback/auxiliary bytes, valid local epoch, quiet local stores and exact paid originals. Issue a frozen single-use in-memory plan without creating a missing DB or writing rows. Confirmation consumes the plan. Recheck under profile then exclusive journal lock, compare every native legacy row inside versionchange before committing metadata, and verify exact logical rows and local state after commit. Cancellation, stale evidence and malformed records refuse migration. Lost read-back is unverified, never asserted rollback. Keep the low-level preparation primitive for existing isolated tests; guarded flow is the candidate for future owner use.
Alternatives: auto-upgrade rejected; UI activation deferred until device/compatibility acceptance; backup inspection alone rejected; metadata-only preflight insufficient.
Limitations: proof compares the selected bytes, not a file's provenance or successful disk download. No cross-origin recovery guarantee, no arbitrary-writer security boundary, no ability to downgrade native version, no migration of owner data. Caller must be quiescent including RAM-only results. A larger-than-supported backup or unsettled/foreign/ambiguous history is refused rather than silently truncated.
Tests: genuine paid workout + actual backup, read-only preflight, fake/cancelled/stale plan, mismatched original, blocked/aborted upgrade, race within versionchange, exact postcondition, lost post-commit readback, absent database. Full tests/build/production game/mobile/privacy on frozen source.
Rollback: restore only hash-matching owned v2 and QA sources from .before, remove unchanged new proof module. Never downgrade a migrated DB. Delta: explicit backup-bound migration gate, readback: native QA, confidence: local only, revisit: physical device acceptance/owner decision.
"""
with (a/'ADR.md').open('x',encoding='utf-8') as f:f.write(adr)
for path,data in old.items():
 with (a/(Path(path).name+'.before')).open('xb') as f:f.write(data)
for path,data in old.items():assert (root/path).read_bytes()==data,path
for path,data in updates.items():
 if path==new:
  with (root/path).open('xb') as f:f.write(data)
 else:(root/path).write_bytes(data)
 assert hashfile(root/path)==sha(data)
 print('PATCH',path,len(data),sha(data),flush=True)
owned={p:sha(data) for p,data in updates.items()}
(a/'owned.json').write_text(json.dumps(owned,indent=2),encoding='utf-8')
d=Path(tempfile.mkdtemp(prefix='bodyforge-isolated-qa-')).resolve()
assert not d.is_relative_to(root.resolve()) and d.parent==Path(tempfile.gettempdir()).resolve()
head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z','--','src','public','qa']).decode().split('\0')
files+=['index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json']
rows=[];seen=set()
for name in sorted(set(filter(None,files))):
 src=root/name;rel=Path(name)
 assert not rel.is_absolute() and '..' not in rel.parts and name.casefold() not in seen,name
 seen.add(name.casefold())
 assert src.is_file() and not src.is_symlink() and not getattr(src.stat(),'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT,name
 assert not any(x.startswith('.env') or x in ('.npmrc','.yarnrc') for x in rel.parts),name
 assert src.suffix.lower() not in ('.key','.pem','.p12','.pfx','.jks','.keystore','.apk','.aab'),name
 rows.append(dict(path=name,bytes=src.stat().st_size,sha256=hashfile(src)))
assert all(next(x for x in rows if x['path']==name)['sha256']==h for name,h in owned.items())
for row in rows:
 target=d/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/row['path'],target)
 assert hashfile(target)==row['sha256'],row['path']
for row in rows:assert hashfile(root/row['path'])==row['sha256'],row['path']
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==head
for name,content in [('source.json',json.dumps(rows,indent=2)),('head.txt',head+'\n'),('isolated-root.txt',str(d))]:
 with (a/name).open('x',encoding='utf-8') as out:out.write(content)
print('SNAPSHOT',len(rows),hashfile(a/'source.json'),flush=True)
verify=(root/'docs/audits/BF_107_V2_GAME_FLOW_20261127/verify.ps1').read_text(encoding='utf-8-sig')
verify=once(verify,'BF_107_V2_GAME_FLOW_20261127','BF_107_ACTIVATION_FENCE_20261127')
with (a/'verify.ps1').open('x',encoding='utf-8',newline='\n') as f:f.write(verify)
