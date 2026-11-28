import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {POSE_CONNECT_META,POSE_CONNECT_POLICY,verifyPoseConnectHtml,verifyPoseConnectSources} from './pose-egress-policy.mjs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
test('authored policy is exact and matches application and pinned SDK assets',()=>assert.equal(verifyPoseConnectSources(html,app),true));
test('production serialization preserves policy',()=>assert.equal(verifyPoseConnectHtml(html.replace(POSE_CONNECT_META,POSE_CONNECT_META.replace(/\s*\/>$/,'>'))),true));
test('broader destinations, telemetry and altered pinned URLs fail closed',()=>{
  for(const bad of ["connect-src *","connect-src 'self' https:",POSE_CONNECT_POLICY+' https://odml.pa.googleapis.com',POSE_CONNECT_POLICY.replace('/wasm/','/'),POSE_CONNECT_POLICY.replace('/float16/1/','/float16/latest/')]){
    assert.throws(()=>verifyPoseConnectHtml(html.replace(POSE_CONNECT_POLICY,bad)),/allowlist/);
  }
});
test('missing, duplicate, misplaced or late policy rejected',()=>{
  assert.throws(()=>verifyPoseConnectHtml(html.replace(POSE_CONNECT_META,'')),/exactly one/);
  assert.throws(()=>verifyPoseConnectHtml(html.replace(POSE_CONNECT_META,POSE_CONNECT_META+POSE_CONNECT_META)),/exactly one/);
  assert.throws(()=>verifyPoseConnectHtml(html.replace(POSE_CONNECT_META,'').replace('<body>','<body>'+POSE_CONNECT_META)),/head/);
  assert.throws(()=>verifyPoseConnectHtml(html.replace(POSE_CONNECT_META,'<script src="/other.js"></script>'+POSE_CONNECT_META)),/precedes/);
});
test('application asset URL drift rejected',()=>{
  assert.throws(()=>verifyPoseConnectSources(html,app.replace('/float16/1/','/float16/2/')),/changed/);
  assert.throws(()=>verifyPoseConnectSources(html,app.replace('const WASM_URL','const OTHER_URL')),/unique/);
});
