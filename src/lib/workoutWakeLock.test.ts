import { describe, expect, it, vi } from 'vitest';
import { WorkoutWakeLock, type ScreenWakeLease } from './workoutWakeLock';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function deferred() {
  let resolve!: (lease: ScreenWakeLease) => void;
  const promise = new Promise<ScreenWakeLease>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('optional screen wake lock during camera workouts', () => {
  it('requests only during an active workout and releases on completion', async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    const wake = new WorkoutWakeLock(request);
    wake.setEnabled(false);
    await flush();
    expect(request).not.toHaveBeenCalled();
    wake.setEnabled(true);
    await flush();
    expect(request).toHaveBeenCalledOnce();
    wake.setEnabled(true);
    await flush();
    expect(request).toHaveBeenCalledOnce();
    wake.setEnabled(false);
    expect(release).toHaveBeenCalledOnce();
    wake.setEnabled(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it('never requests the API if the workout ends before the microtask starts', async () => {
    const request = vi.fn(async () => ({ release: vi.fn(async () => {}) }));
    const wake = new WorkoutWakeLock(request);
    wake.setEnabled(true);
    wake.setEnabled(false);
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('releases a late camera-session grant rather than keeping the screen on', async () => {
    const late = deferred();
    const release = vi.fn(async () => {});
    const wake = new WorkoutWakeLock(() => late.promise);
    wake.setEnabled(true);
    await flush();
    wake.setEnabled(false);
    late.resolve({ release });
    await flush();
    expect(release).toHaveBeenCalledOnce();
  });

  it('rejects an obsolete grant after a rapid stop and restart', async () => {
    const first = deferred();
    const second = deferred();
    const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const obsoleteRelease = vi.fn(async () => {});
    const currentRelease = vi.fn(async () => {});
    const wake = new WorkoutWakeLock(request);
    wake.setEnabled(true);
    await flush();
    wake.setEnabled(false);
    wake.setEnabled(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    second.resolve({ release: currentRelease });
    await flush();
    first.resolve({ release: obsoleteRelease });
    await flush();
    expect(obsoleteRelease).toHaveBeenCalledOnce();
    expect(currentRelease).not.toHaveBeenCalled();
    wake.setEnabled(false);
    expect(currentRelease).toHaveBeenCalledOnce();
  });

  it('reacquires after returning to the foreground and releases on hiding', async () => {
    const releases = [vi.fn(async () => {}), vi.fn(async () => {})];
    const request = vi.fn().mockImplementationOnce(async () => ({ release: releases[0] }))
      .mockImplementationOnce(async () => ({ release: releases[1] }));
    const wake = new WorkoutWakeLock(request);
    wake.setEnabled(true);
    await flush();
    wake.setEnabled(false);
    expect(releases[0]).toHaveBeenCalledOnce();
    wake.setEnabled(true);
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    wake.setEnabled(false);
    expect(releases[1]).toHaveBeenCalledOnce();
  });

  it('treats blocked, unsupported and throwing APIs as non-fatal', async () => {
    const rejects = new WorkoutWakeLock(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const throws = new WorkoutWakeLock(() => { throw Error('wakeLock missing'); });
    expect(() => { rejects.setEnabled(true); throws.setEnabled(true); }).not.toThrow();
    await flush();
    expect(() => { rejects.setEnabled(false); throws.setEnabled(false); }).not.toThrow();
  });

  it('does not crash the training session if release rejects or throws', async () => {
    const rejects = new WorkoutWakeLock(async () => ({ release: async () => { throw Error('revoked'); } }));
    const throws = new WorkoutWakeLock(async () => ({
      release: () => { throw Error('already released'); },
    }));
    rejects.setEnabled(true);
    throws.setEnabled(true);
    await flush();
    expect(() => { rejects.setEnabled(false); throws.setEnabled(false); }).not.toThrow();
    await flush();
  });
});
