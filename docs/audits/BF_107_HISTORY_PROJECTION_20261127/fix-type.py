from pathlib import Path
import hashlib,json,shutil
root=Path.cwd();a=root/'docs/audits/BF_107_HISTORY_PROJECTION_20261127'
copy=Path((a/'isolated-root.txt').read_text(encoding='utf-8-sig').strip())
def sha(b):return hashlib.sha256(b).hexdigest()
def hashfile(p):return sha(p.read_bytes())
g=json.loads((a/'gates.json').read_text(encoding='utf-8-sig'))
assert g['tsc']==2 and g['journal']=='NOT_RUN' and g['devStopped'] and g['previewStopped']
assert 'TS2448' in (a/'tsc.log').read_text(encoding='utf-8-sig')
owned=json.loads((a/'owned.json').read_text());rows=json.loads((a/'source.json').read_text())
assert hashfile(a/'source.json').upper()==g['sourceManifestSha256']
for x in rows:assert hashfile(copy/x['path'])==x['sha256'],x['path']
for p,h in owned.items():assert hashfile(root/p)==h,p
p='src/lib/durableJournal.ts';old=(root/p).read_bytes()
assert sha(old)==owned[p]==hashfile(copy/p)
before=b'              const value = project(row);\n              if (value !== undefined) entries.push(value);'
after=b'              const projected = project(row);\n              if (projected !== undefined) entries.push(projected);'
assert old.count(before)==1
new=old.replace(before,after)
for f in ['source.json','owned.json','gates.json','tsc.log']:
 with (a/(f+'.initial')).open('xb') as out:out.write((a/f).read_bytes())
with (a/'durableJournal.ts.before-typefix').open('xb') as out:out.write(old)
assert (root/p).read_bytes()==old and (copy/p).read_bytes()==old
(root/p).write_bytes(new);(copy/p).write_bytes(new)
owned[p]=sha(new)
for x in rows:
 if x['path']==p:x.update(bytes=len(new),sha256=sha(new))
(a/'source.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
(a/'owned.json').write_text(json.dumps(owned,indent=2),encoding='utf-8')
for x in rows:assert hashfile(copy/x['path'])==x['sha256']
print('TYPEFIX',len(new),sha(new),flush=True)