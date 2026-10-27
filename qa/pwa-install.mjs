import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path));
const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8'));
const index = read('index.html').toString('utf8');

assert.equal(manifest.id, '/');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.lang, 'ru');
assert.equal(manifest.theme_color, '#0a1018');
assert.equal(manifest.background_color, '#0a1018');
assert.ok(manifest.name.includes('BODYFORGE'));
assert.match(index, /<link rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(index, /<link rel="apple-touch-icon" sizes="180x180" href="\/icons\/bodyforge-180\.png"/);

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const targets = [
  { path: '/icons/bodyforge-192.png', size: 192, purpose: 'any' },
  { path: '/icons/bodyforge-512.png', size: 512, purpose: 'any' },
  { path: '/icons/bodyforge-maskable-512.png', size: 512, purpose: 'maskable' },
  { path: '/icons/bodyforge-180.png', size: 180, purpose: null },
];
const asset = (path) => 'public' + path;
function checkPng(bytes, size, label) {
  assert.ok(bytes.length > 1200, label + ' is suspiciously small/blank');
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), label + ' is not PNG');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', label + ' has no IHDR');
  assert.equal(bytes.readUInt32BE(16), size, label + ' incorrect width');
  assert.equal(bytes.readUInt32BE(20), size, label + ' incorrect height');
}
for (const target of targets) {
  const binary = read(asset(target.path));
  checkPng(binary, target.size, target.path);
  if (target.purpose !== null) {
    const icon = manifest.icons.find((item) => item.src === target.path);
    assert.ok(icon, target.path + ' missing from manifest');
    assert.equal(icon.sizes, target.size + 'x' + target.size);
    assert.equal(icon.type, 'image/png');
    assert.equal(icon.purpose, target.purpose);
  }
}
assert.ok(manifest.icons.some((icon) =>
  icon.src === '/icons/bodyforge-icon.svg' && icon.sizes === 'any' && icon.type === 'image/svg+xml'));
assert.match(read('public/icons/bodyforge-icon.svg').toString('utf8'), /<svg\s/);
assert.match(read('public/icons/bodyforge-maskable.svg').toString('utf8'), /<svg\s/);

// The exact assets must be copied into the production output, not only served
// by Vite development middleware. Run npm run build first.
const output = JSON.parse(read('dist/manifest.webmanifest').toString('utf8'));
assert.deepEqual(output, manifest);
const builtIndex = read('dist/index.html').toString('utf8');
assert.match(builtIndex, /rel="manifest" href="\/manifest\.webmanifest"/);
for (const target of targets) {
  assert.ok(read('dist' + target.path).equals(read(asset(target.path))),
    'Built icon differs from source: ' + target.path);
}

// Optional loopback-only smoke against the existing local Vite server.
// No production site, user account, webcam, or profile data is requested.
const origin = process.env.BODYFORGE_QA_ORIGIN;
if (origin) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/, 'Only isolated loopback origins are allowed');
  const remoteManifest = await fetch(origin + '/manifest.webmanifest', { signal: AbortSignal.timeout(7000) });
  assert.equal(remoteManifest.status, 200, 'Manifest not served over HTTP');
  assert.deepEqual(await remoteManifest.json(), manifest);
  for (const target of targets) {
    const response = await fetch(origin + target.path, { signal: AbortSignal.timeout(7000) });
    assert.equal(response.status, 200, target.path + ' failed HTTP');
    checkPng(Buffer.from(await response.arrayBuffer()), target.size, 'HTTP ' + target.path);
  }
}

console.log('BODYFORGE_PWA_INSTALL_PASS', JSON.stringify({
  filesChecked: targets.length + 3,
  iconSizes: targets.map((t) => t.size),
  built: true,
  localHttp: Boolean(origin),
  offlineMode: false,
  serviceWorker: false,
}));
