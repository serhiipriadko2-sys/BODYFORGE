import * as THREE from 'three';

const xMin=-.02831,xMax=.02831,yMin=1.58794,yMax=1.61410;

/** Authoring projection matches the Blender-generated packed response map.
 * The original albedo UV, bone weights and shape are not changed.
 * The second UV channel is only used on the verified lip surface. */
export function installAvatarLipResponse(
  surfaces: readonly THREE.SkinnedMesh[], material: THREE.MeshStandardMaterial, texture: THREE.Texture,
): boolean {
  const image=texture.image as {width?:number;height?:number}|undefined;
  if(surfaces.length!==1 || surfaces[0].name!=='BODYFORGE_Lips' ||
     image?.width!==256 || image?.height!==128)return false;
  const geometry=surfaces[0].geometry, p=geometry.getAttribute('position');
  if(p?.count!==2320 || p.itemSize!==3 || !geometry.hasAttribute('uv') ||
     geometry.hasAttribute('uv1') || material.roughnessMap || material.bumpMap)return false;
  const uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(![x,y,z].every(Number.isFinite)||x<xMin||x>xMax||y<yMin||y>yMax||z<.136||z>.165)return false;
    uv[i*2]=(x-xMin)/(xMax-xMin);
    uv[i*2+1]=(yMax-y)/(yMax-yMin);
  }
  geometry.setAttribute('uv1',new THREE.Float32BufferAttribute(uv,2));
  geometry.userData.BODYFORGE_lipResponse='v1';
  texture.name='BODYFORGE lip microgrooves and roughness';
  texture.channel=1;
  texture.flipY=false;
  texture.colorSpace=THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  material.roughnessMap=material.bumpMap=texture;
  material.roughness=1;
  material.bumpScale=.20;
  material.envMapIntensity=.74;
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n// BODYFORGE_LIP_RESPONSE_V1');
  };
  material.customProgramCacheKey=()=> 'bodyforge-lip-response-v1';
  material.needsUpdate=true;
  return true;
}
