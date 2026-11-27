import * as THREE from 'three';
import { METRIC_REST, METRIC_NORMAL, METRIC_SKIN_ID } from './avatarMetricSkinReview';

/** Development-only artistic calibration, NOT anatomical pore measurements.
 * Keep the same licensed cheek source and fixed physical texture period.
 * Two normalized bytes per bind vertex: slope amplitude and filter bias.
 * The latter widens only the sampling footprint, not the physical Jacobian. */
export const REGIONAL_MICRO_ID = 'BF_REGIONAL_MICRO_V1';
export const REGIONAL_MICRO_ATTRIBUTE = 'bfRegionalMicro';
export const REGIONAL_MICRO_FOOTPRINT_MAX = 2.25;
type Profile = readonly [number, number];

const clamp = (x:number)=>Math.max(0,Math.min(1,x));

/** Compact C1-continuous region support. Coordinates in bind metres, adapted
 * from the pinned body's measured face/body landmarks. Mirror left/right.
 * Broad zones are applied first; smaller sensitive zones take precedence. */
export function sampleRegionalMicro(x:number,y:number,z:number):Profile {
  if(![x,y,z].every(Number.isFinite))return [.52,.12];
  const a=Math.abs(x);
  let strength=.52,filter=.12;
  const region=(cx:number,cy:number,cz:number,rx:number,ry:number,rz:number,s:number,f:number)=>{
    const q=((a-cx)/rx)**2+((y-cy)/ry)**2+((z-cz)/rz)**2;
    const w=clamp(1-q)**2;
    strength+=(s-strength)*w;filter+=(f-filter)*w;
  };
  region(.095,1.333,.135,.18,.20,.14,.56,.14); // chest
  region(.11,1.34,-.065,.19,.19,.14,.54,.16); // back
  region(.27,1.38,.03,.13,.14,.14,.52,.19); // shoulder
  region(.435,1.173,.102,.11,.14,.14,.58,.13); // forearm
  region(.512,1.102,.218,.10,.08,.12,.43,.45); // wrist
  region(.548,1.035,.273,.10,.11,.15,.35,.60); // hand
  region(.181,.396,-.045,.10,.19,.09,.48,.22); // calf
  region(.184,.323,.047,.09,.25,.10,.59,.15); // shin
  region(.151,.538,.073,.085,.09,.07,.68,.10); // knee
  region(.382,1.232,-.015,.09,.10,.08,.66,.10); // elbow
  region(.043,1.485,.047,.105,.115,.11,.38,.48); // neck
  region(.018,1.712,.145,.05,.037,.04,.48,.30); // forehead
  region(.050,1.641,.119,.040,.048,.045,.72,.07); // cheek
  region(.004,1.648,.164,.027,.035,.032,.64,.12); // nose
  region(.008,1.577,.150,.04,.029,.045,.58,.20); // chin
  region(.030,1.677,.143,.030,.018,.024,.20,.88); // eyelid
  region(.079,1.654,.049,.028,.049,.043,.28,.74); // ear
  return [clamp(strength),clamp(filter)];
}

/** Atomic install: validate all primitives before adding any attribute.
 * Capture from the immutable metric field, not animated positions. */
export function installRegionalMicro(surfaces:readonly THREE.SkinnedMesh[],
  material:THREE.MeshPhysicalMaterial):boolean {
  if(material.userData.BODYFORGE_regionalMicro!==undefined||
     material.userData.BODYFORGE_regionalDermal!==true||
     !Number.isFinite(material.userData.BODYFORGE_metricSkinScale)||
     !surfaces.some(s=>s.name==='BODYFORGE_Body'&&s.geometry.getAttribute(METRIC_REST)?.count===65895))return false;
  const pending:{geometry:THREE.BufferGeometry;bytes:Uint8Array}[]=[];
  for(const s of surfaces){
    const geometry=s.geometry,p=geometry.getAttribute(METRIC_REST),n=geometry.getAttribute(METRIC_NORMAL);
    if(!p||p.itemSize!==3||!n||n.itemSize!==3||n.count!==p.count||
       p.count!==geometry.getAttribute('position')?.count||geometry.hasAttribute(REGIONAL_MICRO_ATTRIBUTE))return false;
    const bytes=new Uint8Array(p.count*2);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(![x,y,z].every(Number.isFinite))return false;
      const [strength,filter]=sampleRegionalMicro(x,y,z);
      bytes[i*2]=Math.round(255*strength);bytes[i*2+1]=Math.round(255*filter);
    }
    pending.push({geometry,bytes});
  }
  for(const {geometry,bytes} of pending)
    geometry.setAttribute(REGIONAL_MICRO_ATTRIBUTE,new THREE.Uint8BufferAttribute(bytes,2,true));
  material.userData.BODYFORGE_regionalMicro=REGIONAL_MICRO_ID;
  return true;
}

/** Compose only with the known metric shader. Preserve its three samples,
 * geometry derivatives, Fresnel/GGX and shadowed light. Direct diffuse uses
 * the mesoscopic normal captured before the pore gradient; direct specular
 * retains the final perturbed normal. Indirect lighting remains unchanged. */
export function regionalMicroShaders(vertex:string,fragment:string):{vertex:string;fragment:string}|undefined {
  const begin='#include <begin_vertex>',normal='#include <normal_fragment_maps>';
  const strength='float bfStrength = mix(0.60,1.15,vBfDermal.z);';
  const geometry='vec3 bfMetricDx = dFdx(bfMetricP), bfMetricDy = dFdy(bfMetricP);';
  const cosine='float bfCos = dot(geometryNormal, directLight.direction);';
  const diffuse='mix(irradiance, directLight.color * bfSoft,';
  const mixed='vec3 bfMixedNormal = mix(normal, nonPerturbedNormal, 0.64);';
  const diffusion=fragment.includes('BF_SKIN_ANGULAR_DIFFUSION_V1');
  const planes=['zy','xz','xy'];
  const sampleAnchors=planes.map(plane=>'bfMetricDx.'+plane+', bfMetricDy.'+plane);
  if(!vertex.includes(METRIC_SKIN_ID)||!fragment.includes(METRIC_SKIN_ID)||
     vertex.includes(REGIONAL_MICRO_ID)||fragment.includes(REGIONAL_MICRO_ID)||
     vertex.split(begin).length!==2||
     [normal,strength,geometry,cosine,diffusion?mixed:diffuse,...sampleAnchors].some(a=>fragment.split(a).length!==2))return;
  const varying='varying vec2 vBfRegionalMicro;\n';
  let f=fragment.replace(normal,normal+'\n bfMesoNormal = normal;')
    .replace(geometry,geometry+'\n float bfMicroFootprint = mix(1.0, '+REGIONAL_MICRO_FOOTPRINT_MAX.toFixed(2)+', vBfRegionalMicro.y);')
    .replace(strength,'float bfStrength = clamp(vBfRegionalMicro.x, 0.12, 0.78);')
    .replace(cosine,'float bfCos = dot(bfMesoNormal, directLight.direction);');
  for(const plane of planes)f=f.replace('bfMetricDx.'+plane+', bfMetricDy.'+plane,
    'bfMetricDx.'+plane+' * bfMicroFootprint, bfMetricDy.'+plane+' * bfMicroFootprint');
  f=diffusion?f.replace(mixed,'vec3 bfMixedNormal = mix(bfMesoNormal, nonPerturbedNormal, 0.64);')
    :f.replace(diffuse,'mix(directLight.color * max(0.0, bfCos), directLight.color * bfSoft,');
  return {
    vertex:'// '+REGIONAL_MICRO_ID+'\nattribute vec2 '+REGIONAL_MICRO_ATTRIBUTE+';\n'+varying+
      vertex.replace(begin,begin+'\n vBfRegionalMicro = '+REGIONAL_MICRO_ATTRIBUTE+';'),
    fragment:'// '+REGIONAL_MICRO_ID+'\n'+varying+'vec3 bfMesoNormal;\n'+f,
  };
}
