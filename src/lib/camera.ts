/** Browser camera preferences. Browsers may return a landscape stream when
 * the hardware cannot provide the requested portrait dimensions. */
export const PORTRAIT_ASPECT_RATIO = 9 / 16;

export function portraitCameraConstraints(): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 720 },
      height: { ideal: 1280 },
      aspectRatio: { ideal: PORTRAIT_ASPECT_RATIO },
      frameRate: { ideal: 24, max: 30 },
    },
  };
}

export type CameraOrientation = 'portrait' | 'landscape' | 'unknown';

export function cameraOrientation(width: number, height: number): CameraOrientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'unknown';
  }
  return height >= width ? 'portrait' : 'landscape';
}
