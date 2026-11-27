import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const ROUTE = '/_bodyforge/review/head-volume-v4.json';
const RECIPE = '.bodyforge-qa/scan-reference-artec/head-volume-review-v4.json';
const SHA256 = '185ec8ce1c6cc0e9c77de12dd5c7bfeeffc274bb7af816a8fc4ba81b0c4cc0b6';

/** Narrow read-only dev endpoint. Raw scans and landmarks stay behind the
 * private-directory deny rule. Only nine fitted control volumes are served. */
export function localAvatarHeadReview(): Plugin {
  return {
    name: 'bodyforge-local-head-volume-review',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== ROUTE) return next();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const host = req.headers.host ?? '';
        const addr = req.socket.remoteAddress ?? '';
        if (req.url !== ROUTE || req.method !== 'GET' ||
            !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr) ||
            !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host) ||
            req.headers.forwarded || req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] ||
            (req.headers.origin && req.headers.origin !== 'http://' + host) ||
            ['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site']))) {
          res.statusCode = 403; res.end('Forbidden'); return;
        }
        try {
          const path = resolve(server.config.root, RECIPE), stat = lstatSync(path);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 9284) throw Error('Review unavailable');
          const bytes = readFileSync(path);
          if (createHash('sha256').update(bytes).digest('hex') !== SHA256) throw Error('Review unavailable');
          const { id, bodySha256, baseline, field, zones } = JSON.parse(bytes.toString('utf8'));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ id, bodySha256, baseline, field, zones }));
        } catch {
          res.statusCode = 404; res.end('Review unavailable');
        }
      });
    },
  };
}
