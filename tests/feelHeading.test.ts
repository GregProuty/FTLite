// Feel-ii (spec 2026-11-18-feel-ii-design §1.1): click-to-heading. The Helm's `heading` command sets a held heading in the
// helm module (−1 clears it); the ship turns to that bearing by auto-face's turn law and holds it; A/D or auto-face held
// at the Helm clears it. Admission like the throttle; it rides the hash, the snapshot and the wire.
import { describe, expect, it } from 'vitest';
import { hashF64 } from '../src/shared/hash';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_MODULES } from '../src/renderer/src/sim/duel/modules';
import { moduleLength, type SimModule } from '../src/renderer/src/sim/module';
import { loadDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { helmTurn, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { validHoldHeading } from '../src/renderer/src/sim/duel/throttle';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { headingTurn } from '../src/renderer/src/sim/tactical/hunter';
import { createTacticalState, Outcome, Room } from '../src/renderer/src/sim/tactical/state';
import { heldTurn } from '../src/renderer/src/app/duel/runtime';
import { createSeatedDuel } from './helpers/duelSeat';
import { CUTTER } from './helpers/scriptedDuel';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope =>
  ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput[] = [NONE, NONE]) => stepDuelTick(d, { held, commands });
const heading = (h: number): DuelCommand => ({ kind: 'heading', heading: h });
/** The unsigned angle (heading steps, 0..128) between two heading indices. */
const apart = (a: number, b: number): number => { const k = (((a - b) % 256) + 256) % 256; return Math.min(k, 256 - k); };
function holdAt(d: DuelState): number {
  let at = 1;
  for (const { module, state } of DUEL_MODULES) { if (module.id === 'helm') return at + 1; at += moduleLength(module as SimModule<unknown>, state(d)); }
  throw new Error('no helm module');
}
// createSeatedDuel seats player 0 at the Helm and player 1 at Weapons.

describe('headingTurn (Feel-ii §1.1)', () => {
  it('is auto-face\'s turn law toward a fixed bearing: none inside the dead band, the short way otherwise, clockwise dead astern', () => {
    const t = createTacticalState(5);
    t.ships[0].heading = 0;
    expect(headingTurn(t, 0, 0)).toBe(0);
    expect(headingTurn(t, 0, 1)).toBe(0);   // 1.4°, inside sin 2.5°
    expect(headingTurn(t, 0, 10)).toBe(1);
    expect(headingTurn(t, 0, 246)).toBe(-1);
    expect(headingTurn(t, 0, 128)).toBe(1);
    expect(validHoldHeading(-1) && validHoldHeading(0) && validHoldHeading(255)).toBe(true);
    expect([-2, 256, 0.5, NaN, '3', null].some((v) => validHoldHeading(v))).toBe(false);
  });
});

describe('the heading command (Feel-ii §1.1)', () => {
  it('admits in order: stale-tick, then invalid-seat, then malformed, then noop, else applied', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const r = step(d, [
        cmd(d, 1, heading(300), d.interior.tick + 1),
        cmd(d, 1, heading(300)),   // Weapons is not the Helm
        cmd(d, 0, heading(256)), cmd(d, 0, heading(-2)), cmd(d, 0, heading(0.5)),
        cmd(d, 0, heading(-1)),    // nothing held yet
        cmd(d, 0, heading(64))
      ]);
      expect(r.map((x) => [x.id.player, x.reason ?? x.status])).toEqual([
        [0, 'malformed'], [0, 'malformed'], [0, 'malformed'], [0, 'noop'], [0, 'applied'], [1, 'stale-tick'], [1, 'invalid-seat']
      ]);
      expect(d.holdHeading).toBe(64);
    } finally { disposeDuel(d); }
  });
  it('turns the ship onto the bearing and holds it there, at the throttle\'s thrust', () => {
    const d = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      const target = (d.tactical.ships[0].heading + 100) % 256;
      step(d, [cmd(d, 0, heading(target)), cmd(d, 0, { kind: 'throttle', level: 2 })]);
      for (let k = 0; k < 90; k++) step(d);
      expect(apart(d.tactical.ships[0].heading, target)).toBeLessThanOrEqual(2);
      for (let k = 0; k < 120; k++) step(d);
      expect(apart(d.tactical.ships[0].heading, target)).toBeLessThanOrEqual(2);   // held, no chatter out of the band
      expect(d.holdHeading).toBe(target);
    } finally { disposeDuel(d); }
  });
  it('A/D or auto-face held at the Helm clears it, a −1 clears it; Weapons\' held keys do not', () => {
    for (const [held, cleared] of [[{ ...NONE, moveX: 1 }, true], [{ ...NONE, moveX: -1 }, true], [{ ...NONE, face: true }, true], [NONE, false]] as const) {
      const d = createSeatedDuel(CUTTER, 5);
      try {
        step(d, [cmd(d, 0, heading(40))]);
        step(d, [], [held, { ...NONE, moveX: 1, face: true }]);
        expect(d.holdHeading, JSON.stringify(held)).toBe(cleared ? -1 : 40);
      } finally { disposeDuel(d); }
    }
    const d = createSeatedDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, heading(40))]);
      expect(step(d, [cmd(d, 0, heading(-1))])[0]!.status).toBe('applied');
      expect(d.holdHeading).toBe(-1);
    } finally { disposeDuel(d); }
  });
  it('A/D wins the tick it clears it; the predicted turn (helmTurn, the runtime\'s heldTurn) is the sim\'s', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const target = (d.tactical.ships[0].heading + 60) % 256;
      step(d, [cmd(d, 0, heading(target))]);
      expect(helmTurn(d, NONE)).toBe(1);
      expect(heldTurn(d, NONE)).toBe(1);
      expect(helmTurn(d, { ...NONE, moveX: -1 })).toBe(-1);
      const h0 = d.tactical.ships[0].heading + d.tactical.ships[0].headingAcc;
      step(d, [], [{ ...NONE, moveX: -1 }, NONE]);
      expect(d.tactical.ships[0].heading + d.tactical.ships[0].headingAcc - h0).toBeLessThan(0);
    } finally { disposeDuel(d); }
  });
  it('is kept across stand and sit, duel-decided on the end card, and −1 in a new round', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      step(d, [cmd(d, 0, heading(90))]);
      expect(step(d, [cmd(d, 0, { kind: 'stand' })])[0]!.status).toBe('applied');
      expect([d.holdHeading, helmTurn(d, NONE) !== 0]).toEqual([90, true]);   // the rule; playtest2feedback §3: the unattended crew Helm now turns onto it too
      const h0 = d.tactical.ships[0].heading;
      step(d);
      expect(apart(d.tactical.ships[0].heading, 90)).toBeLessThan(apart(h0, 90));   // playtest2feedback §3: an unattended crew Helm turns onto its held heading
      expect(step(d, [cmd(d, 0, heading(10))])[0]).toMatchObject({ status: 'rejected', reason: 'invalid-seat' });
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]!.status).toBe('applied');
      expect(d.holdHeading).toBe(90);
      d.tactical.systems[1].hull = 0; step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(step(d, [cmd(d, 0, heading(5))])[0]).toMatchObject({ status: 'rejected', reason: 'duel-decided' });
      step(d, [cmd(d, 0, { kind: 'rematch' })]);
      expect([d.round, d.holdHeading]).toEqual([1, -1]);
    } finally { disposeDuel(d); }
  });
  it('with Engines off (level 2) the held heading turns nothing, and is held for the repair', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      d.tactical.systems[0].rooms[Room.Engines] = 2;
      const h0 = d.tactical.ships[0].heading;
      step(d, [cmd(d, 0, heading((h0 + 64) % 256))]);
      for (let k = 0; k < 30; k++) step(d);
      expect([d.tactical.ships[0].heading, d.holdHeading]).toEqual([h0, (h0 + 64) % 256]);
    } finally { disposeDuel(d); }
  });
});

describe('the held heading in the hash, the snapshot and on the wire (Feel-ii §1.1)', () => {
  it('moves the duel hash, round-trips the snapshot and refuses a bad value even rehashed', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const base = hashDuel(d);
      d.holdHeading = 17; expect(hashDuel(d)).not.toBe(base);
      d.holdHeading = -1; expect(hashDuel(d)).toBe(base);
      step(d, [cmd(d, 0, heading(200))]);
      const snap = saveDuelSnapshot(d, DIGEST), at = holdAt(d);
      expect(snap.values[at]).toBe(200);
      const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(snap)), DIGEST);
      try { expect([r.holdHeading, hashDuel(r)]).toEqual([200, hashDuel(d)]); } finally { disposeDuel(r); }
      for (const bad of [256, 0.5, -2]) {
        const s = structuredClone(snap); s.values[at] = bad; s.header.hash = hashF64(Float64Array.from(s.values));
        expect(() => validateDuelSnapshot(CUTTER, s, DIGEST), `held heading ${bad}`).toThrow(/held heading/);
      }
    } finally { disposeDuel(d); }
  });
  it('the duel codec round-trips any finite heading and refuses a missing, non-numeric or infinite one', () => {
    const codec = duelCodec(2), envelope = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 0, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const h of [-1, 0, 255, 0.5, 900]) expect(codec.decodeMessage(codec.encodeMessage(envelope(heading(h))))).toEqual(envelope(heading(h)));
    for (const bad of [{ kind: 'heading' }, { kind: 'heading', heading: '2' }, { kind: 'heading', heading: Infinity }, { kind: 'heading', heading: 1, extra: 1 }])
      expect(() => codec.encodeMessage(envelope(bad)), JSON.stringify(bad)).toThrow();
  });
  it('heading points along hx, hy (a sanity check of the bearing convention the map uses)', () => {
    expect([hx(0), hy(0)].map((v) => Math.round(v))).toEqual([0, -1]);   // north is screen up
    expect([hx(64), hy(64)].map((v) => Math.round(v))).toEqual([1, 0]);   // 90° clockwise is east
  });
});
