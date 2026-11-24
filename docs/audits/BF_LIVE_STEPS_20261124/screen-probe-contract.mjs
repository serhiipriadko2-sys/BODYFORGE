import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const java = fs.readFileSync('android/src/java/ru/bodyforge/healthqa/MainActivity.java','utf8');
const source = java.match(/private static final String SCREEN_PROBE\s*=\s*([\s\S]*?)\n\s*private final Runnable screenPoll/);
assert(source, 'missing exact native probe');
const probe = [...source[1].matchAll(/"(?:\\.|[^"\\])*"/g)].map(m=>JSON.parse(m[0])).join('');
let checks = 0;
function check(name, expected, {origin='https://appassets.androidplatform.net', visibility='visible',
  screen='challenge', created='true', marker='ready', shell=true, present=true}={}) {
  const result=vm.runInNewContext(probe,{
    location:{origin},
    document:{visibilityState:visibility,querySelector(sel){
      if(sel==='.app-shell') return shell?{dataset:{screen,fighterCreated:created}}:null;
      if(sel==='[data-native-live-panel]') return present?{dataset:{nativeLivePanel:marker}}:null;
      throw Error('Unexpected selector');
    }}
  },{timeout:100});
  assert.equal(result,expected,name);
  console.log('PASS '+name);checks++;
}
check('Camera ready','ready');
check('Camera busy','busy',{marker:'busy'});
check('Forge hidden','off',{screen:'dashboard'});
check('FAQ hidden','off',{screen:'settings'});
check('No fighter hidden','off',{created:'false'});
check('Missing shell hidden','off',{shell:false});
check('Missing marker hidden','off',{present:false});
check('Hidden document hidden','off',{visibility:'hidden'});
check('Unknown marker fails closed','off',{marker:'connected'});
check('External origin hidden','off',{origin:'https://example.test'});
check('Lookalike origin hidden','off',{origin:'https://appassets.androidplatform.net.evil.test'});
assert(!/addJavascriptInterface|postMessage|localStorage|sessionStorage/.test(probe));
console.log('PASS probe carries only enum and no storage/bridge');
console.log('BODYFORGE_SCREEN_PROBE_PASS checks='+ ++checks);
