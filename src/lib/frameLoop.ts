/** Runs requestAnimationFrame only while a 3D surface actually needs animation.
 * The callback may synchronously turn the loop off; it is never rearmed then. */
export class ActiveFrameLoop {
  private pending: number | null = null;
  private active = false;
  private stopped = false;
  private generation = 0;

  constructor(
    private readonly onFrame: (time: number) => void,
    private readonly requestFrame: (callback: (time: number) => void) => number,
    private readonly cancelFrame: (id: number) => void,
  ) {}

  setActive(active: boolean): void {
    if (this.stopped || this.active === active) return;
    this.active = active;
    this.generation++;
    if (!active) {
      if (this.pending !== null) {
        this.cancelFrame(this.pending);
        this.pending = null;
      }
    } else if (this.pending === null) {
      this.schedule(this.generation);
    }
  }

  stop(): void {
    this.setActive(false);
    this.stopped = true;
  }

  private schedule(generation: number): void {
    this.pending = this.requestFrame((time) => this.tick(time, generation));
  }

  private tick(time: number, generation: number): void {
    // A callback cancelled before pause/resume cannot clear the new pending RAF.
    if (generation !== this.generation) return;
    this.pending = null;
    if (!this.active || this.stopped) return;
    try {
      this.onFrame(time);
    } finally {
      if (generation === this.generation && this.active && !this.stopped && this.pending === null) {
        this.schedule(generation);
      }
    }
  }
}
