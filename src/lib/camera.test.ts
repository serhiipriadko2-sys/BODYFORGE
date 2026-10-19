import { describe, expect, it } from 'vitest';
import { cameraOrientation, portraitCameraConstraints, PORTRAIT_ASPECT_RATIO, cameraDeviceOptions, cameraZoomCapabilities, isUltraWideCamera, zoomConstraints, VideoFrameGate, CameraFrameWatchdog } from './camera';
import { SquatCounter } from './squatCounter';

describe('fresh camera observations', () => {
  it('expires frozen observations without mute and resumes only on a fresh frame', () => {
    const watchdog = new CameraFrameWatchdog();
    expect(watchdog.observe(true, 100)).toBe(false);
    expect(watchdog.observe(false, 999)).toBe(false);
    expect(watchdog.observe(false, 1000)).toBe(true);
    expect(watchdog.observe(false, 2000)).toBe(true);
    expect(watchdog.observe(true, 2100)).toBe(false);
    expect(watchdog.observe(false, 2999)).toBe(false);
    expect(watchdog.observe(false, 3000)).toBe(true);
  });

  it('also expires an empty stream and resets the timer for a new session', () => {
    const watchdog = new CameraFrameWatchdog();
    expect(watchdog.observe(false, 100)).toBe(false);
    expect(watchdog.observe(false, 1000)).toBe(true);
    watchdog.reset();
    expect(watchdog.observe(false, 5000)).toBe(false);
    expect(watchdog.observe(false, 5899)).toBe(false);
    expect(watchdog.observe(true, 5900)).toBe(false);
    expect(watchdog.observe(false, 6799)).toBe(false);
  });

  it('does not finish a repetition by repeatedly processing one frozen frame', () => {
    const gate = new VideoFrameGate();
    const counter = new SquatCounter();
    const sequence = [170, 170, 170, 140, 123, 98, 91, 89, 90, 90, 118, 142, 167];
    let count = 0;
    sequence.forEach((angle, index) => {
      if (gate.accept(index / 10)) count = counter.update(angle, index * 100).count;
    });
    for (const now of [1300, 1400, 1500, 1800]) {
      if (gate.accept(1.2)) count = counter.update(167, now).count;
    }
    expect(count).toBe(0);
    expect(gate.accept(2.4)).toBe(true);
    const resumed = counter.update(170, 2400);
    expect(resumed.phase).toBe('calibrate');
    expect(resumed.count).toBe(0);
  });

  it('requires advancing finite video time and accepts a new stream only after reset', () => {
    const gate = new VideoFrameGate();
    expect(gate.accept(Number.NaN)).toBe(false);
    expect(gate.accept(Number.POSITIVE_INFINITY)).toBe(false);
    expect(gate.accept(-1)).toBe(false);
    expect(gate.accept(0)).toBe(true);
    expect(gate.accept(0)).toBe(false);
    expect(gate.accept(1)).toBe(true);
    expect(gate.accept(.5)).toBe(false);
    gate.reset();
    expect(gate.accept(0)).toBe(true);
  });
});

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
