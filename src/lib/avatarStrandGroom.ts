import * as THREE from 'three';

export const LAYERED_GROOM_INDEX_COUNT = 35562;
export const LAYERED_GROOM_VERTEX_COUNT = 10336;

/** Verify the authored donor before replacing a working rigged haircut.
 * Local bounds correspond to the pinned scalp in bind space, not a generic head. */
export function isLayeredAvatarGroom(mesh: THREE.Object3D | undefined): mesh is THREE.Mesh {
  if (!(mesh instanceof THREE.Mesh) || mesh instanceof THREE.SkinnedMesh ||
      mesh.userData.BODYFORGE_groom_revision !== 'layered-v2' || mesh.children.length ||
      mesh.position.lengthSq() > 1e-12 || mesh.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
      mesh.scale.distanceTo(new THREE.Vector3(1,1,1)) > 1e-6) return false;
  const { geometry } = mesh;
  const p=geometry.getAttribute('position'), n=geometry.getAttribute('normal'), c=geometry.getAttribute('color');
  if (p?.count!==LAYERED_GROOM_VERTEX_COUNT || p.itemSize!==3 || n?.count!==p.count ||
      n.itemSize!==3 || c?.count!==p.count || c.itemSize!==4 ||
      geometry.index?.count!==LAYERED_GROOM_INDEX_COUNT) return false;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const normal=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
    const r=c.getX(i),g=c.getY(i),b=c.getZ(i);
    if(![x,y,z,normal,r,g,b].every(Number.isFinite) ||
       Math.abs(x)>.085||y<1.660||y>1.800||z<-.063||z>.153||
       Math.abs(normal-1)>.01||Math.min(r,g,b)<.20||Math.max(r,g,b)>.90||c.getW(i)!==1)return false;
  }
  for(let i=0;i<geometry.index.count;i++){
    const index=geometry.index.getX(i);
    if(!Number.isInteger(index)||index<0||index>=p.count)return false;
  }
  return true;
}

/** Lower energy reflection than the former glossy cap; no alpha blending,
 * additional render pass or runtime texture. */
export function createLayeredGroomMaterial(): THREE.MeshPhysicalMaterial {
  const material=new THREE.MeshPhysicalMaterial({
    name:'BODYFORGE layered matte hair',vertexColors:true,side:THREE.DoubleSide,
    roughness:.73,specularIntensity:.27,envMapIntensity:.52,metalness:0,
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n// BODYFORGE_LAYERED_GROOM_V2');
  };
  material.customProgramCacheKey=()=> 'bodyforge-layered-groom-v2';
  return material;
}
