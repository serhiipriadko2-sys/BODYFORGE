from pathlib import Path
from hashlib import sha256
p=Path('qa/durable-journal-e2e.mjs')
a=Path('docs/audits/BF_107_JOURNAL_WRITE_SCALE_20261125')
raw=p.read_bytes()
assert sha256(raw).hexdigest()=='babfce761580dd4da276a67f3112b34972e425eda972779efbe7cf5d48cedcf4'
s=raw.decode().replace('\r\n','\n')
def once(x,y):
 global s
 assert s.count(x)==1,x
 s=s.replace(x,y)
once("import { spawn } from 'node:child_process';","import { spawn } from 'node:child_process';\nimport { requireDevOrigin, waitForOwnedBrowser, newOwnedPage, cleanupOwnedChrome } from './owned-chrome.mjs';")
once("if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(origin)) throw Error('Loopback QA origin required');","await requireDevOrigin(origin);")
once("'--headless=new', '--no-first-run'","'--headless=new', '--disable-webgl', '--no-first-run'")
once("], { stdio: 'ignore', windowsHide: true });", "], { stdio: 'ignore' });")
once("let socket, sequence = 0, assertions = 0, browserSocket;","let socket, sequence = 0, assertions = 0, browser;")
start=s.index('  let port;\n  for (let i = 0;')
end=s.index('  await new Promise((resolve, reject) => { socket.addEventListener',start)
s=s[:start]+"""  browser = await waitForOwnedBrowser(ownedProfile, chrome);
  const target = await newOwnedPage(browser);
  socket = new WebSocket(target.webSocketDebuggerUrl);
"""+s[end:]
start=s.index("  if (socket?.readyState === WebSocket.OPEN) void cdp('Browser.close')")
s=s[:start]+"""  socket?.close();
  for (const request of requests.values()) { clearTimeout(request.timer); request.reject(Error('Owned QA stopped')); }
  requests.clear();
  try { await cleanupOwnedChrome(ownedProfile, 'bf-durable-journal-', chrome, browser); }
  catch (error) { console.error('QA_OWNED_CLEANUP FAIL', String(error)); process.exitCode ||= 23; }
}
"""
# Wait for the synthetic navigation to finish before dynamic module import.
once("  await cdp('Page.navigate', { url: origin + '/?durable-qa' });","""  await cdp('Page.navigate', { url: origin + '/?durable-qa' });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { if (await js("location.href.endsWith('/?durable-qa')&&document.title==='Disposable actual IndexedDB QA'")) break; } catch { /* navigation */ }
    await sleep(100);
  }
  if (Date.now() >= deadline) throw Error('Disposable test document did not load');""")
with (a/'durable-journal-e2e.mjs.before-harness').open('xb') as f:f.write(raw)
assert p.read_bytes()==raw
p.write_bytes(s.encode())
print('QA',p.stat().st_size,sha256(p.read_bytes()).hexdigest())