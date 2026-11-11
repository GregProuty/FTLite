import { describe, it, expect } from 'vitest';
import { runAcceptance, acceptanceTable, runAcceptanceCli } from '../src/renderer/src/sim/acceptance';
import { telemetryRecord, type TelemetryRecord } from '../src/renderer/src/sim/telemetry';
import { createSimState } from '../src/renderer/src/sim/state';
import { step } from '../src/renderer/src/sim/step';
import { botIntent } from '../src/renderer/src/sim/bot';
import { DEFAULT_CHARACTERS, RECRUIT } from '../src/renderer/src/sim/characters';
import { ACCEPTANCE_MINUTES, TICK_HZ } from '../src/renderer/src/sim/tuning';
import { LAYOUT } from './helpers/sim';

describe('runAcceptance', () => {
  it('equals an independent bot loop for 2 players, seed 1, half a minute, and is repeatable', () => {
    const s = createSimState(LAYOUT, 2, 1, DEFAULT_CHARACTERS);
    const budget = Math.round(0.5 * 60 * TICK_HZ);
    while (s.tick < budget && !s.ended) step(s, [botIntent(s, 0), botIntent(s, 1)]);
    const oracle = telemetryRecord(s, 1);
    const r = runAcceptance({ players: 2, seed: 1, minutes: 0.5 });
    expect(r).toEqual(oracle);
    expect(runAcceptance({ players: 2, seed: 1, minutes: 0.5 })).toEqual(r);
    expect(r.playerCount).toBe(2); expect(r.characters).toEqual(['Okoro', 'Lindqvist']);
    expect(r.endReason).toBe('running'); expect(r.durationSeconds).toBe(30);
  });
  it('crew lists for 1 and 4 players, and custom characters', () => {
    expect(runAcceptance({ players: 1, seed: 2, minutes: 0.05 }).characters).toEqual(['Okoro']);
    expect(runAcceptance({ players: 4, seed: 2, minutes: 0.05 }).characters).toEqual(['Okoro', 'Lindqvist', 'Reyes', 'Dubois']);
    expect(runAcceptance({ players: 2, seed: 2, minutes: 0.05, characters: [RECRUIT, RECRUIT] }).characters).toEqual(['Recruit', 'Recruit']);
  });
  it('a run that ends early reports its real reason and a shorter duration', { timeout: 60_000 }, () => {
    // One bot with the default spawner pressure eventually goes down or loses the hull; record the pair that ends here if a new seed is chosen.
    const r = runAcceptance({ players: 1, seed: 1, minutes: 20 });
    expect(r.endReason).not.toBe('running'); expect(r.durationSeconds).toBeLessThan(20 * 60);
  });
});

describe('acceptanceTable and runAcceptanceCli', () => {
  const rec = (players: number, seed: number, over: Partial<TelemetryRecord> = {}): TelemetryRecord => ({
    version: 1, simVersion: 9, seed, playerCount: players, characters: ['Okoro'], endReason: 'running', durationSeconds: 60,
    firstDown: null, firstDeath: null, stationsNeverManned: ['Doors'], mannedSeconds: {}, longestIdleSeconds: [12.5],
    spawns: { fire: 1, breach: 0, power: 0, debris: 2 }, impacts: 1, evadeRolls: 0, evasions: 0, shots: 3, hits: 1,
    repairs: { fire: 1, breach: 0, power: 0 }, maxStress: 0.4, phaseEntries: { buildUp: 1, sustainPeak: 0, peakFade: 0, relax: 0 }, skills: [[0, 0, 0, 0, 0, 0]], ...over
  });
  it('renders a header and one row per record with the record values', () => {
    const lines = acceptanceTable([rec(1, 1), rec(4, 3, { endReason: 'hull', durationSeconds: 42.5, firstDown: { who: 'Reyes', seconds: 10 }, hits: 0, shots: 0 })]).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^players\s+seed\s+ended-at\s+reason\s+first-down\s+first-death\s+never-manned\s+longest-idle\s+spawns\s+impacts\s+hits\/shots$/);
    expect(lines[1]).toMatch(/^1\s+1\s+1:00\s+running\s+-\s+-\s+Doors\s+12\.5\s+1\/0\/0\/2\s+1\s+1\/3$/);
    expect(lines[2]).toMatch(/^4\s+3\s+0:42\.5\s+hull\s+Reyes 0:10\s+-\s+Doors\s+12\.5\s+1\/0\/0\/2\s+1\s+0\/0$/);
  });
  it('no arguments: nine runs in players-major order at the default minutes; "1 1": three runs; --json prints records; bad input prints usage and runs nothing', () => {
    const calls: { players: number; seed: number; minutes: number }[] = []; const out: string[] = [];
    const run = (o: { players: number; seed: number; minutes: number }) => { calls.push(o); return rec(o.players, o.seed); };
    runAcceptanceCli([], run, (s) => out.push(s));
    expect(calls).toEqual([1, 2, 4].flatMap((players) => [1, 2, 3].map((seed) => ({ players, seed, minutes: ACCEPTANCE_MINUTES }))));
    expect(out).toHaveLength(1); expect(out[0]!.split('\n')).toHaveLength(10);
    calls.length = 0; out.length = 0;
    runAcceptanceCli(['1', '1'], run, (s) => out.push(s));
    expect(calls).toEqual([{ players: 1, seed: 1, minutes: 1 }, { players: 2, seed: 1, minutes: 1 }, { players: 4, seed: 1, minutes: 1 }]);
    expect(out[0]!.split('\n')[1]).toMatch(/^1\s+1\s+/);
    calls.length = 0; out.length = 0;
    runAcceptanceCli(['1', '5', '--json'], run, (s) => out.push(s));
    expect(calls.map((c) => c.seed)).toEqual([5, 5, 5]); expect(out).toHaveLength(4); expect(JSON.parse(out[1]!).seed).toBe(5);
    calls.length = 0; out.length = 0;
    runAcceptanceCli(['1', '5', '5', '2', '5'], run, (s) => out.push(s));             // duplicate seeds collapse, order kept
    expect(calls.map((c) => [c.players, c.seed])).toEqual([[1, 5], [1, 2], [2, 5], [2, 2], [4, 5], [4, 2]]);
    calls.length = 0; out.length = 0;
    runAcceptanceCli(['abc'], run, (s) => out.push(s));
    expect(calls).toEqual([]); expect(out).toHaveLength(1); expect(out[0]).toMatch(/^usage:/);
    runAcceptanceCli(['0'], run, (s) => out.push(s)); runAcceptanceCli(['1', 'x'], run, (s) => out.push(s));
    expect(calls).toEqual([]); expect(out).toHaveLength(3);
  });
});
