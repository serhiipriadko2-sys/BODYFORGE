// One-shot cleanup of ONLY two BODYFORGE finish-save Chrome profiles
// created and observed by this investigation. Never use personal browser data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const names = ['bf-finish-save-0hqMCp', 'bf-finish-save-6qcn5x'];
const root = path.resolve(os.tmpdir());
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const name of names) {
  const folder = path.resolve(root, name);
  if (!/^bf-finish-save-[A-Za-z0-9]{6}$/.test(name) ||
      path.dirname(folder).toLowerCase() !== root.toLowerCase()) throw Error('Invalid owned folder');
  if (!fs.existsSync(folder)) { console.log('ALREADY_ABSENT', name); continue; }
  const portFile = path.join(folder, 'DevToolsActivePort');
  if (!fs.existsSync(portFile)) throw Error('No owned port evidence for ' + name);
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Invalid owned port for ' + name);
  const response = await fetch('http://127.0.0.1:' + port + '/json/version', {signal:AbortSignal.timeout(1500)});
  if (!response.ok) throw Error('Owned CDP server unavailable for ' + name);
  const { webSocketDebuggerUrl } = await response.json();
  const endpoint = new URL(webSocketDebuggerUrl);
  if (endpoint.protocol !== 'ws:' || endpoint.hostname !== '127.0.0.1' ||
      endpoint.port !== String(port) || !endpoint.pathname.startsWith('/devtools/browser/')) {
    throw Error('Unsafe CDP endpoint for ' + name);
  }
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(Error('CDP open timeout for '+name)),1500);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP open failed'));},{once:true});
  });
  const closed = new Promise(resolve=>{
    const timer=setTimeout(resolve,1800);
    socket.addEventListener('close',()=>{clearTimeout(timer);resolve();},{once:true});
  });
  socket.send(JSON.stringify({id:1,method:'Browser.close'}));
  await closed;
  if(socket.readyState===WebSocket.OPEN)socket.close();
  await delay(550);
  try { fs.rmSync(folder,{recursive:true,force:true,maxRetries:20,retryDelay:250}); }
  catch(e){throw Error('Owned temporary profile cleanup failed '+name+': '+String(e));}
  if(fs.existsSync(folder))throw Error('Owned temporary profile still present '+name);
  console.log('OWNED_PROFILE_CLOSED',name);
}
