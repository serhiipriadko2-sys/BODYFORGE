// Narrow connection CSP, not a complete security/privacy certificate.
import assert from 'node:assert/strict';
import {MODEL_REQUIREMENT,SDK_VERSION} from './offline-pose-pack.mjs';
export const WASM_URL='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+SDK_VERSION+'/wasm';
export const POSE_CONNECT_POLICY="connect-src 'self' "+WASM_URL+'/ '+MODEL_REQUIREMENT.url;
export const POSE_CONNECT_META='<meta http-equiv="Content-Security-Policy" content="'+POSE_CONNECT_POLICY+'" />';
export function verifyPoseConnectHtml(html){
  assert.equal(typeof html,'string');
  const metas=[...html.matchAll(/<meta\b[^>]*>/gi)].filter(m=>/\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(m[0]));
  assert.equal(metas.length,1,'exactly one connection policy');
  const normalize=s=>s.replace(/\s*\/?>$/,'>');
  assert.equal(normalize(metas[0][0]),normalize(POSE_CONNECT_META),'connection allowlist differs');
  const head=html.search(/<head\b[^>]*>/i),end=html.search(/<\/head\s*>/i);
  assert.ok(head>=0&&metas[0].index>head&&metas[0].index<end,'policy must be in head');
  assert.ok(!/<(?:script|link|img|iframe|object|embed|style)\b/i.test(html.slice(0,metas[0].index)),'policy precedes resources');
  return true;
}
export function verifyPoseConnectSources(html,app){
  verifyPoseConnectHtml(html);
  for(const [name,url] of [['WASM_URL',WASM_URL],['MODEL_URL',MODEL_REQUIREMENT.url]]){
    const matches=[...app.matchAll(new RegExp("\\bconst "+name+"\\s*=\\s*['\"]([^'\"]+)['\"]","g"))];
    assert.equal(matches.length,1,name+' must be unique');
    assert.equal(matches[0][1],url,name+' changed without policy review');
  }
  return true;
}
