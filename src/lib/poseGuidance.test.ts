import { describe, expect, it } from 'vitest';
import { assessPoseGuidance, PoseGuidanceTracker } from './poseGuidance';
import type { PosePoint } from './squatCounter';

const empty = (): PosePoint[] => Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
function pose(options: { knees?: boolean; ankles?: boolean; ankleY?: number; shoulderY?: number } = {}): PosePoint[] {
  const p = empty();
  const { knees = true, ankles = true, ankleY = .83, shoulderY = .2 } = options;
  for (const [index, x] of [[11,.38],[12,.62]] as const) p[index] = { x, y: shoulderY, visibility: .95 };
  for (const [index, x] of [[23,.43],[24,.57]] as const) p[index] = { x, y: .44, visibility: .94 };
  if (knees) for (const [index, x] of [[25,.42],[26,.58]] as const) p[index] = { x, y: .64, visibility: .92 };
  if (ankles) for (const [index, x] of [[27,.39],[28,.61]] as const) p[index] = { x, y: ankleY, visibility: .91 };
  return p;
}

describe('live camera framing feedback', () => {
  it('tells the player to show their whole body when no person is detected', () => {
    expect(assessPoseGuidance(undefined, null).kind).toBe('no-person');
    expect(assessPoseGuidance(empty(), null).kind).toBe('no-person');
  });
  it('distinguishes hidden knees from missing feet', () => {
    expect(assessPoseGuidance(pose({ knees: false }), null).kind).toBe('knees-hidden');
    expect(assessPoseGuidance(pose({ ankles: false }), null).kind).toBe('feet-hidden');
  });
  it('warns when feet are clipped by the bottom of the frame', () => {
    expect(assessPoseGuidance(pose({ ankleY: .97 }), 160).kind).toBe('too-close');
  });
  it('does not falsely claim poor framing with a readable complete leg', () => {
    expect(assessPoseGuidance(pose(), 165).kind).toBe('tracked');
  });
  it('asks for side-on angle if all landmarks are present but knee angle collapses', () => {
    expect(assessPoseGuidance(pose(), null).kind).toBe('angle-unavailable');
  });
  it('uses either visible complete leg instead of requiring both ankles', () => {
    const p=pose();
    p[28] = { x:.61, y:.85, visibility:.1 };
    expect(assessPoseGuidance(p, 160).kind).toBe('tracked');
  });
  it('rejects invalid or non-finite landmark positions as invisible', () => {
    const p=pose();
    p[27] = { x:Number.NaN, y: .83, visibility:.99 };
    p[28] = { x:-.1, y: .83, visibility:.99 };
    expect(assessPoseGuidance(p,null).kind).toBe('feet-hidden');
  });
});

describe('camera hint stability', () => {
  it('ignores a brief landmark flicker but displays a sustained framing problem', () => {
    const tracker = new PoseGuidanceTracker();
    expect(tracker.update(pose(), 167, 0).kind).toBe('no-person');
    expect(tracker.update(pose(), 167, 420).kind).toBe('tracked');
    expect(tracker.update(pose({ ankles:false }), null, 490).kind).toBe('tracked');
    expect(tracker.update(pose(), 165, 680).kind).toBe('tracked');
    expect(tracker.update(pose({ ankles:false }), null, 800).kind).toBe('tracked');
    expect(tracker.update(pose({ ankles:false }), null, 1250).kind).toBe('feet-hidden');
  });
  it('resets the guidance after changing the camera', () => {
    const tracker = new PoseGuidanceTracker();
    tracker.update(pose(), 170, 0);
    tracker.update(pose(), 170, 500);
    expect(tracker.reset().kind).toBe('no-person');
  });
});
