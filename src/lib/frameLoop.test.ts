import { describe, expect, it } from 'vitest';
import { ActiveFrameLoop } from './frameLoop';

function clock() {
  const callbacks = new Map<number, (time: number) => void>();
  let next = 0;
  return {
    callbacks,
    request: (cb: (time: number) => void): number => {
      const id = ++next;
      callbacks.set(id, cb);
      return id;
    },
    cancel: (id: number) => { callbacks.delete(id); },
    fire: (time: number) => {
      const entry = callbacks.entries().next().value;
      if (entry) {
        const [id, cb] = entry;
        callbacks.delete(id);
        cb(time);
      }
    },
  };
}

describe('active 3D frame loop', () => {
  it('stops requesting animation frames while hidden or paused and resumes once', () => {
    const c = clock();
    const seen: number[] = [];
    const loop = new ActiveFrameLoop((time) => seen.push(time), c.request, c.cancel);
    expect(c.callbacks.size).toBe(0);
    loop.setActive(true);
    loop.setActive(true);
    expect(c.callbacks.size).toBe(1);
    c.fire(100);
    expect(seen).toEqual([100]);
    expect(c.callbacks.size).toBe(1);
    loop.setActive(false);
    expect(c.callbacks.size).toBe(0);
    loop.setActive(true);
    expect(c.callbacks.size).toBe(1);
    c.fire(160);
    expect(seen).toEqual([100, 160]);
    loop.stop();
    expect(c.callbacks.size).toBe(0);
  });

  it('ignores late callbacks after hiding or stopping', () => {
    const c = clock();
    const seen: number[] = [];
    const loop = new ActiveFrameLoop((time) => seen.push(time), c.request, c.cancel);
    loop.setActive(true);
    const stale = [...c.callbacks.values()][0];
    loop.setActive(false);
    stale(10);
    expect(seen).toEqual([]);
    expect(c.callbacks.size).toBe(0);
    loop.setActive(true);
    const late = [...c.callbacks.values()][0];
    loop.stop();
    late(30);
    loop.setActive(true);
    expect(c.callbacks.size).toBe(0);
    expect(seen).toEqual([]);
  });

  it('ignores a cancelled callback after resume without creating a second frame loop', () => {
    const c = clock();
    const seen: number[] = [];
    const loop = new ActiveFrameLoop((time) => seen.push(time), c.request, c.cancel);
    loop.setActive(true);
    const stale = [...c.callbacks.values()][0];
    loop.setActive(false);
    loop.setActive(true);
    stale(20);
    expect(seen).toEqual([]);
    expect(c.callbacks.size).toBe(1);
    c.fire(30);
    expect(seen).toEqual([30]);
    expect(c.callbacks.size).toBe(1);
    loop.stop();
  });

  it('does not rearm an old generation when its frame pauses and resumes the loop', () => {
    const c = clock();
    const loop = new ActiveFrameLoop(() => {
      loop.setActive(false);
      loop.setActive(true);
    }, c.request, c.cancel);
    loop.setActive(true);
    c.fire(20);
    expect(c.callbacks.size).toBe(1);
    loop.stop();
    expect(c.callbacks.size).toBe(0);
  });
});
