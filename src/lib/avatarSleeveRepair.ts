import * as THREE from 'three';

const SPLIT = [1252,1253,2122,2370] as const;
const CLUSTER = new Set<number>([...SPLIT,4381,4382,4383,4410]);
const REMOVE = [5270,5757,5758,5845,8100,8101,8102,8103,8236,8237,8242,8243,8334,8335] as const;
const EXPECTED_HASH=3738144389;
const fingerprint=(values:Iterable<number>)=>{
  let hash=2166136261;
  for(const value of values)hash=Math.imul(hash^(value|0),16777619)>>>0;
  return hash;
};

/** Remove a collapsed cap on the pinned left sleeve, after tailored rest
 * correction, before sculpt capture. Keep the four UV-split vertices but
 * make their geometric position, normal and skin weights identical. No
 * vertex reordering, extra draw call, or change to the original GLB. */
export function repairAvatarSleeve(garments:readonly THREE.SkinnedMesh[]):number {
  const shirt=garments.find(g=>g.name==='BODYFORGE_Shirt');
  if(!shirt || shirt.geometry.userData.BODYFORGE_tailored!=='tailored-v1')return 0;
  const g=shirt.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),
    joints=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight'),index=g.index;
  if(g.userData.BODYFORGE_sleeveRepair || p?.count!==4415 || n?.count!==p.count ||
      !(p instanceof THREE.BufferAttribute) || !(n instanceof THREE.BufferAttribute) ||
      !(weights instanceof THREE.BufferAttribute) || weights.count!==p.count ||
      !(weights.array instanceof Uint16Array) || !weights.normalized ||
      joints?.count!==p.count || index?.count!==25008 || fingerprint(index.array)!==EXPECTED_HASH)return 0;

  const anchor=new THREE.Vector3().fromBufferAttribute(p,SPLIT[0]);
  if(anchor.distanceTo(new THREE.Vector3(.30831039,1.30184460,.07638079))>.0002)return 0;
  const jointTuple=(i:number)=>[joints.getX(i),joints.getY(i),joints.getZ(i),joints.getW(i)];
  const expectedJoints=jointTuple(SPLIT[0]).join(',');
  if(expectedJoints!=='51,52,50,0')return 0;
  for(const i of SPLIT){
    if(new THREE.Vector3().fromBufferAttribute(p,i).distanceTo(anchor)>.000002 ||
      jointTuple(i).join(',')!==expectedJoints)return 0;
  }
  for(const i of CLUSTER)if(new THREE.Vector3().fromBufferAttribute(p,i).distanceTo(anchor)>.003)return 0;

  const kept:number[]=[],removed:number[]=[];
  const normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let offset=0;offset<index.count;offset+=3){
    const ids=[index.getX(offset),index.getX(offset+1),index.getX(offset+2)];
    const collapsed=ids.map(i=>CLUSTER.has(i)?SPLIT[0]:i);
    if(new Set(collapsed).size<3){removed.push(offset/3);continue;}
    if(ids.some(i=>CLUSTER.has(i)&&!SPLIT.some(s=>s===i)))return 0;
    if(ids.some(i=>SPLIT.some(s=>s===i))){
      const point=(v:THREE.Vector3,i:number)=>SPLIT.some(s=>s===i)?v.copy(anchor):v.fromBufferAttribute(p,i);
      point(a,ids[0]);point(b,ids[1]);point(c,ids[2]);
      normal.add(b.sub(a).cross(c.sub(a)));
    }
    kept.push(...ids);
  }
  if(removed.join(',')!==REMOVE.join(',')||normal.lengthSq()<1e-12)return 0;
  normal.normalize();
  if(normal.z<.75)return 0;
  // Average existing joint influences as integer weights, preserving
  // the normalized uint16 sum exactly. The UV attribute is untouched.
  const averages=[0,1,2].map(k=>Math.round(SPLIT.reduce((sum,i)=>sum+weights.array[i*4+k],0)/SPLIT.length));
  averages[0]+=65535-averages.reduce((sum,w)=>sum+w,0);
  if(averages.some(w=>w<0||w>65535))return 0;
  const correctedP=p.clone(),correctedN=n.clone(),correctedW=weights.clone();
  for(const i of SPLIT){
    correctedP.setXYZ(i,anchor.x,anchor.y,anchor.z);
    correctedN.setXYZ(i,normal.x,normal.y,normal.z);
    correctedW.array.set([...averages,0],i*4);
  }
  g.setAttribute('position',correctedP);
  g.setAttribute('normal',correctedN);
  g.setAttribute('skinWeight',correctedW);
  g.setIndex(new THREE.Uint16BufferAttribute(kept,1));
  g.userData.BODYFORGE_sleeveRepair='collapsed-cap-v1';
  return removed.length;
}
