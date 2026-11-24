// QA only: a finite pose stream, paced by actual detectForVideo timestamps.
// No app state, counter feedback, fake clock, or reward data is read/written.
export function createTowerSquatFixture(target = 20) {
  if (!Number.isInteger(target) || target < 1 || target > 20) throw Error('Invalid fixture target');
  let phase = 'calibrate', phaseAt = null, samples = 0, previous = null;
  let cycles = 0, frames = 0, maxGapMs = 0, failure = null;
  let nextPhase = null;
  const transition = name => { phase = name; phaseAt = null; samples = 0; nextPhase = null; };
  function sample(now) {
    frames++;
    if (!Number.isFinite(now) || (previous !== null && now <= previous)) {
      failure ??= 'non-monotonic observation timestamp';
    }
    if (previous !== null && Number.isFinite(now)) {
      const gap = now - previous;
      maxGapMs = Math.max(maxGapMs, gap);
      if (gap > 850) failure ??= 'observation gap exceeded 850 ms';
    }
    previous = now;
    if (failure || phase === 'done') return 174;
    if (nextPhase) transition(nextPhase);
    phaseAt ??= now;
    samples++;
    const elapsed = now - phaseAt;
    if (phase === 'calibrate') {
      if (samples >= 3 && elapsed >= 200) nextPhase = 'down';
      return 174;
    }
    if (phase === 'down') {
      if (samples >= 2 && elapsed >= 180) nextPhase = 'up';
      return 95;
    }
    // The final observed standing sample belongs to this cycle. Never start
    // a new descent until the full standing interval has actually elapsed.
    if (samples >= 3 && elapsed >= 360) {
      cycles++;
      nextPhase = cycles === target ? 'done' : 'down';
    }
    return 174;
  }
  return { sample, diagnostics: () => ({ phase, cycles, frames, maxGapMs, failure }) };
}
