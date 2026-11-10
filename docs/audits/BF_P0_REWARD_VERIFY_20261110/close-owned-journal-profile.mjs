// One-shot cleanup for the exact disposable Chrome profile from this QA run.
// Never discover or close another Chrome profile. No process-wide kill.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const name = 'bf-journal-r4GcLm';
const root = path.resolve(os.tmpdir());
const dir = path.resolve(root, name);
if (path.dirname(dir).toLowerCase() !== root.toLowerCase() || path.basename(dir) !== name) {
  throw Error('Unexpected cleanup target');
}
if (!fs.existsSync(dir)) { console.log('OWNED_PROFILE_ALREADY_ABSENT'); process.exit(0); }
const debugFile = path.join(dir, 'DevToolsActivePort');
if (!fs.existsSync(debugFile)) throw Error('Owned CDP evidence missing; profile not touched');
const port = Number(fs.readFileSync(debugFile, 'utf8').split('\n')[0]);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Invalid owned CDP port');
const reply = await fetch('http://127.0.0.1:' + port + '/json/version', {signal: AbortSignal.timeout(1500)});
if (!reply.ok) throw Error('Owned browser CDP unavailable');
const { webSocketDebuggerUrl } = await reply.json();
const endpoint = new URL(webSocketDebuggerUrl);
if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' ||
    endpoint.port !== String(port) || !endpoint.pathname.startsWith('/devtools/browser/')) {
  throw Error('Owned browser endpoint mismatched');
}
const socket = new WebSocket(webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Owned Chrome CDP connection timeout')), 1500);
  socket.addEventListener('open', () => {clearTimeout(timer);resolve();}, {once:true});
  socket.addEventListener('error', () => {clearTimeout(timer);reject(Error('Owned Chrome CDP failed'));}, {once:true});
});
const closed = new Promise(resolve => {
  const timer = setTimeout(resolve, 2500);
  socket.addEventListener('close', () => {clearTimeout(timer);resolve();}, {once:true});
});
socket.send(JSON.stringify({id:1,method:'Browser.close'}));
await closed;
await new Promise(resolve=>setTimeout(resolve,700));
try {fs.rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
catch (error) {throw Error('Owned cleanup still blocked: '+String(error));}
if (fs.existsSync(dir)) throw Error('Owned profile still present');
console.log('OWNED_JOURNAL_PROFILE_CLOSED_AND_CLEANED');
