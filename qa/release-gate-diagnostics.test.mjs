import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryDiagnostics,recoveryFailureCode} from './release-gate-diagnostics.mjs';

test('known stages and failures survive split chunks and separate output streams',()=>{
  const d=createRecoveryDiagnostics(),out=d.stream(),err=d.stream();
  out.push('BF005_RECOVERY_STA');
  err.push('BF005_RECOVERY_FAILURE recover-first native-recovery\r\n');
  out.push('GE recover-first\r\n');
  err.push('BF005_RECOVERY_CLEANUP_UNVERIFIED');err.end();
  assert.deepEqual(d.snapshot(),{stage:'recover-first',failure:{stage:'recover-first',code:'native-recovery'},cleanupUnverified:true});
});
test('arbitrary child text, unknown codes and suffixed markers are never retained',()=>{
  const d=createRecoveryDiagnostics(),s=d.stream();
  s.push('C:\\Private\\canary.txt BF005_RECOVERY_STAGE launch-first\nBF005_RECOVERY_STAGE private-path\nBF005_RECOVERY_FAILURE recover-first secret-canary\nBF005_RECOVERY_CLEANUP_UNVERIFIED extra\n');
  s.push('x'.repeat(1000)+'BF005_RECOVERY_STAGE launch-second\n');
  assert.deepEqual(d.snapshot(),{cleanupUnverified:false});
  s.push('BF005_RECOVERY_STAGE verify-final\n');
  assert.deepEqual(d.snapshot(),{stage:'verify-final',cleanupUnverified:false});
});
test('first valid failure is immutable and only approved codes leave the parser',()=>{
  const d=createRecoveryDiagnostics(),s=d.stream();
  s.push('BF005_RECOVERY_FAILURE launch-first launcher\nBF005_RECOVERY_FAILURE close-second identity\n');
  const snapshot=d.snapshot();snapshot.failure.code='secret';
  assert.deepEqual(d.snapshot(),{failure:{stage:'launch-first',code:'launcher'},cleanupUnverified:false});
});
test('classifier maps known errors without leaking any raw message',()=>{
  for(const [error,code] of [
    [{code:'ERR_ASSERTION',message:'private'},'assertion'],
    [Error('Disposable launcher PID unavailable'),'launcher'],
    [Error('CDP endpoint does not match disposable identity'),'identity'],
    [Error('Exact-profile Windows recovery failed'),'native-recovery'],
    [Error('Disposable profile removal unconfirmed (EPERM)'),'profile-removal'],
    [Error('Owned CDP open timeout'),'cdp-transport'],
    [Error('C:\\Private\\secret-canary'),'unclassified'],
    [null,'unclassified'],
  ])assert.equal(recoveryFailureCode(error),code);
});
