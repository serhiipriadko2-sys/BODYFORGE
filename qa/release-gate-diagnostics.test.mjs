import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryDiagnostics,recoveryFailureCode,cleanupFailureCode} from './release-gate-diagnostics.mjs';
import {windowsRecoveryFailureCode} from './owned-chrome-windows.mjs';

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

test("cleanup diagnostics keep first typed failure across split chunks, not arbitrary text",()=>{
  const d=createRecoveryDiagnostics(),out=d.stream(),err=d.stream();
  out.push("QA_OWNED_CLEANUP_FAILURE native-");
  err.push("QA_OWNED_CLEANUP_FAILURE private-stage native-handle\n");
  out.push("recovery native-scope-uninspectable\r\n");
  err.push("QA_OWNED_CLEANUP_FAILURE debug-port debug-port\n");
  out.push("QA_OWNED_CLEANUP_FAILURE profile-removal secret-canary\n");
  const snapshot=d.snapshot();snapshot.cleanupFailure.code="mutated";
  assert.deepEqual(d.snapshot(),{cleanupFailure:{stage:"native-recovery",code:"native-scope-uninspectable"},cleanupUnverified:false});
});
test("native errors are classified without retaining raw stderr or arbitrary code",()=>{
  assert.equal(windowsRecoveryFailureCode({killed:true},"private"),"native-timeout");
  assert.equal(windowsRecoveryFailureCode({},"C:\\Private\\secret Chrome process scope uninspectable"),"native-scope-uninspectable");
  assert.equal(windowsRecoveryFailureCode({},"process creation mismatch"),"native-creation-mismatch");
  assert.equal(windowsRecoveryFailureCode({},"private"),"native-other");
  assert.equal(cleanupFailureCode("native-recovery",{cleanupCode:"native-receipt"}),"native-receipt");
  assert.equal(cleanupFailureCode("native-recovery",{cleanupCode:"private-path"}),"unclassified");
  assert.equal(cleanupFailureCode("debug-port",Error("private")),"debug-port");
  assert.equal(cleanupFailureCode("profile-removal",Error("private")),"profile-removal");
});

test('new native diagnostics and screen failures retain only fixed tokens',()=>{
  assert.equal(windowsRecoveryFailureCode({},'process image unavailable'),'native-image-unavailable');
  assert.equal(windowsRecoveryFailureCode({},'owned wait state unavailable'),'native-wait-unavailable');
  assert.equal(cleanupFailureCode('native-recovery',{cleanupCode:'native-image-unavailable'}),'native-image-unavailable');
  const d=createRecoveryDiagnostics(),r=d.stream();
  r.push('BF_SCREEN_OWNERSHIP_DIAGNOSTIC fresh private-path\nBF_SCREEN_OWNERSHIP_DIAGNOSTIC unknown assertion\n');
  assert.deepEqual(d.snapshot(),{cleanupUnverified:false});
  r.push('BF_SCREEN_OWNERSHIP_DIAGNOSTIC responsive cdp-transport\nBF_SCREEN_OWNERSHIP_DIAGNOSTIC fresh assertion\n');
  r.push('QA_OWNED_CLEANUP_FAILURE native-recovery native-wait-unavailable\n');
  assert.deepEqual(d.snapshot(),{screenFailure:{stage:'responsive',code:'cdp-transport'},cleanupFailure:{stage:'native-recovery',code:'native-wait-unavailable'},cleanupUnverified:false});
});
