import * as THREE from 'three';
import recipe from './avatarGarmentFit.json';

type Spec=typeof recipe.garments[number];
const fingerprint=(values:Iterable<number>)=>{
  let hash=2166136261;
  for(const value of values)hash=Math.imul(hash^(value|0),16777619)>>>0;
  return hash;
};
function read(attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute):Float32Array{
  const values=new Float32Array(attribute.count*3);
  for(let i=0;i<attribute.count;i++)values.set([attribute.getX(i),attribute.getY(i),attribute.getZ(i)],i*3);
  return values;
}

/** A topology-preserving rest-shape correction authored in Blender.
 * Call after the seam anchors have been validated and chest holes capped,
 * but before capturing the muscle growth baseline. Never touch skin weights,
 * albedo UVs, or the player's progression. Both garments commit together. */
function prepare(mesh:THREE.SkinnedMesh,spec:Spec){
  const g=mesh.geometry,p=g.getAttribute('position'),normal=g.getAttribute('normal'),index=g.index;
  if(g.userData.BODYFORGE_tailored || !p || p.count!==spec.vertexCount || p.itemSize!==3 ||
    !normal || normal.count!==p.count || !index ||
    !g.hasAttribute('skinWeight') || !g.hasAttribute('uv'))return;
  const rest=read(p),out=rest.slice();
  if(fingerprint(Array.from(rest,v=>Math.round(v*1e6)))!==spec.positionHash ||
    fingerprint(index.array)!==spec.indexHash)return;
  let previous=-1;
  for(const [i,x,y,z] of spec.edits){
    if(!Number.isInteger(i)||i<=previous||i>=p.count||
      ![x,y,z].every(Number.isInteger)||Math.hypot(x,y,z)>.009*1e5)return;
    previous=i;
    out[i*3]+=x/1e5;out[i*3+1]+=y/1e5;out[i*3+2]+=z/1e5;
  }
  // Match UV splits for normal correction, preserving each original normal.
  const weld=new Map<string,number>(),group=new Uint32Array(p.count);
  for(let i=0;i<p.count;i++){
    const k=[0,1,2].map(j=>Math.round(rest[i*3+j]*1e6)).join(',');
    if(!weld.has(k))weld.set(k,weld.size);
    group[i]=weld.get(k)!;
  }
  const oldSum=new Float64Array(weld.size*3),newSum=new Float64Array(oldSum.length);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),old=new THREE.Vector3(),next=new THREE.Vector3();
  function cross(points:Float32Array,ids:number[],target:THREE.Vector3){
    a.fromArray(points,ids[0]*3);b.fromArray(points,ids[1]*3);c.fromArray(points,ids[2]*3);
    return target.crossVectors(b.sub(a),c.sub(a));
  }
  for(let j=0;j<index.count;j+=3){
    const ids=[index.getX(j),index.getX(j+1),index.getX(j+2)];
    cross(rest,ids,old);cross(out,ids,next);
    // A second gate checks quantized runtime coordinates, not just Blender.
    if(old.length()>1e-10&&old.dot(next)/old.lengthSq()<=.15)return;
    for(const i of new Set(ids.map(i=>group[i]))){
      oldSum[i*3]+=old.x;oldSum[i*3+1]+=old.y;oldSum[i*3+2]+=old.z;
      newSum[i*3]+=next.x;newSum[i*3+1]+=next.y;newSum[i*3+2]+=next.z;
    }
  }
  const normals=read(normal),q=new THREE.Quaternion();
  for(let i=0;i<p.count;i++){
    old.fromArray(oldSum,group[i]*3);next.fromArray(newSum,group[i]*3);
    if(old.lengthSq()<1e-20||next.lengthSq()<1e-20)continue;
    q.setFromUnitVectors(old.normalize(),next.normalize());
    a.fromArray(normals,i*3).applyQuaternion(q).normalize();
    normals.set([a.x,a.y,a.z],i*3);
  }
  return {mesh,positions:out,normals,edited:spec.edits.length};
}
export function applyAvatarGarmentFit(garments:readonly THREE.SkinnedMesh[]):number{
  const targets=recipe.garments.map(spec=>{
    const mesh=garments.find(g=>g.name===spec.name);
    return mesh ? prepare(mesh,spec):undefined;
  });
  if(targets.some(t=>!t))return 0;
  let count=0;
  for(const target of targets){
    if(!target)continue;
    const {mesh,positions,normals,edited}=target;
    mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    mesh.geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    mesh.geometry.userData.BODYFORGE_tailored=recipe.version;
    count+=edited;
  }
  return count;
}
