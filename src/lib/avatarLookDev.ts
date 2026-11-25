import * as THREE from 'three';

export type AvatarLookDevMode = 'base' | 'filmic' | 'neutral';
interface LookDevProfile {
  readonly id: AvatarLookDevMode;
  readonly toneMapping: THREE.ToneMapping;
  readonly exposure: number;
  readonly sky: number;
  readonly ground: number;
  readonly hemisphere: number;
  readonly keyColor: number;
  readonly key: number;
  readonly fillColor: number;
  readonly fill: number;
  readonly rimColor: number;
  readonly rim: number;
  readonly fallbackIbl: number;
  readonly measuredIbl: number;
  readonly iblRotation: number;
  readonly accentRim: boolean;
}

/** Controlled lighting comparison. Both candidates share the same lights;
 * only tone mapping/exposure differ. No change to skin/cloth textures or rig.
 * These intensities are artistic settings, not calibrated photometry. */
const base: LookDevProfile = Object.freeze({
  id:'base', toneMapping:THREE.ACESFilmicToneMapping, exposure:1.05,
  sky:0xe0e8f2, ground:0x4a3e38, hemisphere:.25,
  keyColor:0xfff7ef, key:2.25, fillColor:0xd2e2f4, fill:.60,
  rimColor:0xdce8f4, rim:1.6, fallbackIbl:.28, measuredIbl:.78,
  iblRotation:-.45, accentRim:true,
});
const studio = {
  sky:0xffffff, ground:0x777777, hemisphere:.30,
  keyColor:0xffffff, key:2.0, fillColor:0xffffff, fill:.85,
  rimColor:0xffffff, rim:1.0, fallbackIbl:.40, measuredIbl:1.0,
  iblRotation:-.45, accentRim:false,
} as const;
const filmic: LookDevProfile = Object.freeze({
  ...studio,id:'filmic',toneMapping:THREE.AgXToneMapping,exposure:1.18,
});
const neutral: LookDevProfile = Object.freeze({
  ...studio,id:'neutral',toneMapping:THREE.NeutralToneMapping,exposure:1.00,
});

/** Never read the review flag in production. Invalid input selects baseline. */
export function avatarLookDev(mode: unknown): LookDevProfile {
  return mode==='filmic' ? filmic : mode==='neutral' ? neutral : base;
}
