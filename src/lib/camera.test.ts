import { describe, expect, it } from 'vitest';
import { cameraOrientation, portraitCameraConstraints, PORTRAIT_ASPECT_RATIO } from './camera';

describe('portrait-first camera', () => {
  it('requests a portrait feed instead of the previous 1280x720 landscape feed', () => {
    const constraints = portraitCameraConstraints();
    const video = constraints.video as MediaTrackConstraints;
    expect(constraints.audio).toBe(false);
    expect(video.width).toEqual({ ideal: 720 });
    expect(video.height).toEqual({ ideal: 1280 });
    expect(video.aspectRatio).toEqual({ ideal: PORTRAIT_ASPECT_RATIO });
    expect(PORTRAIT_ASPECT_RATIO).toBeCloseTo(0.5625);
    expect(video.facingMode).toEqual({ ideal: 'user' });
  });

  it('reports the actual stream orientation rather than assuming constraints were honored', () => {
    expect(cameraOrientation(720, 1280)).toBe('portrait');
    expect(cameraOrientation(640, 480)).toBe('landscape');
    expect(cameraOrientation(480, 480)).toBe('portrait');
    expect(cameraOrientation(0, 0)).toBe('unknown');
    expect(cameraOrientation(Number.NaN, 1080)).toBe('unknown');
  });
});
