import * as THREE from 'three';

/** The donor GLB owns its embedded images. glTF may decode shared slots into
 * the same ImageBitmap, so release each source once when its material dies. */
export function ownAvatarOcularImages(donor: THREE.Group): void {
  if (typeof ImageBitmap === 'undefined') return;
  const materials = new Set<THREE.Material>();
  const images = new Set<ImageBitmap>();
  donor.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const slot of Object.values(material)) {
        if (slot instanceof THREE.Texture && slot.image instanceof ImageBitmap) images.add(slot.image);
      }
    }
  });
  if (images.size === 0) return;
  for (const material of materials) {
    const release = () => {
      material.removeEventListener('dispose', release);
      materials.delete(material);
      if (materials.size === 0) images.forEach(image => image.close());
    };
    material.addEventListener('dispose', release);
  }
}

/** Take a validated Blender eye surface, retaining the live rig and its bind data.
 * On failure both trees retain ownership. The caller disposes the donor tree. */
export function installAvatarOcularDetail(eyes: THREE.SkinnedMesh, donor: THREE.Group): boolean {
  if (donor.children.length !== 1) return false;
  const [surface] = donor.children;
  if (!(surface instanceof THREE.Mesh) || surface instanceof THREE.SkinnedMesh ||
      surface.name !== 'BODYFORGE_OcularDetail' || surface.children.length > 0 ||
      !(surface.material instanceof THREE.MeshPhysicalMaterial)) return false;

  const material = surface.material;
  const fit = surface.geometry;
  const original = eyes.geometry;
  const rest = original.getAttribute('position');
  const position = fit.getAttribute('position');
  const normal = fit.getAttribute('normal');
  const uv = fit.getAttribute('uv');
  const joints = original.getAttribute('skinIndex');
  const weights = original.getAttribute('skinWeight');
  if (!material.map || !material.clearcoatMap || !material.clearcoatRoughnessMap || !material.roughnessMap ||
      !rest || !position || !normal || !uv || !joints || !weights ||
      rest.count !== 1076 || position.itemSize !== 3 || normal.itemSize !== 3 || uv.itemSize !== 2 ||
      [position, normal, uv, joints, weights].some(attribute => attribute.count !== rest.count) ||
      !original.index || !fit.index || fit.index.count !== original.index.count) return false;

  // Preserve the precise vertex-to-weight mapping. The cornea can only move
  // forward, within the Blender sculpt's 0.84 mm design envelope.
  for (let i = 0; i < rest.count; i++) {
    if (position.getX(i) !== rest.getX(i) || position.getY(i) !== rest.getY(i)) return false;
    const lift = position.getZ(i) - rest.getZ(i);
    if (!Number.isFinite(lift) || lift < 0 || lift > .00084) return false;
    const normalLength = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    if (!Number.isFinite(normalLength) || Math.abs(normalLength - 1) > .01) return false;
    const u = uv.getX(i), v = uv.getY(i);
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  }
  for (let i = 0; i < original.index.count; i++) {
    if (fit.index.getX(i) !== original.index.getX(i)) return false;
  }

  const previousMaterial = eyes.material;
  fit.setAttribute('skinIndex', joints);
  fit.setAttribute('skinWeight', weights);
  donor.remove(surface);
  eyes.geometry = fit;
  eyes.material = material;
  eyes.computeBoundingBox();
  eyes.computeBoundingSphere();
  original.dispose();
  // The untextured fallback was built for this one eye mesh. This upgrade is
  // adopted before the fallback atlas is requested.
  for (const previous of Array.isArray(previousMaterial) ? previousMaterial : [previousMaterial]) previous.dispose();
  return true;
}
