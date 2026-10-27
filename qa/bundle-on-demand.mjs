// Production regression gate: the camera-only MediaPipe library must not
// re-enter the initial app bundle or an HTML modulepreload directive.
// Run after "npm run build". Numbers are uncompressed/minified file sizes.
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = path.resolve('dist');
const assets = path.join(dir, 'assets');
const files = fs.readdirSync(assets);
const only = (pattern, label) => {
  const matches = files.filter((name) => pattern.test(name));
  if (matches.length !== 1) throw Error(label + ': expected one chunk, got ' + matches.length);
  return matches[0];
};
const entryName = only(/^index-[\w-]+\.js$/, 'App entry');
const poseName = only(/^vision_bundle-[\w-]+\.js$/, 'Pose library');
const cameraControlsName = only(/^CameraControls-[\w-]+\.js$/, 'Camera controls');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const entryBytes = fs.readFileSync(path.join(assets, entryName));
const poseBytes = fs.readFileSync(path.join(assets, poseName));
const entryGzip = gzipSync(entryBytes).length;
const entry = entryBytes.length;
const pose = poseBytes.length;
const baseline = 496761; // Vite 8.3.4 / main@bc9fd6b, measured 2026-10-22
const saved = baseline - entry;
const reduction = Math.round((saved / baseline) * 1000) / 10;
const result = { entryBytes: entry, entryGzipBytes: entryGzip, cameraChunkBytes: pose,
  baselineEntryBytes: baseline, entryBytesSaved: saved, entryReductionPercent: reduction,
  entryName, poseName };
if (entry >= baseline * 0.8) throw Error('Initial bundle regression: ' + JSON.stringify(result));
if (pose < 100000 || pose > 300000) throw Error('Unexpected pose chunk size: ' + JSON.stringify(result));
if (html.includes(poseName)) throw Error('Camera-only chunk was preloaded in index.html');
if (html.includes(cameraControlsName)) throw Error('Mobile camera controls were preloaded in index.html');
if (!entryBytes.toString('utf8').includes(cameraControlsName)) {
  throw Error('Camera controls no longer use a dynamic import');
}
if (!entryBytes.toString('utf8').includes(poseName)) {
  throw Error('Initial app chunk no longer references its lazy camera chunk');
}
console.log('BODYFORGE_BUNDLE_ON_DEMAND_PASS ' + JSON.stringify(result));
