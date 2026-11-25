import * as THREE from 'three';
import recipe from './avatarScanTransferField.json';

export const SCAN_REVIEW_ID = 'scan-depth-review-v1';
const {size, bounds, unitMeters, values} = recipe;
const [x0,x1,y0,y1] = bounds;
const stepX=(x1-x0)/(size-1),stepY=(y1-y0)/(size-1);
const smooth = (z:number) => THREE.MathUtils.smoothstep(z,.085,.115);
export function sampleScanDepth(x:number,y:number,z:number):number {
  if (!Number.isFinite(x+y+z) || x<=x0 || x>=x1 || y<=y0 || y>=y1 || z<=.085 ||
      (Math.abs(x)<=.031 && y>=1.586 && y<=1.616)) return 0;
  const u=(x-x0)/stepX,v=(y-y0)/stepY;
  const i=Math.min(size-2,Math.floor(u)),j=Math.min(size-2,Math.floor(v));
  const a=u-i,b=v-j,k=j*size+i;
  return ((values[k]*(1-a)+values[k+1]*a)*(1-b)+
      (values[k+size]*(1-a)+values[k+size+1]*a)*b)*unitMeters*smooth(z);
}

/** DEV-only scan-based shape review; no save changes or new draw calls.
 * All positions and normals are prepared and checked before committing.
 * The existing UVs, index order, skeleton and protected seams are retained. */
export function applyAvatarScanTransfer(root:THREE.Object3D):number {
  const body=root.getObjectByName('BODYFORGE_Body');
  if (!(body instanceof THREE.SkinnedMesh) || body.userData.BODYFORGE_groom!=='v2') return 0;
  const g=body.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),index=g.index;
  if (g.userData.facialContour!=='lower-face-contour-v3' || g.userData.scanTransfer ||
      p?.count!==65895 || n?.count!==p.count || p.itemSize!==3 || n.itemSize!==3 || !index ||
      recipe.id!==SCAN_REVIEW_ID || size!==128 || values.length!==size*size ||
      values.some(v=>!Number.isInteger(v)||Math.abs(v)>210)) return 0;
  const positions=new THREE.Float32BufferAttribute(p.count*3,3);
  const normals=new THREE.Float32BufferAttribute(p.count*3,3);
  const delta=new Float32Array(p.count),normal=new THREE.Vector3();
  let changed=0;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),d=sampleScanDepth(x,y,z);
    normal.fromBufferAttribute(n,i);
    delta[i]=d;
    if(d!==0){
      // Inverse transpose of z'=z+d(x,y,z). A central difference at
      // half a grid cell avoids unstable one-sided bilinear gradients.
      const gx=(sampleScanDepth(x+stepX*.5,y,z)-sampleScanDepth(x-stepX*.5,y,z))/stepX;
      const gy=(sampleScanDepth(x,y+stepY*.5,z)-sampleScanDepth(x,y-stepY*.5,z))/stepY;
      const gz=(sampleScanDepth(x,y,z+.00025)-sampleScanDepth(x,y,z-.00025))/.0005;
      const det=1+gz;
      if(!Number.isFinite(gx+gy+det)||det<.65||Math.abs(d)>.00211)return 0;
      const nz=normal.z/det;
      normal.set(normal.x-gx*nz,normal.y-gy*nz,nz).normalize();
      if(Math.abs(d)>.00005)changed++;
    }
    positions.setXYZ(i,x,y,z+d);
    normals.setXYZ(i,normal.x,normal.y,normal.z);
  }
  if(changed<3500||changed>4500)return 0;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  const before=new THREE.Vector3(),after=new THREE.Vector3();
  const cross=(attr:THREE.BufferAttribute|THREE.InterleavedBufferAttribute, i:number,j:number,k:number,out:THREE.Vector3)=>{
    a.fromBufferAttribute(attr,i);b.fromBufferAttribute(attr,j);c.fromBufferAttribute(attr,k);
    out.crossVectors(b.sub(a),c.sub(a));
  };
  for(let i=0;i<index.count;i+=3){
    const j=index.getX(i),k=index.getX(i+1),l=index.getX(i+2);
    if(!delta[j]&&!delta[k]&&!delta[l])continue;
    cross(p,j,k,l,before);cross(positions,j,k,l,after);
    if(before.length()>1e-10&&before.dot(after)/before.lengthSq()<=.55)return 0;
  }
  g.setAttribute('position',positions);g.setAttribute('normal',normals);
  g.computeBoundingBox();g.computeBoundingSphere();
  g.userData.scanTransfer=SCAN_REVIEW_ID;
  return changed;
}
