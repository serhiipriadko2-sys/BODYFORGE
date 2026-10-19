import { describe, expect, it } from 'vitest';
import { cameraOrientation, portraitCameraConstraints, PORTRAIT_ASPECT_RATIO, cameraDeviceOptions, cameraZoomCapabilities, isUltraWideCamera, zoomConstraints } from './camera';

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

describe('camera selection and device support', () => {
  it('selects front, back or an exact wide-lens device without losing portrait framing', () => {
    const back = portraitCameraConstraints({ kind: 'facing', value: 'environment' });
    expect((back.video as MediaTrackConstraints).facingMode).toEqual({ ideal: 'environment' });
    const wide = portraitCameraConstraints({ kind: 'device', value: 'ultrawide-device-id' });
    const constraints = wide.video as MediaTrackConstraints;
    expect(constraints.deviceId).toEqual({ exact: 'ultrawide-device-id' });
    expect(constraints.facingMode).toBeUndefined();
    expect(constraints.aspectRatio).toEqual({ ideal: 9 / 16 });
    expect(constraints.height).toEqual({ ideal: 1280 });
  });

  it('distinguishes real wide lens labels from generic wide camera names', () => {
    expect(isUltraWideCamera('Back Ultra Wide Camera')).toBe(true);
    expect(isUltraWideCamera('camera 0.5x')).toBe(true);
    expect(isUltraWideCamera('Сверхширокоугольная камера')).toBe(true);
    expect(isUltraWideCamera('Back Wide Camera')).toBe(false);
    expect(isUltraWideCamera('Main camera')).toBe(false);
  });

  it('offers only discoverable video inputs and flags the ultra wide one', () => {
    expect(cameraDeviceOptions([
      { kind: 'audioinput', deviceId: 'mic', label: 'microphone' },
      { kind: 'videoinput', deviceId: 'back-main', label: 'Back camera' },
      { kind: 'videoinput', deviceId: 'back-ultra', label: 'Back Ultra Wide camera' },
      { kind: 'videoinput', deviceId: '', label: '' },
    ])).toEqual([
      { deviceId: 'back-main', label: 'Back camera', ultraWide: false },
      { deviceId: 'back-ultra', label: 'Back Ultra Wide camera', ultraWide: true },
    ]);
  });

  it('exposes zoom only when supported by the actual track', () => {
    expect(cameraZoomCapabilities({ zoom: { min: 0.5, max: 5, step: 0.1 } }, { zoom: 1 }))
      .toEqual({ min: 0.5, max: 5, step: 0.1, current: 1 });
    expect(cameraZoomCapabilities({}, {})).toBeNull();
    expect(cameraZoomCapabilities({ zoom: { min: 1, max: 1, step: 0 } }, { zoom: 1 })).toBeNull();
    expect((zoomConstraints(0.5).advanced as Array<Record<string, number>>)[0].zoom).toBe(0.5);
  });
});
