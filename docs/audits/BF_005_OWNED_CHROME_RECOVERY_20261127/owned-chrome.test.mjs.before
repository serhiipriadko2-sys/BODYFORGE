import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { parseDevToolsIdentity, checkedEndpoint, requirePreviewOrigin } from './owned-chrome.mjs';
const browserPath = '/devtools/browser/11111111-2222-3333-4444-555555555555';
const identity = { port: 49152, browserPath };
test('reads both lines of a disposable Chrome identity', () => {
  assert.deepEqual(parseDevToolsIdentity('49152\r\n' + browserPath + '\r\n'), identity);
});
for (const raw of ['49152', '0\n' + browserPath, '65536\n' + browserPath, '49152\n/devtools/page/fake', '49152\n' + browserPath + '\nextra']) {
  test('rejects invalid identity ' + JSON.stringify(raw), () => assert.throws(() => parseDevToolsIdentity(raw)));
}
test('accepts only the exact browser UUID at the verified loopback port', () => {
  const good = 'ws://127.0.0.1:49152' + browserPath;
  assert.equal(checkedEndpoint(good, identity), good);
  for (const bad of [good.replace('11111111', 'aaaaaaaa'), good.replace('49152','49153'),
    good.replace('127.0.0.1','localhost'), good + '?x=1', good.replace('ws:', 'wss:')]) {
    assert.throws(() => checkedEndpoint(bad, identity));
  }
});
test('page ID cannot be substituted for another target or the browser', () => {
  const good = 'ws://127.0.0.1:49152/devtools/page/ABC123';
  assert.equal(checkedEndpoint(good, identity, 'ABC123'), good);
  assert.throws(() => checkedEndpoint(good, identity, 'OTHER'));
  assert.throws(() => checkedEndpoint(good, identity));
});

test('preview proof rejects missing, stale and fallback entry responses', async t => {
  const entry = '/assets/index-Test123.js';
  const contents = 'console.log("test build")';
  const digest = createHash('sha256').update(contents).digest('hex');
  let html = '<script type="module" src="' + entry + '"></script>';
  let mediaType = 'text/javascript';
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    if (request.url === entry) {
      response.writeHead(200, { 'Content-Type': mediaType });
      response.end(contents);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(html);
  }).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  await assert.rejects(requirePreviewOrigin(origin, ''), /EXPECT_ENTRY_SHA256/);
  await assert.rejects(requirePreviewOrigin('http://localhost:' + server.address().port, digest), /loopback/);
  assert.equal(requests, 0);
  assert.deepEqual(await requirePreviewOrigin(origin, digest.toUpperCase()), { entry, sha256: digest });
  await assert.rejects(requirePreviewOrigin(origin, '0'.repeat(64)), /mismatch/);
  mediaType = 'text/html';
  await assert.rejects(requirePreviewOrigin(origin, digest), /not JavaScript/);
  html = '<script type="module" src="/@vite/client"></script>';
  await assert.rejects(requirePreviewOrigin(origin, digest), /production preview/);
});
