from pathlib import Path
import hashlib, json, subprocess, shutil
root=Path.cwd(); a=root/'docs/audits/BF_105_RECEIPT_SCHEMA_20261124'
old=root/'.bodyforge-qa/bf105-receipt-preview'
copy=root/'.bodyforge-qa/bf105-consolidated-receipts'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
mfile=a/'source.json'
assert sha(mfile)=='db211bacc9ad5470f3c2c97b8fd4814f95e1836609180e658693c4c3310e318a'
manifest=json.loads(mfile.read_text(encoding='utf-8-sig'))
assert len(manifest)==246
for row in manifest: assert sha(old/row['path'])==row['sha256'],row['path']
updates={
 'src/lib/receiptCompatibility.ts':'5312e5013f21eebea0ac5544858fc822aa4bb4ace650d7bf9c13249d4a04c471',
 'src/lib/receiptCompatibility.test.ts':'1585e9aff81ed6ecb4f4ce349c4cf8a743124cbcbbe7ae4167a0da31b271f85f',
 'src/lib/progression.ts':'666939a292869e188f9f64aad8ad4289c2a714594e1c2fa6a9e56249fa2934b1',
 'src/lib/workoutReceipt.ts':'0a4d55bc930aad4d0229b78ba351807838fc1beefb7d230e41a49b5d87b25a7f',
 'src/lib/workoutReceipt.test.ts':'40b362fe5cb7c2ecb50a0b7c33def42740b024b15e7fc3e7889fb7bb4dd6c8fd',
 'qa/receipt-preview-e2e.mjs':'e56b9065d78bf456dc9696dba3e4e71b9a5ba22e154582e7d14dfca9aa6687a1',
}
for f,h in updates.items(): assert sha(root/f)==h,f
assert sha(old/'src/lib/game.ts')==sha(root/'src/lib/game.ts')=='dfde50705323b8f75f1cf5a58dea93a12e128d7d095837e7f453b557ac6dc336'
manifest=[r for r in manifest if r['path'] not in updates]+[dict(path=f,bytes=(root/f).stat().st_size,sha256=h) for f,h in updates.items()]
manifest.sort(key=lambda r:r['path'])
copy.mkdir(exist_ok=False)
for row in manifest:
    f=row['path']; src=(root if f in updates else old)/f; dest=copy/f
    dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
    assert sha(dest)==row['sha256'],f
(a/'consolidated-source.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('SNAPSHOT',len(manifest),sha(a/'consolidated-source.json'),flush=True)