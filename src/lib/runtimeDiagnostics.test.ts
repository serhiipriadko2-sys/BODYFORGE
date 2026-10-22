import { describe, expect, it } from 'vitest';
import { RuntimeDiagnostics } from './runtimeDiagnostics';

describe('privacy-preserving performance diagnostics', () => {
  it('bounds samples, counts frames and uses nearest-rank p50/p95', () => {
    const state = new RuntimeDiagnostics();
    state.startCameraSession();
    for (let i = 0; i < 125; i++) state.recordInference(i, i * 100);
    const report = state.snapshot();
    expect(report.camera.frames).toBe(125);
    expect(report.camera.sampleCount).toBe(120);
    expect(report.camera.p50Ms).toBe(64);
    expect(report.camera.p95Ms).toBe(118);
    expect(report.camera.maxMs).toBe(124);
    expect(report.camera.observedHz).toBe(10);
  });

  it('ignores invalid measurements and never leaks data from a previous workout', () => {
    const state = new RuntimeDiagnostics();
    state.recordInference(13, 100);
    state.recordInference(-1, 200);
    state.recordInference(Number.NaN, 300);
    state.recordInference(Infinity, 400);
    state.recordInference(1, NaN);
    expect(state.snapshot().camera.frames).toBe(1);
    expect(state.snapshot().camera.p95Ms).toBeNull(); // Not enough frames for a stable percentile.
    state.startCameraSession();
    expect(state.snapshot().camera).toEqual({
      frames: 0, sampleCount: 0, p50Ms: null, p95Ms: null, maxMs: null, observedHz: null,
    });
  });

  it('does not misreport FPS from large inactivity gaps or mixed avatar instances', () => {
    const state = new RuntimeDiagnostics();
    const hero = state.attachAvatar();
    [100, 140, 180, 220].forEach((time) => state.recordAvatarFrame(hero, time));
    expect(state.snapshot().avatar.observedFps).toBe(25);
    state.recordAvatarFrame(hero, 10_000);
    expect(state.snapshot().avatar.observedFps).toBeNull();
    const forge = state.attachAvatar();
    [10000, 10050, 10100, 10150].forEach((time) => state.recordAvatarFrame(forge, time));
    expect(state.snapshot().avatar.observedFps).toBe(20);
    state.detachAvatar(forge);
    expect(state.snapshot().avatar.observedFps).toBeNull(); // Hero's stale FPS is not substituted.
    state.detachAvatar(hero);
    expect(state.snapshot().avatar.active).toBe(false);
  });

  it('reports GLB and GPU counters while owned, retaining only numeric summary after disposal', () => {
    const state = new RuntimeDiagnostics();
    const id = state.attachAvatar();
    state.recordGlbLoad(id, 456.789);
    state.recordAvatarFrame(id, 100, { drawCalls: 9, geometries: 6, textures: 3 });
    expect(state.snapshot().avatar).toMatchObject({
      glbLoadMs: 456.8, drawCalls: 9, geometries: 6, textures: 3, active: true,
    });
    state.detachAvatar(id);
    expect(state.snapshot().avatar.active).toBe(false);
    const report = JSON.stringify(state.snapshot());
    expect(report).not.toContain('landmarks');
    expect(report).not.toContain('deviceId');
    expect(report).not.toContain('nickname');
    expect(report).not.toContain('video');
  });

  it('ignores late GLB callbacks and frames after an avatar was destroyed', () => {
    const state = new RuntimeDiagnostics();
    const id = state.attachAvatar();
    state.detachAvatar(id);
    state.recordAvatarFrame(id, 100);
    state.recordGlbLoad(id, 999);
    expect(state.snapshot().avatar.frames).toBe(0);
    expect(state.snapshot().avatar.glbLoadMs).toBeNull();
  });
});
