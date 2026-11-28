import * as THREE from 'three';

/** Fitted from the pinned CC0 V6 donor vertices in Blender, converted to
 * character coordinates (X right, Y up, Z forward). The V8 ray audit
 * selected a 6 degree downward optical axis and +/-6 degree gaze envelope. */
const CENTERS = {
  L: [0.03285256233707197, 1.5736949323426284, 0.12137868255708062],
  R: [-0.032891018510595865, 1.5736949772644446, 0.12137791736987691],
} as const;
export const EYE_PITCH_DEG = 6;
export const EYE_GAZE_DEG = 6;
export const EYE_IRIS_DEG = 26.5;
export const EYE_PUPIL_DEG = 9.2;
const MAP_ANGLE = 110 * Math.PI / 180;
const MAP_RADIUS = .49;
const irisAngle = EYE_IRIS_DEG * Math.PI / 180;
const pupilRatio = EYE_PUPIL_DEG / EYE_IRIS_DEG;
const unit = (x: number) => THREE.MathUtils.clamp(x, 0, 1);
const smooth = (x: number, a: number, b: number) => {
  const t = unit((x-a)/(b-a)); return t*t*(3-2*t);
};
const lerp = THREE.MathUtils.lerp;

/** Azimuthal projection around the optical axis. The antipode is hidden by
 * the head. Front pupil and limbal ring have exact angular boundaries. */
export function foundationEyeUV(x: number, y: number, z: number): [number, number] {
  const radial = Math.hypot(x,y);
  const angle = Math.atan2(radial,z);
  if (!Number.isFinite(angle) || Math.hypot(x,y,z) < 1e-8) throw Error('Invalid globe coordinate');
  const r = MAP_RADIUS * Math.min(1, angle/MAP_ANGLE);
  return radial < 1e-10 ? (z >= 0 ? [.5,.5] : [.5+MAP_RADIUS,.5])
    : [.5+r*x/radial,.5+r*y/radial];
}

/** Original deterministic pigment, not a scan or licensed external image.
 * Radial multi-frequency fibers, irregular collarette, dark limbus, ivory
 * sclera with very subdued peripheral pink vascular variation. */
export function foundationEyePigment(theta: number, angle: number): [number,number,number] {
  const r = Math.max(0,theta/irisAngle);
  const a = angle;
  const noise = .40*Math.sin(a*43+2.7*Math.sin(r*12+a*3))
    + .28*Math.sin(a*79-r*19+1.6*Math.sin(a*9))
    + .17*Math.cos(a*137+r*8)
    + .15*Math.sin(a*191+r*32);
  const broad = .55*Math.sin(a*9+2.2*r)+.45*Math.cos(a*17-4*r);
  const collarette = Math.exp(-Math.pow((r-.55-.038*Math.sin(a*12)-.025*Math.cos(a*23))/.077,2));
  const crypt = Math.pow(.5+.5*Math.sin(a*23+4*Math.sin(r*17)),5)*Math.exp(-Math.pow((r-.67)/.19,2));
  const limb = smooth(r,.84,1.015);
  const pigment = [
    lerp(103+30*noise+15*broad+16*collarette-12*crypt,43,limb),
    lerp(73+23*noise+9*broad+11*collarette-9*crypt,35,limb),
    lerp(46+15*noise+7*broad+4*collarette-5*crypt,30,limb),
  ];
  const pupil = 1-smooth(r,pupilRatio-.014,pupilRatio+.014);
  for(let k=0;k<3;k++) pigment[k]=lerp(pigment[k],[12,10,9][k],pupil);
  const peripheral=smooth(r,1.10,3.8);
  const vessel1=Math.pow(.5+.5*Math.sin(a*11+4.0*r+1.8*Math.sin(a*7+r*3)),23);
  const vessel2=Math.pow(.5+.5*Math.cos(a*19-r*5+1.3*Math.sin(a*13)),32);
  const vessel=peripheral*(.65*vessel1+.35*vessel2);
  const sclera=[214-11*peripheral+9*vessel,206-25*peripheral-21*vessel,197-20*peripheral-18*vessel];
  const edge=smooth(r,.985,1.035);
  return pigment.map((v,k)=>Math.round(THREE.MathUtils.clamp(lerp(v,sclera[k],edge),0,255))) as [number,number,number];
}

export function createFoundationEyeTexture(size=512): THREE.DataTexture {
  if(![256,512,1024].includes(size)) throw Error('Invalid eye map size');
  const bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const u=((x+.5)/size-.5)/MAP_RADIUS,v=((y+.5)/size-.5)/MAP_RADIUS;
    const theta=Math.min(1,Math.hypot(u,v))*MAP_ANGLE;
    const [r,g,b]=foundationEyePigment(theta,Math.atan2(v,u));
    const i=4*(y*size+x);
    bytes[i]=r;bytes[i+1]=g;bytes[i+2]=b;bytes[i+3]=255;
  }
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  texture.name='BF_V8_OriginalEyePigment';
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  return texture;
}
export interface FoundationEyeRig {
  pose(gaze: number): void;
  reset(): void;
}
export function eyeAngles(side: 'L'|'R', gaze: number): [number,number] {
  const g=Number.isFinite(gaze)?THREE.MathUtils.clamp(gaze,-1,1):0;
  return [EYE_PITCH_DEG, (side==='L'?-1:1)+EYE_GAZE_DEG*g];
}

/** Keep original non-spherical globe triangles, head binding and optical
 * pivot. The former iris shell remains owned but hidden, eliminating its
 * visible geometry offset. Rotate actual globe positions and normals from
 * rest every sample, never the paid body morph buffers. */
export function createFoundationEyes(source: THREE.Group): FoundationEyeRig {
  const sides=['L','R'] as const;
  const eyes=sides.map(side=>{
    const mesh=source.getObjectByName('BF_Foundation_Eye_'+side);
    const iris=source.getObjectByName('BF_Foundation_Iris_'+side);
    if(!(mesh instanceof THREE.SkinnedMesh)||!(iris instanceof THREE.SkinnedMesh)||
       !(mesh.material instanceof THREE.MeshPhysicalMaterial)||mesh.material.name!=='BF_Sclera_V2')
      throw Error('Invalid donor eye');
    const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal'),
      w=mesh.geometry.getAttribute('skinWeight'),j=mesh.geometry.getAttribute('skinIndex');
    if(!(p instanceof THREE.BufferAttribute)||!(n instanceof THREE.BufferAttribute)||
       !(p.array instanceof Float32Array)||!(n.array instanceof Float32Array)||
       p.count!==578||n.count!==p.count||w?.count!==p.count||j?.count!==p.count||
       mesh.skeleton.bones.length!==19||p.itemSize!==3||n.itemSize!==3||
       mesh.geometry.index?.count!==3264) throw Error('Invalid donor globe topology');
    const head=mesh.skeleton.bones.findIndex(b=>b.name==='head');
    if(head<0) throw Error('Donor eye head binding unavailable');
    const center=new THREE.Vector3(...CENTERS[side]);
    const uv=new Float32Array(p.count*2),restP=new Float32Array(p.array),restN=new Float32Array(n.array);
    for(let i=0;i<p.count;i++){
      let weight=0,total=0;
      for(let k=0;k<4;k++){
        const a=w.getComponent(i,k);
        if(!Number.isFinite(a)||a<0)throw Error('Invalid globe weight');
        total+=a;if(j.getComponent(i,k)===head)weight+=a;
      }
      if(Math.abs(total-1)>1e-6||Math.abs(weight-1)>1e-6)throw Error('Globe not rigidly head bound');
      const x=p.getX(i)-center.x,y=p.getY(i)-center.y,z=p.getZ(i)-center.z;
      const r=Math.hypot(x,y,z);
      if(r<.0112||r>.0126)throw Error('Donor globe pivot mismatch');
      uv.set(foundationEyeUV(x,y,z),i*2);
    }
    return {side,mesh,iris,p,n,restP,restN,center,uv};
  });
  const texture=createFoundationEyeTexture();
  for(const e of eyes){
    e.mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(e.uv,2));
    e.p.setUsage(THREE.DynamicDrawUsage);e.n.setUsage(THREE.DynamicDrawUsage);
    e.mesh.frustumCulled=false;
    const m=e.mesh.material as THREE.MeshPhysicalMaterial;
    m.color.set(0xffffff);m.map=texture;m.roughness=.29;m.metalness=0;
    m.specularIntensity=.68;m.clearcoat=.48;m.clearcoatRoughness=.10;
    m.needsUpdate=true;
    e.iris.visible=false;
  }
  const xaxis=new THREE.Vector3(1,0,0),yaxis=new THREE.Vector3(0,1,0);
  const q=new THREE.Quaternion(),tmp=new THREE.Quaternion(),v=new THREE.Vector3();
  let last=Infinity;
  const pose=(gaze:number)=>{
    const g=Number.isFinite(gaze)?THREE.MathUtils.clamp(gaze,-1,1):0;
    if(g===last)return;
    for(const e of eyes){
      const [pitch,yaw]=eyeAngles(e.side,g);
      q.setFromAxisAngle(xaxis,THREE.MathUtils.degToRad(pitch))
        .multiply(tmp.setFromAxisAngle(yaxis,THREE.MathUtils.degToRad(yaw)));
      for(let i=0;i<e.p.count;i++){
        v.fromArray(e.restP,3*i).sub(e.center).applyQuaternion(q).add(e.center);
        e.p.setXYZ(i,v.x,v.y,v.z);
        v.fromArray(e.restN,3*i).applyQuaternion(q).normalize();
        e.n.setXYZ(i,v.x,v.y,v.z);
      }
      e.p.needsUpdate=e.n.needsUpdate=true;
    }
    last=g;
  };
  pose(0);
  return {pose,reset:()=>pose(0)};
}
