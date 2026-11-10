// One-shot cleanup: ONLY temporary Chrome profiles recorded in this BODYFORGE QA session.
// No discovery, no personal Chrome profile, no process-wide kill or global settings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const names = ['bf-appearance-iQS5b7', 'bf-appearance-kWQKbV', 'bf-appearance-bDk2YZ', 'bf-appearance-mOmnSW'];
const root = path.resolve(os.tmpdir());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const name of names) {
  const dir = path.resolve(root, name);
  if (!/^bf-appearance-[A-Za-z0-9]{6}$/.test(name) || path.dirname(dir).toLowerCase() !== root.toLowerCase()) {
    console.error('DENIED_INVALID_PROFILE', name);
    process.exitCode = 1;
    continue;
  }
  if (!fs.existsSync(dir)) { console.log('ALREADY_ABSENT', name); continue; }
  const portFile = path.join(dir, 'DevToolsActivePort');
  try {
    if (fs.existsSync(portFile)) {
      const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isSafeInteger(port) && port >= 1024 && port <= 65535) {
        const response = await fetch('http://127.0.0.1:' + port + '/json/version', {signal: AbortSignal.timeout(1500)});
        if (response.ok) {
          const info = await response.json();
          if (typeof info.webSocketDebuggerUrl === 'string' && info.webSocketDebuggerUrl.startsWith('ws://127.0.0.1:')) {
            const ws = new WebSocket(info.webSocketDebuggerUrl);
            await new Promise((resolve, reject) => {
              const timer = setTimeout(() => reject(Error('CDP handshake timeout')), 2000);
              ws.addEventListener('open', () => {clearTimeout(timer);resolve();}, {once: true});
              ws.addEventListener('error', () => {clearTimeout(timer);reject(Error('CDP handshake failed'));}, {once:true});
            });
            ws.send(JSON.stringify({id:1, method:'Browser.close'}));
            await sleep(1200);
            ws.close();
            console.log('OWNED_BROWSER_CLOSE_REQUESTED', name);
          } else {console.log('UNVERIFIED_CDP_ENDPOINT', name); process.exitCode = 1; continue;}
        }
      }
    }
  } catch (error) { console.warn('OWNED_CDP_UNREACHABLE', name, String(error)); }
  await sleep(500);
  try {
    fs.rmSync(dir, {recursive:true, force:true, maxRetries:20, retryDelay:250});
    console.log('OWNED_PROFILE_CLEANED', name);
  } catch (error) {
    console.error('OWNED_PROFILE_CLEANUP_BLOCKED', name, String(error));
    process.exitCode = 1;
  }
}
