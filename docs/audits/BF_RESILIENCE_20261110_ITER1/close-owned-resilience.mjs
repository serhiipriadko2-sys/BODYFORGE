// One-shot cleanup: the exact disposable Chrome profile created by this BODYFORGE resilience run.
// The profile pathname is scoped to OS temp. No browsing of personal Chrome data, no blanket process termination.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const name = 'bf-resilience-K4OPOV';
const root = path.resolve(os.tmpdir());
const dir = path.resolve(root, name);
if (!/^bf-resilience-[A-Za-z0-9]{6}$/.test(name) ||
    path.dirname(dir).toLowerCase() !== root.toLowerCase()) throw Error('Unsafe profile target');
if (!fs.existsSync(dir)) { console.log('OWNED_PROFILE_ALREADY_ABSENT', name); process.exit(0); }
const portFile = path.join(dir, 'DevToolsActivePort');
if (!fs.existsSync(portFile)) throw Error('No owned browser port evidence');
const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Invalid owned browser port');
const resp = await fetch('http://127.0.0.1:' + port + '/json/version',
  {signal: AbortSignal.timeout(1500)});
if (!resp.ok) throw Error('Owned browser CDP unreachable');
const {webSocketDebuggerUrl} = await resp.json();
const endpoint = new URL(webSocketDebuggerUrl);
if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' ||
    endpoint.port !== String(port) || !endpoint.pathname.startsWith('/devtools/browser/')) {
  throw Error('Browser CDP endpoint does not match owned profile');
}
const socket = new WebSocket(webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Owned browser CDP timeout')), 1800);
  socket.addEventListener('open', () => {clearTimeout(timer); resolve();}, {once:true});
  socket.addEventListener('error', () => {clearTimeout(timer); reject(Error('Owned browser CDP error'));}, {once:true});
});
const closed = new Promise(resolve => {
  const timer = setTimeout(resolve, 1500);
  socket.addEventListener('close', () => {clearTimeout(timer);resolve();}, {once:true});
});
socket.send(JSON.stringify({id:1,method:'Browser.close'}));
await closed;
if (socket.readyState === WebSocket.OPEN) socket.close();
await new Promise(resolve => setTimeout(resolve,350));
fs.rmSync(dir,{recursive:true,force:true,maxRetries:20,retryDelay:250});
if(fs.existsSync(dir))throw Error('Owned profile not removed');
console.log('OWNED_RESILIENCE_CHROME_CLOSED',name);
