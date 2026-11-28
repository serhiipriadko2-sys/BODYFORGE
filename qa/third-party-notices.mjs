// Pinned web runtime license evidence; no network or automatic policy change.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const deps=[
  [
    "@mediapipe/tasks-vision",
    "1.1.1",
    "Apache-2.0",
    "qa/license-inputs/mediapipe-1.1.1-LICENSE.txt",
    12331,
    "8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8"
  ],
  [
    "lucide-react",
    "0.468.0",
    "ISC",
    "node_modules/lucide-react/LICENSE",
    880,
    "1e7290b35280a048667bbf0ebabac1c7fd52a75300e8b2946ac165715997f2bc"
  ],
  [
    "react",
    "19.3.1",
    "MIT",
    "node_modules/react/LICENSE",
    1088,
    "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93"
  ],
  [
    "react-dom",
    "19.3.1",
    "MIT",
    "node_modules/react-dom/LICENSE",
    1088,
    "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93"
  ],
  [
    "scheduler",
    "0.28.0",
    "MIT",
    "node_modules/scheduler/LICENSE",
    1088,
    "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93"
  ],
  [
    "three",
    "0.186.1",
    "MIT",
    "node_modules/three/LICENSE",
    1081,
    "8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc"
  ]
];
const model=["BlazePose GHUM Pose Landmarker Lite (float16, version 1)","Apache-2.0","qa/license-inputs/apache-2.0.txt",11358,"cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"];
const header="BODYFORGE / THIRD-PARTY NOTICES\n\nPinned web runtime and model notices. This file does not change BODYFORGE licensing or certify complete redistribution compliance.\nMediaPipe source license: https://github.com/google-ai-edge/mediapipe/blob/v1.1.1/LICENSE\nBlazePose model card: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf\nModel: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task\nModel SHA-256: 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a\nFonts: /fonts/Manrope-OFL.txt, /fonts/Unbounded-OFL.txt and /fonts/README.md.\nAvatar attribution: individual /assets/athlete-*-source.md files in the distribution.\nOriginal license texts follow (line endings normalized to LF).\n";
export const NOTICE_PATH='third-party-notices.txt';
function read(root,rel,limit){
  const p=path.resolve(root,rel),st=fs.lstatSync(p),real=fs.realpathSync.native(p);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size<1||st.size>limit||(process.platform==='win32'?real.toLowerCase()!==p.toLowerCase():real!==p))throw Error('notice input boundary');
  const b=fs.readFileSync(p);if(b.length!==st.size)throw Error('notice input changed');return b;
}
function pinned(root,p,n,h){const b=read(root,p,65536);if(b.length!==n||sha(b)!==h)throw Error('notice source pin mismatch');
  const s=new TextDecoder('utf-8',{fatal:true}).decode(b).replace(/\r\n/g,'\n');if(s.includes('\r')||s.includes('\0'))throw Error('notice encoding');return s;}
export function renderThirdPartyNotices(root){
  const lock=JSON.parse(read(root,'package-lock.json',4*1024*1024).toString('utf8'));
  const actual=Object.entries(lock.packages??{}).filter(([n,v])=>n&&!v.dev).map(([n,v])=>[n,v.version,v.license]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  const expected=deps.map(([n,v,l])=>['node_modules/'+n,v,l]);if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('runtime notice inventory mismatch');
  const sections=[header];
  for(const [name,version,license,p,n,h] of deps){
    const meta=JSON.parse(read(root,'node_modules/'+name+'/package.json',1024*1024).toString('utf8'));
    if(meta.name!==name||meta.version!==version||meta.license!==license)throw Error('runtime notice metadata mismatch');
    sections.push('===== '+name+' '+version+' / '+license+' =====\n'+pinned(root,p,n,h));
  }
  const [name,license,p,n,h]=model;sections.push('===== '+name+' / '+license+' =====\n'+pinned(root,p,n,h));
  const b=Buffer.from(sections.join('\n\n')+'\n','utf8');if(b.length>65536)throw Error('notice size');return b;
}
export function verifyThirdPartyNotices(root){
  const expected=renderThirdPartyNotices(root),actual=read(root,'public/'+NOTICE_PATH,65536);
  if(!actual.equals(expected))throw Error('third-party notice bytes mismatch');
  return {status:'verified-pinned-web-notices',packages:deps.length,model:1,bytes:actual.length,sha256:sha(actual),licenseReview:'incomplete-transitive-native-and-assets'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==2)throw Error('verify only');console.log('BF_THIRD_PARTY_NOTICES_PASS',JSON.stringify(verifyThirdPartyNotices(path.resolve(import.meta.dirname,'..'))));}
  catch{console.error('BF_THIRD_PARTY_NOTICES_FAIL');process.exitCode=16;}
}
