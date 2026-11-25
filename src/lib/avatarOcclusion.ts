import * as THREE from 'three';

type Positions = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
export interface AthleteOcclusionResult { removedTriangles: number; maskedMeshes: number }

const masked = new WeakSet<THREE.BufferGeometry>();
const INSET = .008; // Source/rest-pose metres; leave an 8 mm safety strip.
const GARMENTS = [
  ['BODYFORGE_Shirt', 4415], ['BODYFORGE_Shorts', 1568], ['BODYFORGE_Shoes', 1142],
] as const;

/**
 * Conservative interior of author-athlete.py shirt_face / shorts_face.
 * Use the complete triangle's bounding box, not its centroid: the entire box
 * must fit one convex garment section. This also avoids crossing a collar
 * hole or a stepped sleeve/torso boundary with three individually safe points.
 * Coordinates are original glTF (height=y, depth=z), before scene transforms.
 */
export function coveredAthleteTriangle(position: Positions, a: number, b: number, c: number, shirt = true): boolean {
  const minX = Math.min(position.getX(a), position.getX(b), position.getX(c));
  const maxX = Math.max(position.getX(a), position.getX(b), position.getX(c));
  const minY = Math.min(position.getY(a), position.getY(b), position.getY(c));
  const maxY = Math.max(position.getY(a), position.getY(b), position.getY(c));
  const minZ = Math.min(position.getZ(a), position.getZ(b), position.getZ(c));
  const maxZ = Math.max(position.getZ(a), position.getZ(b), position.getZ(c));
  if (![minX, maxX, minY, maxY, minZ, maxZ].every(Number.isFinite)) return false;
  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));

  if (minY >= .730 + INSET && maxY <= 1.025 - INSET && maxAbsX < .275 - INSET) return true;
  if (!shirt) return false;

  const front = THREE.MathUtils.clamp((maxZ - .005) / .10, 0, 1);
  const collarHeight = 1.545 - .020 * front;
  if (minY < 1.005 + INSET || maxY > collarHeight - INSET) return false;
  // Inflate the author's neckline exclusion and reject even a possible box
  // intersection; preserving extra hidden skin is safer than a visible hole.
  if (maxY > 1.535 - INSET) {
    const neckX = minX > 0 ? minX : maxX < 0 ? -maxX : 0;
    const neckZ = minZ > .020 ? minZ - .020 : maxZ < .020 ? .020 - maxZ : 0;
    if ((neckX / (.070 + INSET)) ** 2 + (neckZ / (.080 + INSET)) ** 2 < 1) return false;
  }
  const radius = minY > 1.34 ? .328 : minY > 1.15 ? .29 : .255;
  const torso = maxAbsX <= radius - INSET;
  const sleeve = minY >= 1.28 + INSET && maxY <= 1.46 - INSET && maxAbsX <= .415 - INSET;
  return torso || sleeve;
}

/** Shared validation for the pinned full body and its original garments. */
function occlusionTargets(root: THREE.Object3D): THREE.SkinnedMesh[] | undefined {
  const body = root.getObjectByName('BODYFORGE_Body');
  if (!(body instanceof THREE.SkinnedMesh)) return undefined;
  const position = body.geometry.getAttribute('position');
  const realistic = body.userData.BODYFORGE_realism === 'v1';
  if (!position || position.itemSize !== 3 || position.count !== (realistic ? 65895 : 64607) ||
      !body.geometry.index || body.geometry.groups.length > 0 || !body.skeleton) return undefined;
  for (const [name, vertices] of GARMENTS) {
    const garment = root.getObjectByName(name);
    if (!(garment instanceof THREE.SkinnedMesh) || garment.skeleton !== body.skeleton ||
        garment.geometry.getAttribute('position')?.count !== vertices ||
        garment.geometry.getAttribute('skinWeight')?.itemSize !== 4 ||
        !garment.geometry.getAttribute('uv') || !garment.geometry.index) return undefined;
  }
  if (masked.has(body.geometry)) return undefined;
  if (body.geometry.index.count !== 96224 * 3 ||
      body.geometry.getAttribute('skinWeight')?.itemSize !== 4 ||
      !body.geometry.getAttribute('uv')) return undefined;

  const targets: THREE.SkinnedMesh[] = [body];
  const nipples = root.getObjectByName('BODYFORGE_SkinNipples');
  if (nipples instanceof THREE.SkinnedMesh && nipples.skeleton === body.skeleton &&
      nipples.geometry.getAttribute('position')?.count === (realistic ? 458 : 457) && nipples.geometry.index?.count === 624 * 3 &&
      nipples.geometry.groups.length === 0) targets.push(nipples);
  return targets;
}

/** Fixed-clothing compatibility mask. Never use it for a removable shirt. */
export function maskAthleteOcclusion(root: THREE.Object3D): AthleteOcclusionResult {
  const result = { removedTriangles: 0, maskedMeshes: 0 };
  const targets = occlusionTargets(root);
  if (!targets) return result;
  for (const mesh of targets) {
    const geometry = mesh.geometry;
    if (masked.has(geometry)) continue;
    const source = geometry.index!;
    const points = geometry.getAttribute('position');
    const kept: number[] = [];
    for (let index = 0; index < source.count; index += 3) {
      const a = source.getX(index), b = source.getX(index + 1), c = source.getX(index + 2);
      if (coveredAthleteTriangle(points, a, b, c)) result.removedTriangles++;
      else kept.push(a, b, c);
    }
    masked.add(geometry);
    if (kept.length === source.count) continue;
    geometry.setIndex(new THREE.BufferAttribute(
      source.array instanceof Uint16Array ? new Uint16Array(kept) : new Uint32Array(kept), 1));
    result.maskedMeshes++;
  }
  return result;
}

export interface AthleteWardrobe {
  readonly shirtVisible: boolean;
  readonly bareTriangles: number;
  readonly clothedTriangles: number;
  setShirt(visible: boolean): void;
}

/** Partition the original skin indices once, BEFORE any deformation or GPU
 * upload. The permanently covered shorts triangles are omitted in both states.
 * Always-visible triangles form a prefix, followed by shirt-covered triangles.
 * Switching clothes changes the draw range, never recreates a GPU index buffer.
 * All opaque skin attributes, joints, topology connectivity and winding stay
 * intact. The separate shirt and chest badge are switched together.
 */
export function createAthleteWardrobe(root: THREE.Object3D): AthleteWardrobe | undefined {
  const targets = occlusionTargets(root);
  const shirt = root.getObjectByName('BODYFORGE_Shirt');
  const shorts = root.getObjectByName('BODYFORGE_Shorts');
  const shoes = root.getObjectByName('BODYFORGE_Shoes');
  const mark = root.getObjectByName('BODYFORGE_ChestMark');
  if (!targets || targets.length !== 2 || !shirt || !shorts || !shoes ||
      targets.some(mesh => masked.has(mesh.geometry))) return;
  const partitions = targets.map(mesh => {
    const geometry = mesh.geometry, source = geometry.index!;
    const points = geometry.getAttribute('position');
    const always: number[] = [], reveal: number[] = [];
    for (let i = 0; i < source.count; i += 3) {
      const a = source.getX(i), b = source.getX(i + 1), c = source.getX(i + 2);
      if (coveredAthleteTriangle(points, a, b, c, false)) continue;
      (coveredAthleteTriangle(points, a, b, c) ? reveal : always).push(a, b, c);
    }
    return { geometry, source, always, reveal };
  });
  if (!partitions.every(p => p.reveal.length > 0)) return;
  const ranges = partitions.map(({ geometry, source, always, reveal }) => {
    const Index = source.array instanceof Uint16Array ? Uint16Array : Uint32Array;
    const array = new Index(always.length + reveal.length);
    array.set(always); array.set(reveal, always.length);
    geometry.setIndex(new THREE.BufferAttribute(array, 1));
    masked.add(geometry);
    return { geometry, bare: array.length, clothed: always.length };
  });
  let shirtVisible = false;
  const setShirt = (visible: boolean) => {
    shirtVisible = visible;
    shirt.visible = visible;
    if (mark) mark.visible = visible;
    for (const range of ranges) range.geometry.setDrawRange(0, visible ? range.clothed : range.bare);
  };
  setShirt(false);
  return {
    get shirtVisible() { return shirtVisible; },
    bareTriangles: ranges.reduce((sum, r) => sum + r.bare / 3, 0),
    clothedTriangles: ranges.reduce((sum, r) => sum + r.clothed / 3, 0),
    setShirt,
  };
}
