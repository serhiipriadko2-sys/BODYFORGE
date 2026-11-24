import * as THREE from 'three';

const PARTS = new Set([
  'BF_Trainer_Outsole', 'BF_Trainer_Midsole', 'BF_Trainer_Tongue',
  'BF_Trainer_Eyestay', 'BF_Trainer_Laces', 'BF_Trainer_Stitch',
]);

type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

type ShoeTriangle = { triangle: THREE.Triangle; indices: readonly number[]; bounds: THREE.Box3 };
function sourceTriangles(source: Attribute, indices: THREE.BufferAttribute): [ShoeTriangle[], ShoeTriangle[]] {
  const sides: [ShoeTriangle[], ShoeTriangle[]] = [[], []];
  for (let i = 0; i < indices.count; i += 3) {
    const vertices = [indices.getX(i), indices.getX(i+1), indices.getX(i+2)];
    const points = vertices.map(index => new THREE.Vector3().fromBufferAttribute(source,index));
    if (points.some(point => point.x * points[0].x <= 0)) continue;
    const triangle = new THREE.Triangle(points[0],points[1],points[2]);
    if (triangle.getArea() <= 1e-12) continue;
    sides[points[0].x > 0 ? 0 : 1].push({ triangle, indices: vertices, bounds: new THREE.Box3().setFromPoints(points) });
  }
  return sides;
}

/** Reuse the pinned shoe's skeleton. Interpolate the nearest triangle, not
 * nearest vertices: the convex shoe shell has large sparse top triangles. */
function transferUpper(
  position: Attribute, index: number, triangles: [ShoeTriangle[], ShoeTriangle[]], joints: Attribute, weights: Attribute,
  resultJoints: Uint16Array, resultWeights: Float32Array,
): boolean {
  const point = new THREE.Vector3().fromBufferAttribute(position,index);
  const closest = new THREE.Vector3(), bary = new THREE.Vector3();
  let bestDistance = .015 ** 2, nearest: ShoeTriangle | undefined;
  for (const candidate of triangles[point.x > 0 ? 0 : 1]) {
    if (candidate.bounds.distanceToPoint(point) ** 2 > bestDistance) continue;
    candidate.triangle.closestPointToPoint(point, closest);
    const distance = closest.distanceToSquared(point);
    if (distance >= bestDistance) continue;
    if (!candidate.triangle.getBarycoord(closest,bary)) continue;
    bestDistance = distance;
    nearest = candidate;
  }
  if (!nearest) return false;
  const sums = new Map<number, number>();
  for (let k = 0; k < 3; k++) {
    const influence = Math.max(0,bary.getComponent(k));
    for (let j = 0; j < 4; j++) {
      const bone = joints.getComponent(nearest.indices[k], j);
      const weight = weights.getComponent(nearest.indices[k], j) * influence;
      if (!Number.isInteger(bone) || bone < 0 || !Number.isFinite(weight) || weight < 0) return false;
      sums.set(bone, (sums.get(bone) ?? 0) + weight);
    }
  }
  const selected = [...sums.entries()].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = selected.reduce((sum, [, w]) => sum + w, 0);
  if (!(total > 0 && Number.isFinite(total))) return false;
  selected.forEach(([joint, weight], j) => {
    resultJoints[index * 4 + j] = joint;
    resultWeights[index * 4 + j] = weight / total;
  });
  return true;
}

export function installAvatarTrainers(shoes: THREE.SkinnedMesh, donor: THREE.Group): boolean {
  const source = shoes.geometry.getAttribute('position');
  const joints = shoes.geometry.getAttribute('skinIndex');
  const weights = shoes.geometry.getAttribute('skinWeight');
  if (shoes.name !== 'BODYFORGE_Shoes' || shoes.parent === null ||
      source?.count !== 1142 || joints?.count !== source.count || weights?.count !== source.count ||
      !shoes.skeleton || donor.children.length !== PARTS.size ||
      shoes.parent.children.some(node => PARTS.has(node.name))) return false;

  const names = new Set<string>();
  const findFoot = (side: string) => shoes.skeleton.bones.findIndex(bone =>
    bone.name.replace(/[^a-z0-9]/gi, '').toLowerCase() === 'foot' + side);
  const left = findFoot('l'), right = findFoot('r');
  if (left < 0 || right < 0 || !shoes.geometry.index ||
      shoes.skeleton.boneInverses[left].clone().invert().elements[12] <= 0 ||
      shoes.skeleton.boneInverses[right].clone().invert().elements[12] >= 0) return false;
  const sourceSurface = sourceTriangles(source, shoes.geometry.index);
  const prepared: { surface: THREE.Mesh; skinIndex: Uint16Array; skinWeight: Float32Array }[] = [];
  let triangles = 0;
  for (const node of donor.children) {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.SkinnedMesh || node.children.length ||
        !PARTS.has(node.name) || names.has(node.name) || !(node.material instanceof THREE.MeshStandardMaterial) ||
        node.position.lengthSq() > 1e-12 || node.quaternion.angleTo(new THREE.Quaternion()) > 1e-6 ||
        node.scale.distanceTo(new THREE.Vector3(1, 1, 1)) > 1e-6) return false;
    names.add(node.name);
    const position = node.geometry.getAttribute('position'), normal = node.geometry.getAttribute('normal'), indices = node.geometry.index;
    if (!position || position.itemSize !== 3 || !normal || normal.count !== position.count ||
        !indices || position.count > 2000 || indices.count % 3 !== 0) return false;
    triangles += indices.count / 3;
    if (triangles > 6500) return false;
    const skinIndex = new Uint16Array(position.count * 4), skinWeight = new Float32Array(position.count * 4);
    const sole = node.name === 'BF_Trainer_Outsole' || node.name === 'BF_Trainer_Midsole';
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const norm = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (![x, y, z, norm].every(Number.isFinite) ||
          Math.abs(x) < .13 || Math.abs(x) > .29 || y < -.012 || y > .125 ||
          z < -.075 || z > .25 || Math.abs(norm - 1) > .025) return false;
      if (sole) {
        skinIndex[i * 4] = x > 0 ? left : right;
        skinWeight[i * 4] = 1;
      } else if (!transferUpper(position, i, sourceSurface, joints, weights, skinIndex, skinWeight)) return false;
    }
    for (let i = 0; i < indices.count; i++) {
      if (!Number.isInteger(indices.getX(i)) || indices.getX(i) < 0 || indices.getX(i) >= position.count) return false;
    }
    if (skinIndex.some(value => value >= shoes.skeleton.bones.length)) return false;
    prepared.push({ surface: node, skinIndex, skinWeight });
  }

  // All validation completed; only now transfer ownership to the live scene.
  for (const { surface, skinIndex, skinWeight } of prepared) {
    surface.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    surface.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    const mesh = new THREE.SkinnedMesh(surface.geometry, surface.material);
    mesh.name = surface.name;
    mesh.position.copy(shoes.position);
    mesh.quaternion.copy(shoes.quaternion);
    mesh.scale.copy(shoes.scale);
    mesh.bindMode = shoes.bindMode;
    mesh.bind(shoes.skeleton, shoes.bindMatrix);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    donor.remove(surface);
    shoes.parent.add(mesh);
  }
  shoes.parent.updateWorldMatrix(true, true);
  return true;
}
