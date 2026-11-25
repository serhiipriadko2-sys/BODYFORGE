import * as THREE from 'three';
import recipe from './avatarLashGuides.json';

const names = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();
const RINGS = 5, SIDES = 4;
export const LASH_VERTICES_PER_STRAND = RINGS * SIDES;
export const LASH_INDEX_COUNT = 156 * ((RINGS - 1) * SIDES * 6 + 6);

/** The guide roots and interpolated skin weights were sampled in Blender
 * from the evaluated face, not from a generic eye sphere. One indexed
 * skinned draw, no per-frame CPU geometry updates or external request. */
export function createAvatarLashes(body: THREE.SkinnedMesh): THREE.SkinnedMesh | undefined {
  if (body.name !== 'BODYFORGE_Body' || !body.parent ||
      body.geometry.userData.facialProfile !== recipe.faceProfile ||
      body.userData.BODYFORGE_groom !== 'v2' ||
      body.geometry.getAttribute('position')?.count !== 65895 ||
      body.parent.getObjectByName('BODYFORGE_Lashes') || recipe.guides.length !== 156) return;
  const bones = body.skeleton.bones;
  const byName = new Map(bones.map((bone, index) => [names(bone.name), index]));
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const skinIndices: number[] = [], skinWeights: number[] = [];
  const tangent = new THREE.Vector3(), cross = new THREE.Vector3(), radial = new THREE.Vector3();
  const axis = new THREE.Vector3(1, 0, 0);
  const point = new THREE.Vector3();
  for (const guide of recipe.guides) {
    const [x,y,z] = guide.root;
    const { upper, length, spread, width, tone } = guide;
    if (![x,y,z,length,spread,width,tone].every(Number.isFinite) ||
        Math.abs(x)<.022 || Math.abs(x)>.043 || y<1.669 || y>1.680 ||
        z<.138 || z>.149 || length<=0 || length>.0065 || width<=0 ||
        width>.00012 || guide.weights.length>4 || tone<.59 || tone>1) return;
    const joints: number[] = [], weights: number[] = [];
    let lidWeight=0;
    const lid='orbicularis'+(upper?'03':'04')+(x>0?'l':'r');
    for (const pair of guide.weights) {
      const [name,weight] = pair;
      if (typeof name !== 'string' || typeof weight !== 'number' ||
          !Number.isFinite(weight) || weight<0 || weight>1) return;
      const joint=byName.get(names(name));
      if (joint===undefined) return;
      if (names(name)===lid) lidWeight+=weight;
      joints.push(joint); weights.push(weight);
    }
    const sum=weights.reduce((a,b)=>a+b,0);
    if (Math.abs(sum-1)>1e-5 || lidWeight<.25) return;
    while (weights.length<4) {weights.push(0);joints.push(0);}
    const start=positions.length/3;
    // Upper lashes extend forward then curl up; lower lashes curl down.
    // The slight lateral fan makes the roots read as hairs, not eyeliner.
    const sign=upper?1:-1;
    for (let ring=0;ring<RINGS;ring++){
      const t=ring/(RINGS-1);
      point.set(x+spread*t,y+sign*length*(.10*t+.40*t*t),z+length*(t-.20*t*t));
      tangent.set(spread,sign*length*(.10+.80*t),length*(1-.40*t)).normalize();
      cross.copy(axis).addScaledVector(tangent,-axis.dot(tangent)).normalize();
      radial.crossVectors(tangent,cross).normalize();
      const radius=width*(.08+.92*(1-t)**.8);
      for (let side=0;side<SIDES;side++){
        const angle=side/SIDES*Math.PI*2;
        const u=Math.cos(angle)*radius,v=Math.sin(angle)*radius;
        positions.push(point.x+cross.x*u+radial.x*v,point.y+cross.y*u+radial.y*v,point.z+cross.z*u+radial.z*v);
        colors.push(tone,tone,tone);
        skinIndices.push(...joints);skinWeights.push(...weights.map(w=>w/sum));
        if(ring<RINGS-1){
          const a=start+ring*SIDES+side,b=start+ring*SIDES+(side+1)%SIDES;
          indices.push(a,b,b+SIDES,a,b+SIDES,a+SIDES);
        }
      }
    }
    const end=start+(RINGS-1)*SIDES;
    indices.push(end,end+1,end+2,end,end+2,end+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({
    name:'BODYFORGE natural eyelash fibres',color:'#2c211d',vertexColors:true,
    roughness:.87,metalness:0,envMapIntensity:.35,side:THREE.DoubleSide,
  });
  const lashes=new THREE.SkinnedMesh(geometry,material);
  lashes.name='BODYFORGE_Lashes';
  lashes.position.copy(body.position);
  lashes.quaternion.copy(body.quaternion);
  lashes.scale.copy(body.scale);
  lashes.bindMode=body.bindMode;
  lashes.bind(body.skeleton,body.bindMatrix);
  lashes.frustumCulled=false;
  body.parent.add(lashes);
  return lashes;
}
