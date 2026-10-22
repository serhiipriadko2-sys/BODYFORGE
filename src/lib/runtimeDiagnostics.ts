/**
 * Temporary performance counters for diagnosing real phone bottlenecks.
 * No video, landmarks, identifiers, workouts, storage or network requests.
 * All samples are bounded and disappear when the page is closed.
 */
export interface GpuCounters {
  drawCalls: number;
  geometries: number;
  textures: number;
}

export interface DiagnosticsSnapshot {
  schema: 'bodyforge.runtime-diagnostics.v1';
  camera: {
    frames: number;
    sampleCount: number;
    p50Ms: number | null;
    p95Ms: number | null;
    maxMs: number | null;
    observedHz: number | null;
  };
  avatar: {
    frames: number;
    observedFps: number | null;
    glbLoadMs: number | null;
    drawCalls: number | null;
    geometries: number | null;
    textures: number | null;
    active: boolean;
  };
}

interface AvatarSession {
  frames: number;
  intervals: number[];
  previousAt: number | null;
  loadedMs: number | null;
  gpu: GpuCounters | null;
}

const SAMPLE_LIMIT = 120;
const round = (number: number) => Math.round(number * 10) / 10;
const isDuration = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 60_000;

function sample(list: number[], value: number): void {
  list.push(value);
  if (list.length > SAMPLE_LIMIT) list.shift();
}

function percentile(values: number[], percentage: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return round(sorted[Math.ceil(sorted.length * percentage) - 1]);
}

function frequency(gaps: number[]): number | null {
  if (gaps.length < 3) return null;
  const mean = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
  return mean > 0 ? round(1000 / mean) : null;
}

function avatarSnapshot(run: AvatarSession, active: boolean): DiagnosticsSnapshot['avatar'] {
  return {
    frames: run.frames,
    observedFps: frequency(run.intervals),
    glbLoadMs: run.loadedMs,
    drawCalls: run.gpu?.drawCalls ?? null,
    geometries: run.gpu?.geometries ?? null,
    textures: run.gpu?.textures ?? null,
    active,
  };
}

const EMPTY_AVATAR: DiagnosticsSnapshot['avatar'] = {
  frames: 0, observedFps: null, glbLoadMs: null,
  drawCalls: null, geometries: null, textures: null, active: false,
};

export class RuntimeDiagnostics {
  private cameraDurations: number[] = [];
  private cameraIntervals: number[] = [];
  private previousCameraAt: number | null = null;
  private cameraFrames = 0;
  private avatarRuns = new Map<number, AvatarSession>();
  private nextAvatarId = 0;
  private latestAvatarId: number | null = null;
  private previousAvatar: DiagnosticsSnapshot['avatar'] = { ...EMPTY_AVATAR };

  startCameraSession(): void {
    this.cameraDurations = [];
    this.cameraIntervals = [];
    this.previousCameraAt = null;
    this.cameraFrames = 0;
  }

  recordInference(durationMs: number, timestampMs: number): void {
    if (!isDuration(durationMs) || !Number.isFinite(timestampMs) || timestampMs < 0) return;
    this.cameraFrames++;
    sample(this.cameraDurations, durationMs);
    if (this.previousCameraAt !== null) {
      const gap = timestampMs - this.previousCameraAt;
      if (gap > 0 && gap <= 2000) sample(this.cameraIntervals, gap);
      else if (gap > 2000 || gap <= 0) this.cameraIntervals = [];
    }
    this.previousCameraAt = timestampMs;
  }

  attachAvatar(): number {
    const id = ++this.nextAvatarId;
    this.avatarRuns.set(id, {
      frames: 0, intervals: [], previousAt: null, loadedMs: null, gpu: null,
    });
    this.latestAvatarId = id;
    return id;
  }

  recordAvatarFrame(id: number, timestampMs: number, gpu?: GpuCounters): void {
    const run = this.avatarRuns.get(id);
    if (!run || !Number.isFinite(timestampMs) || timestampMs < 0) return;
    run.frames++;
    if (run.previousAt !== null) {
      const gap = timestampMs - run.previousAt;
      if (gap > 0 && gap <= 2000) sample(run.intervals, gap);
      else if (gap > 2000 || gap <= 0) run.intervals = [];
    }
    run.previousAt = timestampMs;
    if (gpu && Object.values(gpu).every((value) => Number.isInteger(value) && value >= 0)) {
      run.gpu = { ...gpu };
    }
    this.latestAvatarId = id;
  }

  recordGlbLoad(id: number, durationMs: number): void {
    const run = this.avatarRuns.get(id);
    if (!run || !isDuration(durationMs)) return;
    run.loadedMs = round(durationMs);
    this.latestAvatarId = id;
  }

  detachAvatar(id: number): void {
    const run = this.avatarRuns.get(id);
    if (!run) return;
    this.previousAvatar = avatarSnapshot(run, false);
    this.avatarRuns.delete(id);
    if (this.latestAvatarId === id) {
      this.latestAvatarId = this.avatarRuns.size ? [...this.avatarRuns.keys()].at(-1)! : null;
    }
  }

  snapshot(): DiagnosticsSnapshot {
    const current = this.latestAvatarId === null ? null : this.avatarRuns.get(this.latestAvatarId);
    return {
      schema: 'bodyforge.runtime-diagnostics.v1',
      camera: {
        frames: this.cameraFrames,
        sampleCount: this.cameraDurations.length,
        p50Ms: percentile(this.cameraDurations, .5),
        // A percentile of a handful of frames exaggerates startup outliers.
        p95Ms: this.cameraDurations.length >= 20 ? percentile(this.cameraDurations, .95) : null,
        maxMs: this.cameraDurations.length ? round(Math.max(...this.cameraDurations)) : null,
        observedHz: frequency(this.cameraIntervals),
      },
      avatar: current ? avatarSnapshot(current, true) : { ...this.previousAvatar },
    };
  }
}

/** Session-only singleton. No personal data is ingested or persisted. */
export const runtimeDiagnostics = new RuntimeDiagnostics();
