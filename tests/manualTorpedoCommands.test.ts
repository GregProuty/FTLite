// W-3 manual torpedo (spec 2026-11-18-pew-pew-weapons-design §3, §4, §5): torpMode and the held heading on the wire and
// through the duel step and the authority.
// - The codec round-trips torpMode and the held torpHeading, and refuses anything else (W-4 spec §7: a frame carrying
//   torpTurn is malformed).
// - The step admits torpMode from the Weapons attendant only and sets the mode before a same-tick missileLaunch, which
//   in MANUAL needs no range.
// - The Weapons attendant's held torpHeading flies a MANUAL torpedo; anyone else's does not.
// - The authority carries them into its checkpoint and replay, and a pause or an expired frame clears them.
import { describe, expect, it } from 'vitest';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { parseEncounterReplay } from '../src/renderer/src/authority/replay';
import type { CommandEnvelope, HeldInput } from '../src/renderer/src/net/contracts';
import { duelCodec } from '../src/renderer/src/net/codec';
import { REMOTE_HELD_TIMEOUT_MS } from '../src/renderer/src/net/receivePolicy';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { heldTorpHeading, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { classOf, missileOf, placeMissile, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { RockKind, rockSlots, ROCK_STRIDE } from '../src/renderer/src/sim/tactical/rocks';
import { torpedoInRange } from '../src/renderer/src/sim/tactical/weapons';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { liveDuel } from './helpers/liveDuel';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand, requestedTick = d.interior.tick): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick, command });
/** One step: player 1 holds `held1`, player 0 `held0`. */
const step = (d: DuelState, commands: DuelEnvelope[] = [], held1: HeldInput = NONE, held0: HeldInput = NONE) => stepDuelTick(d, { held: [held0, held1], commands });
const why = (r: ReturnType<typeof step>) => r.map((x) => x.reason ?? x.status);
/** A Cutter duel with player 0 standing and player 1 at Weapons. */
function gunnerAtWeapons(): DuelState { const d = createDuel(CUTTER, 5); sitDown(d.interior, 1, d.weapons); return d; }
const mode = (manual: boolean): DuelCommand => ({ kind: 'torpMode', manual });
/** The crew at (0, 1500) nose north and still, the enemy far beyond torpedo range at (0, −1500). */
function apart(t: TacticalState): void {
  Object.assign(t.ships[0], { x: 0, y: 1500, vx: 0, vy: 0, heading: 0, headingAcc: 0 });
  Object.assign(t.ships[1], { x: 0, y: -1500, vx: 0, vy: 0 });
}
/** The crew's MANUAL torpedo 200 north of the crew, still, nose north, past its boost. */
const flying = (t: TacticalState) => placeMissile(t, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('torpMode and the held steering on the wire (spec §4)', () => {
  it('torpMode round-trips through the duel codec; a wrong type, a missing or an extra field does not pass', () => {
    const codec = duelCodec(2), env = (command: unknown) => ({ kind: 'command' as const, envelope: { runId: 'r', id: { player: 1, sequence: 1 }, requestedTick: 0, command } as CommandEnvelope });
    for (const good of [env({ kind: 'torpMode', manual: true }), env({ kind: 'torpMode', manual: false })]) expect(codec.decodeMessage(codec.encodeMessage(good))).toEqual(good);
    for (const bad of [{ kind: 'torpMode', manual: 1 }, { kind: 'torpMode' }, { kind: 'torpMode', manual: true, extra: 1 }]) expect(() => codec.encodeMessage(env(bad))).toThrow();
  });
  it('the held frame carries torpHeading −1..255, integers only; a frame carrying torpTurn is malformed (W-4 spec §7)', () => {
    const codec = duelCodec(2), frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 1, tick: 0, sequence: 1, held: { ...NONE, ...held } } });
    for (const good of [{ torpHeading: 40 }, { torpHeading: -1 }, { torpHeading: 255 }]) expect(codec.decodeMessage(raw(frame(good)))).toEqual(frame(good));
    for (const bad of [{ torpTurn: 1 }, { torpTurn: 0 }, { torpTurn: 1, torpHeading: 40 }, { torpHeading: 256 }, { torpHeading: -2 }, { torpHeading: 2.5 }])
      expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
});

describe('torpMode through the duel step (spec §3)', () => {
  it('the gunner sets it; the same value again is noop', () => {
    const d = gunnerAtWeapons();
    try {
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].torpManual).toBe(true);
      expect(why(step(d, [cmd(d, 1, mode(true))]))).toEqual(['noop']);
      expect(why(step(d, [cmd(d, 1, mode(false))]))).toEqual(['applied']);
      expect(d.tactical.systems[0].torpManual).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('rejects a stale tick, a sender away from Weapons and a malformed value', () => {
    const d = gunnerAtWeapons();
    try {
      const r = step(d, [cmd(d, 1, mode(true), d.interior.tick + 1), cmd(d, 0, mode(true)), cmd(d, 1, { kind: 'torpMode', manual: 1 } as unknown as DuelCommand)]);
      expect(why(r)).toEqual(['not-at-weapons', 'stale-tick', 'malformed']);   // sorted by player, then sequence
      expect(d.tactical.systems[0].torpManual).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('in MANUAL missileLaunch needs no range; in AUTO it is unavailable out of range', () => {
    const d = gunnerAtWeapons();
    try {
      apart(d.tactical);
      expect(torpedoInRange(d.tactical, 0)).toBe(false);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' })]))).toEqual(['unavailable']);
      d.tactical.systems[0].torpManual = true;
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' })]))).toEqual(['applied']);
      expect(missileOf(d.tactical, 0)?.manual).toBe(true);
    } finally { disposeDuel(d); }
  });
  it('torpMode takes effect before a missileLaunch in the same tick, whatever their envelope order', () => {
    const d = gunnerAtWeapons();
    try {
      apart(d.tactical);
      expect(why(step(d, [cmd(d, 1, { kind: 'missileLaunch' }), cmd(d, 1, mode(true))]))).toEqual(['applied', 'applied']);
      expect(missileOf(d.tactical, 0)?.manual).toBe(true);
    } finally { disposeDuel(d); }
  });
});

describe('the held steering through the duel step (spec §3)', () => {
  it('heldTorpHeading: a whole heading index or none (W-4 spec §7)', () => {
    expect(heldTorpHeading(NONE)).toBe(-1);
    expect([heldTorpHeading({ ...NONE, torpHeading: 40 }), heldTorpHeading({ ...NONE, torpHeading: 0 })]).toEqual([40, 0]);
    for (const bad of [256, -1, 1.5, Number.NaN]) expect(heldTorpHeading({ ...NONE, torpHeading: bad })).toBe(-1);
  });
  it('the gunner\'s torpHeading turns the MANUAL torpedo; the standing player\'s does not', () => {
    const d = gunnerAtWeapons(), turn = classOf(d.tactical, 0).slots.missile.turnStepsPerTick;
    try {
      apart(d.tactical);
      // Asteroids-iii (SIM_VERSION 60, lanes): the spot at ρ 1300 lies on the outer lane, where seeded rock 60 took the
      // torpedo; no rock is in the way, so the test measures only the steering.
      for (let k = 0; k < rockSlots(d.tactical); k++) d.tactical.rocks[k * ROCK_STRIDE] = RockKind.Gone;
      const m = flying(d.tactical);
      for (let k = 0; k < 10; k++) step(d, [], NONE, { ...NONE, torpHeading: 64 });   // player 0 stands: not Weapons
      expect(m.heading).toBe(0);
      for (let k = 0; k < 10; k++) step(d, [], { ...NONE, torpHeading: 64 });   // W-4 spec §7: the held heading steers
      expect(m.heading).toBe(Math.floor(10 * turn));
    } finally { disposeDuel(d); }
  });
});

describe('the authority carries the held steering (spec §4)', () => {
  /** An authority duel with player 1 at Weapons and the crew's MANUAL torpedo flying. */
  const torpDuel = (runId: string) => liveDuel(duelInit(5, runId), (s) => {
    sitDown(s.duel.interior, 1, s.duel.weapons);
    apart(s.duel.tactical);
    s.duel.tactical.systems[0].torpManual = true;
    flying(s.duel.tactical);
  });
  const heldOf = (l: ReturnType<typeof torpDuel>) => (JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint).held[1]!;
  it('a held torpHeading from the gunner flies the torpedo, and rides into the checkpoint and the replay', () => {
    const l = torpDuel('torp-wire');
    for (let k = 0; k < 6; k++) { l.held(1, { ...NONE, torpHeading: 40 }); l.tick(); }
    expect(missileOf(l.state.duel.tactical, 0)!.heading).toBeGreaterThan(0);
    const cp = JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[1]).toEqual({ ...NONE, torpHeading: 40 });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    expect(() => validateDuelCheckpoint({ ...cp, held: [cp.held[0]!, { ...NONE, torpTurn: 1 } as HeldInput] }, DIGEST, resolveCutter)).toThrow();   // W-4 spec §7: an unknown key now
    const replay = JSON.parse(JSON.stringify(l.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"torpHeading":40');
  });
  it('a pause deletes them, and an expired held frame is neutralised', () => {
    const l = torpDuel('torp-pause');
    l.held(1, { ...NONE, torpHeading: 40 }); l.tick();
    expect(heldOf(l)).toMatchObject({ torpHeading: 40 });
    l.command(0, { kind: 'setPaused', paused: true }); l.tick();
    expect('torpHeading' in heldOf(l)).toBe(false);
    const e = torpDuel('torp-expire');
    e.held(1, { ...NONE, torpHeading: 40 }); e.tick();
    expect(heldOf(e)).toMatchObject({ torpHeading: 40 });
    e.tick(Math.ceil(REMOTE_HELD_TIMEOUT_MS / (1000 / 60)) + 2);
    expect(heldOf(e).torpHeading).toBeUndefined();
  });
});
