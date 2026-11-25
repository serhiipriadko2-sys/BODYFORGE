import * as THREE from 'three';

export const DERMAL_ATTRIBUTE = 'bfDermalRegion';

/** Artistic regional response on the verified bind-space anatomy.
 * Channels: oily T-zone, thin/vascular tissue, microrelief strength.
 * No claim of measured tissue thickness or full diffusion simulation. */
export function sampleDermalRegion(x: number, y: number, z: number): readonly [number,number,number] {
  if (![x,y,z].every(Number.isFinite)) return [0,0,.5];
  if (y<1.53) return [0,0,.5];
  const a=Math.abs(x);
  const blob=(cx:number,cy:number,cz:number,rx:number,ry:number,rz:number)=>
    Math.exp(-(((a-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2));
  const nose=blob(.004,1.648,.164,.020,.025,.022);
  const forehead=blob(.018,1.712,.145,.036,.023,.023);
  const chin=blob(.008,1.577,.150,.026,.017,.030);
  const cheek=blob(.050,1.641,.119,.027,.034,.030);
  const eyelid=blob(.030,1.677,.143,.021,.009,.016);
  const ear=blob(.079,1.654,.049,.016,.033,.026);
  const oil=THREE.MathUtils.clamp(.95*nose+.76*forehead+.34*chin,0,1);
  const thin=THREE.MathUtils.clamp(.94*ear+.65*eyelid+.34*nose+.37*cheek,0,1);
  const pores=THREE.MathUtils.clamp(.50+.34*cheek+.27*nose-.42*eyelid-.22*ear,0,1);
  return [oil,thin,pores];
}

/** One immutable three-byte attribute per vertex. All skin primitives get
 * the same contract; the growth pipeline never rewrites it. */
export function installDermalRegions(surfaces: readonly THREE.SkinnedMesh[]): boolean {
  if (!surfaces.some(s=>s.name==='BODYFORGE_Body'&&s.geometry.getAttribute('position')?.count===65895&&
    s.userData.BODYFORGE_groom==='v2')) return false;
  if (!surfaces.every(s=>s.geometry.getAttribute('position')?.itemSize===3)) return false;
  for(const surface of surfaces){
    const p=surface.geometry.getAttribute('position'), data=new Uint8Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const values=sampleDermalRegion(p.getX(i),p.getY(i),p.getZ(i));
      for(let k=0;k<3;k++)data[i*3+k]=Math.round(values[k]*255);
    }
    surface.geometry.setAttribute(DERMAL_ATTRIBUTE,new THREE.Uint8BufferAttribute(data,3,true));
  }
  return true;
}

/** Extend the existing diffuse-wrap shader, preserving shadowed direct
 * lighting, GGX specular and measured microrelief. No texture sample added. */
export function regionalDermalShaders(vertex:string,fragment:string): {vertex:string;fragment:string} | undefined {
  const begin='#include <begin_vertex>', rough='#include <roughnessmap_fragment>';
  const wrap='vec3 bfWrap = vec3(0.40, 0.22, 0.13);';
  const blend='mix(irradiance, directLight.color * bfSoft, 0.38)';
  if([begin].some(x=>vertex.split(x).length!==2) ||
    [rough,wrap,blend].some(x=>fragment.split(x).length!==2) ||
    vertex.includes('BODYFORGE_DERMAL_REGIONS_V3'))return;
  const v='varying vec3 vBfDermal;\n';
  return {
    vertex:'// BODYFORGE_DERMAL_REGIONS_V3\nattribute vec3 bfDermalRegion;\n'+v+
      vertex.replace(begin,begin+'\n vBfDermal = bfDermalRegion;'),
    fragment:v+fragment
      .replace(wrap,'vec3 bfWrap = mix(vec3(0.25, 0.12, 0.07), vec3(0.54, 0.27, 0.14), vBfDermal.y);')
      .replace(blend,'mix(irradiance, directLight.color * bfSoft, mix(0.26, 0.43, vBfDermal.y))')
      .replace(rough,rough+`
        // BODYFORGE_DERMAL_REGIONS_V3
        float bfTargetRoughness = mix(0.72, 0.43, vBfDermal.x);
        roughnessFactor = clamp(mix(bfTargetRoughness, roughnessFactor, 0.28), 0.37, 0.88);
      `)
      .replace('dHdxy_fwd(), faceDirection);','dHdxy_fwd() * mix(0.28, 0.92, vBfDermal.z), faceDirection);'),
  };
}
