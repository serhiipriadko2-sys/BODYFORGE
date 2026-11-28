// BF-604: deterministic worker generated only from approved build/public bytes.
// No model/WASM copying, network access, service-worker registration, or deployment.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { generatedEntries, verifyPublic } from './release-artifact-boundary.mjs';
import { verifyThirdPartyNotices } from './third-party-notices.mjs';
import { MODEL_REQUIREMENT, RUNTIME_FILES, SDK_VERSION } from './offline-pose-pack.mjs';

export const OFFLINE_WORKER_FILE = 'bodyforge-offline.js';
const SHA = /^[a-f0-9]{64}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const sort = (a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
const samePath = (a,b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const validLocal = name =>
  ['index.html','favicon.svg','manifest.webmanifest','third-party-notices.txt'].includes(name) ||
  /^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(name) ||
  /^assets\/[a-z0-9_-]+\.(?:png|jpg|hdr|glb)$/.test(name) ||
  /^assets\/athlete-[a-z0-9_-]+-source\.md$/.test(name) ||
  /^fonts\/(?:[a-z0-9_-]+\.woff2|(?:Manrope|Unbounded)-OFL\.txt|README\.md)$/.test(name) ||
  /^icons\/bodyforge-[a-z0-9_-]+\.(?:png|svg)$/.test(name);
const pose = [
  ...RUNTIME_FILES.filter(pin => pin.path.startsWith('wasm/')).map(pin => ({
    key: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + SDK_VERSION + '/' + pin.path,
    bytes: pin.bytes, sha256: pin.sha256,
  })),
  { key: MODEL_REQUIREMENT.url, bytes: MODEL_REQUIREMENT.bytes, sha256: MODEL_REQUIREMENT.sha256 },
];
export function offlineManifestForFiles(files, kind = 'training') {
  if (!Array.isArray(files) || files.length < 3 || !['shell','training'].includes(kind)) throw Error('offline input set');
  const seen = new Set();
  const local = files.map(file => {
    if (!file || typeof file.path !== 'string' || !validLocal(file.path) ||
        file.path.split('/').some(part => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
        seen.has(file.path.toLowerCase()) ||
        !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 32*1024*1024 ||
        typeof file.sha256 !== 'string' || !SHA.test(file.sha256)) throw Error('offline input entry');
    seen.add(file.path.toLowerCase());
    return { key: '/' + file.path, bytes: file.bytes, sha256: file.sha256 };
  });
  if (!seen.has('index.html') || !seen.has('manifest.webmanifest') ||
      local.filter(entry => /^\/assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(entry.key)).length !== 1) throw Error('offline required inputs');
  const entries = [...local, ...(kind === 'training' ? pose.map(entry => ({...entry})) : [])].sort(sort);
  if (entries.length > 256 || entries.reduce((sum,e) => sum + e.bytes,0) > 128*1024*1024) throw Error('offline cache budget');
  const canonical = {schema:1,kind,entries};
  return { schema:1,kind,version:sha(JSON.stringify(canonical)),entries };
}
function exactSource(root, relative) {
  const filename = path.resolve(root,relative);
  const st = fs.lstatSync(filename);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size < 1 || st.size > 64*1024 ||
      !samePath(fs.realpathSync.native(filename),filename)) throw Error('offline source boundary');
  return fs.readFileSync(filename,'utf8');
}
export async function renderOfflineWorker(root, manifest) {
  const ts = (await import('typescript')).default;
  const compile = relative => {
    const result = ts.transpileModule(exactSource(root,relative), {
      fileName:relative,reportDiagnostics:true,
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
        newLine:ts.NewLineKind.LineFeed,sourceMap:false,removeComments:false},
    });
    if (result.diagnostics?.some(d=>d.category===ts.DiagnosticCategory.Error)) throw Error('offline worker transpile');
    return result.outputText;
  };
  const core = compile('src/lib/offlineCache.ts'), adapter = compile('src/lib/offlineWorker.ts');
  // Statically scoped CommonJS wrappers; no runtime eval, dynamic import or external script.
  return '/* BODYFORGE generated offline worker; not automatically registered. */\n' +
    '(function(){\n"use strict";\nconst core={};\n(function(exports){\n' + core +
    '\n})(core);\nconst worker={};\n(function(exports,require){\n' + adapter +
    '\n})(worker,function(name){if(name!=="./offlineCache")throw Error("Unknown offline module");return core;});\n' +
    'worker.attachOfflineWorker(self,' + JSON.stringify(manifest) + ');\n})();\n';
}
function publicInputs(root) {
  const policy = JSON.parse(exactSource(root,'qa/public-artifact-allowlist.json'));
  return verifyPublic(path.join(root,'public'),policy).files;
}
export function offlineWorkerBuild() {
  let root;
  return {
    name:'bodyforge-offline-worker',apply:'build',enforce:'post',
    configResolved(config) {
      root = path.resolve(config.root);
      if (config.base !== '/' || !samePath(config.publicDir,path.join(root,'public')) ||
          config.build.ssr || config.build.watch || config.build.copyPublicDir === false) throw Error('offline build configuration');
    },
    generateBundle:{order:'post',async handler(_options,bundle) {
      if (!root || Object.hasOwn(bundle,OFFLINE_WORKER_FILE)) throw Error('offline output collision');
      verifyThirdPartyNotices(root);
      const files = [...publicInputs(root), ...generatedEntries({output:Object.values(bundle)})];
      const manifest = offlineManifestForFiles(files);
      this.emitFile({type:'asset',fileName:OFFLINE_WORKER_FILE,source:await renderOfflineWorker(root,manifest)});
    }},
  };
}
/** Called after the existing exact-byte distribution boundary has passed. */
export async function verifyOfflineWorkerDistribution(root, distribution) {
  const files = distribution?.files;
  if (!Array.isArray(files)) throw Error('offline distribution missing');
  const workers = files.filter(file=>file.path===OFFLINE_WORKER_FILE);
  if (workers.length !== 1) throw Error('offline generated worker missing or duplicate');
  const manifest = offlineManifestForFiles(files.filter(file=>file.path!==OFFLINE_WORKER_FILE));
  const expected = Buffer.from(await renderOfflineWorker(root,manifest),'utf8');
  const actual = Buffer.from(exactSource(root,'dist/'+OFFLINE_WORKER_FILE),'utf8');
  if (!expected.equals(actual) || workers[0].bytes!==actual.length || workers[0].sha256!==sha(actual)) throw Error('offline worker artifact mismatch');
  return {schema:1,kind:manifest.kind,version:manifest.version,entries:manifest.entries.length,
    cacheBytes:manifest.entries.reduce((sum,e)=>sum+e.bytes,0),
    workerBytes:actual.length,workerSha256:sha(actual),registration:'not-run',inference:'not-run'};
}
