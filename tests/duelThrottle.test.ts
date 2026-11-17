// Artemis-ii (spec 2026-11-17-artemis-consoles §5.1, §5.2, §5.6): the helm module's throttle, its command and wire, its
// snapshot bounds and the 42 → 43 alias table. Task 2 adds the flight (§5.3).
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES, helmModule } from '../src/renderer/src/sim/duel/modules';
import { moduleLength, type SimModule } from '../src/renderer/src/sim/module';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { clampThrottle, THROTTLE_MAX, THROTTLE_MIN, throttleThrust, validThrottle } from '../src/renderer/src/sim/duel/throttle';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { aliasPlan, duelSchema, MIGRATIONS } from '../scripts/golden/duelOracle';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope =>
  ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const throttle = (level: number): DuelCommand => ({ kind: 'throttle', level });
/** The flattened offset of helm.throttle: after SIM_VERSION and every module before helm. */
function helmOffset(d: DuelState): number {
  let at = 1;
  for (const { module, state } of DUEL_MODULES) { if (module.id === 'helm') return at; at += moduleLength(module as SimModule<unknown>, state(d)); }
  throw new Error('no helm module');
}
// createDuel seats player 0 at the Helm (nav) and player 1 at Weapons.

describe('the throttle levels (Artemis spec §5.1, §5.3)', () => {
  it('are the integers −1..4; thrust is −1 for reverse and a quarter a notch forward; clamping rounds into range', () => {
    expect([THROTTLE_MIN, THROTTLE_MAX]).toEqual([-1, 4]);
    expect([-1, 0, 1, 2, 3, 4].map((v) => validThrottle(v))).toEqual(Array(6).fill(true));
    expect([-2, 5, 0.5, NaN, Infinity, '2', null].map((v) => validThrottle(v))).toEqual(Array(7).fill(false));
    expect([-1, 0, 1, 2, 3, 4].map(throttleThrust)).toEqual([-1, 0, 0.25, 0.5, 0.75, 1]);
    expect([-5, -1, 0, 2.4, 9, NaN, -0.2].map(clampThrottle)).toEqual([-1, -1, 0, 2, 4, 0, 0]);
    expect(Object.is(clampThrottle(-0.2), 0)).toBe(true);
  });
});

describe('the helm module (Artemis spec §5.1)', () => {
  it('sits after round and before interior, owns throttle, and its field moves the duel hash', () => {
    expect(DUEL_MODULES.map(({ module }) => module.id)).toEqual(['space', 'ship', 'presence', 'repair', 'round', 'helm', 'interior']);
    expect([helmModule.commands, helmModule.reasons]).toEqual([['throttle'], ['invalid-seat', 'malformed', 'stale-tick']]);
    const d = createDuel(CUTTER, 5);
    try {
      expect(d.throttle).toBe(0);
      const base = hashDuel(d);
      d.throttle = 2; expect(hashDuel(d)).not.toBe(base);
      d.throttle = 0; expect(hashDuel(d)).toBe(base);
    } finally { disposeDuel(d); }
  });
});

describe('the throttle command (Artemis spec §5.2)', () => {
  it('admits in order: stale-tick, then invalid-seat, then malformed, then noop, else applied', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const r = step(d, [
        cmd(d, 1, throttle(9), d.interior.tick + 1),   // stale comes before the seat
        cmd(d, 1, throttle(9)),                        // Weapons is not the Helm: the seat comes before malformed
        cmd(d, 0, throttle(5)), cmd(d, 0, throttle(-2)), cmd(d, 0, throttle(0.5)), cmd(d, 0, throttle(NaN)),
        cmd(d, 0, throttle(0)),                        // already at 0
        cmd(d, 0, throttle(3))
      ]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([
        [0, 'malformed'], [0, 'malformed'], [0, 'malformed'], [0, 'malformed'], [0, 'noop'], [0, 'applied'], [1, 'stale-tick'], [1, 'invalid-seat']
      ]);
      expect(d.throttle).toBe(3);
    } finally { disposeDuel(d); }
  });
  it('envelope order holds within a tick and the last applied level wins; a repeat of the new level is noop', () => {
    const d = createDuel(CUTTER, 5);
    try {
      expect(step(d, [cmd(d, 0, throttle(2)), cmd(d, 0, throttle(4)), cmd(d, 0, throttle(4))]).map((x) => x.status)).toEqual(['applied', 'applied', 'noop']);
      expect(d.throttle).toBe(4);
    } finally { disposeDuel(d); }
  });
  it('only the present Helm attendant may set it: an away Helm player and an empty Helm are invalid-seat', () => {
    const d = createDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, { kind: 'presence', present: false })]);
      expect(step(d, [cmd(d, 0, throttle(2))])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      step(d, [cmd(d, 0, { kind: 'presence', present: true })]);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      expect(step(d, [cmd(d, 0, throttle(2))])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      expect(d.throttle).toBe(0);
    } finally { disposeDuel(d); }
  });
  it('is kept across stand and sit, answered duel-decided on the end card, and reset to 0 by a new round', () => {
    const d = createDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, throttle(3))]);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      expect(d.throttle).toBe(3);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]!.status).toBe('applied');
      expect(d.throttle).toBe(3);
      d.tactical.systems[1].hull = 0; step(d);   // the hunter is down: the round is decided
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(step(d, [cmd(d, 0, throttle(1))])[0]).toMatchObject({ status: 'rejected', reason: 'duel-decided' });
      expect(d.throttle).toBe(3);
      step(d, [cmd(d, 0, { kind: 'rematch' })]);
      expect([d.round, d.throttle]).toEqual([1, 0]);
    } finally { disposeDuel(d); }
  });
});

describe('the throttle on the wire (Artemis spec §5.2)', () => {
  it('the duel codec round-trips any finite level and refuses a missing, non-numeric or infinite one, or an extra key', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const level of [-1, 0, 4, 0.5, 9]) expect(codec.decodeMessage(codec.encodeMessage(envelope({ kind: 'throttle', level })))).toEqual(envelope({ kind: 'throttle', level }));
    for (const bad of [{ kind: 'throttle' }, { kind: 'throttle', level: '2' }, { kind: 'throttle', level: Infinity }, { kind: 'throttle', level: 1, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
});

describe('the throttle in the snapshot (Artemis spec §5.1)', () => {
  it('round-trips mid-throttle and refuses a level that is not an integer in −1..4, even rehashed', () => {
    const d = createDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, throttle(-1))]);
      const snap = saveDuelSnapshot(d, DIGEST), at = helmOffset(d);
      expect(snap.values[at]).toBe(-1);
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST);
      try { expect([r.throttle, hashDuel(r)]).toEqual([-1, hashDuel(d)]); } finally { disposeDuel(r); }
      for (const bad of [7, 0.5, -2]) {
        const s = structuredClone(snap); s.values[at] = bad; s.header.hash = hashF64(Float64Array.from(s.values));
        expect(() => validateDuelSnapshot(CUTTER, s, DIGEST), `throttle ${bad}`).toThrow(new RegExp(`throttle ${bad} is invalid`));
      }
    } finally { disposeDuel(d); }
  });
});

describe('the 42 → 43 alias table (Artemis spec §5.6)', () => {
  it('declares helm.throttle added, after the round module, and maps every other field to itself', () => {
    const m = MIGRATIONS[42]!;
    expect(m.change).toBe('Artemis-ii: helm throttle');
    const d = createDuel(CUTTER, 1);
    try {
      const now = duelSchema(d), k = now.names.indexOf('helm.throttle');
      expect(k).toBe(now.names.indexOf('round.decidedTick') + 1);
      const oldNames = now.names.filter((_, i) => i !== k), oldCounts = now.counts.filter((_, i) => i !== k);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts, m).problems).toEqual([]);
      expect(aliasPlan(oldNames, oldCounts, now.names, now.counts).problems).toEqual(['new field helm.throttle is neither mapped nor declared added']);
    } finally { disposeDuel(d); }
  });
});
