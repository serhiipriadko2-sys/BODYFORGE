// Read-only local endpoint and source-boundary QC, no user data.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
const origin=process.env.BODYFORGE_QA_ORIGIN||'http://127.0.0.1:5173';
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const route='/_bodyforge/review/head-volume-v4.json';
function request(path,headers={},method='GET'){
  return new Promise((resolve,reject)=>{
    const req=http.request(origin+path,{headers,method,timeout:10000},res=>{
      const chunks=[];let size=0;
      res.on('data',b=>{size+=b.length;if(size>100000){req.destroy(Error('Unexpected oversized response'));return;}chunks.push(b)});
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(Error('HTTP timeout')));
    req.on('error',reject);req.end();
  });
}
const actual=await request(route);
assert.equal(actual.status,200);
assert.match(actual.headers['content-type'],/^application\/json/);
assert.equal(actual.headers['cache-control'],'no-store');
const raw=JSON.parse(fs.readFileSync('.bodyforge-qa/scan-reference-artec/head-volume-review-v4.json','utf8'));
const expected=Object.fromEntries(['id','bodySha256','baseline','field','zones'].map(k=>[k,raw[k]]));
assert.deepEqual(JSON.parse(actual.body),expected);
assert(actual.body.length<2000);
const checks=[{case:'valid local numeric recipe',status:actual.status,bytes:Buffer.byteLength(actual.body)}];
for(const [name,path,headers,method] of [
  ['raw', '/.bodyforge-qa/scan-reference-artec/head-volume-review-v4.json', {}, 'GET'],
  ['raw encoded', '/%2ebodyforge-qa/scan-reference-artec/head-volume-review-v4.json', {}, 'GET'],
  ['forwarded',route,{'X-Forwarded-For':'192.0.2.1'},'GET'],
  ['origin',route,{'Origin':'https://example.invalid'},'GET'],
  ['cross-site',route,{'Sec-Fetch-Site':'cross-site'},'GET'],
  ['query',route+'?extra=1',{},'GET'],
  ['post',route,{},'POST'],
  ['host',route,{'Host':'example.invalid'},'GET'],
]){
  const r=await request(path,headers,method);
  assert.equal(r.status,403,name);
  assert(!r.body.includes('BF_HEAD_VOLUME_REVIEW_V4'),name+' leaked recipe');
  checks.push({case:name,status:r.status});
}
console.log(JSON.stringify({status:'PASS',origin,checks},null,2));
