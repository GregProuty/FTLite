// The generic authority (engine refactor spec §6, R-1a): createAuthority is createEncounterAuthority over the sector
// rules, the sector rules wrap today's hooks, and replays name their mode, absent meaning sector.
import { describe, expect, it } from 'vitest';
import { createAuthority, createEncounterAuthority } from '../src/renderer/src/authority/authority';
import { parseEncounterReplay, parseReplay, replayMode, runEncounterReplay } from '../src/renderer/src/authority/replay';
import { sectorRules } from '../src/renderer/src/authority/sectorRules';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { SIM_VERSION } from '../src/renderer/src/sim/tuning';
import { telemetryRecord } from '../src/renderer/src/sim/telemetry';
import { hashState } from '../src/renderer/src/sim/hash';
import { visitRef } from '../src/renderer/src/sim/commands';
import { LAYOUT, makeState } from './helpers/sim';
import { ownTestCleanup } from './helpers/simLifetime';
import { scriptedSemanticReplay } from './helpers/script';

const init = () => ({ runId: 'generic', layoutId: LAYOUT.id, layoutHash: deriveLayout(LAYOUT).layoutHash, simVersion: SIM_VERSION,
  contentDigest: __GAMEPLAY_CONTENT_DIGEST__, seed: 11, playerCount: 2, characters: [0, 0], unlocked: [] });
function deps() {
  let now = 0; const callbacks = new Set<() => void>();
  return { now: (t: number) => { now = t; for (const cb of [...callbacks]) { callbacks.delete(cb); cb(); } },
    value: { contentDigest: __GAMEPLAY_CONTENT_DIGEST__, resolveLayout: () => LAYOUT, clock: { nowMs: () => now }, onCrash(r: { error: string }) { throw Error(r.error); },
      scheduler: { schedule: (_: number, cb: () => void) => { callbacks.add(cb); return () => { callbacks.delete(cb); }; } } } };
}

describe('the generic authority', () => {
  it('createAuthority is createEncounterAuthority over the sector rules: identical checkpoints after 300 ticks', () => {
    const a = deps(), b = deps();
    const sector = createAuthority(a.value), generic = createEncounterAuthority(sectorRules, b.value);
    ownTestCleanup(() => { sector.dispose(); generic.dispose(); });
    sector.start(init()); generic.start(init());
    for (let k = 1; k <= 300; k++) { a.now(k * 1000 / 60 + 0.01); b.now(k * 1000 / 60 + 0.01); }
    expect(generic.checkpoint([])).toEqual(sector.checkpoint([]));
    expect(sector.checkpoint([]).snapshot.header.tick).toBe(300);
    expect(sector.checkpoint([])).not.toHaveProperty('modeMemory');
  });
  it('the sector rules are today\'s hooks: tick, players, hash, safe point, callouts, end record', () => {
    const s = makeState(2);
    expect(sectorRules.tick(s)).toBe(s.tick);
    expect(sectorRules.playerCount(s)).toBe(2);
    expect(sectorRules.hash(s)).toBe(hashState(s));
    expect(sectorRules.safePointKey(s)).toBe(JSON.stringify(visitRef(s)));
    expect(sectorRules.callouts(s, 0)).toEqual({ text: expect.any(String), station: null });
    expect(sectorRules.terminal(s, init())).toEqual({ ended: false, endRecord: null });
    s.ended = 1;
    expect(sectorRules.terminal(s, { ...init(), seed: 5 })).toEqual({ ended: true, endRecord: { mode: 'sector', record: telemetryRecord(s, 5) } });
    expect(sectorRules.initialControllers()).toEqual([]);
  });
  it('replays name their mode: absent is sector, so recorded V2 files parse unchanged; another mode is refused', () => {
    const replay = scriptedSemanticReplay(1, 1, 5);
    expect(replay).not.toHaveProperty('mode');
    expect(replayMode(replay)).toBe('sector');
    expect(parseReplay(LAYOUT, replay, __GAMEPLAY_CONTENT_DIGEST__)).not.toHaveProperty('mode');
    expect(parseEncounterReplay(sectorRules, { ...replay, mode: 'sector' }, __GAMEPLAY_CONTENT_DIGEST__, () => LAYOUT).mode).toBe('sector');
    expect(() => parseReplay(LAYOUT, { ...replay, mode: 'duel' }, __GAMEPLAY_CONTENT_DIGEST__)).toThrow(/replay mode does not match/);
    expect(() => parseReplay(LAYOUT, { ...replay, mode: 7 }, __GAMEPLAY_CONTENT_DIGEST__)).toThrow(/replay mode does not match/);
    expect(runEncounterReplay(sectorRules, replay, __GAMEPLAY_CONTENT_DIGEST__, () => LAYOUT).hashes).toHaveLength(5);
  });
});
