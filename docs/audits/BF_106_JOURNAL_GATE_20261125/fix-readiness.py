from pathlib import Path
from hashlib import sha256
import json,shutil
root=Path.cwd();a=root/'docs/audits/BF_106_JOURNAL_GATE_20261125';p=root/'qa/journal-e2e.mjs'
old=p.read_bytes();assert sha256(old).hexdigest()=='48aa98b6c64ea37b62cb11f14ebd75b16217d8868a518bfe8609a069e0e04067'
log=(a/'diagnostic.log').read_text(encoding='utf-8-sig')
assert 'DIAGNOSTIC_QUARANTINE_COMPLETE' in log and '"immediate":false' in log and '"eventual":true' in log
s=old.decode().replace('\r\n','\n')
a1="      check(await page.js(\"!!document.querySelector('[data-quarantined-results]')\"), item.name + ' preserved result remains visible in the working application');"
a2="      check(await page.js(\"!!document.querySelector('.app-shell') && !!document.querySelector('[data-quarantined-results]')\"), item.name + ' quarantine and usable profile survive real reload');"
assert s.count(a1)==1 and s.count(a2)==1
s=s.replace(a1,"      // The notice has its own lazy boundary; app-shell alone is not readiness.\n      await page.until(\"!!document.querySelector('[data-quarantined-results]')\", item.name + ' quarantine notice resolved');\n"+a1)
s=s.replace(a2,"      await page.until(\"!!document.querySelector('[data-quarantined-results]')\", item.name + ' quarantine notice after reload');\n"+a2)
with (a/'journal-e2e.mjs.before').open('xb') as f:f.write(old)
assert p.read_bytes()==old;p.write_bytes(s.encode())
owned=json.loads((a/'owned.json').read_text());owned['qa/journal-e2e.mjs']=sha256(p.read_bytes()).hexdigest()
(a/'owned-final.json').write_text(json.dumps(owned,indent=2),encoding='utf-8')
# Preserve earlier failed evidence; freeze same product bytes with ONLY QA readiness changed.
first=root/'.bodyforge-qa/bf106-journal-gate';copy=root/'.bodyforge-qa/bf106-journal-gate-final';r=a/'final-run'
assert sha256((a/'source.json').read_bytes()).hexdigest()=='53a23a8205240a4df533c73bcf77798015e7c53ddcb530d19ff16b2e14e75e2a'
manifest=json.loads((a/'source.json').read_text())
for row in manifest:
 assert sha256((first/row['path']).read_bytes()).hexdigest()==row['sha256'],row['path']
r.mkdir(exist_ok=False);copy.mkdir(exist_ok=False)
for row in manifest:
 f=row['path'];src=p if f=='qa/journal-e2e.mjs' else first/f;dest=copy/f
 if f=='qa/journal-e2e.mjs':row.update(bytes=p.stat().st_size,sha256=owned[f])
 dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
 assert sha256(dest.read_bytes()).hexdigest()==row['sha256'],f
(r/'source.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
shutil.copyfile(a/'head.txt',r/'head.txt')
print('QA_FIXED',p.stat().st_size,owned['qa/journal-e2e.mjs'])
print('FINAL_SOURCE',len(manifest),sha256((r/'source.json').read_bytes()).hexdigest())