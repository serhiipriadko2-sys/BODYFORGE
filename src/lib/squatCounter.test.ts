import { describe, expect, it } from 'vitest';
import { getKneeAngle, SquatCounter } from './squatCounter';

function feed(counter: SquatCounter, sequence: number[], from = 0, step = 75) {
  let snapshot = counter.update(sequence[0], from);
  for (let i = 1; i < sequence.length; i++) snapshot = counter.update(sequence[i], from + i * step);
  return snapshot;
}

const SQUAT = [170, 170, 170, 140, 123, 98, 91, 89, 90, 90, 118, 142, 167, 173, 175, 176];
const SHALLOW = [170, 170, 170, 141, 131, 123, 118, 120, 140, 165, 170, 171];

describe('SquatCounter', () => {
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
});
