import * as THREE from 'three';
import { parseEmbeddedFoundationGltf } from './embeddedFoundationGltf';
import { disposeThreeTree } from './threeResources';
import { DEFAULT_AVATAR_LOOK, lookColors, type AvatarLook } from './avatarLook';
import type { BodyBuild, Muscle, Outfit } from './game';
import type { ZoneLevels } from './muscleZones';
import type { AvatarIdleRig } from './avatarIdle';

export const FOUNDATION_REVIEW_ID = 'BF_CC0_FOUNDATION_V1';
export type FoundationVersion = 1 | 3;
export const FOUNDATION_GROUPS = ['arms', 'core', 'legs', 'back'] as const;
export type FoundationWeights = Record<string, number>;
type Settings = { build: BodyBuild; muscles: Partial<Record<Muscle, number>>; outfit: Outfit; look?: AvatarLook; zoneLevels?: ZoneLevels };
export interface FoundationFigure {
  id: string;
  root: THREE.Group;
  shirt: THREE.SkinnedMesh;
  torso: THREE.SkinnedMesh;
  idle?: AvatarIdleRig;
  apply: (settings: Settings) => void;
}

/** Paid game levels drive TWO actual geometric morphs for each group.
 * Volume is linear; relief grows monotonically with a mild convex curve.
 * Artistic progression, not a medical model or inferred change in body fat. */
export function foundationWeights(levels: Settings['muscles'], relief = true): FoundationWeights {
  const values: FoundationWeights = {};
  for (const g of FOUNDATION_GROUPS) {
    const n = levels[g] ?? 0;
    const t = Number.isFinite(n) ? THREE.MathUtils.clamp(n, 0, 5) / 5 : 0;
    values[g.toUpperCase() + '_VOLUME'] = t;
    values[g.toUpperCase() + '_RELIEF'] = relief ? .65 * t + .35 * t * t : 0;
  }
  return values;
}

/** Do not reuse the previous rig's vertex-count-specific fitting functions.
 * This asset has its own topology, UVs, weights and named morph targets. */
export function createFoundationFigure(source: THREE.Group, relief = true, observe?: (weights: FoundationWeights) => void, version: FoundationVersion = 1): FoundationFigure {
  const names = ['BF_Foundation_Skin', 'BF_Foundation_TorsoSkin', 'BF_Foundation_Shorts', 'BF_Foundation_Shirt'];
  const keys = Object.keys(foundationWeights({}));
  const meshes = names.map(name => {
    const node = source.getObjectByName(name);
    if (!(node instanceof THREE.SkinnedMesh) || node.skeleton.bones.length !== 19 ||
        node.geometry.morphAttributes.position?.length !== keys.length ||
        node.geometry.morphAttributes.normal?.length !== keys.length ||
        !node.morphTargetDictionary || !node.morphTargetInfluences ||
        !keys.every(key => Number.isInteger(node.morphTargetDictionary?.[key])) ||
        new Set(Object.values(node.morphTargetDictionary)).size !== keys.length ||
        !(node.material instanceof THREE.MeshStandardMaterial)) throw Error('Invalid foundation mesh: ' + name);
    node.castShadow = true; node.receiveShadow = true;
    return node;
  });
  const [skin, torso, shorts, shirt] = meshes;
  const hairStyles = ['buzz', 'crop', 'swept'] as const;
  const hairMeshes = version === 3 ? [...hairStyles.map(s => 'Hair_' + s), 'Scalp', 'Brows'].map(suffix => {
    const node = source.getObjectByName('BF_Foundation_' + suffix);
    if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial)) throw Error('Invalid foundation hair: ' + suffix);
    node.castShadow = true;
    return node;
  }) : [];
  if (version === 3) {
    for (const mesh of meshes) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!material.normalMap) throw Error('Missing foundation normal texture: ' + mesh.name);
    }
    for (const suffix of ['Eye_L', 'Eye_R', 'Iris_L', 'Iris_R', 'Shoe_L', 'Shoe_R', 'Sole_L', 'Sole_R']) {
      const node = source.getObjectByName('BF_Foundation_' + suffix);
      if (!(node instanceof THREE.Mesh)) throw Error('Missing foundation detail: ' + suffix);
      node.castShadow = true; node.receiveShadow = true;
    }
  }
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source, true);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height < 1.5 || height > 2.0) throw Error('Invalid foundation height');
  const root = new THREE.Group();
  const id = version === 3 ? 'BF_CC0_FOUNDATION_V3' : FOUNDATION_REVIEW_ID;
  root.name = id;
  const scale = 4.75 / height, centre = bounds.getCenter(new THREE.Vector3());
  source.scale.setScalar(scale);
  source.position.set(-centre.x * scale, -bounds.min.y * scale + .028, -centre.z * scale);
  root.add(source);
  const apply = ({ build, muscles, outfit, look = DEFAULT_AVATAR_LOOK }: Settings) => {
    const values = foundationWeights(muscles, relief);
    for (const mesh of meshes) {
      for (const [name, value] of Object.entries(values)) {
        mesh.morphTargetInfluences![mesh.morphTargetDictionary![name]] = value;
      }
    }
    root.scale.x = build === 'solid' ? 1.055 : 1;
    const colors = lookColors(look);
    for (const mesh of [skin, torso]) (mesh.material as THREE.MeshStandardMaterial).color.set(colors.skin);
    const fabric = outfit === 'ember' ? '#47302b' : outfit === 'steel' ? '#324052' : '#263344';
    for (const mesh of [shirt, shorts]) (mesh.material as THREE.MeshStandardMaterial).color.set(fabric);
    hairMeshes.forEach((mesh, i) => {
      mesh.visible = i >= hairStyles.length || hairStyles[i] === (look.hairStyle ?? 'crop');
      (mesh.material as THREE.MeshStandardMaterial).color.set(colors.hair);
    });
    shorts.visible = true; shirt.visible = look.shirt === true; torso.visible = !shirt.visible;
    root.updateMatrixWorld(true);
    observe?.(values);
  };
  return { id, root, shirt, torso, apply };
}

export async function loadFoundationFigure(relief: boolean, observe: (weights: FoundationWeights) => void, version: FoundationVersion = 1): Promise<FoundationFigure> {
  const response = await fetch('/_bodyforge/review/foundation-v' + version + '.glb', {
    cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error('Local foundation unavailable');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== (version === 3 ? 15400816 : 6723504)) throw Error('Invalid foundation length');
  const { scene } = await parseEmbeddedFoundationGltf(bytes);
  try { return createFoundationFigure(scene, relief, observe, version); }
  catch (error) { disposeThreeTree(scene); throw error; }
}
