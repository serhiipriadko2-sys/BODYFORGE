from pathlib import Path
import json, hashlib, shutil
root=Path.cwd()
a=root/'docs/audits/BF_102_CRASH_20261124'
old=root/'.bodyforge-qa/bf102-crash-stable-20261124'
copy=root/'.bodyforge-qa/bf102-seeded-crash-20261124'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
mfile=a/'frozen-source.json'
assert sha(mfile)=='577d035abcd58473f99dfc9ec1182bc8ea568ed06df0d55dd42408296ea70f7e'
manifest=json.loads(mfile.read_text(encoding='utf-8-sig'))
for row in manifest: assert sha(old/row['path'])==row['sha256'],row['path']
build=json.loads((a/'build-manifest.json').read_text(encoding='utf-8-sig'))
for row in build: assert sha(old/'dist'/row['path'])==row['sha256'],row['path']
target='qa/journal-e2e.mjs'
h='3cb62fc8c3296e432f312b66b299f6e08ff0afb5a0e16ec3faf973f194b3de5d'
assert sha(root/target)==h
copy.mkdir(exist_ok=False)
for row in manifest:
    f=row['path']
    src=(root if f==target else old)/f
    dest=copy/f
    dest.parent.mkdir(parents=True,exist_ok=True)
    if f==target: row.update(bytes=src.stat().st_size,sha256=h)
    shutil.copyfile(src,dest)
    assert sha(dest)==row['sha256'],f
(a/'seeded-source.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('SEEDED_SOURCE_READY',len(manifest),sha(a/'seeded-source.json'),flush=True)