// BF-701: test the actual Vite config with a disposable, non-sensitive fixture.
// No requests to the developer's running server and no real private files.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createServer, preview } from 'vite';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bf-private-fixture-'));
const marker = 'SYNTHETIC_PRIVATE_CANARY_' + randomUUID();
const configFile = path.resolve('vite.config.ts');
const fixture = [
  '.bodyforge-qa/fixture.txt', 'docs/audits/fixture.txt',
  '.iskra/fixture.txt', '.agents/fixture.txt', '.codex/fixture.txt',
  '.vscode/fixture.txt', '.git/fixture.txt', 'AGENTS.md', 'CODEX_ISKRA.md',
];
const checks = [];
async function write(name, text) {
  const target = path.join(dir, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text, { flag: 'wx' });
}
function request(port, target, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: target, method, timeout: 5000 }, res => {
      const chunks = [];
      let bytes = 0;
      res.on('data', part => {
        bytes += part.length;
        if (bytes > 65536) { res.destroy(new Error('Unexpected fixture response size')); return; }
        chunks.push(part);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), cache: res.headers['cache-control'] }));
    });
    req.on('timeout', () => req.destroy(new Error('fixture request timeout')));
    req.on('error', reject);
    req.end();
  });
}
function check(surface, label, condition, status, exposed = false) {
  checks.push({ surface, label, pass: Boolean(condition), status, exposed });
}
let dev, prod;
try {
  for (const name of fixture) await write(name, marker);
  await write('index.html', '<!doctype html><title>BODYFORGE synthetic fixture</title><p>APP_OK</p>');
  await write('public/assets/safe.txt', 'SAFE_PUBLIC_ASSET');
  await write('public/assets/qa-safe.txt', 'SAFE_PUBLIC_ASSET');
  await write('dist/index.html', '<!doctype html><title>BODYFORGE synthetic preview</title><p>APP_OK</p>');
  await write('dist/assets/safe.txt', 'SAFE_PUBLIC_ASSET');
  await write('dist/assets/qa-safe.txt', 'SAFE_PUBLIC_ASSET');
  dev = await createServer({
    configFile, root: dir, clearScreen: false, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, fs: { allow: [dir] } },
  });
  await dev.listen(0);
  const devAddr = dev.httpServer.address();
  assert.equal(devAddr.address, '127.0.0.1');
  prod = await preview({
    configFile, root: dir, clearScreen: false, logLevel: 'silent',
    preview: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  const prodAddr = prod.httpServer.address();
  assert.equal(prodAddr.address, '127.0.0.1');
  const abs = dir.replaceAll('\\', '/');
  const paths = fixture.map(name => ['direct ' + name, '/' + name]);
  for (const [label, name] of [['qa','/.bodyforge-qa/fixture.txt'],['audit','/docs/audits/fixture.txt']]) {
    paths.push(
      [label + ' query', name + '?raw'],
      [label + ' case', name.toUpperCase()],
      [label + ' encoded', name.replace(label === 'qa' ? '.' : 'audits', label === 'qa' ? '%2e' : '%61udits')],
      [label + ' absolute', '/@fs/' + abs + name],
      [label + ' directory', name.slice(0, name.lastIndexOf('/'))],
    );
  }
  paths.push(
    ['QA encoded separator', '/.bodyforge-qa%2Ffixture.txt'],
    ['QA Windows separator', '/.bodyforge-qa%5Cfixture.txt'],
    ['QA Windows suffix', '/.bodyforge-qa./fixture.txt'],
    ['audit repeated separator', '/docs//audits/fixture.txt'],
    ['audit dot segment', '/docs/./audits/fixture.txt'],
    ['audit parent segment', '/docs/other/../audits/fixture.txt'],
    ['audit Windows suffix', '/docs/audits%20/fixture.txt'],
  );
  for (const [surface, addr] of [['dev', devAddr], ['preview', prodAddr]]) {
    for (const [label, route] of paths) {
      const response = await request(addr.port, route);
      check(surface, label, response.status === 403 && !response.text.includes(marker) && response.cache === 'no-store', response.status, response.text.includes(marker));
    }
    const head = await request(addr.port, '/.bodyforge-qa/fixture.txt', 'HEAD');
    check(surface, 'private HEAD', head.status === 403 && head.text === '', head.status);
    const invalid = await request(addr.port, '/invalid-%ZZ');
    check(surface, 'invalid URL encoding', invalid.status === 400, invalid.status);
    const home = await request(addr.port, '/');
    check(surface, 'ordinary app', home.status === 200 && home.text.includes('APP_OK'), home.status);
    for (const route of ['/assets/safe.txt', '/assets/qa-safe.txt']) {
      const asset = await request(addr.port, route);
      check(surface, 'ordinary asset ' + route, asset.status === 200 && asset.text === 'SAFE_PUBLIC_ASSET', asset.status);
    }
  }
} finally {
  if (dev) await dev.close();
  if (prod) await new Promise((resolve, reject) => prod.httpServer.close(error => error ? reject(error) : resolve()));
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
  console.log('BF701_FIXTURE_CLEANUP', !(await fs.stat(dir).catch(() => null)));
}
for (const c of checks) console.log(c.pass ? 'PASS' : 'FAIL', c.surface, c.label, c.status, c.exposed ? 'CANARY_SERVED' : '');
console.log('BF701_PRIVATE_FIXTURE', JSON.stringify({ total: checks.length, passed: checks.filter(c => c.pass).length, failed: checks.filter(c => !c.pass).length, canaryServed: checks.filter(c => c.exposed).length }));
if (!checks.length || checks.some(c => !c.pass)) process.exitCode = 12;
