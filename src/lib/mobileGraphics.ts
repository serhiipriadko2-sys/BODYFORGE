/** A user-controlled rendering budget. Browser UA strings do not reliably
 * identify a phone model; camera quality and exercise thresholds are separate. */
export type GraphicsMode = 'balanced' | 'economy';
export const GRAPHICS_CHANGE_EVENT = 'bodyforge:graphics-change';
export const isGraphicsMode = (value: unknown): value is GraphicsMode =>
  value === 'balanced' || value === 'economy';

export function avatarPixelRatio(mode: unknown, devicePixelRatio: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, mode === 'economy' ? 1 : 1.5);
}
