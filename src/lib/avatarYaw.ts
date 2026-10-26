/**
 * Avatar orbit contract: one angle shared by touch, keyboard and editor
 * buttons. Never persist this viewing angle into game progression.
 */
export const INITIAL_AVATAR_YAW = -0.21;
export const AVATAR_YAW_LIMIT = 1.02;
export function clampAvatarYaw(value: number): number {
  if (!Number.isFinite(value)) return INITIAL_AVATAR_YAW;
  return Math.max(-AVATAR_YAW_LIMIT,
    Math.min(AVATAR_YAW_LIMIT, Math.round(value * 1000) / 1000));
}
export function stepAvatarYaw(current: number, step: number): number {
  return clampAvatarYaw(clampAvatarYaw(current) + (Number.isFinite(step) ? step : 0));
}
