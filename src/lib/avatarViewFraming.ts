import type { PerspectiveCamera } from 'three';

/** Frame the normalized athlete from just above the shorts to the shoes.
 * Keep the original 35-degree perspective and leave the other views alone. */
export function configureAvatarLegCamera(camera: PerspectiveCamera): void {
  camera.position.set(0, 1.44, 5.47);
  camera.lookAt(0, 1.39, 0);
}
