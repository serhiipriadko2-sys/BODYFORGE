from pathlib import Path
import json, hashlib, shutil
root=Path.cwd()
a=root/'docs/audits/BF_102_CRASH_20261124'
previous=root/'.bodyforge-qa/bf102-journal-identity-20261124'
copy=root/'.bodyforge-qa/bf102-crash-stable-20261124'
old_manifest=root/'docs/audits/BF_102_JOURNAL_IDENTITY_20261124/frozen-source.json'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(old_manifest)=='ef544a36462d65ed37525df9dd730297320addc03dee6c48d770013b42de36cc'
owned={'qa/journal-e2e.mjs':'d97cc41f3908c44ce9f315f94481fab626f5bc9274a847e05e2bdd603cd7e979','qa/multitab-e2e.mjs':'5d31989d6d52e239080cd0e8f66d5f4c671f57c7461ec76c793a0b090043f225','qa/owned-chrome.mjs':'74e48a598f39c0aafe5148adf936abfe124e125ab4420ddf71e0b09ab471bcb1','qa/owned-chrome.test.mjs':'e8c50ed1a87a9a60f48701f493817b62b997836c375fece720da261814403fe0'}
old=json.loads(old_manifest.read_text(encoding='utf-8-sig'))
assert isinstance(old,list) and len(old)==227
for row in old: assert sha(previous/row['path'])==row['sha256'], row['path']
for f,h in owned.items(): assert sha(root/f)==h, f
manifest=[r for r in old if r['path'] not in owned]+[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in owned.items()]
manifest.sort(key=lambda x:x['path'])
copy.mkdir(exist_ok=False)
for row in manifest:
    f=row['path']; source=(root if f in owned else previous)/f
    dest=copy/f
    dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(source,dest)
    assert sha(dest)==row['sha256'],f
(a/'frozen-source.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('FROZEN_SOURCE_READY',len(manifest),sha(a/'frozen-source.json'),flush=True)