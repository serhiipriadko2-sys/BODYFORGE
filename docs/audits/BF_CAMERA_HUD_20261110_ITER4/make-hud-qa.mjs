import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = 'C:/github/BODYFORGE';
const qaPath = path.join(root, 'qa/mobile-e2e.mjs');
const historic = path.join(root, 'docs/audits/BF_CAMERA_HUD_20261110_ITER3/hud-candidate-native.patch');
const dest = path.join(root, 'docs/audits/BF_CAMERA_HUD_20261110_ITER4/hud-mobile-e2e.mjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const source = fs.readFileSync(qaPath);
const originalPatch = fs.readFileSync(historic);
const expectedQa = 'be9bee1912c556dd7b12153d9ea91b3a90f6ef777c4dab0ea2afcf9ecb526b2b';
const expectedPatch = 'aa2696d5323640164e0dfd624dddc2efc7235fe9004ccb909149f97b93011dfb';
if (sha(source) !== expectedQa || sha(originalPatch) !== expectedPatch) {
  throw Error('SOURCE_DRIFT: refuse to construct baseline from changed input');
}
const patch = originalPatch.toString('utf8').replace(/\r\n/g, '\n');
const qaChunk = patch.split('diff --git a/src/forge.css')[0];
const added = qaChunk.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
  .map(line => line.slice(1)).join('\n');
if (!added.includes('CAMERA_HUD_MATRIX') || !added.includes('cameraHudMatrix.every(Boolean)')) {
  throw Error('GEOMETRY_CONTRACT_MISSING');
}
const anchor = "  check(detectorReady,'pose model fully active before switching lens');";
const text = source.toString('utf8');
if (text.split(anchor).length !== 2) throw Error('ANCHOR_NOT_UNIQUE');
const next = text.replace(anchor, anchor + '\n' + added);
fs.writeFileSync(dest, next, 'utf8');
console.log('E2E_SOURCE_SHA', expectedQa);
console.log('E2E_SHA', sha(fs.readFileSync(dest)));
console.log('E2E_BYTES', fs.statSync(dest).size);
console.log('GEOMETRY_ASSERTIONS', 4);
