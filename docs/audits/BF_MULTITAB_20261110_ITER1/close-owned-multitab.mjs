// One-shot cleanup for the exact disposable profile created by this run.
// No generic Chrome kill, no personal profile read, no filesystem traversal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const name = 'bf-multitab-ub3hJL';
const temp = path.resolve(os.tmpdir());
const dir = path.resolve(temp, name);
if (!/^bf-multitab-[a-zA-Z0-9]{6}$/.test(name) ||
    path.dirname(dir).toLowerCase() !== temp.toLowerCase()) throw Error('Invalid owned profile path');
if (!fs.existsSync(dir)) { console.log('PROFILE_ABSENT', name); process.exit(0); }
const file = path.join(dir, 'DevToolsActivePort');
if (!fs.existsSync(file)) throw Error('No owned DevToolsActivePort evidence');
const port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid owned port');
const response = await fetch('http://127.0.0.1:' + port + '/json/version',
  {signal: AbortSignal.timeout(1500)});
if (!response.ok) throw Error('No owned CDP browser');
const {webSocketDebuggerUrl} = await response.json();
const endpoint = new URL(webSocketDebuggerUrl);
if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' ||
    endpoint.port !== String(port) || !endpoint.pathname.startsWith('/devtools/browser/')) {
  throw Error('Unexpected CDP browser endpoint');
}
const socket = new WebSocket(webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Owned CDP connect timeout')), 1500);
  socket.addEventListener('open', () => {clearTimeout(timer); resolve();}, {once: true});
  socket.addEventListener('error', () => {clearTimeout(timer); reject(Error('Owned CDP connection failed'));}, {once: true});
});
const closed = new Promise(resolve => {
  const timer = setTimeout(resolve, 1500);
  socket.addEventListener('close', () => {clearTimeout(timer); resolve();}, {once: true});
});
socket.send(JSON.stringify({id: 1, method: 'Browser.close'}));
await closed;
if (socket.readyState === WebSocket.OPEN) socket.close();
await new Promise(resolve => setTimeout(resolve, 350));
fs.rmSync(dir, {recursive: true, force: true, maxRetries: 20, retryDelay: 250});
if (fs.existsSync(dir)) throw Error('Owned profile was not removed');
console.log('OWNED_MULTITAB_PROFILE_CLOSED_AND_REMOVED', name);
