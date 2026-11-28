// BF-603: local QA only. No application import, public asset, or redistribution.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MODEL_REQUIREMENT } from './offline-pose-pack.mjs';

export const MODEL_FILENAME='pose_landmarker_lite.task';
export const MODEL_DIR='.bodyforge-qa/bf603-model-probe-20261127';
// Official GCS HEAD verified 2026-11-27; the card's generation 1682624738331272 returned 404.
export const MODEL_GENERATION='1682624736756847';
export const MODEL_SOURCE=MODEL_REQUIREMENT.url+'?generation='+MODEL_GENERATION;
const root=fileURLToPath(new URL('../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const eq=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
function canonicalDirectory(dir){
  const s=fs.lstatSync(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||!eq(fs.realpathSync.native(dir),dir))throw Error('model directory boundary');
}
function regular(file){
  const s=fs.lstatSync(file,{bigint:true});
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||!eq(fs.realpathSync.native(file),file))throw Error('model file boundary');
  return s;
}
const identity=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
export function validateModelBytes(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.byteLength!==MODEL_REQUIREMENT.bytes)throw Error('model size mismatch');
  if(sha(bytes)!==MODEL_REQUIREMENT.sha256)throw Error('model hash mismatch');
  return {bytes:bytes.byteLength,sha256:MODEL_REQUIREMENT.sha256};
}
export async function readVerifiedModel(dir){
  dir=path.resolve(dir);canonicalDirectory(dir);
  const filename=path.join(dir,MODEL_FILENAME),before=regular(filename);
  if(before.size!==BigInt(MODEL_REQUIREMENT.bytes))throw Error('model size mismatch');
  const handle=await fs.promises.open(filename,fs.constants.O_RDONLY|(process.platform==='win32'?0:(fs.constants.O_NOFOLLOW??0)));
  try{
    if(identity(await handle.stat({bigint:true}))!==identity(before)||identity(regular(filename))!==identity(before))throw Error('model changed before read');
    const data=Buffer.alloc(MODEL_REQUIREMENT.bytes);let offset=0;
    while(offset<data.length){
      const {bytesRead}=await handle.read(data,offset,data.length-offset,offset);
      if(!bytesRead)throw Error('model truncated');
      offset+=bytesRead;
    }
    const extra=Buffer.alloc(1);
    if((await handle.read(extra,0,1,offset)).bytesRead!==0)throw Error('model size changed');
    if(identity(await handle.stat({bigint:true}))!==identity(before)||identity(regular(filename))!==identity(before))throw Error('model changed during read');
    validateModelBytes(data);
    return data;
  }finally{await handle.close();}
}
export async function readModelResponse(response){
  if(response.status!==200||response.redirected||!response.body)throw Error('model HTTP response rejected');
  const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding');
  if(length!==null&&length!==String(MODEL_REQUIREMENT.bytes))throw Error('model HTTP size mismatch');
  if(encoding!==null&&encoding.toLowerCase()!=='identity')throw Error('model HTTP encoding rejected');
  const data=Buffer.alloc(MODEL_REQUIREMENT.bytes),reader=response.body.getReader();
  let offset=0,done=false;
  try{
    while(true){
      const next=await reader.read();
      if(next.done){done=true;break;}
      if(!(next.value instanceof Uint8Array)||offset+next.value.byteLength>data.length)throw Error('model HTTP size limit');
      data.set(next.value,offset);offset+=next.value.byteLength;
    }
    if(offset!==data.length)throw Error('model HTTP truncated');
    validateModelBytes(data);
    return data;
  }finally{
    if(!done)await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}
function localDirectory(project){
  project=path.resolve(project);canonicalDirectory(project);
  canonicalDirectory(path.join(project,'.bodyforge-qa'));
  execFileSync('git',['check-ignore','--quiet',MODEL_DIR+'/'+MODEL_FILENAME],{cwd:project,stdio:'ignore',timeout:10000});
  return path.join(project,MODEL_DIR);
}
// Explicit operator-only command; release gates must never invoke acquisition.
export async function acquireLocalModel(project){
  const dir=localDirectory(project);
  if(fs.existsSync(dir))throw Error('model target already exists; verify separately');
  const response=await fetch(MODEL_SOURCE,{redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(60000)});
  if(response.url!==MODEL_SOURCE)throw Error('model HTTP URL mismatch');
  const generation=response.headers.get('x-goog-generation');
  if(generation!==MODEL_GENERATION)throw Error('model generation mismatch');
  const data=await readModelResponse(response);
  // All incoming bytes are bounded and checked before any destination write.
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir,MODEL_FILENAME),data,{flag:'wx'});
  const verified=await readVerifiedModel(dir);
  const manifest={schemaVersion:1,status:'model-bytes-verified-local',scope:'local QA only; not distribution approval',source:MODEL_SOURCE,generation:MODEL_GENERATION,observedGeneration:generation,licenseEvidence:'https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite',...validateModelBytes(verified)};
  const file=path.join(dir,'model-manifest.json'),serialized=JSON.stringify(manifest,null,2)+'\n';
  fs.writeFileSync(file,serialized,{flag:'wx'});
  if(fs.readFileSync(file,'utf8')!==serialized)throw Error('model manifest read-back failed');
  return manifest;
}
if(process.argv[1]&&eq(process.argv[1],fileURLToPath(import.meta.url))){
  try{
    if(process.argv.length!==3||!['--verify-local','--acquire-local'].includes(process.argv[2]))throw Error('expected --verify-local or --acquire-local');
    const result=process.argv[2]==='--acquire-local'?await acquireLocalModel(root):{status:'model-bytes-verified-local',...validateModelBytes(await readVerifiedModel(localDirectory(root)))};
    console.log(JSON.stringify(result,null,2));
  }catch(error){
    const reason=error instanceof Error&&/^(model |expected --)/.test(error.message)?error.message:'local model I/O or network failure';
    console.error('BF603_MODEL_BLOCKED',reason);process.exitCode=16;
  }
}
