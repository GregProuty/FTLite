// Audio-i spec section 5 and the music spike (2026-11-19): the five-mood music state machine, time injected.
import { describe, it, expect } from 'vitest';
import { CALM_AFTER_S, DUCK_LEVEL, IDLE_STATUS, MAX_STEP_S, MOODS, REPORT_STALE_S, SETTLE_S, createMusic, liveStatus, stepMusic, type AudioStatus, type Mood, type MusicMix } from '../src/renderer/src/audio/musicState';

type In = { mood: Mood; paused: boolean; duck: boolean; idle?: boolean };
const quiet: In = { mood: 'calm', paused: false, duck: false };
const combat: In = { ...quiet, mood: 'combat' };
/** Steps from `from` to `to` in 50 ms frames with the same input; returns the last mix. */
function run(s: ReturnType<typeof createMusic>, from: number, to: number, input: In): MusicMix {
  let out: MusicMix | null = null;
  for (let k = 0; from + k * 0.05 <= to + 1e-9; k++) out = stepMusic(s, { now: from + k * 0.05, ...input });
  return out!;
}
/** A mix with only `mood` playing, at full level. */
const only = (mood: Mood, mix = 1): MusicMix => ({
  gains: Object.fromEntries(MOODS.map((m) => [m, m === mood ? 1 : 0])) as Record<Mood, number>,
  on: Object.fromEntries(MOODS.map((m) => [m, m === mood])) as Record<Mood, boolean>, mix
});

describe('the music state machine (Audio-i spec section 5, music spike)', () => {
  it('starts calm, with only the calm track on', () => {
    expect(stepMusic(createMusic(), { now: 0, ...quiet })).toEqual(only('calm'));
  });
  it('crossfades to combat over 2 s with equal power, at once', () => {
    const s = createMusic(); stepMusic(s, { now: 0, ...quiet });
    const first = stepMusic(s, { now: 0.05, ...combat });
    expect(first.on.combat).toBe(true); expect(first.on.calm).toBe(true);
    for (let t = 0.1; t < 2.1; t += 0.05) { const m = stepMusic(s, { now: t, ...combat }); expect(m.gains.calm ** 2 + m.gains.combat ** 2).toBeCloseTo(1); }
    const s2 = createMusic(); stepMusic(s2, { now: 0, ...quiet });
    const half = run(s2, 0.05, 1, combat);
    expect(half.gains.calm).toBeCloseTo(Math.SQRT1_2, 1); expect(half.gains.combat).toBeCloseTo(Math.SQRT1_2, 1);
    expect(run(s2, 1.05, 2.5, combat)).toEqual(only('combat'));
  });
  it('holds combat for 8 s after the last danger, then fades to the mood asked for and lets the combat source go', () => {
    const s = createMusic();
    run(s, 0, 3, combat);
    expect(run(s, 3.05, 3 + CALM_AFTER_S - 0.5, { ...quiet, mood: 'space' }).gains.combat).toBeCloseTo(1);
    expect(run(s, 3 + CALM_AFTER_S - 0.45, 3 + CALM_AFTER_S + 2.5, { ...quiet, mood: 'space' })).toEqual(only('space'));
  });
  it('moves between the quiet moods once the new one has been asked for 1 s, so a flicker changes nothing', () => {
    const s = createMusic(); stepMusic(s, { now: 0, ...quiet });
    expect(run(s, 0.05, SETTLE_S - 0.1, { ...quiet, mood: 'space' })).toEqual(only('calm'));   // asked, not yet settled
    expect(run(s, SETTLE_S - 0.05, SETTLE_S + 0.3, quiet)).toEqual(only('calm'));              // back to calm: the count is dropped
    run(s, SETTLE_S + 0.35, 2 * SETTLE_S + 0.3, { ...quiet, mood: 'intrigue' });               // 0.95 s of intrigue: not enough
    expect(run(s, 2 * SETTLE_S + 0.35, 3 * SETTLE_S + 0.2, { ...quiet, mood: 'adventure' })).toEqual(only('calm'));   // a new ask restarts the count
    const mid = run(s, 3 * SETTLE_S + 0.25, 3 * SETTLE_S + 1.4, { ...quiet, mood: 'adventure' });
    expect(mid.on).toMatchObject({ calm: true, adventure: true, space: false, intrigue: false, combat: false });
    expect(mid.gains.calm ** 2 + mid.gains.adventure ** 2).toBeCloseTo(1);
    expect(run(s, 3 * SETTLE_S + 1.45, 3 * SETTLE_S + 4, { ...quiet, mood: 'adventure' })).toEqual(only('adventure'));
  });
  it('fades the mix out while paused, without counting the calm-down or the settle, and back in on resume', () => {
    const s = createMusic();
    run(s, 0, 3, combat);
    const paused = run(s, 3.05, 30, { ...quiet, paused: true });
    expect(paused.mix).toBe(0); expect(paused.gains.combat).toBeCloseTo(1);   // 27 s paused, still combat
    expect(run(s, 30.05, 30.5, quiet).mix).toBe(1);
    const s2 = createMusic(); stepMusic(s2, { now: 0, ...quiet });
    expect(run(s2, 0.05, 20, { mood: 'space', paused: true, duck: false }).on.space).toBe(false);   // paused: still calm underneath
  });
  it('ducks the mix for 0.6 s after a big hit', () => {
    const s = createMusic(); stepMusic(s, { now: 0, ...quiet });
    expect(stepMusic(s, { now: 0.05, ...quiet, duck: true }).mix).toBe(DUCK_LEVEL);
    expect(run(s, 0.1, 0.5, quiet).mix).toBe(DUCK_LEVEL);
    expect(run(s, 0.55, 0.8, quiet).mix).toBe(1);
  });
  it('caps a long frame gap', () => {
    const s = createMusic(); stepMusic(s, { now: 0, ...quiet });
    const m = stepMusic(s, { now: 100, ...combat });
    expect(m.gains.combat).toBeCloseTo(Math.sin(((MAX_STEP_S / 2) * Math.PI) / 2));
  });
  it('goes calm at once (still a 2 s crossfade) when the report is idle, skipping the 8 s and 1 s waits', () => {
    const s = createMusic();
    run(s, 0, 3, combat);
    const mid = run(s, 3.05, 4, { ...quiet, idle: true });
    expect(mid.gains.combat).toBeLessThan(1); expect(mid.gains.combat).toBeGreaterThan(0);
    expect(run(s, 4.05, 5.5, { ...quiet, idle: true })).toEqual(only('calm'));
    const s2 = createMusic();
    run(s2, 0, 5, { ...quiet, mood: 'space' });
    expect(stepMusic(s2, { now: 5.05, ...quiet, idle: true }).on.calm).toBe(true);
  });
  it('treats a missing or stale report as idle (the menu)', () => {
    const report: AudioStatus = { mood: 'combat', paused: true, duck: false, hum: null, fires: 2 };
    expect(liveStatus(null, 5)).toBe(IDLE_STATUS);
    expect(liveStatus({ status: report, at: 5 }, 5 + REPORT_STALE_S)).toBe(report);
    expect(liveStatus({ status: report, at: 5 }, 5 + REPORT_STALE_S + 0.01)).toBe(IDLE_STATUS);
  });
});
