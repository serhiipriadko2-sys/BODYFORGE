import * as THREE from 'three';
import type { AvatarFocus } from '../components/GameAvatar';

/** World-space framing in normalized 4.75-unit character coordinates.
 * A single light and a single 1024px depth map; no post-processing pass.
 * Keep the lighting direction fixed while changing the shadow camera crop. */
const frames: Record<AvatarFocus, { centre: number; extent: number; radius: number; bias: number }> = {
  full: { centre: 2.38, extent: 3.20, radius: 2.4, bias: .017 },
  portrait: { centre: 4.14, extent: 1.27, radius: 2.5, bias: .008 },
  torso: { centre: 3.10, extent: 2.05, radius: 2.3, bias: .012 },
  legs: { centre: 1.04, extent: 1.82, radius: 2.4, bias: .013 },
};
export function configureAvatarKey(key: THREE.DirectionalLight, view: AvatarFocus): void {
  const {centre, extent, radius, bias} = frames[view];
  key.target.position.set(0, centre, 0);
  key.position.set(-4.5, centre+3.5, 6);
  const shadow = key.shadow;
  shadow.mapSize.set(1024,1024);
  shadow.camera.left = shadow.camera.bottom = -extent;
  shadow.camera.right = shadow.camera.top = extent;
  shadow.camera.near = .2;
  shadow.camera.far = 17;
  shadow.camera.updateProjectionMatrix();
  shadow.normalBias = bias;
  shadow.bias = -.00012;
  shadow.radius = radius;
  shadow.intensity = .82;
  shadow.needsUpdate = true;
}

/** The economy mode and static onboarding keep the old cheap no-shadow
 * budget. Portrait still supports a depth map outside the hero studio. */
export function avatarShadowsEnabled(graphics: unknown, view: AvatarFocus, studio: boolean): boolean {
  return graphics !== 'economy' && (studio || view === 'portrait');
}

/** Palette is intentionally subdued: the accent belongs to the stage,
 * not the human's skin tone. */
export function avatarRimColor(accent: string): THREE.Color {
  const safe = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#55e3f2';
  return new THREE.Color('#dce8f4').lerp(new THREE.Color(safe), .22);
}
