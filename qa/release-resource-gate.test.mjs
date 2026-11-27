import test from 'node:test';
import assert from 'node:assert/strict';
import {RESOURCE_MINIMUM_MIB,assessReleaseMemory,parseReleaseMemory,readReleaseMemory} from './release-resource-gate.mjs';

const valid={physicalMiB:2048,virtualMiB:4096,totalPhysicalMiB:8192,totalVirtualMiB:16384};
test('exact minimum passes and policy is immutable',()=>{
  assert.deepEqual(RESOURCE_MINIMUM_MIB,{physicalMiB:2048,virtualMiB:4096});
  assert.equal(Object.isFrozen(RESOURCE_MINIMUM_MIB),true);
  assert.deepEqual(assessReleaseMemory(valid),{status:'pass',...valid});
});
test('physical and virtual thresholds independently fail closed',()=>{
  for(const sample of [{...valid,physicalMiB:2047},{...valid,virtualMiB:4095},{...valid,physicalMiB:0}]){
    assert.deepEqual(assessReleaseMemory(sample),{status:'blocked',reason:'insufficient-memory',...sample});
  }
});
test('missing, negative, fractional, excessive or nonnumeric readings cannot pass',()=>{
  for(const sample of [null,[],{}, {...valid,physicalMiB:null},{...valid,virtualMiB:Infinity},
    {...valid,physicalMiB:-1},{...valid,physicalMiB:2047.9},{...valid,physicalMiB:'2048'},
    {...valid,totalPhysicalMiB:0},{...valid,physicalMiB:8193},{...valid,virtualMiB:16385},
    {...valid,totalVirtualMiB:Number.MAX_SAFE_INTEGER+1},{...valid,unexpected:1}])
    assert.deepEqual(assessReleaseMemory(sample),{status:'blocked',reason:'invalid-memory-sample'});
});
test('parser accepts a complete measured sample, never malformed output or unknown fields',()=>{
  assert.deepEqual(parseReleaseMemory(JSON.stringify(valid)+'\r\n'),{status:'pass',...valid});
  for(const raw of [null,'','{}','WARNING: '+JSON.stringify(valid),'x'.repeat(2049),JSON.stringify({...valid,untrusted:'canary'})])
    assert.deepEqual(parseReleaseMemory(raw),{status:'blocked',reason:'invalid-memory-sample'});
});
test('read-only host probe produces a typed result without exposing machine paths or raw output',()=>{
  const result=readReleaseMemory();
  assert.ok(['pass','blocked'].includes(result.status));
  if(result.status==='pass')assert.equal(assessReleaseMemory(Object.fromEntries(Object.entries(result).filter(([k])=>k!=='status'))).status,'pass');
  else assert.ok(['unsupported-release-platform','memory-probe-unavailable','invalid-memory-sample','insufficient-memory'].includes(result.reason));
});
