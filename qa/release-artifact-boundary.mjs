// BF-701: exact public baseline and generated-build boundary.
// Standalone QA. No application import, network, deployment, or automatic policy update.
// This validates names and bytes; it does not certify licenses or secret-free contents.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_FILES=512, MAX_FILE_BYTES=64*1024*1024, MAX_TOTAL_BYTES=256*1024*1024;
const sha=value=>createHash('sha256').update(value).digest('hex');
const hex=/^[a-f0-9]{64}$/;
const rootPublic=new Set(['favicon.svg','manifest.webmanifest']);
const policyScope='public-byte-baseline-not-license-approval';
export class BoundaryError extends Error {
  constructor(code,relative){
    // Do not leak unexpected names (which may contain private information).
    super(code+(typeof relative==='string'?' entry-sha256='+sha(relative):''));
    this.name='BoundaryError';this.code=code;
  }
}
function requireThat(ok,code,name){if(!ok)throw new BoundaryError(code,name);}
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fields=(x,keys)=>isObject(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const sort=(a,b)=>a<b?-1:a>b?1:0;
const samePath=(a,b)=>process.platform==='win32'?path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase():path.resolve(a)===path.resolve(b);
function pathPresent(filename){
  try{fs.lstatSync(filename);return true;}
  catch(error){if(error?.code==='ENOENT')return false;throw error;}
}
function safeName(name){
  if(typeof name!=='string'||name.length===0||name.length>200)return false;
  const parts=name.split('/');
  return parts.length<=2&&parts.every(p=>/^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$/.test(p)&&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
}
function publicName(name){
  if(!safeName(name))return false;
  if(rootPublic.has(name)||name==='third-party-notices.txt')return true;
  return /^assets\/[a-z0-9_-]+\.(?:png|jpg|hdr|glb)$/.test(name)||
    /^assets\/athlete-[a-z0-9_-]+-source\.md$/.test(name)||
    /^fonts\/(?:[a-z0-9_-]+\.woff2|(?:Manrope|Unbounded)-OFL\.txt|README\.md)$/.test(name)||
    /^icons\/bodyforge-[a-z0-9_-]+\.(?:png|svg)$/.test(name);
}
function generatedName(name){
  return safeName(name)&&(name==='index.html'||name==='bodyforge-offline.js'||/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(name));
}
function entriesMap(entries,allowed){
  requireThat(Array.isArray(entries)&&entries.length>0&&entries.length<=MAX_FILES,'MANIFEST_COUNT_INVALID');
  const map=new Map(),folded=new Set();let total=0;
  for(const item of entries){
    requireThat(fields(item,['path','bytes','sha256']),'MANIFEST_ENTRY_INVALID');
    const n=item.path;
    requireThat(allowed(n),'MANIFEST_PATH_FORBIDDEN',n);
    requireThat(Number.isSafeInteger(item.bytes)&&item.bytes>0&&item.bytes<=MAX_FILE_BYTES&&typeof item.sha256==='string'&&hex.test(item.sha256),'MANIFEST_BYTES_OR_HASH_INVALID',n);
    requireThat(!folded.has(n.toLowerCase()),'MANIFEST_DUPLICATE_OR_CASE_COLLISION',n);
    folded.add(n.toLowerCase());map.set(n,{path:n,bytes:item.bytes,sha256:item.sha256});
    total+=item.bytes;requireThat(total<=MAX_TOTAL_BYTES,'MANIFEST_SIZE_LIMIT');
  }
  return new Map([...map].sort(([a],[b])=>sort(a,b)));
}
export function validatePublicPolicy(policy){
  requireThat(fields(policy,['schemaVersion','scope','sourceInventorySha256','files'])&&policy.schemaVersion===1&&policy.scope===policyScope&&typeof policy.sourceInventorySha256==='string'&&hex.test(policy.sourceInventorySha256),'POLICY_INVALID');
  const expected=entriesMap(policy.files,publicName);
  for(const n of rootPublic)requireThat(expected.has(n),'PUBLIC_REQUIRED_ENTRY_MISSING',n);
  return expected;
}
function statKey(s){
  return [s.dev,s.ino,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
}
function checkedStat(root,n,kind){
  const filename=n?path.join(root,...n.split('/')):root;
  const st=fs.lstatSync(filename,{bigint:true});
  requireThat(!st.isSymbolicLink(),'SYMLINK_OR_JUNCTION_FORBIDDEN',n);
  requireThat(kind==='directory'?st.isDirectory():st.isFile()&&st.nlink===1n,'UNEXPECTED_TYPE_OR_HARDLINK',n);
  requireThat(samePath(fs.realpathSync.native(filename),filename),'NONCANONICAL_PATH',n);
  return st;
}
function metadata(root,expected){
  checkedStat(root,'','directory');
  const dirs=new Set();
  for(const n of expected.keys()){
    const slash=n.lastIndexOf('/');
    if(slash!==-1)dirs.add(n.slice(0,slash));
  }
  const found=new Map(),seenDirs=new Set();
  const walk=(relative='')=>{
    const dir=relative?path.join(root,relative):root;
    for(const segment of fs.readdirSync(dir).sort(sort)){
      const n=relative?relative+'/'+segment:segment;
      requireThat(safeName(n),'FORBIDDEN_PATH',n);
      // Reject unexpected paths before stat/open or reading any file contents.
      requireThat(expected.has(n)||dirs.has(n),'UNEXPECTED_ENTRY',n);
      if(dirs.has(n)){
        checkedStat(root,n,'directory');seenDirs.add(n);walk(n);
      }else{
        const st=checkedStat(root,n,'file');
        requireThat(st.size===BigInt(expected.get(n).bytes),'SIZE_MISMATCH',n);
        found.set(n,statKey(st));
      }
    }
  };
  walk();
  for(const n of dirs)requireThat(seenDirs.has(n),'MISSING_DIRECTORY',n);
  for(const n of expected.keys())requireThat(found.has(n),'MISSING_FILE',n);
  return found;
}
function hashApprovedFile(root,item,identity){
  const n=item.path,filename=path.join(root,...n.split('/'));
  requireThat(statKey(checkedStat(root,n,'file'))===identity,'FILE_CHANGED_BEFORE_OPEN',n);
  const flags=fs.constants.O_RDONLY|(process.platform==='win32'?0:(fs.constants.O_NOFOLLOW??0));
  const fd=fs.openSync(filename,flags);
  try{
    requireThat(statKey(fs.fstatSync(fd,{bigint:true}))===identity,'FILE_CHANGED_ON_OPEN',n);
    requireThat(statKey(checkedStat(root,n,'file'))===identity,'PATH_CHANGED_ON_OPEN',n);
    const digest=createHash('sha256'),buf=Buffer.allocUnsafe(128*1024);
    let remaining=item.bytes;
    while(remaining>0){
      const size=fs.readSync(fd,buf,0,Math.min(remaining,buf.length),null);
      requireThat(size>0,'TRUNCATED_READ',n);digest.update(buf.subarray(0,size));remaining-=size;
    }
    requireThat(fs.readSync(fd,buf,0,1,null)===0,'FILE_GREW_DURING_READ',n);
    requireThat(statKey(fs.fstatSync(fd,{bigint:true}))===identity,'FILE_CHANGED_DURING_READ',n);
    requireThat(digest.digest('hex')===item.sha256,'HASH_MISMATCH',n);
  }finally{fs.closeSync(fd);}
}
function verifyTree(directory,expected){
  const root=path.resolve(directory);
  const before=metadata(root,expected);
  // Complete the entire metadata check before hashing any approved bytes.
  for(const item of expected.values())hashApprovedFile(root,item,before.get(item.path));
  const after=metadata(root,expected);
  for(const [n,id] of before)requireThat(after.get(n)===id,'TREE_CHANGED_DURING_VERIFY',n);
  return {files:[...expected.values()],count:expected.size,bytes:[...expected.values()].reduce((s,x)=>s+x.bytes,0)};
}
export function verifyPublic(directory,policy){
  return verifyTree(directory,validatePublicPolicy(policy));
}
export function generatedEntries(result){
  const bundles=Array.isArray(result)?result:[result];
  requireThat(bundles.length>0&&bundles.every(b=>isObject(b)&&Array.isArray(b.output)),'BUILD_OUTPUT_INVALID');
  const entries=[];
  for(const bundle of bundles)for(const item of bundle.output){
    requireThat(isObject(item)&&generatedName(item.fileName),'GENERATED_PATH_FORBIDDEN',item?.fileName);
    const n=item.fileName;
    requireThat(n!=='bodyforge-offline.js'||item.type==='asset','BUILD_OUTPUT_TYPE_INVALID',n);
    let data;
    if(item.type==='chunk'&&typeof item.code==='string'&&n.endsWith('.js'))data=Buffer.from(item.code,'utf8');
    else if(item.type==='asset'&&(typeof item.source==='string'||item.source instanceof Uint8Array))data=Buffer.from(item.source);
    else throw new BoundaryError('BUILD_OUTPUT_TYPE_INVALID',n);
    entries.push({path:n,bytes:data.length,sha256:sha(data)});
  }
  const expected=entriesMap(entries,generatedName);
  requireThat(expected.has('index.html'),'BUILD_INDEX_MISSING');
  requireThat([...expected.keys()].filter(n=>/^assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(n)).length===1,'BUILD_ENTRY_COUNT_INVALID');
  return [...expected.values()];
}
export function verifyDistribution(directory,policy,buildResult){
  const publicEntries=[...validatePublicPolicy(policy).values()];
  const generated=generatedEntries(buildResult);
  const expected=entriesMap([...publicEntries,...generated],n=>publicName(n)||generatedName(n));
  const verified=verifyTree(directory,expected);
  return {...verified,publicCount:publicEntries.length,generatedCount:generated.length};
}
export async function buildAndVerify(root,policy){
  const project=path.resolve(root),publicDir=path.join(project,'public'),dist=path.join(project,'dist');
  // Never reuse, empty, or delete an existing dist directory.
  requireThat(!pathPresent(dist),'OUTPUT_ALREADY_EXISTS');
  requireThat(!fs.readdirSync(project).some(n=>/^\.env(?:\.|$)/i.test(n)),'LOCAL_ENV_FILES_FORBIDDEN');
  requireThat(!Object.keys(process.env).some(n=>/^VITE_/i.test(n)),'VITE_ENV_VARIABLES_FORBIDDEN');
  const pre=verifyPublic(publicDir,policy);
  const { build }=await import('vite');
  const boundary={
    name:'bodyforge-qa-exact-artifact-boundary',apply:'build',
    configResolved(config){
      requireThat(samePath(config.root,project)&&typeof config.publicDir==='string'&&samePath(config.publicDir,publicDir)&&
        samePath(path.resolve(config.root,config.build.outDir),dist)&&config.build.emptyOutDir===false&&config.build.copyPublicDir!==false&&
        config.build.write!==false&&!config.build.watch&&!config.build.ssr,'UNEXPECTED_BUILD_CONFIG');
      requireThat(!pathPresent(dist),'OUTPUT_ALREADY_EXISTS');
      verifyPublic(publicDir,policy);
    },
  };
  const result=await build({root:project,configFile:path.join(project,'vite.config.ts'),logLevel:'silent',clearScreen:false,
    plugins:[boundary],build:{outDir:dist,emptyOutDir:false,write:true}});
  const post=verifyPublic(publicDir,policy);
  requireThat(JSON.stringify(pre)===JSON.stringify(post),'PUBLIC_TREE_CHANGED_DURING_BUILD');
  return {status:'TESTED_LOCAL_ARTIFACT_BOUNDARY',public:post,distribution:verifyDistribution(dist,policy,result),
    limitations:['Path and exact-byte verification, not content or license certification.','Run build mode on a clean disposable snapshot or clean CI checkout. No deployment.']};
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    requireThat(process.argv.length===3&&['--public','--build'].includes(process.argv[2]),'USAGE_NODE_QA_RELEASE_ARTIFACT_BOUNDARY_MJS_PUBLIC_OR_BUILD');
    const policy=JSON.parse(fs.readFileSync(new URL('./public-artifact-allowlist.json',import.meta.url),'utf8'));
    const result=process.argv[2]==='--public'
      ? {status:'PUBLIC_BYTE_BASELINE_MATCH',public:verifyPublic(path.resolve('public'),policy)}
      : await buildAndVerify(process.cwd(),policy);
    console.log(JSON.stringify(result,null,2));
  }catch(error){
    // Native errors may carry private paths; do not dump stacks or environment.
    console.error('BODYFORGE_ARTIFACT_BOUNDARY_FAIL',error instanceof BoundaryError?error.message:'IO_OR_BUILD_ERROR');
    process.exitCode=12;
  }
}
