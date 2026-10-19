import { describe, expect, it } from 'vitest';
import { getKneeAngle, SquatCounter, StableKneeTracker } from './squatCounter';

function feed(counter: SquatCounter, sequence: number[], from = 0, step = 75) {
  let snapshot = counter.update(sequence[0], from);
  for (let i = 1; i < sequence.length; i++) snapshot = counter.update(sequence[i], from + i * step);
  return snapshot;
}

const SQUAT = [170, 170, 170, 140, 123, 98, 91, 89, 90, 90, 118, 142, 167, 173, 175, 176];
const SHALLOW = [170, 170, 170, 158, 148, 142, 139, 138, 143, 160, 170, 171];

describe('SquatCounter', () => {
  it('accepts a controlled side-view squat with a 120 degree minimum', () => {
    const counter = new SquatCounter();
    const sequence = [170, 170, 170, 158, 144, 132, 125, 120, 119, 124, 138, 151, 165, 170, 172];
    expect(feed(counter, sequence, 0, 110).count).toBe(1);
  });

  it('calibrates from a stable but imperfect camera projection of standing', () => {
    const counter = new SquatCounter();
    const sequence = [150, 151, 151, 150, 143, 131, 116, 107, 104, 108, 122, 139, 149, 151, 151];
    expect(feed(counter, sequence, 0, 110).count).toBe(1);
  });

  it('does not count a shallow bend relative to the users standing pose', () => {
    const counter = new SquatCounter();
    const sequence = [170, 170, 170, 163, 149, 142, 137, 137, 141, 155, 168, 170, 171];
    expect(feed(counter, sequence, 0, 110).count).toBe(0);
  });

  it('counts a full squat after calibration and full extension', () => {
    const counter = new SquatCounter();
    expect(feed(counter, SQUAT).count).toBe(1);
  });

  it('rejects shallow or partial squats', () => {
    const counter = new SquatCounter();
    expect(feed(counter, SHALLOW).count).toBe(0);
  });

  it('counts 20 complete repetitions without manual stop', () => {
    const counter = new SquatCounter();
    let last = counter.update(170, 0);
    for (let rep = 0; rep < 20; rep++) {
      last = feed(counter, SQUAT, 100 + rep * SQUAT.length * 75);
    }
    expect(last.count).toBe(20);
  });

  it('prevents repeated counts while staying upright', () => {
    const counter = new SquatCounter();
    feed(counter, SQUAT);
    const last = feed(counter, Array.from({ length: 30 }, () => 172), SQUAT.length * 75);
    expect(last.count).toBe(1);
  });

  it('requires standing calibration and resets after lost pose', () => {
    const counter = new SquatCounter();
    feed(counter, [95, 95, 95, 170, 170, 170], 0);
    counter.update(null, 1600);
    const state = counter.update(null, 2600);
    expect(state.phase).toBe('calibrate');
    expect(state.count).toBe(0);
  });

  it('does not finish an unseen squat after a long camera pause', () => {
    const counter = new SquatCounter();
    expect(feed(counter, SQUAT.slice(0, 10)).phase).toBe('bottom');
    const resumed = counter.update(172, 2100);
    expect(resumed.phase).toBe('calibrate');
    expect(resumed.count).toBe(0);
    expect(feed(counter, [172, 172, 172], 2175).count).toBe(0);
  });

  it('keeps earned repetitions when recalibrating after a pause', () => {
    const counter = new SquatCounter();
    expect(feed(counter, SQUAT).count).toBe(1);
    const resumed = counter.update(170, 3100);
    expect(resumed.phase).toBe('calibrate');
    expect(resumed.count).toBe(1);
  });

  it('tolerates a brief missed landmark without double counting', () => {
    const counter = new SquatCounter();
    expect(feed(counter, SQUAT.slice(0, 10)).phase).toBe('bottom');
    const missed = counter.update(null, 750);
    expect(missed.phase).toBe('bottom');
    const finished = feed(counter, SQUAT.slice(10), 825);
    expect(finished.count).toBe(1);
    expect(finished.counted).toBe(true);
    expect(counter.update(176, 1300).count).toBe(1);
  });
});

describe('getKneeAngle', () => {
  it('reads a straight visible knee', () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
    landmarks[23] = { x: 0.5, y: 0.3, visibility: 1 };
    landmarks[25] = { x: 0.5, y: 0.5, visibility: 1 };
    landmarks[27] = { x: 0.5, y: 0.8, visibility: 1 };
    expect(getKneeAngle(landmarks)).toBeCloseTo(180);
  });
  it('requires visible joints', () => {
    expect(getKneeAngle([])).toBeNull();
  });

  it('keeps tracking the same leg when confidences fluctuate', () => {
    const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
    landmarks[23] = { x: 0.3, y: 0.32, visibility: 0.95 };
    landmarks[25] = { x: 0.3, y: 0.52, visibility: 0.95 };
    landmarks[27] = { x: 0.3, y: 0.72, visibility: 0.95 };
    landmarks[24] = { x: 0.65, y: 0.33, visibility: 0.55 };
    landmarks[26] = { x: 0.65, y: 0.52, visibility: 0.55 };
    landmarks[28] = { x: 0.82, y: 0.65, visibility: 0.55 };
    const tracker = new StableKneeTracker();
    expect(tracker.update(landmarks).side).toBe('left');
    for (const index of [23, 25, 27]) landmarks[index].visibility = 0.5;
    for (const index of [24, 26, 28]) landmarks[index].visibility = 0.95;
    expect(tracker.update(landmarks).side).toBe('left');
    for (const index of [23, 25, 27]) landmarks[index].visibility = 0.1;
    expect(tracker.update(landmarks).side).toBe('right');
  });

  it('accepts moderate partial visibility but rejects collapsed skeletons', () => {
    const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
    points[23] = { x: 0.5, y: 0.3, visibility: 0.47 };
    points[25] = { x: 0.5, y: 0.5, visibility: 0.47 };
    points[27] = { x: 0.5, y: 0.7, visibility: 0.47 };
    expect(getKneeAngle(points)).toBeCloseTo(180);
    points[27] = { x: 0.5, y: 0.501, visibility: 0.47 };
    expect(getKneeAngle(points)).toBeNull();
  });
});
