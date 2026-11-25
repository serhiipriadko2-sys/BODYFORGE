import * as THREE from 'three';

/** Refit the small authored chest emblem to the current shirt surface.
 * The operation runs only on physique changes, after cloth folds and
 * tailoring. No independent per-frame simulation or new mesh. The pinned
 * mark and shirt share a skeleton and local bind-space coordinates.
 */
export function createAvatarChestMarkFit(root:THREE.Object3D): (()=>boolean)|undefined {
  const shirt=root.getObjectByName('BODYFORGE_Shirt');
  const mark=root.getObjectByName('BODYFORGE_ChestMark');
  if(!(shirt instanceof THREE.SkinnedMesh)||!(mark instanceof THREE.SkinnedMesh)||
      shirt.skeleton!==mark.skeleton||shirt.parent!==mark.parent||
      !shirt.bindMatrix.equals(mark.bindMatrix)||
      shirt.geometry.userData.BODYFORGE_tailored!=='tailored-v1')return;
  const cloth=shirt.geometry.getAttribute('position'),index=shirt.geometry.index;
  const logo=mark.geometry.getAttribute('position');
  if(cloth?.count!==4415||!(logo instanceof THREE.BufferAttribute)||
      logo.count!==8||!index||![25008,24966].includes(index.count))return;
  if(shirt.position.distanceTo(mark.position)>1e-8||shirt.scale.distanceTo(mark.scale)>1e-8||
      shirt.quaternion.angleTo(mark.quaternion)>1e-8)return;
  const bounds=new THREE.Box3().setFromBufferAttribute(logo);
  if(bounds.min.y<1.28||bounds.max.y>1.45||bounds.min.z<.09||bounds.max.z>.18||
      Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))>.2)return;
  const candidates:number[][]=[];
  // Only the nearby front panel can meet the projection. Expand the search
  // by the maximum supported sculpture displacement plus a small margin.
  for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    if(ids.every(j=>cloth.getZ(j)>.045)&&
      Math.min(...ids.map(j=>cloth.getX(j)))<=bounds.max.x+.045&&
      Math.max(...ids.map(j=>cloth.getX(j)))>=bounds.min.x-.045&&
      Math.min(...ids.map(j=>cloth.getY(j)))<=bounds.max.y+.045&&
      Math.max(...ids.map(j=>cloth.getY(j)))>=bounds.min.y-.045)candidates.push(ids);
  }
  if(!candidates.length)return;
  const ray=new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,0,-1));
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();
  const fitted=new Float32Array(logo.count);
  return ()=>{
    for(let i=0;i<logo.count;i++){
      const z=logo.getZ(i);
      ray.origin.set(logo.getX(i),logo.getY(i),z+.025);
      let front=-Infinity;
      for(const ids of candidates){
        a.fromBufferAttribute(cloth,ids[0]);b.fromBufferAttribute(cloth,ids[1]);c.fromBufferAttribute(cloth,ids[2]);
        if(ray.intersectTriangle(a,b,c,false,hit))front=Math.max(front,hit.z);
      }
      if(!Number.isFinite(front)||Math.abs(front-z)>.008)return false;
      // Preserve the original projection and UV shape. Apply a restrained
      // 1.2 mm separation from the current fabric at each authored vertex.
      fitted[i]=front+.0012;
    }
    for(let i=0;i<logo.count;i++)logo.setZ(i,fitted[i]);
    logo.needsUpdate=true;
    return true;
  };
}
