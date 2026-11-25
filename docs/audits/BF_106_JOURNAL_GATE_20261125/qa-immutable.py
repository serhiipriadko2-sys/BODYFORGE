from pathlib import Path
from hashlib import sha256
p=Path('qa/journal-gate-e2e.mjs')
s=p.read_text(encoding='utf-8')
assert sha256(p.read_bytes()).hexdigest()=='e0ea7e9f4ddd244c7f12febf4d95e5b156ef289ed0dbdc671594505cf5bac9b8'
s=s.replace("await hold(a,gate,'exclusive');await startStage(b,'queued');await pending(a,gate,'shared');", "await hold(a,gate,'exclusive');await startStage(b,'queued');await pending(a,gate,'shared');\n  await b.js(\"window.immutableRaw=entry.raw;entry.raw='caller-mutated-while-queued';true\");")
s=s.replace("stageResult.status==='saved' && stageResult.entries[0].raw===entry.raw\"),'queued result preserved exactly after release');", "stageResult.status==='saved' && stageResult.entries[0].raw===immutableRaw\"),'queued result preserves original payload despite caller mutation');\n  await b.js('entry.raw=immutableRaw;true');")
p.write_bytes(s.encode())
print('QA_HASH',sha256(p.read_bytes()).hexdigest())