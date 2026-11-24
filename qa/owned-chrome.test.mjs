import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDevToolsIdentity, checkedEndpoint } from './owned-chrome.mjs';
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
