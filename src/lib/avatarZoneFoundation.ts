import * as THREE from 'three';
import { parseEmbeddedFoundationGltf } from './embeddedFoundationGltf';
import { DEFAULT_AVATAR_LOOK, lookColors } from './avatarLook';
import { disposeThreeTree } from './threeResources';
import type { FoundationFigure } from './avatarFoundationReview';
import { applyZonePart, decodeZoneFields, geometryFingerprint, zoneWeights, type ZoneWeights } from './zoneMorphRuntime';
import { ZONE_ASSET_PINS, ZONE_ASSET_PINS_V5, ZONE_ASSET_PINS_V6, BLINK_ASSET_PIN, BROW_ASSET_PIN, LASH_ASSET_PIN, HAIR_ASSET_PINS, SKIN_SCAN_PIN, EYE_APERTURE_PIN, LIP_REPAIR_PIN, ZONE_ASSET_PINS_V24, ZONE_ASSET_PINS_V26, ZONE_ASSET_PINS_V27, ZONE_ASSET_PINS_V28 } from './zoneAssetPins';
import { createFoundationIdle, regularizeFoundationHead, tuneFoundationMaterials } from './regionalFoundationIdle';
import { createFoundationEyes } from './regionalFoundationEyes';
import { repairFoundationFaceRest } from './regionalFoundationFaceRepair';
import { createFoundationBlink, decodeFoundationBlink } from './regionalFoundationBlink';
import { tuneFoundationSkin } from './regionalFoundationSkin';
import { installFoundationBrows } from './regionalFoundationBrows';
import { installFoundationLashes } from './regionalFoundationLashes';
import { installFoundationHair } from './regionalFoundationHair';
import { decodeFoundationScan, installFoundationDetail } from './regionalFoundationDetail';
import { installFoundationEyeContact } from './regionalFoundationEyeContact';
import { repairFoundationLipRest } from './regionalFoundationLipRepair';

export const ZONE_REVIEW_ID = 'BF_CC0_ZONES_V4';
type GeometryProof = { revision: number; meshes: Record<string,{vertices:number;position:string;normal:string}> };
type Observer = (weights: ZoneWeights, proof: GeometryProof) => void;

async function digest(buffer:ArrayBuffer):Promise<string> {
  const b=await crypto.subtle.digest('SHA-256',buffer);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function loadPinned(pin:{url:string;bytes:number;sha256:string}):Promise<ArrayBuffer> {
  const r=await fetch(pin.url,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Regional asset unavailable');
  const b=await r.arrayBuffer();
  if(b.byteLength!==pin.bytes||await digest(b)!==pin.sha256)throw Error('Regional asset integrity failure');
  return b;
}

export async function loadZoneFoundation(relief:boolean,observe:Observer,version:4|5|6|7|8|9|10|11|12|13|14|15|20|23|24|26|27|28=4):Promise<FoundationFigure> {
  const pins=version===28?ZONE_ASSET_PINS_V28:version===27?ZONE_ASSET_PINS_V27:version===26?ZONE_ASSET_PINS_V26:version===24?ZONE_ASSET_PINS_V24:version>=6?ZONE_ASSET_PINS_V6:version===5?ZONE_ASSET_PINS_V5:ZONE_ASSET_PINS;
  const reviewId=version===28?'BF_CC0_ZONES_V28':version===27?'BF_CC0_ZONES_V27':version===26?'BF_CC0_ZONES_V26':version===24?'BF_CC0_ZONES_V24':version===23?'BF_CC0_ZONES_V23':version===20?'BF_CC0_ZONES_V20':version===15?'BF_CC0_ZONES_V15':version===14?'BF_CC0_ZONES_V14':version===13?'BF_CC0_ZONES_V13':version===12?'BF_CC0_ZONES_V12':version===11?'BF_CC0_ZONES_V11':version===10?'BF_CC0_ZONES_V10':version===9?'BF_CC0_ZONES_V9':version===8?'BF_CC0_ZONES_V8':version===7?'BF_CC0_ZONES_V7':version===6?'BF_CC0_ZONES_V6':version===5?'BF_CC0_ZONES_V5':ZONE_REVIEW_ID;
  const [glb,fieldBytes,blinkBytes,browBytes,lashBytes,hairBytes,scanBytes,apertureBytes,lipBytes]=await Promise.all([loadPinned(pins.model),loadPinned(pins.fields),version>=10?loadPinned(BLINK_ASSET_PIN):Promise.resolve(undefined),version>=12?loadPinned(BROW_ASSET_PIN):Promise.resolve(undefined),version>=13?loadPinned(LASH_ASSET_PIN):Promise.resolve(undefined),version>=14?Promise.all(HAIR_ASSET_PINS.map(loadPinned)):Promise.resolve(undefined),version>=15?loadPinned(SKIN_SCAN_PIN):Promise.resolve(undefined),version>=20?loadPinned(EYE_APERTURE_PIN):Promise.resolve(undefined),version>=23?loadPinned(LIP_REPAIR_PIN):Promise.resolve(undefined)]);
  const fields=decodeZoneFields(fieldBytes);
  const {scene:source}=await parseEmbeddedFoundationGltf(glb);
  try {
    const states=await Promise.all(fields.parts.map(async part=>{
      const mesh=source.getObjectByName(part.name);
      if(!(mesh instanceof THREE.SkinnedMesh)||mesh.skeleton.bones.length!==19||
          !(mesh.material instanceof THREE.MeshStandardMaterial)||!mesh.material.normalMap||
          Object.keys(mesh.geometry.morphAttributes).length)throw Error('Invalid regional body mesh '+part.name);
      const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
      if(!(p instanceof THREE.BufferAttribute)||!(n instanceof THREE.BufferAttribute)||p.itemSize!==3||n.itemSize!==3||
          !(p.array instanceof Float32Array)||!(n.array instanceof Float32Array)||p.count!==part.vertices||n.count!==part.vertices)
        throw Error('Invalid regional geometry buffers');
      const copy=new Uint8Array(p.array.byteLength);copy.set(new Uint8Array(p.array.buffer,p.array.byteOffset,p.array.byteLength));
      if(await digest(copy.buffer)!==part.positionSha256)throw Error('Regional geometry and field order mismatch');
      mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
      p.setUsage(THREE.DynamicDrawUsage);n.setUsage(THREE.DynamicDrawUsage);
      return {part,mesh,p,n,restP:new Float32Array(p.array),restN:new Float32Array(n.array),outP:p.array,outN:n.array};
    }));
    const byName=(name:string)=>{const s=states.find(s=>s.part.name===name);if(!s)throw Error('Missing '+name);return s.mesh;};
    const skin=byName('BF_Foundation_Skin'),torso=byName('BF_Foundation_TorsoSkin'),
      shorts=byName('BF_Foundation_Shorts'),shirt=byName('BF_Foundation_Shirt');
    const hairStyles=['buzz','crop','swept'] as const;
    const hair=[...hairStyles.map(s=>'Hair_'+s),'Scalp','Brows'].map(s=>{
      const n=source.getObjectByName('BF_Foundation_'+s);
      if(!(n instanceof THREE.Mesh)||!(n.material instanceof THREE.MeshStandardMaterial))throw Error('Invalid regional detail');
      n.castShadow=true;return n;
    });
    source.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(source,true),height=bounds.max.y-bounds.min.y;
    if(!Number.isFinite(height)||height<1.5||height>2)throw Error('Invalid regional height');
    const root=new THREE.Group(),scale=4.75/height,centre=bounds.getCenter(new THREE.Vector3());
    root.name=reviewId;
    source.scale.setScalar(scale);source.position.set(-centre.x*scale,-bounds.min.y*scale+.028,-centre.z*scale);root.add(source);
    if(version>=7) {
      for(const s of states) {
        if(!s.mesh.skeleton.bones.every((b,i)=>b===skin.skeleton.bones[i]))throw Error('Regional skeleton mismatch');
        regularizeFoundationHead(s.mesh);
      }
      tuneFoundationMaterials(source);
    }
    if(version>=9){
      const s=states.find(s=>s.part.name==='BF_Foundation_Skin');
      if(!s)throw Error('Missing face repair mesh');
      repairFoundationFaceRest(fields,s.part,s.restP,s.restN);
    }
    const lipState=version>=23?states.find(s=>s.part.name==='BF_Foundation_Skin'):undefined;
    const lipBlink=lipState&&blinkBytes?decodeFoundationBlink(blinkBytes,fields,lipState.part,lipState.restP,lipState.restN):undefined;
    if(version>=23){
      if(!lipBytes||!lipState||!lipBlink)throw Error('Missing lip repair inputs');
      repairFoundationLipRest(fields,lipState.part,lipState.restP,lipState.restN,lipBytes,lipBlink.ids);
    }
    if(version>=11)tuneFoundationSkin(source);
    if(version>=15){if(!scanBytes)throw Error('Missing skin scan');installFoundationDetail(source,states,await decodeFoundationScan(scanBytes),scale);}
    if(version>=12){if(!browBytes)throw Error('Missing brow asset');installFoundationBrows(source,browBytes);}
    const lashes=version>=13&&lashBytes?installFoundationLashes(source,lashBytes):undefined;
    if(version>=13&&!lashes)throw Error('Missing lash rig');
    if(lashes)hair.push(lashes.mesh);
    if(version>=14){if(!hairBytes)throw Error('Missing hair assets');installFoundationHair(source,hairBytes);}
    const faceState=states.find(s=>s.part.name==='BF_Foundation_Skin');
    const blink=version>=10&&blinkBytes&&faceState?createFoundationBlink(skin,lipBlink??decodeFoundationBlink(blinkBytes,fields,faceState.part,faceState.restP,faceState.restN)):undefined;
    if(version>=10&&!blink)throw Error('Missing blink rig');
    const skeletonIdle=version>=7?createFoundationIdle(source,skin):undefined;
    const eyes=version>=8?createFoundationEyes(source):undefined;
    const eyeContact=version>=20&&apertureBytes?installFoundationEyeContact(source,apertureBytes):undefined;
    if(version>=20&&!eyeContact)throw Error('Missing eye contact rig');
    const idle:FoundationFigure['idle']=eyes&&skeletonIdle?{
      pose(p){skeletonIdle.pose(p);eyes.pose(p.gaze);blink?.pose(p.blink);lashes?.pose(p.blink);eyeContact?.pose(p.blink);},
      reset(){skeletonIdle.reset();eyes.reset();blink?.reset();lashes?.reset();eyeContact?.reset();}
    }:skeletonIdle;
    let revision=0,lastSignature='';
    const apply:FoundationFigure['apply']=({build,zoneLevels,outfit,look=DEFAULT_AVATAR_LOOK})=>{
      if(!zoneLevels)throw Error('Regional levels missing');
      const weights=zoneWeights(build,zoneLevels,relief),sig=JSON.stringify(weights);
      if(sig!==lastSignature){
        const proof:GeometryProof={revision:++revision,meshes:{}};
        for(const s of states){
          applyZonePart(fields,s.part,s.restP,s.restN,s.outP,s.outN,weights);
          s.p.needsUpdate=true;s.n.needsUpdate=true;s.mesh.geometry.computeBoundingSphere();
          proof.meshes[s.part.name]={vertices:s.part.vertices,position:geometryFingerprint(s.outP),normal:geometryFingerprint(s.outN)};
        }
        lastSignature=sig;observe(weights,proof);
        blink?.reapply();
      }
      const colors=lookColors(look);
      for(const m of [skin,torso])(m.material as THREE.MeshStandardMaterial).color.set(colors.skin);
      for(const m of [shorts,shirt])(m.material as THREE.MeshStandardMaterial).color.set(outfit==='ember'?'#47302b':outfit==='steel'?'#324052':'#263344');
      hair.forEach((m,i)=>{m.visible=i>=hairStyles.length||hairStyles[i]===(look.hairStyle??'crop');(m.material as THREE.MeshStandardMaterial).color.set(colors.hair)});
      shirt.visible=look.shirt===true;torso.visible=!shirt.visible;shorts.visible=true;
      root.updateMatrixWorld(true);
    };
    return {id:reviewId,root,shirt,torso,apply,idle};
  }catch(e){disposeThreeTree(source);throw e;}
}
