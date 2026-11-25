from pathlib import Path
from hashlib import sha256
import json
root=Path.cwd();a=root/'docs/audits/BF_106_JOURNAL_GATE_20261125';p=root/'qa/mobile-e2e.mjs'
old=p.read_bytes()
assert sha256(old).hexdigest()=='18e4fc3cfe1e71ff68e781e6cf14166ed5e41e6c6b06784f9d02e5908c0050b2'
log=(a/'final-run/mobile.log').read_text(encoding='utf-8-sig')
assert 'broken backup cannot be presented as verified' in log
assert 'Неоднозначная или слишком сложная структура JSON. Прогресс не изменён.' in log
s=old.decode('utf-8').replace('\r\n','\n')
needle='''  check(!!(await js("document.querySelector('.progress-backup-file-checker [role=status]')?.textContent.includes('не является корректным JSON')")),
    'broken backup cannot be presented as verified');'''
assert s.count(needle)==1
replacement='''  // Validate the rejected-file contract, not the old inspector's error wording.
  const rejectedBackup=await read("(()=>{const panel=document.querySelector('.progress-backup-file-checker'),notice=panel?.querySelector('[data-inspection-result]');return {state:panel?.dataset.inspectionState,result:notice?.dataset.inspectionResult,message:notice?.textContent?.trim(),hasPreview:!!panel?.querySelector('[data-import-preview]'),primary:localStorage.getItem('bodyforge:pilot:v1')}})()");
  check(rejectedBackup.state==='invalid' && rejectedBackup.result==='invalid' &&
    !!rejectedBackup.message && !rejectedBackup.hasPreview,
    'broken backup is rejected with no verified comparison');
  check(rejectedBackup.primary===beforeBackup,
    'rejecting malformed backup preserves exact wallet and reward history');'''
s=s.replace(needle,replacement)
with (a/'mobile-e2e.mjs.before').open('xb') as out:out.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode('utf-8'))
owned=json.loads((a/'owned-final.json').read_text(encoding='utf-8'));owned['qa/mobile-e2e.mjs']=sha256(p.read_bytes()).hexdigest()
(a/'owned-final.json').write_text(json.dumps(owned,indent=2),encoding='utf-8')
print('MOBILE_QA',p.stat().st_size,owned['qa/mobile-e2e.mjs'])