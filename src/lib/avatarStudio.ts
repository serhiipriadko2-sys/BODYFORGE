import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** A bounded, local studio IBL fallback. No per-frame capture.
 * The caller owns the returned target and must dispose it with the renderer.
 */
export function createAvatarStudio(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(room, .04, .1, 100, { size: 128 });
  } finally {
    room.dispose();
    generator.dispose();
  }
}

/** The input is the pinned linear RGBE 512x256 environment. PMREM retains
 * glossy and rough reflections in a bounded 128px cube layout. The caller
 * always owns/disposes the input; ownership of the result is transferred. */
export function createMeasuredAvatarStudio(renderer: THREE.WebGLRenderer, texture: THREE.DataTexture): THREE.WebGLRenderTarget {
  if (texture.image.width !== 512 || texture.image.height !== 256 ||
      texture.type !== THREE.HalfFloatType || texture.colorSpace !== THREE.LinearSRGBColorSpace) {
    throw new Error('Invalid BODYFORGE HDR studio texture');
  }
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromEquirectangular(texture);
  } finally {
    generator.dispose();
  }
}
