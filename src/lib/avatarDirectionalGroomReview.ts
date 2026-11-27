import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeThreeTree } from './threeResources';

export const DIRECTIONAL_GROOM_REVISION = 'directional-v3';
export const DIRECTIONAL_GROOM_VERTICES = 11762;
export const DIRECTIONAL_GROOM_INDICES = 35040;
export const DIRECTIONAL_GROOM_ROUTE = '/_bodyforge/review/groom-v3.glb';
export const DIRECTIONAL_GROOM_SIZE = 1083452;
export const FIBRE_ATLAS_SIZE = 256;

/** Pinned, procedurally authored scalp mesh. No imported human scan. */
export function validateDirectionalGroom(mesh: THREE.Object3D | undefined): mesh is THREE.Mesh {
  if (!(mesh instanceof THREE.Mesh) || mesh instanceof THREE.SkinnedMesh || mesh.children.length ||
      mesh.userData.BODYFORGE_groom_revision !== DIRECTIONAL_GROOM_REVISION ||
      mesh.position.lengthSq() > 1e-12 || mesh.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
      mesh.scale.distanceTo(new THREE.Vector3(1,1,1)) > 1e-6) return false;
  const g=mesh.geometry, p=g.getAttribute('position'), n=g.getAttribute('normal'),
    uv=g.getAttribute('uv'), c=g.getAttribute('color'), index=g.index;
  if (p?.count!==DIRECTIONAL_GROOM_VERTICES || p.itemSize!==3 || n?.count!==p.count || n.itemSize!==3 ||
      uv?.count!==p.count || uv.itemSize!==2 || c?.count!==p.count || c.itemSize!==4 ||
      index?.count!==DIRECTIONAL_GROOM_INDICES) return false;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i), u=uv.getX(i), v=uv.getY(i);
    const normal=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
    const r=c.getX(i), green=c.getY(i), b=c.getZ(i);
    if(![x,y,z,u,v,normal,r,green,b].every(Number.isFinite) || Math.abs(x)>.085 ||
       y<1.660||y>1.800||z<-.063||z>.153||Math.abs(normal-1)>.01||
       u<0||u>1||v<0||v>1||Math.min(r,green,b)<.25||Math.max(r,green,b)>.98||c.getW(i)!==1)return false;
  }
  for(let i=0;i<index.count;i++){
    const k=index.getX(i);
    if(!Number.isInteger(k)||k<0||k>=p.count)return false;
  }
  return true;
}

/** Preserve authored normals and derive the exact tangent basis from the UV
 * direction (U across the ribbon, V along the fibers). Reject invalid bases. */
export function prepareDirectionalTangents(mesh: THREE.Mesh): boolean {
  if(!validateDirectionalGroom(mesh))return false;
  const g=mesh.geometry;
  g.computeTangents();
  const t=g.getAttribute('tangent'), n=g.getAttribute('normal');
  if(t?.count!==n.count || t.itemSize!==4)return false;
  for(let i=0;i<t.count;i++){
    const x=t.getX(i),y=t.getY(i),z=t.getZ(i),w=t.getW(i);
    const length=Math.hypot(x,y,z),dot=x*n.getX(i)+y*n.getY(i)+z*n.getZ(i);
    if(![length,dot,w].every(Number.isFinite)||Math.abs(length-1)>.001||
      Math.abs(dot)>.001||Math.abs(w)!==1)return false;
  }
  return true;
}

const smooth=(x:number,a:number,b:number)=>{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
};

/** A deterministic coverage atlas, not a photograph or measured BCSDF.
 * Opaque low scalp layer and nine irregular tapered fiber lanes per card.
 * Root/tip padding plus mipmaps preserve subpixel coverage. */
export function createFibreAtlas(): THREE.DataTexture {
  const size=FIBRE_ATLAS_SIZE, data=new Uint8Array(size*size*4);
  for(let j=0;j<size;j++){
    const v=(j+.5)/size;
    const t=Math.max(0,Math.min(1,(v-.40)/.57));
    for(let i=0;i<size;i++){
      const u=(i+.5)/size;
      let alpha=1, tone=.85;
      if(v<.33){
        tone=.89+.067*Math.sin(Math.PI*2*(u*87+.29*v))+
          .038*Math.sin(Math.PI*2*(u*43-.75*v));
      }else{
        let best=0, brightness=.73;
        for(let lane=0;lane<9;lane++){
          const phase=lane*2.399963;
          const center=(lane+.5)/9+.009*Math.sin(phase+t*5.2)+.004*Math.sin(phase*1.7+t*11.4);
          const tip=.86+.13*(.5+.5*Math.sin(phase*1.19));
          const width=(.033+.005*Math.cos(phase))*(1-.50*smooth(t,.72,1));
          const a=(1-smooth(Math.abs(u-center),width-.006,width+.006))*
            (1-smooth(t,tip,Math.min(1,tip+.045)));
          if(a>best){best=a;brightness=.76+.19*(.5+.5*Math.sin(phase*1.13))+
            .026*Math.cos(t*10+phase);}
        }
        alpha=best;
        tone=brightness*(.91+.09*smooth(t,0,.30));
      }
      const k=(j*size+i)*4, b=Math.round(Math.max(0,Math.min(1,tone))*255);
      data[k]=data[k+1]=data[k+2]=b;data[k+3]=Math.round(alpha*255);
    }
  }
  const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  map.name='BODYFORGE procedural hair fibre coverage';
  map.colorSpace=THREE.SRGBColorSpace;
  map.flipY=false;map.generateMipmaps=true;
  map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
  map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;map.needsUpdate=true;
  return map;
}

/** Use the built-in anisotropic microfacet approximation, not the full
 * Marschner hair BCSDF. Opaque depth writing with alpha-to-coverage; no
 * transparency sort or additional pass. The existing hair dye still applies. */
export function createDirectionalGroomMaterial(): THREE.MeshPhysicalMaterial {
  const material=new THREE.MeshPhysicalMaterial({
    name:'BODYFORGE directional fibre groom review',vertexColors:true,
    side:THREE.DoubleSide,roughness:.52,specularIntensity:.48,
    envMapIntensity:.65,metalness:0,anisotropy:.74,anisotropyRotation:0,
    map:createFibreAtlas(),alphaTest:.28,alphaToCoverage:true,transparent:false,depthWrite:true,
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n// BODYFORGE_DIRECTIONAL_GROOM_V3');
  };
  material.customProgramCacheKey=()=> 'bodyforge-directional-groom-v3';
  return material;
}

export type DirectionalGroom = {groom:THREE.Group;crop:THREE.Mesh;swept:THREE.Mesh;material:THREE.MeshPhysicalMaterial};

/** Local review asset only. Abort stalled network fetches. No production
 * asset swap, and all failed donor trees are disposed before returning. */
export async function loadDirectionalGroomReview(): Promise<DirectionalGroom> {
  const response=await fetch(DIRECTIONAL_GROOM_ROUTE,{
    cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)throw Error('Directional groom unavailable');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength!==DIRECTIONAL_GROOM_SIZE)throw Error('Directional groom byte size mismatch');
  const {scene:groom}=await new GLTFLoader().parseAsync(bytes,'');
  try{
    const crop=groom.getObjectByName('BODYFORGE_Groom_crop');
    const swept=groom.getObjectByName('BODYFORGE_Groom_swept');
    if(groom.children.length!==2||!validateDirectionalGroom(crop)||!validateDirectionalGroom(swept)||
        !prepareDirectionalTangents(crop)||!prepareDirectionalTangents(swept))throw Error('Directional groom geometry invalid');
    const oldMaterials=new Set<THREE.Material>();
    for(const mesh of [crop,swept])for(const old of Array.isArray(mesh.material)?mesh.material:[mesh.material])oldMaterials.add(old);
    const material=createDirectionalGroomMaterial();
    for(const mesh of [crop,swept]){mesh.material=material;mesh.castShadow=true;}
    oldMaterials.forEach(old=>old.dispose());
    return {groom,crop,swept,material};
  }catch(error){disposeThreeTree(groom);throw error;}
}
