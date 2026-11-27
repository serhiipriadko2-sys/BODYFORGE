// BF-603: pinned local runtime only. No model download, publication or camera access.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const SDK_VERSION='1.1.1';
export const MODEL_REQUIREMENT=Object.freeze({
  state:'license-and-model-bytes-required',
  url:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  bytes:5777746,
  sha256:'59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
});
const pins=[
  ['vision_bundle.mjs',156139,'a84921e02321e582484c1f8126d344b5f33b791fa09c640a52e20ee8632068f1'],
  ['wasm/vision_wasm_internal.js',334128,'6522286aa32dd93eff17c3da002b0649516f87abfec7a80b5bfe5c9625caa5f8'],
  ['wasm/vision_wasm_internal.wasm',13519922,'0e101a010e262ef8e78f22e3c95b60a9705fd06962753c9acd6356d9fb56b7bd'],
  ['wasm/vision_wasm_module_internal.js',334166,'539a4386fd12d0723d6e900ec80467d168ba7290dda2f79e77a2181b8e906115'],
  ['wasm/vision_wasm_module_internal.wasm',13519940,'3b57e4b55ac6346bf940212e3e11250b308a6a474077385e2f527b119cf74525'],
  ['wasm/vision_wasm_nosimd_internal.js',333931,'942654dbdcebce08ea039af23d18e58bebf23c8607d74023d2df7071c8a7b638'],
  ['wasm/vision_wasm_nosimd_internal.wasm',12627509,'c9b1b69bb87baf9e529254d8559dcbcf4c5a9c0eda84f56a12f17d675335ec9c'],
];
export const RUNTIME_FILES=Object.freeze(pins.map(([path,bytes,sha256])=>Object.freeze({path,bytes,sha256})));
const equalPath=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
function directory(p){
  const s=fs.lstatSync(p);
  if(!s.isDirectory()||s.isSymbolicLink()||!equalPath(fs.realpathSync.native(p),p))throw Error('runtime directory boundary');
}
function regular(p){
  const s=fs.lstatSync(p,{bigint:true});
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||!equalPath(fs.realpathSync.native(p),p))throw Error('runtime file boundary');
  return s;
}
const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
export async function verifyPinnedFile(root,pin){
  // The verifier accepts only the pinned file set; never arbitrary manifest paths.
  if(!RUNTIME_FILES.some(p=>p.path===pin?.path&&p.bytes===pin.bytes&&p.sha256===pin.sha256))throw Error('unknown runtime pin');
  const filename=path.join(root,...pin.path.split('/'));
  const st=regular(filename);
  if(st.size!==BigInt(pin.bytes))throw Error('runtime size mismatch');
  const hash=createHash('sha256');let bytes=0;
  const file=await fs.promises.open(filename,fs.constants.O_RDONLY|(process.platform==='win32'?0:(fs.constants.O_NOFOLLOW??0)));
  try{
    if(identity(await file.stat({bigint:true}))!==identity(st)||identity(regular(filename))!==identity(st))throw Error('runtime file changed before read');
    for await(const chunk of file.createReadStream({autoClose:false,highWaterMark:128*1024})){
      bytes+=chunk.length;if(bytes>pin.bytes)throw Error('runtime size changed');
      hash.update(chunk);
    }
    if(identity(await file.stat({bigint:true}))!==identity(st)||identity(regular(filename))!==identity(st))throw Error('runtime file changed');
    if(bytes!==pin.bytes||hash.digest('hex')!==pin.sha256)throw Error('runtime hash mismatch');
  }finally{await file.close();}
  return {...pin};
}
export async function verifyInstalledRuntime(sdk){
  sdk=path.resolve(sdk);directory(sdk);directory(path.join(sdk,'wasm'));
  const pkg=path.join(sdk,'package.json');
  if(regular(pkg).size>65536n)throw Error('runtime package metadata too large');
  const meta=JSON.parse(fs.readFileSync(pkg,'utf8'));
  if(meta.name!=='@mediapipe/tasks-vision'||meta.version!==SDK_VERSION||meta.license!=='Apache-2.0')throw Error('runtime package version/license metadata mismatch');
  const wasmNames=fs.readdirSync(path.join(sdk,'wasm')).sort();
  const expected=RUNTIME_FILES.filter(p=>p.path.startsWith('wasm/')).map(p=>p.path.slice(5)).sort();
  if(JSON.stringify(wasmNames)!==JSON.stringify(expected))throw Error('runtime WASM set mismatch');
  for(const pin of RUNTIME_FILES)await verifyPinnedFile(sdk,pin);
  return {sdkVersion:SDK_VERSION,sdkLicenseMetadata:meta.license,files:RUNTIME_FILES.map(x=>({...x})),bytes:RUNTIME_FILES.reduce((n,x)=>n+x.bytes,0),model:MODEL_REQUIREMENT};
}
export async function prepareRuntimePack(project){
  project=path.resolve(project);directory(project);
  const sdk=path.join(project,'node_modules','@mediapipe','tasks-vision');
  const parent=path.join(project,'.bodyforge-qa');directory(parent);
  const rel='.bodyforge-qa/bf603-local-runtime-probe';
  // This is a local QA-only materialization; no unreviewed output path.
  execFileSync('git',['check-ignore','--quiet',rel],{cwd:project,stdio:'ignore',timeout:10000});
  const metadata=await verifyInstalledRuntime(sdk);
  const pack=fs.mkdtempSync(path.join(parent,'bf603-local-runtime-'));
  directory(pack);fs.mkdirSync(path.join(pack,'wasm'));
  for(const pin of RUNTIME_FILES){
    const from=path.join(sdk,...pin.path.split('/')),to=path.join(pack,...pin.path.split('/'));
    // Fresh exclusive destination, bounded stream; independent full read-back below.
    await pipeline(fs.createReadStream(from,{highWaterMark:128*1024}),fs.createWriteStream(to,{flags:'wx'}));
    await verifyPinnedFile(pack,pin);
  }
  await verifyInstalledRuntime(sdk);
  const result={schemaVersion:1,status:'runtime-only-verified',scope:'local QA only; not a redistribution approval',...metadata};
  const manifest=path.join(pack,'runtime-manifest.json'),data=JSON.stringify(result,null,2)+'\n';
  // A completion manifest is written only after every pinned asset passes.
  fs.writeFileSync(manifest,data,{flag:'wx'});
  if(fs.readFileSync(manifest,'utf8')!==data)throw Error('runtime manifest read-back failed');
  return {pack,manifest:result};
}
if(process.argv[1]&&equalPath(process.argv[1],fileURLToPath(import.meta.url))){
  try{
    if(process.argv.length!==3||!['--verify-installed','--prepare-local'].includes(process.argv[2]))throw Error('expected --verify-installed or --prepare-local');
    const project=fileURLToPath(new URL('../',import.meta.url));
    const result=process.argv[2]==='--verify-installed'
      ? await verifyInstalledRuntime(path.join(project,'node_modules','@mediapipe','tasks-vision'))
      : await prepareRuntimePack(project);
    console.log(JSON.stringify(result,null,2));
  }catch{console.error('BODYFORGE_OFFLINE_RUNTIME_BLOCKED');process.exitCode=16;}
}
