// Audio-i spec section 5: the music state machine, time injected.
import { describe, it, expect } from 'vitest';
import { CALM_AFTER_S, DUCK_LEVEL, IDLE_STATUS, MAX_STEP_S, REPORT_STALE_S, createMusic, liveStatus, stepMusic, type AudioStatus, type MusicMix } from '../src/renderer/src/audio/musicState';

const quiet = { engaged: false, paused: false, duck: false };
/** Steps from `from` to `to` in 50 ms frames with the same input; returns the last mix. */
function run(s: ReturnType<typeof createMusic>, from: number, to: number, input: { engaged: boolean; paused: boolean; duck: boolean }): MusicMix {
  let out: MusicMix | null = null;
  for (let k = 0; from + k * 0.05 <= to + 1e-9; k++) out = stepMusic(s, { now: from + k * 0.05, ...input });
  return out!;
}

describe('the music state machine (Audio-i spec section 5)', () => {
  it('starts calm', () => {
    expect(stepMusic(createMusic(), { now: 0, ...quiet })).toEqual({ calm: 1, battle: 0, mix: 1, battleOn: false });
  });
  it('crossfades to battle over 2 s with equal power once engaged', () => {
    const s = createMusic(); stepMusic(s, { now: 0, ...quiet });
    const first = stepMusic(s, { now: 0.05, ...quiet, engaged: true });
    expect(first.battleOn).toBe(true);
    for (let t = 0.1; t < 2.1; t += 0.05) { const m = stepMusic(s, { now: t, ...quiet, engaged: true }); expect(m.calm ** 2 + m.battle ** 2).toBeCloseTo(1); }
    const s2 = createMusic(); stepMusic(s2, { now: 0, ...quiet });
    const half = run(s2, 0.05, 1, { ...quiet, engaged: true });
    expect(half.calm).toBeCloseTo(Math.SQRT1_2, 1); expect(half.battle).toBeCloseTo(Math.SQRT1_2, 1);
    expect(run(s2, 1.05, 2.5, { ...quiet, engaged: true }).battle).toBeCloseTo(1);
  });
  it('holds battle for 8 s after the last engagement, then fades back and lets the battle source go', () => {
    const s = createMusic();
    run(s, 0, 3, { ...quiet, engaged: true });
    expect(run(s, 3.05, 3 + CALM_AFTER_S - 0.5, quiet).battle).toBeCloseTo(1);
    const back = run(s, 3 + CALM_AFTER_S - 0.45, 3 + CALM_AFTER_S + 2.5, quiet);
    expect(back).toEqual({ calm: 1, battle: 0, mix: 1, battleOn: false });
  });
  it('fades the mix out while paused, without counting the calm-down, and back in on resume', () => {
    const s = createMusic();
    run(s, 0, 3, { ...quiet, engaged: true });
    const paused = run(s, 3.05, 30, { ...quiet, paused: true });
    expect(paused.mix).toBe(0); expect(paused.battle).toBeCloseTo(1);   // 27 s paused, still battle
    expect(run(s, 30.05, 30.5, quiet).mix).toBe(1);
  });
  it('ducks the mix for 0.6 s after a big hit', () => {
    const s = createMusic(); stepMusic(s, { now: 0, ...quiet });
    expect(stepMusic(s, { now: 0.05, ...quiet, duck: true }).mix).toBe(DUCK_LEVEL);
    expect(run(s, 0.1, 0.5, quiet).mix).toBe(DUCK_LEVEL);
    expect(run(s, 0.55, 0.8, quiet).mix).toBe(1);
  });
  it('caps a long frame gap', () => {
    const s = createMusic(); stepMusic(s, { now: 0, ...quiet });
    const m = stepMusic(s, { now: 100, ...quiet, engaged: true });
    expect(m.battle).toBeCloseTo(Math.sin(((MAX_STEP_S / 2) * Math.PI) / 2));
  });
  it('treats a missing or stale report as idle (the menu)', () => {
    const report: AudioStatus = { engaged: true, paused: true, duck: false, hum: null, fires: 2 };
    expect(liveStatus(null, 5)).toBe(IDLE_STATUS);
    expect(liveStatus({ status: report, at: 5 }, 5 + REPORT_STALE_S)).toBe(report);
    expect(liveStatus({ status: report, at: 5 }, 5 + REPORT_STALE_S + 0.01)).toBe(IDLE_STATUS);
  });
});
