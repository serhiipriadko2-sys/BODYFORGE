import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root,deps,portText]=process.argv.slice(2);
const port=Number(portText);
if(!path.isAbsolute(root)||!path.isAbsolute(deps)||!path.basename(root).startsWith('bodyforge-isolated-qa-')||
   path.basename(deps)!=='node_modules'||!Number.isInteger(port)||port<1024||port>65535)throw Error('Unexpected isolated QA scope');
const {createServer}=await import(pathToFileURL(path.join(deps,'vite/dist/node/index.js')).href);
const server=await createServer({
  root,configFile:path.join(root,'vite.config.ts'),cacheDir:path.join(root,'.vite-qa-cache'),
  clearScreen:false,server:{host:'127.0.0.1',port,strictPort:true,hmr:false,fs:{allow:[root,deps]}},
});
await server.listen();
console.log('BODYFORGE_ISOLATED_QA_READY http://127.0.0.1:'+port);
let closing=false;
const stop=()=>{if(closing)return;closing=true;void server.close().catch(error=>{console.error(error);process.exitCode=1})};
process.once('SIGINT',stop);process.once('SIGTERM',stop);