import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** A bounded, local studio IBL. No downloaded HDR or per-frame capture.
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
