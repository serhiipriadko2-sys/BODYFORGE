import * as THREE from 'three';
import type { Muscle } from './game';
import { prepareShoulderWeights, type ShoulderWeightCandidate } from './avatarShoulderTransitionReview';

export const POSE_CORRECTIVE_ID = 'BF_POSE_CORRECTIVE_REVIEW_V1';
export const ARM_TAPER_ID = 'BF_ARM_TAPER_REVIEW_V1';
export const ARM_CONTOUR_ID = 'BF_ARM_CONTOUR_REVIEW_V1';
export const AXILLA_CONTACT_ID = 'BF_AXILLA_CONTACT_REVIEW_V1';
export const AXILLA_MEDIAL_ID = 'BF_AXILLA_MEDIAL_REVIEW_V2';
type ArmTaperMode = boolean | 'contour' | 'contact' | 'contact-medial';
// Pinned bind-space humerus endpoints (metres); mirrored for the right arm.
const armStart = [.203572626546,1.428929295450,.018598292131] as const;
const armAxis = [.170015193799,-.197040238502,-.001440444382] as const;
const axisSquared = armAxis.reduce((sum,v)=>sum+v*v,0);
function smoother(x:number,a:number,b:number):number {
  const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);
  return t*t*t*(10+t*(-15+6*t));
}
/** Artistic attenuation of the shoulder-only corrective, not a medical model.
 * Quintic transitions retain zero first/second derivatives at endpoints. */
export function armTaperGain(x:number,y:number,z:number,contour=false):number {
  if(![x,y,z].every(Number.isFinite))return 0;
  const a=Math.abs(x);
  const t=((a-armStart[0])*armAxis[0]+(y-armStart[1])*armAxis[1]+(z-armStart[2])*armAxis[2])/axisSquared;
  // A wider transition on the lateral surface retains medial shoulder
  // clearance while avoiding the sharper uniform axial fade at the elbow.
  const lateral=a-armStart[0]-t*armAxis[0];
  const outside=contour?smoother(lateral,-.025,.035):0;
  const from=.50-(contour ? .40*outside : 0);
  const to=contour?1.30+.20*outside:1.10;
  return THREE.MathUtils.clamp(1-smoother(a,.21,.29)*smoother(t,from,to),0,1);
}
// Paired clearance field in the pinned bind-space axilla. This is a
// sampled contact-shaping approximation, not a medical model or IPC solver.
// The lateral torso retracts as the medial arm moves away; outer arm,
// chest/back surface, elbow and hands are outside the smooth envelope.
export function axillaContactField(x:number,y:number,z:number):number {
  if(![x,y,z].every(Number.isFinite))return 0;
  const a=Math.abs(x);
  const envelope=smoother(a,.125,.155)*(1-smoother(a,.275,.325))*
    smoother(y,1.19,1.25)*(1-smoother(y,1.375,1.43))*(1-smoother(Math.abs(z),.045,.085));
  return envelope===0?0:Math.sign(x)*envelope*(2*smoother(a,.175,.220)-1);
}
// Restrict the positive arm branch to its medial surface. The lateral
// coordinate is measured from the pinned rest humeral axis, not world x.
// Torso retraction remains unchanged; the smooth fade preserves continuity.
export function axillaMedialField(x:number,y:number,z:number):number {
  const field=axillaContactField(x,y,z);
  if(field===0||field*Math.sign(x)<=0)return field;
  const a=Math.abs(x);
  const t=((a-armStart[0])*armAxis[0]+(y-armStart[1])*armAxis[1]+(z-armStart[2])*armAxis[2])/axisSquared;
  const lateral=a-armStart[0]-t*armAxis[0];
  return field*(1-smoother(lateral,-.025,.015));
}
export function axillaContactStrength(levels:Partial<Record<Muscle,number>>):number {
  const level=(key:Muscle)=>{
    const value=levels[key]??0;
    return Number.isFinite(value)?THREE.MathUtils.clamp(value,0,5):0;
  };
  return .014*(.35*level('arms')+.20*level('core')+.45*level('back'))/5;
}
const MAX_POSED_DELTA = .035;
type Levels = Partial<Record<Muscle, number>>;
const ramp = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);
export function poseCorrectiveMask(x: number, y: number): number {
  const a = Math.abs(x);
  const shoulder = ramp(a,.09,.175)*(1-ramp(a,.275,.51))*ramp(y,1.10,1.31)*(1-ramp(y,1.48,1.54));
  const collar = ramp(a,.055,.10)*(1-ramp(a,.20,.27))*ramp(y,1.40,1.46)*(1-ramp(y,1.50,1.54));
  return Math.max(shoulder,collar);
}
type Active = { i:number; mask:number; group:number; taper:number; contact:number };
type Target = {
  mesh:THREE.SkinnedMesh; alternate:ShoulderWeightCandidate; active:Active[];
  group:Int32Array; groupCount:number; triangles:Uint32Array;
};
type Edit = { mesh:THREE.SkinnedMesh; positions:Float32Array; normals:Float32Array; changed:number; peak:number };
export interface PoseCorrective {
  apply(levels:Levels):boolean;
  readonly applications:number;
  readonly revision:string;
}
function prepare(mesh:THREE.SkinnedMesh,index:THREE.BufferAttribute,taper:ArmTaperMode):Target|undefined {
  const p=mesh.geometry.getAttribute('position');
  const alternate=prepareShoulderWeights(mesh,16,.85,index);
  if(!alternate)return;
  const active:Active[]=[],lookup=new Map<string,number>(),group=new Int32Array(p.count).fill(-1);
  // Weld only the differential-normal calculation. Actual mesh splits remain.
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),mask=poseCorrectiveMask(x,y);
    const contact=taper==='contact-medial'?axillaMedialField(x,y,z):taper==='contact'?axillaContactField(x,y,z):0;
    if(mask<=0&&contact===0)continue;
    const k=[x,y,z].map(v=>Math.round(v*1e6)).join(',');
    let n=lookup.get(k);
    if(n===undefined){n=lookup.size;lookup.set(k,n);}
    group[i]=n;active.push({i,mask,group:n,contact,taper:taper?armTaperGain(x,y,z,taper==='contour'||taper==='contact'||taper==='contact-medial'):1});
  }
  const triangles:number[]=[];
  for(let k=0;k<index.count;k+=3){
    const a=index.getX(k),b=index.getX(k+1),c=index.getX(k+2);
    if(a>=p.count||b>=p.count||c>=p.count)return;
    if(group[a]>=0||group[b]>=0||group[c]>=0)triangles.push(a,b,c);
  }
  if(active.length<100||!triangles.length)return;
  return {mesh,alternate,active,group,groupCount:lookup.size,triangles:Uint32Array.from(triangles)};
}
function correction(target:Target,side:Int8Array,left:THREE.Bone,right:THREE.Bone,contactStrength:number):Edit|undefined {
  const {mesh,alternate,active,group,groupCount,triangles}=target,g=mesh.geometry;
  const pos=g.getAttribute('position'),normal=g.getAttribute('normal'),j=g.getAttribute('skinIndex'),w=g.getAttribute('skinWeight');
  if(!(pos.array instanceof Float32Array)||!(normal.array instanceof Float32Array)||pos.count!==group.length)return;
  // Compute skin transforms in mesh-local coordinates, including current
  // nonuniform growth and outer character transforms. Do not edit the rig.
  const source=mesh.skeleton.bones.map((bone,i)=>new THREE.Matrix4().copy(mesh.bindMatrixInverse)
    .multiply(bone.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
  const around=(bone:THREE.Bone,sign:number)=>{
    const p=new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).applyMatrix4(mesh.bindMatrixInverse);
    return new THREE.Matrix4().makeTranslation(p.x,p.y,p.z)
      .multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(12*sign)))
      .multiply(new THREE.Matrix4().makeTranslation(-p.x,-p.y,-p.z));
  };
  const rotations=[around(right,-1),null,around(left,1)] as const;
  const other=source.map((m,i)=>side[i]?rotations[side[i]+1]!.clone().multiply(m):m);
  const positions=pos.array.slice(),normals=normal.array.slice();
  const old=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),temp=new THREE.Vector3(),delta=new THREE.Vector3();
  const linear=new THREE.Matrix3(),elements=linear.elements;
  let changed=0,peak=0;
  for(const {i,mask,taper,contact} of active){
    if(mask<=0&&contactStrength===0)continue;
    old.fromBufferAttribute(pos,i);a.set(0,0,0);b.set(0,0,0);elements.fill(0);
    let sum=0,altSum=0;
    for(let k=0;k<4;k++){
      const weight=w.getComponent(i,k),id=j.getComponent(i,k);
      const aw=alternate.weights.getComponent(i,k),aid=alternate.indices.getComponent(i,k);
      if(weight){
        const m=source[id];if(!m)return;
        a.addScaledVector(temp.copy(old).applyMatrix4(m),weight);sum+=weight;
        const e=m.elements;
        for(let col=0;col<3;col++)for(let row=0;row<3;row++)elements[col*3+row]+=e[col*4+row]*weight;
      }
      if(aw){if(!other[aid])return;b.addScaledVector(temp.copy(old).applyMatrix4(other[aid]),aw);altSum+=aw;}
    }
    if(sum<.999||sum>1.001||altSum<.999||altSum>1.001)return;
    a.multiplyScalar(1/sum);b.multiplyScalar(1/altSum);
    delta.subVectors(b,a).multiplyScalar(mask).clampLength(0,MAX_POSED_DELTA).multiplyScalar(taper);
    // Apply the signed reserve in posed space, then invert the actual
    // blended linear transform so body and fitted shirt share the field.
    delta.x+=contact*contactStrength;
    const length=delta.length();
    if(!Number.isFinite(length))return;
    if(length<1e-8)continue;
    linear.multiplyScalar(1/sum);
    const determinant=linear.determinant();
    if(!Number.isFinite(determinant)||determinant<.30||determinant>2.5)return;
    delta.applyMatrix3(linear.invert());
    if(!Number.isFinite(delta.lengthSq())||delta.length()>(contactStrength>0?.07:.05))return;
    temp.copy(old).add(delta);
    positions.set(temp.toArray(),i*3);changed++;peak=Math.max(peak,length);
  }
  if(changed<100)return;
  // Transport authored (including UV-split) normals by the local change of
  // area-weighted geometric normal, instead of erasing original shading.
  const before=new Float64Array(groupCount*3),after=new Float64Array(groupCount*3);
  const va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3();
  const add=(arr:Float64Array,points:Float32Array,i:number,j:number,k:number)=>{
    va.fromArray(points,i*3);vb.fromArray(points,j*3);vc.fromArray(points,k*3);
    vb.sub(va).cross(vc.sub(va));
    for(const n of [group[i],group[j],group[k]])if(n>=0){
      arr[n*3]+=vb.x;arr[n*3+1]+=vb.y;arr[n*3+2]+=vb.z;
    }
  };
  for(let k=0;k<triangles.length;k+=3){
    const [i,j,k2]=triangles.subarray(k,k+3);
    add(before,pos.array,i,j,k2);add(after,positions,i,j,k2);
  }
  const q=new THREE.Quaternion();
  for(const {i,group:n,mask} of active){
    if(mask<=0&&contactStrength===0)continue;
    va.fromArray(before,n*3);vb.fromArray(after,n*3);
    if(va.lengthSq()<1e-20||vb.lengthSq()<1e-20)continue;
    q.setFromUnitVectors(va.normalize(),vb.normalize());
    vc.fromArray(normal.array,i*3).applyQuaternion(q).normalize();
    if(!Number.isFinite(vc.lengthSq()))return;
    normals.set(vc.toArray(),i*3);
  }
  return {mesh,positions,normals,changed,peak};
}

/** Local, narrow athletic-pose corrective. Alternate skinning is a target
 * only; the true bones, weights, bind matrices, indices and UVs are untouched.
 * Recompute on sculpture changes, not on idle ticks. Not an exercise solver. */
export function createPoseCorrective(root:THREE.Object3D,fullBodyIndex:THREE.BufferAttribute,armTaper:ArmTaperMode=false):PoseCorrective|undefined {
  const body=root.getObjectByName('BODYFORGE_Body'),shirt=root.getObjectByName('BODYFORGE_Shirt');
  if(!(body instanceof THREE.SkinnedMesh)||!(shirt instanceof THREE.SkinnedMesh)||
    body.userData.BODYFORGE_groom!=='v2'||body.skeleton!==shirt.skeleton||
    body.geometry.getAttribute('position')?.count!==65895||fullBodyIndex.count!==288672||
    shirt.geometry.getAttribute('position')?.count!==4415||shirt.geometry.index?.count!==24966||
    shirt.geometry.userData.BODYFORGE_tailored!=='tailored-v1'||
    shirt.geometry.userData.BODYFORGE_sleeveRepair!=='collapsed-cap-v1')return;
  const left=root.getObjectByName('upperarm01L'),right=root.getObjectByName('upperarm01R');
  if(!(left instanceof THREE.Bone)||!(right instanceof THREE.Bone))return;
  root.updateMatrixWorld(true);
  for(const bone of [left,right]){
    const elbow=root.getObjectByName(bone===left?'lowerarm01L':'lowerarm01R');
    if(!(elbow instanceof THREE.Bone))return;
    const a=bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(body.bindMatrixInverse);
    const b=elbow.getWorldPosition(new THREE.Vector3()).applyMatrix4(body.bindMatrixInverse);
    const angle=THREE.MathUtils.radToDeg(Math.atan2(Math.abs(a.x-b.x),a.y-b.y));
    if(!Number.isFinite(angle)||angle<5||angle>9)return;
  }
  const side=Int8Array.from(body.skeleton.bones.map(b=>{
    for(let n:THREE.Object3D|null=b;n;n=n.parent){if(n===left)return 1;if(n===right)return -1;}
    return 0;
  }));
  const targets=[prepare(body,fullBodyIndex,armTaper),prepare(shirt,shirt.geometry.index,armTaper)];
  if(targets.some(t=>!t))return;
  const revision=armTaper==='contact-medial'?AXILLA_MEDIAL_ID:armTaper==='contact'?AXILLA_CONTACT_ID:armTaper==='contour'?ARM_CONTOUR_ID:armTaper?ARM_TAPER_ID:POSE_CORRECTIVE_ID;
  let previous='',applications=0;
  return {
    revision,
    get applications(){return applications;},
    apply(levels){
      const signature=(['arms','core','legs','back'] as const).map(k=>{
        const v=levels[k]??0;return Number.isFinite(v)?THREE.MathUtils.clamp(v,0,5):0;
      }).join(',');
      if(signature===previous)return true;
      // The caller has just rebuilt the ordinary physique and applied growth.
      // Both edits must pass before any surface is changed.
      root.updateMatrixWorld(true);
      const strength=armTaper==='contact'||armTaper==='contact-medial'?axillaContactStrength(levels):0;
      const edits=targets.map(t=>correction(t!,side,left,right,strength));
      if(edits.some(e=>!e))return false;
      for(const e of edits){
        const p=e!.mesh.geometry.getAttribute('position'),n=e!.mesh.geometry.getAttribute('normal');
        (p.array as Float32Array).set(e!.positions);(n.array as Float32Array).set(e!.normals);
        p.needsUpdate=n.needsUpdate=true;
      }
      previous=signature;applications++;
      root.userData.BODYFORGE_poseCorrectiveReview=revision;
      return true;
    },
  };
}
