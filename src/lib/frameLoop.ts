/** Runs requestAnimationFrame only while a 3D surface actually needs animation.
 * The callback may synchronously turn the loop off; it is never rearmed then. */
export class ActiveFrameLoop {
  private pending: number | null = null;
  private active = false;
  private stopped = false;

  constructor(
    private readonly onFrame: (time: number) => void,
    private readonly requestFrame: (callback: (time: number) => void) => number,
    private readonly cancelFrame: (id: number) => void,
  ) {}

  setActive(active: boolean): void {
    if (this.stopped) return;
    this.active = active;
    if (!active) {
      if (this.pending !== null) {
        this.cancelFrame(this.pending);
        this.pending = null;
      }
    } else if (this.pending === null) {
      this.pending = this.requestFrame(this.tick);
    }
  }

  stop(): void {
    this.setActive(false);
    this.stopped = true;
  }

  private tick = (time: number): void => {
    this.pending = null;
    if (!this.active || this.stopped) return;
    try {
      this.onFrame(time);
    } finally {
      if (this.active && !this.stopped && this.pending === null) {
        this.pending = this.requestFrame(this.tick);
      }
    }
  };
}
