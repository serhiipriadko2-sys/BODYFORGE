import * as THREE from 'three';

const FACE_PROFILE = 'bodyforge-facial-planes-v2';
export const DIRECTIONAL_BROW_INDEX_COUNT = 16800;
export const DIRECTIONAL_BROW_VERTEX_COUNT = 7840;

/** Adopt the Blender-fitted geometry only on the pinned head rig.
 * Existing weights are rigidly attached to the protected head bone.
 * The original brows remain visible if the optional donor is unavailable.
 */
export function installAvatarBrows(body: THREE.SkinnedMesh, brows: THREE.SkinnedMesh, donor: THREE.Group): boolean {
  if (body.name !== 'BODYFORGE_Body' || body.geometry.userData.facialProfile !== FACE_PROFILE ||
      brows.name !== 'BODYFORGE_Brows' || body.skeleton !== brows.skeleton ||
      !brows.parent || donor.children.length !== 1) return false;
  const previous = brows.geometry;
  const source = previous.getAttribute('position');
  const joints = previous.getAttribute('skinIndex'), weights = previous.getAttribute('skinWeight');
  const head = brows.skeleton.bones.findIndex(bone => bone.name === 'head');
  if (head < 0 || source?.count !== 3078 || joints?.count !== source.count ||
      weights?.count !== source.count || !(brows.material instanceof THREE.MeshStandardMaterial)) return false;
  for (let i=0;i<source.count;i++) {
    if (joints.getX(i)!==head || weights.getX(i)!==1 ||
        weights.getY(i)!==0 || weights.getZ(i)!==0 || weights.getW(i)!==0) return false;
  }

  const surface = donor.children[0];
  if (!(surface instanceof THREE.Mesh) || surface instanceof THREE.SkinnedMesh || surface.children.length ||
      !['BODYFORGE_BrowsV2','BODYFORGE_BrowsV3'].includes(surface.name) || !(surface.material instanceof THREE.MeshStandardMaterial) ||
      surface.position.lengthSq()>1e-12 || surface.quaternion.angleTo(new THREE.Quaternion())>1e-6 ||
      surface.scale.distanceTo(new THREE.Vector3(1,1,1))>1e-6) return false;
  const directional=surface.name==='BODYFORGE_BrowsV3';
  if(directional&&surface.userData.BODYFORGE_brow_revision!=='directional-v3')return false;
  const geometry=surface.geometry, pos=geometry.getAttribute('position'), normals=geometry.getAttribute('normal');
  const colors=geometry.getAttribute('color'), index=geometry.index;
  if (pos?.count!==(directional?DIRECTIONAL_BROW_VERTEX_COUNT:7545) || pos.itemSize!==3 || normals?.count!==pos.count || normals.itemSize!==3 ||
      colors?.count!==pos.count || colors.itemSize!==4 || index?.count!==(directional?DIRECTIONAL_BROW_INDEX_COUNT:7560)) return false;

  const skinIndex=new Uint16Array(pos.count*4), skinWeight=new Float32Array(pos.count*4);
  let left=0,right=0;
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const length=Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i));
    const c=colors.getX(i);
    if (![x,y,z,length,c].every(Number.isFinite) || Math.abs(x)<.012 || Math.abs(x)>.060 ||
        y<1.686 || y>1.701 || z<.125 || z>.158 || Math.abs(length-1)>.01 ||
        c<.57 || c>1 || Math.abs(colors.getY(i)-c)>1e-6 || Math.abs(colors.getZ(i)-c)>1e-6 ||
        colors.getW(i)!==1) return false;
    if(x>0)left++;else right++;
    skinIndex[i*4]=head; skinWeight[i*4]=1;
  }
  if(Math.min(left,right)<3000)return false;
  for(let i=0;i<index.count;i++){
    const value=index.getX(i);
    if(!Number.isInteger(value)||value<0||value>=pos.count)return false;
  }

  // Preserve the live material's selected hair tint. The new mesh has its own
  // vertex variation; use the original material unless it has another owner.
  const oldMaterial=brows.material;
  let shared=false;
  let root:THREE.Object3D=brows;
  while(root.parent)root=root.parent;
  root.traverse(node=>{
    if(node instanceof THREE.Mesh && node!==brows &&
       (Array.isArray(node.material)?node.material.includes(oldMaterial):node.material===oldMaterial))shared=true;
  });
  const material=surface.material;
  material.color.copy(oldMaterial.color);
  material.vertexColors=true;
  material.side=THREE.DoubleSide;
  material.roughness=directional?.87:.94;
  material.metalness=0;
  material.envMapIntensity=directional?.42:.32;
  geometry.userData.BODYFORGE_brow_revision=directional?'directional-v3':'fitted-v2';
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndex,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeight,4));
  donor.remove(surface);
  brows.geometry=geometry;
  brows.material=material;
  brows.computeBoundingBox();
  brows.computeBoundingSphere();
  previous.dispose();
  if(!shared)oldMaterial.dispose();
  return true;
}
