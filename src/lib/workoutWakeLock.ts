/** Optional Screen Wake Lock for camera workouts.
 * A browser may deny or revoke the lock; this must never block the camera,
 * counting, profile writes, or completion of a workout.
 */
export interface ScreenWakeLease {
  release(): Promise<void>;
}

function releaseQuietly(lease: ScreenWakeLease): void {
  try {
    void lease.release().catch(() => { /* The browser may have revoked it already. */ });
  } catch {
    // Even an unusual synchronous failure must not interrupt the workout.
  }
}

/** Ignores late grants from a stopped or replaced training session.
 * Call setEnabled(false) when the workout ends or the page becomes hidden.
 */
export class WorkoutWakeLock {
  private enabled = false;
  private generation = 0;
  private lease: ScreenWakeLease | null = null;

  constructor(private readonly request: () => Promise<ScreenWakeLease>) {}

  setEnabled(next: boolean): void {
    if (next === this.enabled) return;
    this.enabled = next;
    const generation = ++this.generation;

    if (!next) {
      const previous = this.lease;
      this.lease = null;
      if (previous) releaseQuietly(previous);
      return;
    }

    // Defer the request to make a start immediately followed by stop a no-op.
    void Promise.resolve().then(() => {
      if (!this.enabled || generation !== this.generation) return null;
      return this.request();
    }).then((lease) => {
      if (!lease) return;
      if (!this.enabled || generation !== this.generation) {
        releaseQuietly(lease);
        return;
      }
      this.lease = lease;
    }).catch(() => {
      // Unsupported API, low battery or denied permission: training continues.
    });
  }
}
