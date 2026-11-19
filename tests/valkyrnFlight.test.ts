// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §4.4, §6.2, §10 Aim and Crew of one): mouse aim. A held `aim`
// (a heading index, −1 or absent for none, anything else none) turns the Helm by aimTurn's three-index band, after A/D
// and auto-face; a valid aim sets the held heading, so the Valkyrn's empty Helm flies its throttle and that bearing
// (helmHoldsUnattended) while the Hound's empty Helm flies zero axes; aim and gunHeld ride the codec, the checkpoint and
// the replay, and the aim the hash and snapshot through the held heading.
import { describe, expect, it } from 'vitest';
import { DuelSystem } from '../src/renderer/src/sim/tactical/bars';
import { validateDuelCheckpoint, type DuelCheckpoint } from '../src/renderer/src/authority/duelCheckpoint';
import { duelRules } from '../src/renderer/src/authority/duelRules';
import { parseEncounterReplay } from '../src/renderer/src/authority/replay';
import { duelCodec } from '../src/renderer/src/net/codec';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { loadDuelSnapshot, saveDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { disposeDuel, DUEL_CREW_MAX, type DuelState } from '../src/renderer/src/sim/duel/state';
import { aimTurn, heldAim, helmTurn, stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { autoFaceTurn, headingTurn } from '../src/renderer/src/sim/tactical/hunter';
import { cloneTactical, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { duelInit, resolveCutter } from './helpers/duelAuthority';
import { createSeatedDuel } from './helpers/duelSeat';
import { liveDuel } from './helpers/liveDuel';
import { createSeatedValkyrn, VALKYRN_TEST } from './helpers/valkyrnDuel';
import { sitDown } from '../src/renderer/src/sim/stations';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { REMOTE_HELD_TIMEOUT_MS } from '../src/renderer/src/net/receivePolicy';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
/** One step; player 0 holds `held`, everyone else nothing. */
const step = (d: DuelState, commands: DuelEnvelope[] = [], held: HeldInput = NONE) =>
  stepDuelTick(d, { held: Array.from({ length: d.interior.playerCount }, (_, p) => (p === 0 ? held : NONE)), commands });
/** The unsigned angle (heading steps, 0..128) between two heading indices. */
const apart = (a: number, b: number): number => { const k = (((a - b) % 256) + 256) % 256; return Math.min(k, 256 - k); };
const body = (t: TacticalState) => { const s = t.ships[0]; return [s.x, s.y, s.vx, s.vy, s.heading, s.headingAcc]; };
const raw = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe('aimTurn and the held aim (spec §6.2)', () => {
  it('turns by the sign of the index difference, none within one index; dead astern turns anticlockwise', () => {
    expect([aimTurn(0, 0), aimTurn(0, 1), aimTurn(0, 255), aimTurn(255, 0), aimTurn(10, 9)]).toEqual([0, 0, 0, 0, 0]);
    expect([aimTurn(0, 2), aimTurn(0, 127), aimTurn(250, 4)]).toEqual([1, 1, 1]);
    expect([aimTurn(0, 254), aimTurn(0, 129), aimTurn(4, 250), aimTurn(0, 128)]).toEqual([-1, -1, -1, -1]);
  });
  it('a held aim is a heading index 0..255; anything else counts as none (−1)', () => {
    expect([0, 77, 255].map((aim) => heldAim({ ...NONE, aim }))).toEqual([0, 77, 255]);
    expect([undefined, -1, -2, 256, 2.5, Number.NaN, Infinity].map((aim) => heldAim({ ...NONE, aim }))).toEqual([-1, -1, -1, -1, -1, -1, -1]);
  });
  it('the Valkyrn\'s nose settles on a fixed aim within one index in under 60 ticks, never turning back', () => {
    const d = createSeatedValkyrn(5);
    try {
      const aim = (d.tactical.ships[0].heading + 100) % 256, held = { ...NONE, aim }, turns: number[] = [];
      for (let k = 0; k < 60; k++) { turns.push(helmTurn(d, held)); step(d, [], held); }
      expect(turns.every((t) => t === 0 || t === 1)).toBe(true);   // no sign flip
      expect(turns.slice(turns.indexOf(0)).every((t) => t === 0)).toBe(true);   // settled, it stays
      expect(apart(d.tactical.ships[0].heading, aim)).toBeLessThanOrEqual(1);
      expect(d.holdHeading).toBe(aim);
    } finally { disposeDuel(d); }
  });
  it('A/D and auto-face win over the aim; an invalid aim is none', () => {
    const d = createSeatedValkyrn(5);
    try {
      const aim = (d.tactical.ships[0].heading + 40) % 256;
      expect(helmTurn(d, { ...NONE, aim, moveX: -1 })).toBe(-1);
      expect(helmTurn(d, { ...NONE, aim, face: true })).toBe(autoFaceTurn(d.tactical, 0));
      expect(helmTurn(d, { ...NONE, aim })).toBe(1);
      for (const bad of [300, 2.5, Number.NaN]) expect(helmTurn(d, { ...NONE, aim: bad }), `aim ${bad}`).toBe(0);   // and no held heading
    } finally { disposeDuel(d); }
  });
  it('a valid aim sets the held heading; A/D or auto-face held clears it; an invalid aim leaves it', () => {
    const d = createSeatedValkyrn(5);
    try {
      step(d, [], { ...NONE, aim: 77 }); expect(d.holdHeading).toBe(77);
      step(d, [], { ...NONE, aim: 300 }); expect(d.holdHeading).toBe(77);
      step(d, [], { ...NONE, aim: 90, moveX: 1 }); expect(d.holdHeading).toBe(-1);
      step(d, [], { ...NONE, aim: 90 }); expect(d.holdHeading).toBe(90);
      step(d, [], { ...NONE, aim: 91, face: true }); expect(d.holdHeading).toBe(-1);
    } finally { disposeDuel(d); }
  });
  it('rides the hash and the snapshot through the held heading', () => {
    const a = createSeatedValkyrn(5), b = createSeatedValkyrn(5);
    try {
      step(a, [], { ...NONE, aim: 77 }); step(b, [], { ...NONE, aim: 78 });
      expect(hashDuel(a)).not.toBe(hashDuel(b));
      const r = loadDuelSnapshot(VALKYRN_TEST, JSON.parse(JSON.stringify(saveDuelSnapshot(a, DIGEST))), DIGEST);
      try { expect([r.holdHeading, hashDuel(r)]).toEqual([77, hashDuel(a)]); } finally { disposeDuel(r); }
    } finally { disposeDuel(a); disposeDuel(b); }
  });
});

describe('the empty Helm (spec §4.4)', () => {
  it('the Valkyrn flies its throttle and held heading with the pilot standing, exactly as a ship flown by those axes', () => {
    const d = createSeatedValkyrn(5);
    try {
      d.tactical.systems[0].bars[DuelSystem.Engines] = 4;   // Engineering spike spec §10.2 (fallout a): Engines starts at 3 bars (cap 3); a throttle of 4 needs the 4th bar
      const aim = (d.tactical.ships[0].heading + 64) % 256;
      step(d, [cmd(d, 0, { kind: 'throttle', level: 4 })], { ...NONE, aim });
      step(d, [cmd(d, 0, { kind: 'stand' })]);
      expect([d.interior.stations.occupant[d.nav], d.throttle, d.holdHeading]).toEqual([-1, 4, aim]);
      const ref = cloneTactical(d.tactical);
      for (let k = 0; k < 60; k++) {
        step(d);
        stepDuel(ref, { ...UNCREWED_INPUT, helm: true, axes: { turn: headingTurn(ref, 0, aim), thrust: 1 } });
      }
      expect(body(d.tactical)).toEqual(body(ref));
      expect(apart(d.tactical.ships[0].heading, aim)).toBeLessThanOrEqual(2);
    } finally { disposeDuel(d); }
  });
  it('the Hound flies zero axes with the Helm empty, whatever its throttle and held heading', () => {
    const d = createSeatedDuel(DUEL_LAYOUT, 5);
    try {
      d.tactical.systems[0].bars[DuelSystem.Engines] = 4;   // Engineering spike spec §10.2 (fallout a): Engines starts at 3 bars (cap 3); a throttle of 4 needs the 4th bar
      const h = (d.tactical.ships[0].heading + 64) % 256;
      step(d, [cmd(d, 0, { kind: 'throttle', level: 4 }), cmd(d, 0, { kind: 'heading', heading: h })]);
      step(d, [cmd(d, 0, { kind: 'stand' })]);
      expect([d.interior.stations.occupant[d.nav], d.throttle, d.holdHeading]).toEqual([-1, 4, h]);
      const ref = cloneTactical(d.tactical);
      for (let k = 0; k < 60; k++) { step(d); stepDuel(ref, { ...UNCREWED_INPUT, weapons: true }); }   // player 1 still sits at Weapons
      expect(body(d.tactical)).toEqual(body(ref));
    } finally { disposeDuel(d); }
  });
});

describe('aim and gunHeld on the held wire (spec §6.2, §7.1)', () => {
  const frame = (held: Record<string, unknown>) => ({ kind: 'held', frame: { runId: 'r', player: 0, tick: 0, sequence: 1, held: { moveX: 0, moveY: 0, interactHeld: false, ...held } } });
  it('the codec carries them and refuses anything but an integer index −1..255 and a boolean', () => {
    const codec = duelCodec(DUEL_CREW_MAX), ok = frame({ aim: 40, gunHeld: true });
    expect(codec.decodeMessage(raw(ok))).toEqual(ok);
    expect(codec.decodeMessage(raw(frame({ aim: -1 })))).toEqual(frame({ aim: -1 }));
    for (const bad of [{ aim: 256 }, { aim: -2 }, { aim: 2.5 }, { gunHeld: 1 }]) expect(() => codec.decodeMessage(raw(frame(bad))), JSON.stringify(bad)).toThrow();
  });
  it('they ride the authority\'s held frames into the checkpoint and the replay', () => {
    const live = liveDuel(duelInit(5, 'aim-wire'));
    live.held(0, { ...NONE, aim: 40, gunHeld: true });
    live.tick(2);
    const cp = JSON.parse(JSON.stringify(live.core.captureCheckpoint())) as DuelCheckpoint;
    expect(cp.held[0]).toEqual({ ...NONE, aim: 40, gunHeld: true });
    expect(() => validateDuelCheckpoint(cp, DIGEST, resolveCutter)).not.toThrow();
    expect(() => validateDuelCheckpoint({ ...cp, held: [{ ...NONE, aim: 256 }, cp.held[1]!] }, DIGEST, resolveCutter)).toThrow();
    const replay = JSON.parse(JSON.stringify(live.core.replay())) as unknown;
    expect(() => parseEncounterReplay(duelRules, replay, DIGEST, resolveCutter)).not.toThrow();
    expect(JSON.stringify(replay)).toContain('"aim":40');
  });
});

describe('the authority clears aim and gunHeld (spec §6.2)', () => {
  /** An online crew-of-two Hound whose layout names the gun class, player 0 seated at Weapons (so a held trigger fires). */
  const gunHound = parseShip({ ...hound, shipClass: 'valkyrn' });
  const gunDuel = (runId: string) => liveDuel(duelInit(5, runId, 1, gunHound), (s) => {
    expect(s.duel.crewClass).toBe(ShipClass.Valkyrn);
    sitDown(s.duel.interior, 0, s.duel.weapons);
  }, undefined, () => gunHound);
  const gunFires = (l: ReturnType<typeof gunDuel>) => l.state.duel.tactical.events.filter((e) => e.kind === 'gunFire' && e.ship === 0).length;
  const heldOf = (l: ReturnType<typeof gunDuel>) => (JSON.parse(JSON.stringify(l.core.captureCheckpoint())) as DuelCheckpoint).held[0]!;
  it('baseline: the held trigger fires the gun', () => {
    const l = gunDuel('held-fire');
    let fired = 0;
    for (let k = 0; k < 12; k++) { l.held(0, { ...NONE, aim: 40, gunHeld: true }); l.tick(); fired += gunFires(l); }
    expect(fired).toBeGreaterThan(0);
  });
  it('a pause deletes the held aim and trigger; nothing fires on the tick after the resume', () => {
    const l = gunDuel('held-pause');
    l.held(0, { ...NONE, aim: 40, gunHeld: true }); l.tick();
    expect(heldOf(l)).toMatchObject({ aim: 40, gunHeld: true });
    l.command(0, { kind: 'setPaused', paused: true }); l.tick();
    expect(l.core.captureCheckpoint().phase).toBe('paused');
    const h = heldOf(l);
    expect(['aim' in h, 'gunHeld' in h]).toEqual([false, false]);
    l.command(0, { kind: 'setPaused', paused: false }); l.tick(); l.tick();
    expect(l.core.captureCheckpoint().phase).toBe('running');
    expect(gunFires(l)).toBe(0);
  });
  it('an expired held frame is neutralised: no aim, no trigger, nothing fires', () => {
    const l = gunDuel('held-expire');
    l.held(0, { ...NONE, aim: 40, gunHeld: true }); l.tick();
    expect(heldOf(l)).toMatchObject({ aim: 40, gunHeld: true });
    l.tick(Math.ceil(REMOTE_HELD_TIMEOUT_MS / (1000 / 60)) + 2);
    const h = heldOf(l);
    expect([h.aim, h.gunHeld]).toEqual([undefined, undefined]);
    l.tick();
    expect(gunFires(l)).toBe(0);
  });
});
