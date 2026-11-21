// Hacking spike (spec §2.6, §3.4, §6 R1-6; plan R1-10): the client side of a hack. Online the landing is derived from the
// hacked counters (a lost hack is not); the zap and fizzle sounds; the ship-command queue carries both commands; the
// net-4a predictor keeps a predicted sciencePower and verifies once the authority runs it.
import { afterEach, describe, expect, it } from 'vitest';
import { duelCounters, gapEvents } from '../src/renderer/src/app/duel/onlineSource';
import { duelEventSounds } from '../src/renderer/src/audio/duelSounds';
import { createDuelKeyboard } from '../src/renderer/src/app/duel/input';
import { createDuelPredictor, type LocalInput } from '../src/renderer/src/clientControl/duelPredictor';
import type { DuelPublication } from '../src/renderer/src/clientControl/duelClient';
import type { CommandEnvelope, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__, N = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
const live: DuelState[] = [];
afterEach(() => { for (const d of live.splice(0)) disposeDuel(d); });

describe('the online hack event (R1-6)', () => {
  it('a rise of a room\'s hack clock in the gap is a landed hack; the countdown is not', () => {
    const st = createTacticalState(5), before = [duelCounters(st, 0), duelCounters(st, 1)];
    st.systems[1].hacked[Room.Shields] = 1800;
    expect(gapEvents(before, [null, null], st).filter((e) => e.kind === 'hack')).toEqual([{ kind: 'hack', what: 'done', room: Room.Shields }]);
    const later = [duelCounters(st, 0), duelCounters(st, 1)];
    st.systems[1].hacked[Room.Shields] = 1790;
    expect(gapEvents(later, [null, null], st).filter((e) => e.kind === 'hack')).toEqual([]);
  });
});

describe('the hack sounds (§2.6)', () => {
  it('a landed hack zaps, a lost one fizzles', () => {
    const s = duelEventSounds([{ kind: 'hack', what: 'done', room: 0 }, { kind: 'hack', what: 'lost', room: 1 }], () => 0).sounds;
    expect(s.map((x) => [x.key, x.rate])).toEqual([['forceField', 1.8], ['forceField', 0.6]]);
  });
});

describe('the ship-command queue (§3.4)', () => {
  it('carries sciencePower and hack from the console to the sample', () => {
    const k = createDuelKeyboard(new EventTarget() as never);
    k.ui.ship?.({ kind: 'sciencePower', delta: 1 });
    k.ui.ship?.({ kind: 'hack', room: Room.Engines });
    expect(k.sample().ship).toEqual([{ kind: 'sciencePower', delta: 1 }, { kind: 'hack', room: Room.Engines }]);
  });
});

describe('the predictor with Science commands (plan R1-10)', () => {
  it('keeps a predicted sciencePower from its local tick on, and verifies once the authority has run it', () => {
    const d = createDuel(CUTTER, 4, 0, 2); live.push(d);
    sitDown(d.interior, 0, d.science);
    d.tactical.systems[0].bars[DuelSystem.Sensors] = 3;
    let sequence = 0;
    const water = { held: [0, 0], command: [0, 0] };
    const publication = (): DuelPublication => {
      const snapshot = saveDuelSnapshot(d, DIGEST);
      return { runId: 'r', tick: d.interior.tick, publicationSequence: ++sequence, snapshot, hash: snapshot.header.hash, phase: 'running', pauseOwner: null, controlRevision: 0,
        pauseReason: null, lagTicks: 0, tickTimeMs: null, commandHighWater: [...water.command], heldHighWater: [...water.held], auxiliaryHighWater: [0, 0], eventSequence: 0, held: [N(), N()] };
    };
    const confirmed = (): DuelState => { const c = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST); live.push(c); return c; };
    const cmd: CommandEnvelope<DuelCommand> = { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command: { kind: 'sciencePower', delta: 1 } };
    const entry = (L: number, commands: CommandEnvelope<DuelCommand>[]): LocalInput => ({ heldSequence: L, held: N(), commands });
    const p = createDuelPredictor({ seat: 0, contentDigest: DIGEST, resolveLayout: () => CUTTER });
    p.confirm(publication(), confirmed());
    const seen: number[] = [], results: string[] = [];
    for (let L = 1; L <= 40; L++) {
      p.tick(entry(L, L === 10 ? [cmd] : []));
      stepDuelTick(d, { held: [N(), N()], commands: L === 15 ? [{ ...cmd, requestedTick: d.interior.tick }] : [] });
      water.held[0] = Math.max(0, L - 3); water.command[0] = L >= 15 ? 1 : 0;
      if (d.interior.tick % 3 === 0) results.push(p.confirm(publication(), confirmed()));
      if (L >= 10) seen.push(p.state()!.tactical.systems[0].hackPower);
    }
    expect(seen.every((v) => v === 1)).toBe(true);
    expect(d.tactical.systems[0].hackPower).toBe(1);
    expect(results.slice(-3)).toEqual(['verified', 'verified', 'verified']);
    p.dispose();
  });
});
