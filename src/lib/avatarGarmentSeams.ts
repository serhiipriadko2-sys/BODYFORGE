import * as THREE from 'three';
import recipe from './avatarGarmentSeams.json';

const SIDES = 6;
const PROFILES: Record<string, readonly [number, number]> = {
  collar: [.0048, .0020], sleeve: [.0037, .0018], hem: [.0035, .0017],
  waist: [.0035, .0017], legHem: [.0034, .0017],
};
type Recipe = typeof recipe.garments[number];
type Surface = { garment: THREE.SkinnedMesh; spec: Recipe; seam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> };

function validate(garment: THREE.SkinnedMesh, spec: Recipe): boolean {
  const geometry = garment.geometry;
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  if (garment.children.some(child => child.name.startsWith('BF_GarmentSeams_')) ||
      !(garment.material instanceof THREE.MeshStandardMaterial) || !geometry.index ||
      !positions || positions.itemSize !== 3 || positions.count !== spec.vertexCount ||
      !normals || normals.count !== positions.count || !garment.skeleton ||
      !geometry.getAttribute('skinIndex') || !geometry.getAttribute('skinWeight') ||
      spec.patchIndices.length % 3 !== 0) return false;
  const anchors = new Map(Object.entries(spec.anchors));
  for (const [key, point] of anchors) {
    const i = Number(key);
    if (!Number.isInteger(i) || i < 0 || i >= positions.count || !point || point.length !== 3 ||
        !point.every(Number.isFinite) ||
        Math.hypot(positions.getX(i)-point[0], positions.getY(i)-point[1], positions.getZ(i)-point[2]) > 2e-7) return false;
  }
  const validIndex = (i: number) => Number.isInteger(i) && anchors.has(String(i));
  const expectedLoops = garment.name === 'BODYFORGE_Shirt' ? 4 : 3;
  if (spec.loops.length !== expectedLoops || !spec.patchIndices.every(validIndex)) return false;
  return spec.loops.every(loop => PROFILES[loop.kind] && loop.vertices.length >= 8 &&
    new Set(loop.vertices).size === loop.vertices.length && loop.vertices.every(validIndex));
}

/** The original chest openings carry inward-facing rim normals. Once capped,
 * reconstruct the nearby cloth shading from its intact surrounding surface.
 * No body or garment positions, skin weights or UVs are changed. */
function smoothChestPatchNormals(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position'), source = geometry.getAttribute('normal');
  const result = new Float32Array(source.count * 3);
  const normal = new THREE.Vector3(), mean = new THREE.Vector3();
  for (let i=0;i<source.count;i++) {
    result.set([source.getX(i),source.getY(i),source.getZ(i)],i*3);
  }
  for (const side of [-1,1]) {
    const distance = (i: number) => Math.hypot(positions.getX(i)-side*.0995, positions.getY(i)-1.3105);
    mean.set(0,0,0);
    for (let i=0;i<positions.count;i++) {
      const r=distance(i);
      if (positions.getZ(i)>.105 && r>=.019 && r<=.033 && source.getZ(i)>.65) {
        mean.add(normal.fromBufferAttribute(source,i));
      }
    }
    if (mean.lengthSq()<1) continue;
    mean.normalize();
    for (let i=0;i<positions.count;i++) {
      const r=distance(i);
      if (positions.getZ(i)<=.105 || r>=.030) continue;
      const t=1-THREE.MathUtils.smoothstep(r,.013,.030);
      normal.fromBufferAttribute(source,i).lerp(mean,t).normalize();
      result.set([normal.x,normal.y,normal.z],i*3);
    }
  }
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(result,3));
}

function makeSurface(garment: THREE.SkinnedMesh, spec: Recipe): Surface {
  if (spec.patchIndices.length) {
    const previous = garment.geometry.index!;
    const index = new Uint16Array(previous.count + spec.patchIndices.length);
    index.set(previous.array);
    index.set(spec.patchIndices, previous.count);
    garment.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    if (garment.name === 'BODYFORGE_Shirt') smoothChestPatchNormals(garment.geometry);
  }
  const rings = spec.loops.reduce((count, loop) => count + loop.vertices.length, 0);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(rings * SIDES * 3), 3);
  const normals = new THREE.BufferAttribute(new Float32Array(rings * SIDES * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage); normals.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('normal', normals);
  const indices: number[] = [];
  let start = 0;
  for (const loop of spec.loops) {
    for (let i = 0; i < loop.vertices.length; i++) {
      for (let side = 0; side < SIDES; side++) {
        const a = (start + i) * SIDES, b = (start + (i + 1) % loop.vertices.length) * SIDES;
        const next = (side + 1) % SIDES;
        indices.push(a + side, a + next, b + next, a + side, b + next, b + side);
      }
    }
    start += loop.vertices.length;
  }
  geometry.setIndex(indices);
  const material = new THREE.MeshStandardMaterial({
    name: 'BODYFORGE folded fabric edge', metalness: 0, roughness: .92,
    side: THREE.DoubleSide,
  });
  const seam = new THREE.Mesh(geometry, material);
  seam.name = 'BF_GarmentSeams_' + garment.name;
  seam.receiveShadow = true;
  seam.frustumCulled = false;
  garment.add(seam);
  return { garment, spec, seam };
}

/** Static pose overlay, not a second rig. Every ring centre comes from the
 * actual post-skinning garment vertex. Update only when profile/pose changes.
 * Full orbit and camera zoom are ordinary parent transforms. */
function updateSurface({ garment, spec, seam }: Surface): void {
  const base = garment.geometry.getAttribute('position');
  const baseNormal = garment.geometry.getAttribute('normal');
  const positions = seam.geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = seam.geometry.getAttribute('normal') as THREE.BufferAttribute;
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3();
  const bitangent = new THREE.Vector3(), centre = new THREE.Vector3(), result = new THREE.Vector3();
  let ring = 0;
  for (const loop of spec.loops) {
    const [width, height] = PROFILES[loop.kind];
    const points = loop.vertices.map(index => garment.getVertexPosition(index, new THREE.Vector3()));
    for (let i = 0; i < points.length; i++, ring++) {
      const index = loop.vertices[i], point = points[i];
      tangent.subVectors(points[(i+1)%points.length], points[(i+points.length-1)%points.length]).normalize();
      normal.fromBufferAttribute(baseNormal, index);
      result.fromBufferAttribute(base, index).addScaledVector(normal, .005);
      garment.applyBoneTransform(index, result);
      normal.subVectors(result, point);
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
      if (normal.lengthSq() < .5) {
        normal.set(0, Math.abs(tangent.y) < .9 ? 1 : 0, Math.abs(tangent.y) < .9 ? 0 : 1);
        normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
      }
      bitangent.crossVectors(tangent, normal).normalize();
      centre.copy(point).addScaledVector(normal, .0009);
      for (let side = 0; side < SIDES; side++) {
        const angle = side * Math.PI * 2 / SIDES;
        const c = Math.cos(angle), s = Math.sin(angle), index = ring * SIDES + side;
        result.copy(centre).addScaledVector(normal, height*c).addScaledVector(bitangent, width*s);
        positions.setXYZ(index, result.x, result.y, result.z);
        result.copy(normal).multiplyScalar(c/height).addScaledVector(bitangent, s/width).normalize();
        normals.setXYZ(index, result.x, result.y, result.z);
      }
    }
  }
  positions.needsUpdate = normals.needsUpdate = true;
  // Use a restrained tone-on-tone hem rather than an emissive stripe.
  seam.material.color.copy((garment.material as THREE.MeshStandardMaterial).color).multiplyScalar(.66);
}

export interface AvatarGarmentSeams {
  update(root: THREE.Object3D): void;
  loopCount: number;
  patchTriangles: number;
}

/** Validate both pinned garments before modifying either. No asset download,
 * new skeleton, new animation loop or changes to the player's profile. */
export function createAvatarGarmentSeams(garments: readonly THREE.SkinnedMesh[]): AvatarGarmentSeams | undefined {
  const targets: { garment: THREE.SkinnedMesh; spec: Recipe }[] = [];
  for (const spec of recipe.garments) {
    const garment = garments.find(mesh => mesh.name === spec.name);
    if (!garment || !validate(garment, spec)) return undefined;
    targets.push({ garment, spec });
  }
  const surfaces = targets.map(({ garment, spec }) => makeSurface(garment, spec));
  return {
    loopCount: surfaces.reduce((sum, item) => sum + item.spec.loops.length, 0),
    patchTriangles: surfaces.reduce((sum, item) => sum + item.spec.patchIndices.length/3, 0),
    update(root) {
      // updateWorldMatrix alone does not refresh SkinnedMesh.bindMatrixInverse.
      // The ancestor matrix may include user yaw and body-build scaling.
      root.updateWorldMatrix(true, true);
      root.updateMatrixWorld(true);
      for (const surface of surfaces) updateSurface(surface);
    },
  };
}
