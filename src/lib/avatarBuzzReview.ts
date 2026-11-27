import * as THREE from 'three';
import { scalpDensityShaders, scalpDensityState } from './avatarScalpDensity';

export const BUZZ_REVIEW_ID = 'BF_BUZZ_SURFACE_V1';
export const BUZZ_ATLAS_SIZE = 256;
export const BUZZ_CELLS = 16;
export const BUZZ_SPACING_M = .00072;
const TILE_M = BUZZ_CELLS * BUZZ_SPACING_M;

const smooth = (x: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (x-a)/(b-a)));
  return t*t*(3-2*t);
};
const random = (seed:number) => {
  let x=seed|0;
  x=Math.imul(x^(x>>>16),0x7feb352d);
  x=Math.imul(x^(x>>>15),0x846ca68b);
  return ((x^(x>>>16))>>>0)/4294967296;
};

/** Periodic deterministic 16x16 field of jittered short segments.
 * Nominal projected spacing .72 mm, stylized .09-.14 mm width and
 * .27-.48 mm segment length. Not a measurement of scalp density. */
export function buzzFibrePixels():Uint8Array {
  const size=BUZZ_ATLAS_SIZE, cell=size/BUZZ_CELLS;
  const data=new Uint8Array(size*size);
  for(let j=0;j<BUZZ_CELLS;j++)for(let i=0;i<BUZZ_CELLS;i++){
    const seed=1+i+BUZZ_CELLS*j;
    const cx=(i+.5)*cell+(random(seed*11)-.5)*5;
    const cy=(j+.5)*cell+(random(seed*13)-.5)*5;
    const a=2*Math.PI*random(seed*17),dx=Math.cos(a),dy=Math.sin(a);
    const half=3+2.35*random(seed*19),radius=1+.55*random(seed*23);
    const tone=.74+.26*random(seed*29);
    for(let y=Math.floor(cy-8);y<=Math.ceil(cy+8);y++){
      for(let x=Math.floor(cx-8);x<=Math.ceil(cx+8);x++){
        const X=x+.5-cx,Y=y+.5-cy;
        const t=Math.max(-half,Math.min(half,X*dx+Y*dy));
        const distance=Math.hypot(X-t*dx,Y-t*dy);
        const value=Math.round(255*tone*(1-smooth(distance,radius-.6,radius+.6)));
        const k=((y+size)%size)*size+(x+size)%size;
        data[k]=Math.max(data[k],value);
      }
    }
  }
  return data;
}

export function createBuzzFibreTexture():THREE.DataTexture {
  const t=new THREE.DataTexture(buzzFibrePixels(),BUZZ_ATLAS_SIZE,BUZZ_ATLAS_SIZE,THREE.RedFormat,THREE.UnsignedByteType);
  t.name='BODYFORGE short stubble coverage';
  t.colorSpace=THREE.NoColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;
  t.generateMipmaps=true;t.unpackAlignment=1;t.flipY=false;t.needsUpdate=true;
  return t;
}

export type BuzzSurfaceState={enabled:{value:number};texture:THREE.DataTexture};
const states=new WeakMap<THREE.MeshPhysicalMaterial,BuzzSurfaceState>();
export function buzzSurfaceState(material:THREE.MeshPhysicalMaterial):BuzzSurfaceState|undefined{
  return states.get(material);
}

/** Only activate if the pinned scalp and all required shader anchors exist.
 * The skin material owns this uniform-only texture for its whole lifetime. */
export function installBuzzSurface(material:THREE.MeshPhysicalMaterial):BuzzSurfaceState|undefined{
  if(!scalpDensityState(material))return;
  const existing=states.get(material);if(existing)return existing;
  const base=scalpDensityShaders(THREE.ShaderLib.physical.vertexShader,THREE.ShaderLib.physical.fragmentShader);
  if(!base||!buzzSurfaceShaders(base.vertex,base.fragment))return;
  const state={enabled:{value:0},texture:createBuzzFibreTexture()};
  states.set(material,state);
  const release=()=>{
    material.removeEventListener('dispose',release);
    states.delete(material);state.texture.dispose();
  };
  material.addEventListener('dispose',release);
  return state;
}

/** Return true only if replacing the old buzz cap is actually supported. */
export function setBuzzSurface(material:THREE.MeshPhysicalMaterial,enabled:boolean):boolean{
  const state=states.get(material);if(!state)return false;
  state.enabled.value=enabled?1:0;return enabled;
}

/** Patch the already-installed scalp mask. Three triplanar lookups with
 * explicit derivatives provide mipmapped coverage without UV seams.
 * The underlying skin is still visible; no extra mesh, normals, or draws. */
export function buzzSurfaceShaders(vertex:string,fragment:string):{vertex:string;fragment:string}|undefined{
  const anchor='vBfScalpFraction = bfScalpFraction * 1.5;';
  const color='diffuseColor.rgb = mix(diffuseColor.rgb, bfScalpColor, bfScalpCoverage);';
  if(vertex.includes(BUZZ_REVIEW_ID)||!vertex.includes('BODYFORGE_SCALP_DENSITY_V1')||
     vertex.split(anchor).length!==2||fragment.split(color).length!==2)return;
  const varying='varying vec3 vBfBuzzPosition;\nvarying vec3 vBfBuzzNormal;\n';
  return{
    vertex:'// '+BUZZ_REVIEW_ID+'\n'+varying+vertex.replace(anchor,anchor+'\n vBfBuzzPosition = position;\n vBfBuzzNormal = normal;'),
    fragment:varying+'uniform sampler2D bfBuzzAtlas;\nuniform float bfBuzzEnabled;\n'+fragment.replace(color,[
      '// '+BUZZ_REVIEW_ID,
      'if (bfBuzzEnabled > 0.5) {',
      '  vec3 bfP = vBfBuzzPosition / '+TILE_M.toFixed(8)+';',
      // Evaluate gradients for all fragments on this uniform branch.
      '  vec3 bfDx = dFdx(bfP); vec3 bfDy = dFdy(bfP);',
      '  if (bfScalpCoverage > 0.0) {',
      '    vec3 bfW = abs(vBfBuzzNormal); bfW *= bfW; bfW *= bfW;',
      '    bfW /= max(0.00001, bfW.x+bfW.y+bfW.z);',
      '    float bfX = textureGrad(bfBuzzAtlas, bfP.zy, bfDx.zy, bfDy.zy).r;',
      '    float bfY = textureGrad(bfBuzzAtlas, bfP.xz+vec2(0.37,0.19), bfDx.xz, bfDy.xz).r;',
      '    float bfZ = textureGrad(bfBuzzAtlas, bfP.xy+vec2(0.71,0.43), bfDx.xy, bfDy.xy).r;',
      '    float bfStubble = clamp(dot(bfW,vec3(bfX,bfY,bfZ)),0.0,1.0);',
      '    bfScalpCoverage *= 0.40 + 0.60 * bfStubble;',
      '  }',
      '}',
      color,
    ].join('\n'))
  };
}
