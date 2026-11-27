import * as THREE from 'three';

/** Local shoulder weight-regularization experiment. The solver is executed
 * once on bind topology, never per frame. Original GLB is not modified.
 * Quantized four-influence skinning remains the runtime representation. */
export const SHOULDER_TRANSITION_ID = 'BF_SHOULDER_TRANSITION_REVIEW_V1';
const ramp=(x:number,a:number,b:number)=>{
  const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);
};
export function shoulderTransitionMask(x:number,y:number):number{
  const a=Math.abs(x);
  const shoulder=ramp(a,.125,.17)*(1-ramp(a,.30,.37))*ramp(y,1.22,1.30)*(1-ramp(y,1.47,1.53));
  const collar=ramp(a,.055,.10)*(1-ramp(a,.20,.27))*ramp(y,1.40,1.46)*(1-ramp(y,1.50,1.54));
  return Math.max(shoulder,collar);
}
type Vertex={representative:number;members:number[];mask:number;neighbors:Set<number>};
export type ShoulderWeightCandidate={
  indices:THREE.BufferAttribute;weights:THREE.BufferAttribute;
  changed:number;weldedChanged:number;maxVariation:number;activeVertices:number;
};

export function prepareShoulderWeights(mesh:THREE.SkinnedMesh,iterations:number,blend:number,sourceIndex?:THREE.BufferAttribute):ShoulderWeightCandidate|undefined{
  const g=mesh.geometry,p=g.getAttribute('position'),joints=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight'),index=sourceIndex??g.index;
  if(!p||p.itemSize!==3||!index||!(joints instanceof THREE.BufferAttribute)||!(weights instanceof THREE.BufferAttribute)||
     !(joints.array instanceof Uint8Array)||!(weights.array instanceof Uint16Array)||joints.normalized||!weights.normalized||
     joints.itemSize!==4||weights.itemSize!==4||joints.count!==p.count||weights.count!==p.count||
     mesh.skeleton.bones.length!==163||!Number.isInteger(iterations)||iterations<1||iterations>40||!Number.isFinite(blend)||blend<=0||blend>1)return;
  // Weld only the solver graph. UV topology and original buffer order stay intact.
  const lookup=new Map<string,number>(),vertices:Vertex[]=[],group=new Uint32Array(p.count);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(!Number.isFinite(x+y+z))return;
    const k=[x,y,z].map(v=>Math.round(v*1e6)).join(',');
    let n=lookup.get(k);
    if(n===undefined){n=vertices.length;lookup.set(k,n);vertices.push({representative:i,members:[],mask:shoulderTransitionMask(x,y),neighbors:new Set()});}
    vertices[n].members.push(i);group[i]=n;
  }
  for(let i=0;i<index.count;i+=3){
    const a=group[index.getX(i)],b=group[index.getX(i+1)],c=group[index.getX(i+2)];
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      if(u===v)continue;
      if(vertices[u].mask>0)vertices[u].neighbors.add(v);
      if(vertices[v].mask>0)vertices[v].neighbors.add(u);
    }
  }
  const active=vertices.map((v,i)=>v.mask>0&&v.neighbors.size?i:-1).filter(i=>i>=0);
  if(!active.length)return;
  const local=[...new Set(active.flatMap(i=>[i,...vertices[i].neighbors]))];
  const remap=new Map(local.map((i,n)=>[i,n]));
  const boneIds=[...new Set(local.flatMap(i=>{
    const row=vertices[i].representative*4;
    return Array.from({length:4},(_,k)=>weights.array[row+k]>0?joints.array[row+k]:-1).filter(k=>k>=0);
  }))].sort((a,b)=>a-b);
  if(!boneIds.length||boneIds.some(i=>i>=mesh.skeleton.bones.length))return;
  const columns=boneIds.length,boneColumn=new Map(boneIds.map((id,k)=>[id,k]));
  const base=new Float64Array(local.length*columns);
  for(const [i,n] of remap){
    const v=vertices[i],row=n*columns,raw=v.representative*4;
    let sum=0;
    for(let k=0;k<4;k++){
      const w=weights.array[raw+k];
      if(w){base[row+boneColumn.get(joints.array[raw+k])!]+=w;sum+=w;}
    }
    if(sum<65532||sum>65538)return;
    for(let k=0;k<columns;k++)base[row+k]/=sum;
    // Do not join genuinely different influences at a coincident seam.
    if(v.mask>0)for(const member of v.members){
      const offset=member*4;
      for(let k=0;k<4;k++)if(joints.array[offset+k]!==joints.array[raw+k]||weights.array[offset+k]!==weights.array[raw+k])return;
    }
  }
  const rows=active.map(i=>{
    const v=vertices[i];return {v,row:remap.get(i)!*columns,neighbors:[...v.neighbors].map(n=>remap.get(n)!*columns)};
  });
  let a=base.slice(),b=base.slice();
  for(let it=0;it<iterations;it++){
    for(const {v,row,neighbors} of rows){
      const step=.65*v.mask,inv=step/neighbors.length;
      for(let k=0;k<columns;k++){
        let sum=0;for(const n of neighbors)sum+=a[n+k];
        b[row+k]=(1-step)*a[row+k]+inv*sum;
      }
    }
    [a,b]=[b,a];
  }
  const outJ=joints.clone(),outW=weights.clone();
  let changed=0,weldedChanged=0,maxVariation=0;
  for(const {v,row} of rows){
    const list=boneIds.map((id,k)=>({id,w:base[row+k]+blend*v.mask*(a[row+k]-base[row+k])})).sort((a,b)=>b.w-a.w||a.id-b.id).slice(0,4);
    const total=list.reduce((n,x)=>n+x.w,0);
    if(total<.9||!Number.isFinite(total))continue;
    const packed=list.map(x=>Math.round(65535*x.w/total));
    packed[0]+=65535-packed.reduce((n,w)=>n+w,0);
    if(packed.some(w=>w<0||w>65535))return;
    const old=new Map(boneIds.map((id,k)=>[id,base[row+k]]));
    for(let k=0;k<list.length;k++)old.set(list[k].id,old.get(list[k].id)!-packed[k]/65535);
    const variation=[...old.values()].reduce((n,w)=>n+Math.abs(w),0)*.5;
    // Keep the experiment bounded; no large reassignment of joint ownership.
    if(variation>.25)return;
    if(variation<2/65535)continue;
    maxVariation=Math.max(maxVariation,variation);weldedChanged++;
    for(const i of v.members){
      for(let k=0;k<4;k++){
        outJ.array[i*4+k]=list[k]?.id??0;outW.array[i*4+k]=packed[k]??0;
      }
      changed++;
    }
  }
  return {indices:outJ,weights:outW,changed,weldedChanged,maxVariation,activeVertices:active.length};
}

/** One local review install, after athletic pose and garment repairs, before
 * growth/idle capture. Use the original body index retained before wardrobe
 * partitioning. Both meshes are prepared before any mutation. */
export function installShoulderTransition(root:THREE.Object3D,fullBodyIndex:THREE.BufferAttribute):boolean{
  if(root.userData.BODYFORGE_shoulderTransitionReview)return false;
  const body=root.getObjectByName('BODYFORGE_Body'),shirt=root.getObjectByName('BODYFORGE_Shirt');
  if(!(body instanceof THREE.SkinnedMesh)||!(shirt instanceof THREE.SkinnedMesh)||
    body.userData.BODYFORGE_groom!=='v2'||body.skeleton!==shirt.skeleton||
    body.geometry.getAttribute('position')?.count!==65895||fullBodyIndex.count!==288672||
    shirt.geometry.getAttribute('position')?.count!==4415||shirt.geometry.index?.count!==24966||
    shirt.geometry.userData.BODYFORGE_tailored!=='tailored-v1'||
    shirt.geometry.userData.BODYFORGE_sleeveRepair!=='collapsed-cap-v1')return false;
  root.updateWorldMatrix(true,true);
  const pose:{bone:THREE.Bone;rotation:THREE.Quaternion}[]=[];
  for(const [side,sign] of [['L',1],['R',-1]] as const){
    const bone=root.getObjectByName('upperarm01'+side),elbow=root.getObjectByName('lowerarm01'+side);
    if(!(bone instanceof THREE.Bone)||!(elbow instanceof THREE.Bone)||!bone.parent||!bone.matrixAutoUpdate)return false;
    const a=bone.getWorldPosition(new THREE.Vector3()),b=elbow.getWorldPosition(new THREE.Vector3());
    const angle=THREE.MathUtils.radToDeg(Math.atan2(Math.abs(a.x-b.x),a.y-b.y));
    if(!Number.isFinite(angle)||angle<5||angle>9)return false;
    const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    const world=bone.getWorldQuaternion(new THREE.Quaternion());
    const delta=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),THREE.MathUtils.degToRad(12*sign));
    pose.push({bone,rotation:parent.multiply(delta.multiply(world)).normalize()});
  }
  const b=prepareShoulderWeights(body,16,.85,fullBodyIndex),s=prepareShoulderWeights(shirt,16,.85);
  if(!b||!s||b.changed<3000||s.changed<1000)return false;
  for(const [mesh,c] of [[body,b],[shirt,s]] as const){
    mesh.geometry.setAttribute('skinIndex',c.indices);mesh.geometry.setAttribute('skinWeight',c.weights);
  }
  for(const {bone,rotation} of pose)bone.quaternion.copy(rotation);
  root.updateWorldMatrix(true,true);
  root.userData.BODYFORGE_shoulderTransitionReview=SHOULDER_TRANSITION_ID;
  return true;
}