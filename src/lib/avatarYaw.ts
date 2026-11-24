/**
 * Avatar orbit contract: one angle shared by touch, keyboard and editor
 * buttons. Never persist this viewing angle into game progression.
 */
export const INITIAL_AVATAR_YAW = -0.21;
const FULL_TURN = Math.PI * 2;
/** Normalize into [-pi, pi); the name is retained for existing callers.
 * Full orbit is required to inspect the back-muscle progression. */
export function clampAvatarYaw(value: number): number {
  if (!Number.isFinite(value)) return INITIAL_AVATAR_YAW;
  const wrapped = ((value + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
  return Math.round(wrapped * 1000) / 1000;
}
export function stepAvatarYaw(current: number, step: number): number {
  return clampAvatarYaw(clampAvatarYaw(current) + (Number.isFinite(step) ? step : 0));
}
