/** Browser camera preferences. The visible exercise frame always stays 9:16.
 * Device enumeration and optical zoom are optional: no camera type is invented. */
export const PORTRAIT_ASPECT_RATIO = 9 / 16;
export type CameraSource =
  | { kind: 'facing'; value: 'user' | 'environment' }
  | { kind: 'device'; value: string };

export const DEFAULT_CAMERA: CameraSource = { kind: 'facing', value: 'user' };

/** RAF ticks are not camera observations. Accept each advancing source time
 * once; a newly connected stream starts its own video clock. */
export class VideoFrameGate {
  private lastTime: number | null = null;

  reset(): void { this.lastTime = null; }

  accept(currentTime: number): boolean {
    if (!Number.isFinite(currentTime) || currentTime < 0 ||
        (this.lastTime !== null && currentTime <= this.lastTime)) return false;
    this.lastTime = currentTime;
    return true;
  }
}

/** Expire the displayed pose even when a live track freezes without a mute event.
 * Uses the RAF monotonic clock, independently of the stalled video's clock. */
export class CameraFrameWatchdog {
  private observedAt: number | null = null;

  reset(): void { this.observedAt = null; }

  observe(fresh: boolean, now: number): boolean {
    if (fresh || this.observedAt === null) this.observedAt = now;
    // Match the counter's lost-observation window; slower input must recalibrate.
    return now - this.observedAt >= 900;
  }
}

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
  ultraWide: boolean;
}

export interface CameraZoom {
  min: number;
  max: number;
  step: number;
  current: number;
}

type DeviceCandidate = Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>;
type CameraCapabilities = { zoom?: { min: number; max: number; step?: number } };
type CameraSettings = { zoom?: number };

/** "wide" alone may mean the standard 1x camera: do not mislabel it as 0.5x. */
export function isUltraWideCamera(label: string): boolean {
  return /ultra[\s-]*wide|super[\s-]*wide|0[.,][45678]\s*[x×]|сверхшир|ультра[\s-]*шир/i.test(label);
}

export function cameraDeviceOptions(devices: DeviceCandidate[]): CameraDeviceOption[] {
  const ids = new Set<string>();
  return devices
    .filter((entry) => entry.kind === 'videoinput' && entry.deviceId && !ids.has(entry.deviceId) && ids.add(entry.deviceId))
    .map((entry, index) => ({
      deviceId: entry.deviceId,
      label: entry.label.trim() || `Камера ${index + 1}`,
      ultraWide: isUltraWideCamera(entry.label),
    }));
}

export function portraitCameraConstraints(source: CameraSource = DEFAULT_CAMERA): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      ...(source.kind === 'device' && source.value
        ? { deviceId: { exact: source.value } }
        : { facingMode: { ideal: source.kind === 'facing' ? source.value : 'user' } }),
      width: { ideal: 720 },
      height: { ideal: 1280 },
      aspectRatio: { ideal: PORTRAIT_ASPECT_RATIO },
      frameRate: { ideal: 24, max: 30 },
    },
  };
}

export function cameraZoomCapabilities(capabilities: CameraCapabilities, settings: CameraSettings): CameraZoom | null {
  const range = capabilities.zoom;
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) ||
      range.min <= 0 || range.min >= range.max) return null;
  const step = typeof range.step === 'number' && range.step > 0 && Number.isFinite(range.step) ? range.step : .1;
  const value = typeof settings.zoom === 'number' && Number.isFinite(settings.zoom)
    ? settings.zoom : Math.min(range.max, Math.max(range.min, 1));
  return {
    min: range.min,
    max: range.max,
    step,
    current: Math.min(range.max, Math.max(range.min, value)),
  };
}

/** Optional zoom capability in the Image Capture extensions of getUserMedia. */
export function zoomConstraints(value: number): MediaTrackConstraints {
  return { advanced: [{ zoom: value } as MediaTrackConstraintSet] };
}

export type CameraOrientation = 'portrait' | 'landscape' | 'unknown';

export function cameraOrientation(width: number, height: number): CameraOrientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'unknown';
  }
  return height >= width ? 'portrait' : 'landscape';
}
