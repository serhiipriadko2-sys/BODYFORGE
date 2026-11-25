/** Ordered local skin choices. The new atlas is fitted to the compact rig
 * only. Keep the previous art as a network/validation fallback. */
export const PERIORAL_ATLAS = '/assets/athlete-skin-perioral.jpg';
export const DERMAL_ATLAS = '/assets/athlete-skin-dermal.jpg';

export function avatarSkinAtlases(preferred: boolean, realistic: boolean): readonly string[] {
  const base = realistic ? '/assets/athlete-skin-detail.jpg' : '/assets/athlete-skin.jpg';
  return preferred && realistic
    ? [PERIORAL_ATLAS, DERMAL_ATLAS, '/assets/athlete-skin-portrait.jpg', base]
    : [base];
}

export function acceptsSkinAtlas(file: string, image: unknown): boolean {
  if (!image || typeof image !== 'object') return false;
  const { width, height } = image as { width?: number; height?: number };
  const dimension = file === '/assets/athlete-skin.jpg' ? 1024 : 2048;
  return width === dimension && height === dimension;
}
