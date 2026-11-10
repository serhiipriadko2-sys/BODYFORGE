import { describe, expect, it } from 'vitest';
import { avatarPixelRatio } from './mobileGraphics';

describe('mobile 3D pixel budget', () => {
  it('limits a high-DPI phone to 1x in economy while keeping the existing balanced cap', () => {
    expect(avatarPixelRatio('economy', 3)).toBe(1);
    expect(avatarPixelRatio('balanced', 3)).toBe(1.5);
    expect(avatarPixelRatio(undefined, 3)).toBe(1.5);
  });

  it.each(['economy', 'balanced'])('does not increase a low native pixel ratio in %s', (mode) => {
    expect(avatarPixelRatio(mode, .8)).toBe(.8);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('bounds an invalid ratio %s', (ratio) => {
    expect(avatarPixelRatio('economy', ratio)).toBe(1);
    expect(avatarPixelRatio('balanced', ratio)).toBe(1);
  });
});
