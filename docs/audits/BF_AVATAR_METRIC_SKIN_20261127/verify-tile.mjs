// Read the exact pinned PNG, including orientation and filters, without browser
// color conversion. Compare the packed runtime array with a separately derived
// analytical reference. No packages, network requests or user data.
import fs from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { packMetricSkinTile } from '../../../src/lib/avatarMetricSkinReview.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const file='public/assets/athlete-scan-pores.png',src=fs.readFileSync(file);
assert.equal(sha(src),'56628fec1902669f0cabb7b2dcda7f5bc7837d042db81f068805aa2a3cae0685');
const chunks=[],data=[];let width,height,channels;
for(let p=8;p<src.length;){
  const n=src.readUInt32BE(p),tag=src.toString('ascii',p+4,p+8),b=src.subarray(p+8,p+8+n);
  chunks.push(tag);
  if(tag==='IHDR'){width=b.readUInt32BE(0);height=b.readUInt32BE(4);assert.equal(b[8],8);assert.equal(b[12],0);channels=({0:1,2:3,6:4})[b[9]];assert(channels);}
  if(tag==='IDAT')data.push(b);
  p+=12+n;
}
assert.equal(width,256);assert.equal(height,256);
const raw=inflateSync(Buffer.concat(data)),stride=width*channels,pixels=new Uint8Array(width*height*channels);
assert.equal(raw.length,(stride+1)*height);
function paeth(a,b,c){const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;}
for(let y=0;y<height;y++){
  const mode=raw[y*(stride+1)];assert(mode<=4);
  for(let x=0;x<stride;x++){
    const i=y*stride+x,a=x>=channels?pixels[i-channels]:0,b=y?pixels[i-stride]:0,c=y&&x>=channels?pixels[i-stride-channels]:0;
    pixels[i]=(raw[y*(stride+1)+1+x]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][mode])&255;
  }
}
const heights=new Uint8Array(width*height);
for(let i=0;i<heights.length;i++){
  const j=i*channels;heights[i]=pixels[j];
  if(channels>=3){assert.equal(pixels[j+1],pixels[j]);assert.equal(pixels[j+2],pixels[j]);}
  if(channels===4)assert.equal(pixels[j+3],255);
}
const p=packMetricSkinTile(heights),ref=new Uint8Array(p.length),size=256;
const idx=(x,y)=>(y&255)*size+(x&255);
let clipped=0,energy=0,meanX=0,meanY=0,maxSlope=0,maxQuantError=0;
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=idx(x,y),g1=(heights[idx(x+1,y)]-heights[idx(x-1,y)])/510*size/45;
  const g2=(heights[idx(x,y+1)]-heights[idx(x,y-1)])/510*size/45;
  const len=Math.hypot(g1,g2),factor=Math.min(1,.9/(len||1));
  if(len>.9)clipped++;
  const dx=Math.round(127*g1*factor),dy=Math.round(127*g2*factor),e=(dx*dx+dy*dy)/127**2;
  ref.set([heights[i],128+dx,128+dy,Math.round(255*e)],i*4);
  maxQuantError=Math.max(maxQuantError,Math.abs(dx/127-g1*factor),Math.abs(dy/127-g2*factor));
  maxSlope=Math.max(maxSlope,Math.sqrt(e));energy+=e;meanX+=dx/127;meanY+=dy/127;
}
assert.deepEqual(p,ref);
const f=b=>{let h=2166136261;for(const x of b)h=Math.imul(h^x,16777619)>>>0;return h.toString(16).padStart(8,'0');};
const output={status:'PASS',source:file,sourceSha256:sha(src),pngChunks:chunks,channels,texels:heights.length,bytes:p.length,packedSha256:sha(p),fnv1a:f(p),clipped,rmsSlope:Math.sqrt(energy/heights.length),maxSlope,maxQuantError,meanSlope:[meanX/heights.length,meanY/heights.length],scope:'Exact raw PNG bytes, packed gradient/moment tile; no calibrated biological height.'};
fs.writeFileSync('docs/audits/BF_AVATAR_METRIC_SKIN_20261127/tile-verified.json',JSON.stringify(output,null,2),{flag:'wx'});
console.log('METRIC_TILE_VERIFIED',JSON.stringify(output));
