from pathlib import Path
from hashlib import sha256
p=Path('qa/profile-replacement-e2e.mjs')
a=Path('docs/audits/BF_106_EPOCH_FINALIZE_20261125')
old=p.read_bytes()
assert sha256(old).hexdigest()=='3e99c0e6cb337e9a2b2a0b719056f9dc6e897ae9102877e83b3a7dbf2a6fc0d0'
s=old.decode('utf-8')
x="""  while (Date.now() < deadline) {
    if (await ev(expression)) return;
    await sleep(100);
  }
  throw Error('TIMEOUT ' + label);"""
y="""  while (Date.now() < deadline) {
    try { if (await ev(expression)) return; }
    catch (error) {
      // Only read-only predicates may be retried during a navigation.
      // Never retry a click, storage write or an unrelated CDP failure.
      if (socket?.readyState !== WebSocket.OPEN ||
          !/Inspected target navigated or closed|Cannot find context with specified id|Execution context was destroyed/.test(String(error))) {
        throw Error('WAIT ' + label, { cause: error });
      }
    }
    await sleep(100);
  }
  throw Error('TIMEOUT ' + label);"""
assert s.count(x)==1
s=s.replace(x,y)
with (a/'profile-replacement-e2e.mjs.before-navigation-wait').open('xb') as f:f.write(old)
assert p.read_bytes()==old
p.write_bytes(s.encode())
print('QA_PATCH',p.stat().st_size,sha256(p.read_bytes()).hexdigest())