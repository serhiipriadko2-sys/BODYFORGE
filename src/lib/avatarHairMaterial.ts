import * as THREE from 'three';

/** Opaque matte fibres; one scene-owned texture shared by all haircut meshes.
 * U crosses the fibres, V follows the clumps. This adds lighting relief only,
 * never opacity/sorting or network resources. Dispose with the scene subtree.
 */
export function createAvatarHairMaterial(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const width = 128, height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width, v = y / height;
      const bend = .30 * Math.sin(v * Math.PI * 2);
      const fibres = Math.sin(u * Math.PI * 2 * 23 + bend)
        + .45 * Math.sin(u * Math.PI * 2 * 41 - bend);
      const value = Math.round(128 + 36 * fibres);
      const offset = (y * width + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const bump = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  bump.name = 'bodyforge-local-hair-fibres';
  bump.colorSpace = THREE.NoColorSpace;
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(1, 2);
  bump.magFilter = THREE.LinearFilter;
  bump.minFilter = THREE.LinearMipmapLinearFilter;
  bump.generateMipmaps = true;
  bump.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    color, roughness: .79, metalness: 0, bumpMap: bump, bumpScale: .001,
  });
}
