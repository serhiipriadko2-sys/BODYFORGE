import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import type { Plugin } from 'vite';

const ASSETS = new Map([
  ['/_bodyforge/review/v28-fields-graph30protected.bin', { path: '.bodyforge-qa/agent-v27-pectoral-20261128-run01/v28-fields-graph30protected.bin', bytes: 4678824, sha: 'dc021c9671a4e89cbdd8f2444a9a3a718b8686adc5a1cb0414affec77d38ca27' }],
  ['/_bodyforge/review/v27-fields-upper30r20.bin', { path: '.bodyforge-qa/agent-v27-pectoral-20261128-run01/v27-fields-upper30r20.bin', bytes: 4621504, sha: '824a1024479f06540fb93594c9e7da75488060138ae6ee356860a5dd596a883f' }],
  ['/_bodyforge/review/v26-fields-surface8b.bin', { path: '.bodyforge-qa/agent-v25-contact-20261128-run01/v26-fields-surface8b.bin', bytes: 4498384, sha: '00d4ac77ff853c0c98f02ff46aeb73d5e200550088fce2d6e1ff7d936ee6865c' }],
  ['/_bodyforge/review/v24-fields-diffuse20.bin', { path: '.bodyforge-qa/avatar-zones-20261127/v24-fields-diffuse20.bin', bytes: 4452744, sha: '4925275f728b70ed78b10c62fcdb7aae612f5c36f6266ca7ce4bd0120c68e531' }],
  ['/_bodyforge/review/v23-lip-compress65.bin', { path: '.bodyforge-qa/avatar-zones-20261127/v23-lip-compress65.bin', bytes: 67028, sha: '85ee73cd51102fc2584354670018faf3163cbbd0a6aa9fb9316c8028d3861d12' }],
  ['/_bodyforge/review/v17-eye-aperture.bin', { path: '.bodyforge-qa/avatar-zones-20261127/v17-eye-aperture.bin', bytes: 21504, sha: 'e333f033d5737c6d7dfe1a37226e149d649e9fd77e0b45aeadd7363f714118fc' }],
  ['/_bodyforge/review/hair-buzz-v14b.bin', { path: '.bodyforge-qa/avatar-zones-20261127/hair-buzz-v14b.bin', bytes: 1488676, sha: '0930dcd9db4ec47fb92cf3425c4c977cd42989a6303f251beb7b11101b55bdac' }],
  ['/_bodyforge/review/hair-crop-v14b.bin', { path: '.bodyforge-qa/avatar-zones-20261127/hair-crop-v14b.bin', bytes: 1482844, sha: '48ea16e6036fb51a30a7a32d0fbeab35bfcae1ec4fa378ab4a9d58319e59fd87' }],
  ['/_bodyforge/review/hair-swept-v14b.bin', { path: '.bodyforge-qa/avatar-zones-20261127/hair-swept-v14b.bin', bytes: 1471828, sha: '4b3dcf0e55144505acbb379cf64e34b7234ba9975899295f51cd3e47724104ab' }],
  ['/_bodyforge/review/lashes-v13.bin', { path: '.bodyforge-qa/avatar-zones-20261127/lashes-v13.bin', bytes: 1826456, sha: '7316a020ed6a74395c9555231010fa90721dfe9856c0a39728225a6542cf64e3' }],
  ['/_bodyforge/review/brows-v12.bin', { path: '.bodyforge-qa/avatar-zones-20261127/brows-v12.bin', bytes: 674216, sha: '47fa746dc1f45e0e5f9914327c41d489b8a1c5772ab3dca5e31949a5c61dd5cb' }],
  ['/_bodyforge/review/blink-fields-v10.bin', { path: '.bodyforge-qa/avatar-zones-20261127/blink-fields-v10.bin', bytes: 1161064, sha: 'bc555c9b64821269ffc9deffab56cafe00737a9b601a02e6db6fcce63182324a' }],
  ['/_bodyforge/review/foundation-zones-v6.glb', { path: '.bodyforge-qa/avatar-zones-20261127/v5d/foundation-zones-v5.glb', bytes: 14719772, sha: '7dc94d5c9755fc6152c20120296d4a2213c18e59b2c970d658b4ef20e8247fa1' }],
  ['/_bodyforge/review/zone-fields-v6.bin', { path: '.bodyforge-qa/avatar-zones-20261127/v5d/zone-fields-v5.bin', bytes: 4258496, sha: '85344dd7f012f8a284b4fae5d3b28150615b9985e7f0141163ca05f483654331' }],
  ['/_bodyforge/review/zone-fields-v5.bin', { path: '.bodyforge-qa/avatar-zones-20261127/v5a/zone-fields-v5.bin', bytes: 4602748, sha: '812e24f55a137afcda1d0cfc06b502680dff28249f66f28de1d9fd3c32b5b49d' }],
  ['/_bodyforge/review/foundation-v1.glb', { path: '.bodyforge-qa/avatar-foundation-20261127/foundation-v1/foundation-v1.glb', bytes: 6723504, sha: '1112838b29a6a467399088310d56aeb2f4f17fc134ef2b14d592e213bd74a648' }],
  ['/_bodyforge/review/foundation-v3.glb', { path: '.bodyforge-qa/avatar-foundation-20261127/foundation-v3c/foundation-v3.glb', bytes: 15400816, sha: '433c70d951eb71f13618a3671375e1e284914da1e43eb3badd6bad275aa827f0' }],
  ['/_bodyforge/review/foundation-zones-v4.glb', { path: '.bodyforge-qa/avatar-zones-20261127/v4e/foundation-zones-v4.glb', bytes: 14719768, sha: 'ac3582ac80564ad386a2e6b178ef9d1ef80baecc66f15ae8c41cd05b0bea1251' }],
  ['/_bodyforge/review/zone-fields-v4.bin', { path: '.bodyforge-qa/avatar-zones-20261127/v4e/zone-fields-v4.bin', bytes: 4083096, sha: '7ae100ed39c1bb46ba555637f500f61d312cd95c54d26d6fb9aa2047f2eed9ad' }],
]);

/** Pinned local CC0-derived review assets. No source ZIP, .blend or arbitrary
 * path exposure; not installed on preview or production servers. */
export function localAvatarFoundationReview(): Plugin {
  return {
    name: 'bodyforge-local-foundation-review',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const route = req.url?.split('?')[0] ?? '', asset = ASSETS.get(route);
        if (!asset) return next();
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const host = req.headers.host ?? '', addr = req.socket.remoteAddress ?? '';
        if (req.url !== route || req.method !== 'GET' ||
            !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr) ||
            !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host) ||
            req.headers.forwarded || req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] ||
            (req.headers.origin && req.headers.origin !== 'http://' + host) ||
            ['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site']))) {
          res.statusCode = 403; res.end('Forbidden'); return;
        }
        try {
          const base = realpathSync(server.config.root), path = resolve(base, asset.path);
          const stat = lstatSync(path), actual = realpathSync(path), rel = relative(base, actual);
          if (isAbsolute(rel) || rel.startsWith('..') || actual !== path ||
              !stat.isFile() || stat.isSymbolicLink() || stat.size !== asset.bytes) throw Error('Unavailable');
          const bytes = readFileSync(path);
          if (createHash('sha256').update(bytes).digest('hex') !== asset.sha) throw Error('Unavailable');
          res.setHeader('Content-Type', route.endsWith('.bin') ? 'application/octet-stream' : 'model/gltf-binary');
          res.setHeader('Content-Length', String(bytes.length));
          res.end(bytes);
        } catch { res.statusCode = 404; res.end('Review unavailable'); }
      });
    },
  };
}
