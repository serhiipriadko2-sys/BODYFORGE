import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import type { Plugin } from 'vite';

const ROUTE='/_bodyforge/review/groom-v3.glb';
const ASSET='.bodyforge-qa/groom-review-v3/bodyforge-strand-groom-v3.glb';
const SHA='37fd6ca23f50d666dfbe64b81ae8746b049cec64998e4770cb7466945a54b8d5';

/** Serve exactly one pinned procedural CC0-base derivative, development only.
 * Do not weaken the existing private-directory deny rule. */
export function localAvatarGroomReview():Plugin{
  return {
    name:'bodyforge-local-groom-review',
    apply:'serve',
    configureServer(server){
      server.middlewares.use((req,res,next)=>{
        if(req.url?.split('?')[0]!==ROUTE)return next();
        res.setHeader('Cache-Control','no-store');
        res.setHeader('X-Content-Type-Options','nosniff');
        const host=req.headers.host??'', addr=req.socket.remoteAddress??'';
        if(req.url!==ROUTE||req.method!=='GET'||
          !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(addr)||
          !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)||
          req.headers.forwarded||req.headers['x-forwarded-for']||req.headers['x-forwarded-host']||
          (req.headers.origin&&req.headers.origin!=='http://'+host)||
          ['cross-site','same-site'].includes(String(req.headers['sec-fetch-site']))){
          res.statusCode=403;res.end('Forbidden');return;
        }
        try{
          const path=resolve(server.config.root,ASSET),stat=lstatSync(path);
          const base=realpathSync(server.config.root),actual=realpathSync(path),rel=relative(base,actual);
          if(isAbsolute(rel)||rel.startsWith('..')||
            resolve(base,ASSET)!==actual||!stat.isFile()||stat.isSymbolicLink()||stat.size!==1083452)throw Error('Unavailable');
          const bytes=readFileSync(path);
          if(createHash('sha256').update(bytes).digest('hex')!==SHA)throw Error('Unavailable');
          res.setHeader('Content-Type','model/gltf-binary');
          res.setHeader('Content-Length',String(bytes.length));
          res.end(bytes);
        }catch{res.statusCode=404;res.end('Review unavailable');}
      });
    },
  };
}
