// Net-4a §3.3, §3.4: the duel predictor, against hand-built publications from a duel playing the authority: P runs
// ahead with this seat's input, verifies when the authority used the same inputs, re-simulates when the partner's held
// input changed, anchors on the held watermark, keeps commands until the command watermark passes them, resets on a
// pause, a new round or a decided round, and never stands more than PREDICT_MAX_TICKS past the confirmed tick.
import { afterEach, describe, expect, it } from 'vitest';
import { createDuelPredictor, heldKey, PREDICT_HASH_EVERY, PREDICT_MAX_TICKS, type LocalInput } from '../src/renderer/src/clientControl/duelPredictor';
import type { DuelPublication } from '../src/renderer/src/clientControl/duelClient';
import type { CommandEnvelope, DuelCommand, HeldInput } from '../src/renderer/src/net/contracts';
import { STATE_CADENCE_TICKS } from '../src/network/state/sender';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__, N = (): HeldInput => ({ moveX: 0, moveY: 0, interactHeld: false });
const live: DuelState[] = [];
afterEach(() => { for (const d of live.splice(0)) disposeDuel(d); });
/** The authority: a seated Cutter duel, seat 0 the crew Helm. step(held) runs one tick with these held inputs and commands. */
function authority(seed = 4, cls?: number) {
  const d = createSeatedDuel(CUTTER, seed, 0, 2, cls); live.push(d);
  let revision = 0, sequence = 0, phase: 'running' | 'paused' = 'running';
  const last: HeldInput[] = [N(), N()], water = { held: [0, 0], command: [0, 0] };
  return { d, water,
    step(held: HeldInput[], commands: CommandEnvelope<DuelCommand>[] = []) { last.splice(0, 2, ...held.map((h) => ({ ...h }))); stepDuelTick(d, { held, commands: commands.map((c) => ({ ...c, requestedTick: d.interior.tick })) }); },
    pause(p: boolean) { phase = p ? 'paused' : 'running'; revision++; },
    publication(): DuelPublication {
      const snapshot = saveDuelSnapshot(d, DIGEST);
      return { runId: 'r', tick: d.interior.tick, publicationSequence: ++sequence, snapshot, hash: snapshot.header.hash, phase, pauseOwner: null, controlRevision: revision,
        pauseReason: phase === 'paused' ? 'player' : null, lagTicks: 0, tickTimeMs: null, commandHighWater: [...water.command], heldHighWater: [...water.held], auxiliaryHighWater: [0, 0],
        eventSequence: 0, held: phase === 'paused' ? [N(), N()] : last.map((h) => ({ ...h })) };
    },
    confirmed(): DuelState { const c = loadDuelSnapshot(CUTTER, saveDuelSnapshot(d, DIGEST), DIGEST); live.push(c); return c; }
  };
}
const predictor = () => createDuelPredictor({ seat: 0, contentDigest: DIGEST, resolveLayout: () => CUTTER });
const entry = (heldSequence: number | null, held: HeldInput = N(), commands: CommandEnvelope<DuelCommand>[] = []): LocalInput => ({ heldSequence, held, commands });
const cmd = (sequence: number, command: DuelCommand): CommandEnvelope<DuelCommand> => ({ runId: 'r', id: { player: 0, sequence }, requestedTick: 0, command });

describe('the duel predictor (Net-4a §3.3, §3.4)', () => {
  it('hashes on the cadence ticks', () => { expect(PREDICT_HASH_EVERY).toBe(STATE_CADENCE_TICKS); });
  it('the first publication resets: P is the confirmed state, active, no lead', () => {
    const a = authority(), p = predictor();
    expect(p.state()).toBeNull();
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));
    expect([p.active(), p.stats().lead, p.before() !== null]).toEqual([true, 0, true]);
    p.dispose();
  });
  it('runs ahead one tick per local tick and verifies when the authority ran the same inputs (constant delay of 6 ticks)', () => {
    const a = authority(), p = predictor(), held = { ...N(), throttleHeld: 1 };
    p.confirm(a.publication(), a.confirmed());
    const results: string[] = [];
    // Local tick L sends held sequence L; the authority latches it 6 ticks later (a 100 ms one-way trip).
    for (let L = 1; L <= 60; L++) {
      expect(p.tick(entry(L, held))).toBe(true);
      a.step([L > 6 ? held : N(), N()]);
      if (L > 6) a.water.held[0] = L - 6;
      if (a.d.interior.tick % 3 === 0) results.push(p.confirm(a.publication(), a.confirmed()));
    }
    // Before the first acknowledgement P had no lead and ran this seat's input early: re-simulations; then the lead is
    // built (6 ticks) and every publication verifies.
    expect(results.slice(-10)).toEqual(Array(10).fill('verified'));
    expect(p.stats().lead).toBe(6);
    p.dispose();
  });
  it('re-simulates when the partner\'s held input changed inside the window, and lands on the authority\'s state', () => {
    // The partner stands up first (at L 5, a command P never predicts): seated at Weapons, its moveX moves nothing.
    const a = authority(), p = predictor(), stand: CommandEnvelope<DuelCommand> = { runId: 'r', id: { player: 1, sequence: 1 }, requestedTick: 0, command: { kind: 'stand' } };
    p.confirm(a.publication(), a.confirmed());
    for (let L = 1; L <= 30; L++) { p.tick(entry(L)); a.step([N(), N()], L === 5 ? [stand] : []); a.water.held[0] = L; if (a.d.interior.tick % 3 === 0) p.confirm(a.publication(), a.confirmed()); }
    for (let L = 31; L <= 33; L++) { p.tick(entry(L)); a.step([N(), { ...N(), moveX: 1 }]); a.water.held[0] = L; }
    expect(p.confirm(a.publication(), a.confirmed())).toBe('resimulated');
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));   // lead 0 here: P stands on the confirmed tick
    p.dispose();
  });
  it('a command stays in P from its local tick on, through publications that acknowledge its held frame before the command runs', () => {
    // The Valkyrn's Helm takes the throttle command (the Cutter's crew Helm holds W/S instead). Held frames reach the
    // authority 3 ticks after they are sent; the throttle command, on the reliable channel, runs 5 ticks after.
    const a = authority(4, ShipClass.Valkyrn), p = predictor(), seen: number[] = [];
    p.confirm(a.publication(), a.confirmed());
    for (let L = 1; L <= 30; L++) {
      p.tick(entry(L, N(), L === 10 ? [cmd(1, { kind: 'throttle', level: 2 })] : []));
      a.step([N(), N()], L === 15 ? [cmd(1, { kind: 'throttle', level: 2 })] : []);
      a.water.held[0] = Math.max(0, L - 3); a.water.command[0] = L >= 15 ? 1 : 0;
      if (a.d.interior.tick % 3 === 0) p.confirm(a.publication(), a.confirmed());
      if (L >= 10) seen.push(p.state()!.throttle);
    }
    expect(seen.every((t) => t === 2)).toBe(true);   // never flickers back while in flight
    expect(a.d.throttle).toBe(2);   // and the authority applied it once
    p.dispose();
  });
  it('a predicted stand the authority never runs is taken back: the correction reports reseated (plan deviation 3)', () => {
    // Seat 0, seated at Navigation, stands at L 1; the authority refuses or loses it (the command watermark passes it
    // and the character stays seated), so the re-simulation seats P again. A correction with no seat change is not reseated.
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    p.tick(entry(1, N(), [cmd(1, { kind: 'stand' })]));
    a.step([N(), N()]); a.water.held[0] = 1; a.water.command[0] = 1;
    for (let L = 2; L <= 3; L++) { p.tick(entry(L)); a.step([N(), N()]); a.water.held[0] = L; }
    expect(p.confirm(a.publication(), a.confirmed())).toBe('resimulated');
    expect(p.stats().correction?.reseated).toBe(true);
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));
    // This seat's throttle frame at L 4 is lost (the authority latches neutral for it): a correction, still seated.
    for (let L = 4; L <= 6; L++) { p.tick(entry(L, L === 4 ? { ...N(), throttleHeld: 1 } : N())); a.step([N(), N()]); a.water.held[0] = L; }
    expect(p.confirm(a.publication(), a.confirmed())).toBe('resimulated');
    expect(p.stats().correction?.reseated).toBe(false);
    p.dispose();
  });
  it('a predicted sit the authority refuses or never runs is taken back: the correction reports reseated (plan deviation 3)', () => {
    // Seat 0 stands from Navigation and the authority runs it; then P predicts a sit at Navigation that the authority
    // never runs (the command watermark passes it and the character stays standing), so the re-simulation stands P again.
    const a = authority(), p = predictor(), nav = a.d.nav;
    p.confirm(a.publication(), a.confirmed());
    p.tick(entry(1, N(), [cmd(1, { kind: 'stand' })]));
    a.step([N(), N()], [cmd(1, { kind: 'stand' })]); a.water.held[0] = 1; a.water.command[0] = 1;
    for (let L = 2; L <= 3; L++) { p.tick(entry(L)); a.step([N(), N()]); a.water.held[0] = L; }
    p.confirm(a.publication(), a.confirmed());
    p.tick(entry(4, N(), [cmd(2, { kind: 'sit', station: nav })]));
    a.step([N(), N()]); a.water.held[0] = 4; a.water.command[0] = 2;
    for (let L = 5; L <= 6; L++) { p.tick(entry(L)); a.step([N(), N()]); a.water.held[0] = L; }
    expect(p.confirm(a.publication(), a.confirmed())).toBe('resimulated');
    expect(p.stats().correction?.reseated).toBe(true);
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));
    p.dispose();
  });
  it('at the cap the view holds: before() is P\'s own bodies, so the blend draws P on every capped tick (I1, §3.5)', () => {
    const a = authority(), p = predictor(), held = { ...N(), throttleHeld: 1 };
    p.confirm(a.publication(), a.confirmed());
    for (let L = 1; L <= PREDICT_MAX_TICKS; L++) expect(p.tick(entry(L, held))).toBe(true);
    const ship = () => { const s = p.state()!.tactical.ships[0]!; return { x: s.x, y: s.y, h: s.heading + s.headingAcc }; };
    expect(p.before()!.ships[0]).not.toEqual(ship());   // stepping: before() is the bodies one step back
    for (let L = PREDICT_MAX_TICKS + 1; L <= PREDICT_MAX_TICKS + 3; L++) {
      expect(p.tick(entry(L, held))).toBe(false);
      expect(p.before()!.ships[0]).toEqual(ship());
    }
    const held1 = p.before();
    p.tick(entry(PREDICT_MAX_TICKS + 4, held));
    expect(p.before()).toBe(held1);   // set once on the cap path, not rebuilt every capped tick
    p.dispose();
  });
  it('never stands more than PREDICT_MAX_TICKS past the confirmed tick: tick() is false there and logs the entry', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    const T = a.d.interior.tick;
    for (let L = 1; L <= PREDICT_MAX_TICKS; L++) expect(p.tick(entry(L))).toBe(true);
    expect(p.tick(entry(PREDICT_MAX_TICKS + 1))).toBe(false);
    expect(p.state()!.interior.tick).toBe(T + PREDICT_MAX_TICKS);
    p.dispose();
  });
  it('a pause resets and stops stepping; the resume resets and starts again from it', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    p.tick(entry(1)); a.step([N(), N()]);
    a.pause(true);
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect([p.active(), p.tick(entry(2))]).toEqual([false, false]);
    a.pause(false);
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect([p.active(), p.tick(entry(3))]).toEqual([true, true]);
    p.dispose();
  });
  it('a decided round is a reset every publication: P is the confirmed state and does not step', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    a.d.tactical.outcome = Outcome.CrewWins; a.d.decidedTick = a.d.interior.tick;
    expect(p.confirm(a.publication(), a.confirmed())).toBe('reset');
    expect([p.active(), p.tick(entry(1))]).toEqual([false, false]);
    expect(hashDuel(p.state()!)).toBe(hashDuel(a.d));
    p.dispose();
  });
  it('a different seed (a new round) replaces P', () => {
    const a = authority(4), b = authority(5), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    const first = p.state();
    expect(p.confirm(b.publication(), b.confirmed())).toBe('reset');
    expect(p.state()).not.toBe(first);
    expect(p.state()!.tactical.seed).toBe(b.d.tactical.seed);
    p.dispose();
  });
  it('the input key sees every held field: a partner\'s new reticle or selection alone is a different input (R1-F7)', () => {
    const base = { ...N(), weaponSel: 0, turretAim: 4000 };
    for (const changed of [{ ...base, turretAim: 4001 }, { ...base, weaponSel: 1 }, { ...base, torpHeading: 3 }, { ...base, gunHeld: true }])
      expect(heldKey(changed)).not.toBe(heldKey(base));
    expect(heldKey({ ...base })).toBe(heldKey(base));
  });
  it('records the hash of P on cadence ticks only', () => {
    const a = authority(), p = predictor();
    p.confirm(a.publication(), a.confirmed());
    const T = a.d.interior.tick;
    for (let L = 1; L <= 6; L++) p.tick(entry(L));
    for (let k = T + 1; k <= T + 6; k++) expect(p.hashAt(k) !== null).toBe(k % 3 === 0);
    p.dispose();
  });
});
