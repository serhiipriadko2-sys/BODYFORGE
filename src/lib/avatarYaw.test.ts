import { describe, expect, it } from 'vitest';
import { clampAvatarYaw, INITIAL_AVATAR_YAW, stepAvatarYaw } from './avatarYaw';

describe('one deterministic camera yaw for touch, keyboard and buttons', () => {
  it('clamps angles and rejects NaN or Infinity without changing the game', () => {
    expect(clampAvatarYaw(Infinity)).toBe(INITIAL_AVATAR_YAW);
    expect(clampAvatarYaw(NaN)).toBe(INITIAL_AVATAR_YAW);
    expect(clampAvatarYaw(12)).toBe(1.02);
    expect(clampAvatarYaw(-12)).toBe(-1.02);
    expect(clampAvatarYaw(.34629)).toBe(.346);
  });
  it('button rotation continues the most recent pointer angle, not stale state', () => {
    const draggedTo = clampAvatarYaw(INITIAL_AVATAR_YAW + 55 * .011);
    expect(draggedTo).toBe(.395);
    expect(stepAvatarYaw(draggedTo, .3)).toBe(.695);
    expect(stepAvatarYaw(.95, .3)).toBe(1.02);
    expect(stepAvatarYaw(-.95, -.3)).toBe(-1.02);
  });
  it('ignores invalid button increments', () => {
    expect(stepAvatarYaw(.41, Infinity)).toBe(.41);
  });
});
