import * as THREE from 'three';

/** Original procedural material study, not a face scan or physical SSS.
 * Pigment is attached to immutable rest coordinates, so muscle growth,
 * head motion and blinking do not move color relative to the surface.
 * All values are linear-light multipliers of the selected skin tone. */
const sat=(t:number)=>Math.max(0,Math.min(1,t));
const smooth=(a:number,b:number,x:number)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t);};
const bell=(x:number,c:number,w:number)=>Math.exp(-Math.pow((x-c)/w,2));
function hash(x:number,y:number,z:number){
  let n=Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791);
  n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);
  return ((n^(n>>>16))>>>0)/4294967295;
}
function noise3(x:number,y:number,z:number){
  const i=Math.floor(x),j=Math.floor(y),k=Math.floor(z);
  const a=smooth(0,1,x-i),b=smooth(0,1,y-j),c=smooth(0,1,z-k);
  let s=0;
  for(let h=0;h<2;h++)for(let v=0;v<2;v++)for(let u=0;u<2;u++)
    s+=hash(i+u,j+v,k+h)*(u?a:1-a)*(v?b:1-b)*(h?c:1-c);
  return s;
}
export function foundationSkinTint(x:number,y:number,z:number):[number,number,number] {
  if(![x,y,z].every(Number.isFinite))throw Error('Invalid pigment coordinate');
  const ax=Math.abs(x),face=smooth(1.47,1.49,y)*(1-smooth(1.61,1.64,y)),
    front=smooth(.098,.124,z),eye=bell(ax,.033,.021)*bell(y,1.564,.014)*front;
  const cheek=bell(ax,.046,.028)*bell(y,1.539,.024)*front;
  const nose=bell(ax,0,.019)*bell(y,1.54,.014)*smooth(.123,.146,z);
  const ear=bell(ax,.083,.018)*bell(y,1.548,.036)*smooth(.058,.09,z);
  const joint=bell(y,.46,.075)*smooth(.03,.16,z)+bell(y,.97,.045)*smooth(.22,.38,ax);
  const blush=sat(.75*cheek+.88*nose+.72*ear+.22*joint);
  const beard=face*front*bell(y,1.485,.025)*(1-bell(ax,0,.014)*bell(y,1.505,.013));
  // Localized vermilion shape fitted to the neutral donor front landmarks.
  // Smooth boundary, including cupid's bow and the taper at both canthi.
  const u=ax/.031,span=Math.sqrt(Math.max(0,1-u*u));
  const top=1.504+(.0063+.0016*bell(u,.28,.20))*span;
  const bottom=1.504-.0092*span;
  const lip=front*(1-smooth(.85,1.02,u))*smooth(bottom-.0016,bottom+.0016,y)*(1-smooth(top-.0016,top+.0016,y));
  const n=.64*noise3(x*38,y*38,z*38)+.36*noise3(x*116,y*116,z*116);
  const grain=.94+.06*n;
  const base=[grain,grain*(1-.105*blush-.045*eye),grain*(1-.14*blush-.035*eye)];
  base[0]*=1-.115*beard;base[1]*=1-.07*beard;base[2]*=1-.04*beard;
  const target=[.94,.72,.74];
  return base.map((v,i)=>THREE.MathUtils.lerp(v,target[i],lip*.88)) as [number,number,number];
}
function periodicNoise(x:number,y:number,period:number,seed:number){
  const i=Math.floor(x),j=Math.floor(y),u=smooth(0,1,x-i),v=smooth(0,1,y-j);
  const wrap=(k:number)=>((k%period)+period)%period;
  const a=hash(wrap(i),wrap(j),seed),b=hash(wrap(i+1),wrap(j),seed);
  const c=hash(wrap(i),wrap(j+1),seed),d=hash(wrap(i+1),wrap(j+1),seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,u),THREE.MathUtils.lerp(c,d,u),v);
}
export function createFoundationSkinMaps(size=256):{pigment:THREE.DataTexture;roughness:THREE.DataTexture}{
  if(![128,256,512].includes(size))throw Error('Invalid skin detail map size');
  const color=new Uint8Array(size*size*4),rough=new Uint8Array(color.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size,v=(y+.5)/size;
    const fine=periodicNoise(u*96,v*96,96,19),medium=periodicNoise(u*24,v*24,24,43),
      broad=periodicNoise(u*8,v*8,8,61);
    const n=.46*fine+.36*medium+.18*broad,i=(y*size+x)*4;
    const value=Math.round(255*(.925+.075*n));
    color[i]=value;color[i+1]=Math.round(value*(.985+.015*medium));color[i+2]=Math.round(value*(.979+.021*broad));color[i+3]=255;
    const r=Math.round(255*(.70+.26*(.57*medium+.43*fine)));
    rough[i]=rough[i+1]=rough[i+2]=r;rough[i+3]=255;
  }
  const make=(bytes:Uint8Array,name:string,space:string)=>{
    const t=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
    t.name=name;t.colorSpace=space;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(8,8);
    t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
    return t;
  };
  return {pigment:make(color,'BF_V11_OriginalPigmentDetail',THREE.LinearSRGBColorSpace),roughness:make(rough,'BF_V11_OriginalRoughness',THREE.NoColorSpace)};
}
/** Existing donor normal map/handedness stays untouched. New textures are
 * owned only by this scene root; same material can be shared by both skin
 * meshes without sharing resources between independent avatars. */
export function tuneFoundationSkin(source:THREE.Group):void{
  const targets=['BF_Foundation_Skin','BF_Foundation_TorsoSkin'].map(name=>{
    const m=source.getObjectByName(name);
    if(!(m instanceof THREE.SkinnedMesh)||!(m.material instanceof THREE.MeshPhysicalMaterial)||
      m.material.name!=='BF_DonorSkin_PBR_V2'||!m.material.normalMap||m.material.map||m.material.roughnessMap||
      !m.material.vertexColors)throw Error('Invalid V11 skin material scope');
    const p=m.geometry.getAttribute('position'),uv=m.geometry.getAttribute('uv'),donor=m.geometry.getAttribute('color');
    if(!p||p.itemSize!==3||!uv||uv.count!==p.count||!(donor instanceof THREE.BufferAttribute)||!(donor.array instanceof Float32Array)||donor.normalized||donor.itemSize!==3||donor.count!==p.count)throw Error('Invalid V11 skin coordinates');
    const colors=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++){
      const tint=foundationSkinTint(p.getX(i),p.getY(i),p.getZ(i));
      for(let k=0;k<3;k++){
        const value=donor.array[i*3+k];
        if(!Number.isFinite(value)||value<=0||value>1)throw Error('Invalid donor pigment');
        colors[i*3+k]=value*tint[k];
      }
    }
    return {m,colors};
  });
  const maps=createFoundationSkinMaps();
  for(const {m,colors} of targets){
    m.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const material=m.material as THREE.MeshPhysicalMaterial;
    material.vertexColors=true;material.map=maps.pigment;material.roughnessMap=maps.roughness;
    material.roughness=.82;material.specularIntensity=.52;material.ior=1.42;
    material.needsUpdate=true;
  }
}
