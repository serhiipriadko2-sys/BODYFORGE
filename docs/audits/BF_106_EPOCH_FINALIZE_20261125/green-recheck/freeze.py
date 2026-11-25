from pathlib import Path
import hashlib,json,shutil
root=Path.cwd();a=root/'docs/audits/BF_106_EPOCH_FINALIZE_20261125';old=root/'.bodyforge-qa/bf106-epoch-finalize-green';dest=root/'.bodyforge-qa/bf106-epoch-finalize-recheck'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
mf=a/'green-source.json'
assert sha(mf)=='8aa645be879ad03e0272047801d62554639b1f39a41fe8a2b40550898988d8ef'
rows=json.loads(mf.read_text(encoding='utf-8-sig'))
target='src/lib/avatarScalpDensity.test.ts'
h='52ddd93a9c78151213c73fcedcdd6f5175ac8e0b61e9e30341868be8d125be9a'
assert sha(root/target)==h
for r in rows:assert sha(old/r['path'])==r['sha256'],r['path']
dest.mkdir(exist_ok=False)
for r in rows:
 f=r['path'];src=(root if f==target else old)/f;p=dest/f;p.parent.mkdir(parents=True,exist_ok=True)
 if f==target:r.update(bytes=src.stat().st_size,sha256=h)
 shutil.copyfile(src,p);assert sha(p)==r['sha256'],f
(a/'green-recheck/source.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print('RECHECK_SOURCE',len(rows),sha(a/'green-recheck/source.json'),flush=True)