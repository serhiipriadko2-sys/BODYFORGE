import { describe, expect, it } from 'vitest';
import { getKneeAngle, SquatCounter, StableKneeTracker, type PosePoint } from './squatCounter';

function feed(counter: SquatCounter, sequence: number[], from = 0, step = 75) {
  let snapshot = counter.update(sequence[0], from);
  for (let i = 1; i < sequence.length; i++) snapshot = counter.update(sequence[i], from + i * step);
  return snapshot;
}

const SQUAT = [170, 170, 170, 140, 123, 98, 91, 89, 90, 90, 118, 142, 167, 173, 175, 176];
const SHALLOW = [170, 170, 170, 158, 148, 142, 139, 138, 143, 160, 170, 171];

/** Project the same pixel-space leg into MediaPipe's width/height units. */
function projectedLeg(angle: number, frameAspectRatio: number): PosePoint[] {
  const radians = (180 - angle) * Math.PI / 180;
  const points: PosePoint[] = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
  points[23] = { x: .5, y: .3, visibility: .98 };
  points[25] = { x: .5, y: .5, visibility: .98 };
  points[27] = { x: .5 + .2 * Math.sin(radians) / frameAspectRatio,
    y: .5 + .2 * Math.cos(radians), visibility: .98 };
  return points;
}

describe('SquatCounter', () => {
  it('does not build a repetition from visibility-only switches between motionless legs', () => {
    const counter = new SquatCounter();
    const tracker = new StableKneeTracker();
    const left = projectedLeg(170, 1);
    const right = projectedLeg(110, 1);
    const points = [...left];
    for (const [to, from] of [[24, 23], [26, 25], [28, 27]]) points[to] = { ...right[from] };
    let count = 0;
    for (let time = 0; time <= 1500; time += 100) {
      for (const index of [23, 25, 27]) points[index].visibility = time >= 300 && time <= 900 ? .1 : .99;
      for (const index of [24, 26, 28]) points[index].visibility = time >= 1000 ? .1 : .98;
      const measured = tracker.update(points);
      count = counter.update(measured.angle, time, measured.side).count;
    }
    expect(count).toBe(0);
  });

  it('keeps earned repetitions but discards a partial cycle on a change of leg', () => {
    const counter = new SquatCounter();
    expect(feed(counter, SQUAT).count).toBe(1);
    counter.update(170, 1300, 'left');
    SQUAT.slice(3, 10).forEach((angle, index) => counter.update(angle, 1500 + index * 75, 'left'));
    const switched = counter.update(110, 2100, 'right');
    expect(switched.phase).toBe('calibrate');
    expect(switched.count).toBe(1);
    [170, 170, 170].forEach((angle, index) => counter.update(angle, 2200 + index * 100, 'right'));
    expect(counter.update(170, 2500, 'right').count).toBe(1);
    let count = 0;
    SQUAT.forEach((angle, index) => { count = counter.update(angle, 2600 + index * 75, 'right').count; });
    expect(count).toBe(2);
  });

  it('retains a partial cycle when the same leg returns after a brief landmark loss', () => {
    const counter = new SquatCounter();
    SQUAT.slice(0, 10).forEach((angle, index) => counter.update(angle, index * 75, 'left'));
    expect(counter.update(null, 750, null).phase).toBe('bottom');
    let count = 0;
    SQUAT.slice(10).forEach((angle, index) => { count = counter.update(angle, 825 + index * 75, 'left').count; });
    expect(count).toBe(1);
  });

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

  it('preserves completed repetitions but discards an unfinished squat on camera switch', () => {
    const counter = new SquatCounter();
    expect(feed(counter, SQUAT).count).toBe(1);
    const partial = feed(counter, SQUAT.slice(3, 10), 1500);
    expect(partial.phase).toBe('bottom');
    const afterSwitch = counter.recalibrate();
    expect(afterSwitch.phase).toBe('calibrate');
    expect(afterSwitch.count).toBe(1);
    expect(afterSwitch.calibrated).toBe(false);
    expect(feed(counter, [170, 170, 170], 2300).count).toBe(1);
    expect(feed(counter, SQUAT, 2500).count).toBe(2);
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
  it.each([9 / 16, 1, 16 / 9])('measures pixel-space angles at video aspect ratio %s', (ratio) => {
    for (const angle of [120, 140, 170]) {
      expect(getKneeAngle(projectedLeg(angle, ratio), ratio)).toBeCloseTo(angle, 6);
    }
  });

  it.each([9 / 16, 16 / 9])('keeps full and shallow cycles distinct at video aspect ratio %s', (ratio) => {
    for (const [sequence, expectedCount] of [[SQUAT, 1], [SHALLOW, 0]] as const) {
      const tracker = new StableKneeTracker();
      const counter = new SquatCounter();
      let count = 0;
      for (const [index, angle] of sequence.entries()) {
        const measured = tracker.update(projectedLeg(angle, ratio), ratio);
        count = counter.update(measured.angle, index * 110).count;
      }
      expect(count).toBe(expectedCount);
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects unusable video aspect ratio %s', (ratio) => {
    const points = projectedLeg(170, 1);
    expect(getKneeAngle(points, ratio)).toBeNull();
    expect(new StableKneeTracker().update(points, ratio)).toEqual({ angle: null, side: null });
  });

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
