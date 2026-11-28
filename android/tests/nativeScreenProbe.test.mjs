// Execute the actual embedded WebView probe against synthetic DOM states.
// No Android device, storage, permissions, camera or health data involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/java/ru/bodyforge/healthqa/MainActivity.java',import.meta.url),'utf8');
const match=source.match(/private static final String SCREEN_PROBE\s*=\s*((?:"(?:[^"\\]|\\.)*"\s*(?:\+\s*)?)+);/);
assert.ok(match,'expected exact Java string literal probe');
const probe=[...match[1].matchAll(/"(?:[^"\\]|\\.)*"/g)].map(m=>JSON.parse(m[0])).join('');
assert.ok(probe.length>100);
function run({created='true',screen='challenge',marker='ready',origin='https://appassets.androidplatform.net',visibility='visible',shell=true,hasMarker=true}={}){
  const document=Object.freeze({
    visibilityState:visibility,
    querySelector(selector){
      if(selector==='.app-shell')return shell?Object.freeze({dataset:Object.freeze({screen,fighterCreated:created})}):null;
      if(selector==='[data-native-live-panel]')return hasMarker?Object.freeze({dataset:Object.freeze({nativeLivePanel:marker})}):null;
      throw Error('unexpected selector');
    }
  });
  return vm.runInNewContext(probe,{document,location:Object.freeze({origin})},{timeout:200,contextCodeGeneration:{strings:false,wasm:false}});
}
test('native steps are ready on Camera before fighter creation',()=>{
  assert.equal(run({created:'false'}),'ready');
});
test('native steps remain ready for created fighters',()=>{
  assert.equal(run(),'ready');
});
test('busy Camera disables native settings regardless of fighter creation',()=>{
  for(const created of ['true','false'])assert.equal(run({created,marker:'busy'}),'busy');
});
test('never activates native steps on another tab, even if marker remains mounted',()=>{
  for(const screen of ['dashboard','forge','tower','online','settings','unknown'])assert.equal(run({screen}),'off');
});
test('background, external origin, or missing app shell fail closed',()=>{
  for(const input of [{visibility:'hidden'},{origin:'https://example.org'},{origin:'https://appassets.androidplatform.net.evil.test'},{origin:'http://appassets.androidplatform.net'},{shell:false}])assert.equal(run(input),'off');
});
test('missing or unknown marker fails closed; only typed state leaves the probe',()=>{
  assert.equal(run({hasMarker:false}),'off');
  for(const marker of ['', 'READY','other','1234',null])assert.equal(run({marker}),'off');
});

// Source contract: the packaged notices panel requires a plain UTF-8 response.
test('packaged text resources receive text/plain and UTF-8',()=>{
  const mime=source.match(/private static String mime\(String p\) \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(mime);
  assert.ok(mime.includes('if (s.endsWith(".txt") || s.endsWith(".md")) return "text/plain";'));
  assert.ok(source.includes('String type = mime(path);'));
  assert.ok(source.includes('boolean text = type.startsWith("text/")'));
  assert.ok(source.includes('new WebResourceResponse(type, text ? "UTF-8" : null, stream)'));
});
