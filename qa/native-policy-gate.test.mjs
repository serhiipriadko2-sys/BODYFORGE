import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readPolicyCount, verifyNativePolicies } from './native-policy-gate.mjs';

const marker = 'BODYFORGE_NATIVE_POLICY_PASS';
test('only an exact positive integer completion marker passes', () => {
  assert.equal(readPolicyCount('PASS sample\r\n'+marker+' checks=46\r\n', marker), 46);
});
test('absent, zero, duplicate, malformed and unsafe counts fail closed', () => {
  for (const text of ['', marker+' checks=0', marker+' checks=-1',
    marker+' checks=1.2', marker+' checks=9007199254740992',
    'prefix '+marker+' checks=46', marker+' checks=46 trailing',
    marker+' checks=46\n'+marker+' checks=46']) {
    assert.throws(() => readPolicyCount(text, marker), /policy-marker/);
  }
});
test('missing or relative JDK is blocked without executing a command', () => {
  assert.throws(() => verifyNativePolicies(''), /jdk-unavailable/);
  assert.throws(() => verifyNativePolicies('relative-jdk'), /jdk-unavailable/);
});
test('release includes the actual native source and policy tests in the frozen manifest', () => {
  const source = fs.readFileSync(new URL('./release-gates.mjs', import.meta.url), 'utf8');
  const scope = source.slice(source.indexOf('const stablePaths ='), source.indexOf('function manifest('));
  for (const item of ['android/src','android/tests','android/build-field.ps1','android/pack_web_apk.py','android/README.md']) {
    assert.ok(scope.includes("'"+item+"'"), item);
  }
  const native = source.indexOf("await gate('native-policy',");
  const runtime = source.indexOf("await gate('offline-runtime-pins',");
  const build = source.indexOf("requireResources('artifact');");
  assert.ok(native > 0 && runtime > 0 && native < build && runtime < build);
  assert.ok(source.includes("'BF_NATIVE_POLICY_PASS'"));
  assert.ok(source.includes("'android/tests/nativeScreenProbe.test.mjs'"));
  assert.ok(source.includes("'qa/offline-pose-pack.test.mjs'"));
  assert.ok(source.includes("'--verify-installed'"));
});
