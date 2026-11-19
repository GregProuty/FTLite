// Valkyrn-i (spec 2026-11-18-valkyrn-solo-ship-design §3.1, §4.4, §5, §6.1, §10 Crew of one and Class): the four
// optional layout fields and their hash; createDuel at a crew of one, its throw when the crew argument disagrees with
// the layout; the combined Flight seat, allowed only for a crew of one; the crew slot's class from the layout or the cls
// argument, kept by a rematch and a snapshot round trip, systems[0].cls validated against the header; the gun class
// answering the laser commands unavailable; the downed pilot losing the round.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { Health, Seated } from '../src/renderer/src/sim/components';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { DUEL_LAYOUT } from '../src/renderer/src/sim/duel/layout';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot, type DuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, DUEL_CREW_MIN, LOCAL_CREW_MIN, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { deriveLayout } from '../src/renderer/src/sim/ship/derived';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { LASER, ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { TACTICAL_MODULES } from '../src/renderer/src/sim/tactical/hash';
import { createTacticalState, Outcome } from '../src/renderer/src/sim/tactical/state';
import { VALKYRN_HULL } from '../src/renderer/src/sim/tactical/tuning';
import { hashF64 } from '../src/shared/hash';
import { standAtStation } from './helpers/duelSeat';
import { holdInSight } from './helpers/sensorSight';
import { createSeatedValkyrn, createValkyrnDuel, VALKYRN_TEST, valkyrnTestLayout } from './helpers/valkyrnDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: Array.from({ length: d.interior.playerCount }, () => NONE), commands });
const rehash = (s: DuelSnapshot): DuelSnapshot => { s.header.hash = hashF64(Float64Array.from(s.values)); return s; };
/** The offset of a tactical field in a duel snapshot's values (after the leading SIM_VERSION). */
function tacticalOffset(seed: number, name: string): number {
  const shape = createTacticalState(seed);
  let at = 1;
  for (const m of TACTICAL_MODULES) for (const f of m.fields(shape)) { if (f.name === name) return at; at += f.count; }
  throw new Error(`no tactical field ${name}`);
}

describe('the layout fields (spec §3.1)', () => {
  it('are optional and absent on the Hound; the test Valkyrn carries all four; bad values are refused', () => {
    expect([DUEL_LAYOUT.shipClass, DUEL_LAYOUT.crew, DUEL_LAYOUT.helmHoldsUnattended, DUEL_LAYOUT.hull]).toEqual([undefined, undefined, undefined, undefined]);
    expect([VALKYRN_TEST.shipClass, VALKYRN_TEST.crew, VALKYRN_TEST.helmHoldsUnattended, VALKYRN_TEST.hull]).toEqual(['valkyrn', 1, true, 'valkyrn']);
    for (const bad of [{ crew: 0 }, { crew: 5 }, { crew: 1.5 }, { shipClass: '' }, { shipClass: 'hunter' }, { shipClass: 'valkyrm' }, { hull: 'cutter' }, { helmHoldsUnattended: 'yes' }])
      expect(() => parseShip({ ...hound, ...bad }), JSON.stringify(bad)).toThrow();
  });
  it('the class, the crew and the unattended rule join the layout hash only when present; the hull is view data', () => {
    const plain = deriveLayout(parseShip(hound)).layoutHash;
    expect(deriveLayout(DUEL_LAYOUT).layoutHash).toBe(plain);
    expect(deriveLayout(parseShip({ ...hound, hull: 'hound' })).layoutHash).toBe(plain);
    const withField = [{ crew: 2 }, { shipClass: 'cutter' }, { helmHoldsUnattended: false }].map((f) => deriveLayout(parseShip({ ...hound, ...f })).layoutHash);
    expect(withField.every((h) => h !== plain)).toBe(true);
    expect(new Set(withField).size).toBe(3);
  });
});

describe('a crew of one (spec §4.4)', () => {
  it('createDuel builds one character on a layout whose crew is 1; the local minimum is 1, online keeps 2', () => {
    expect([LOCAL_CREW_MIN, DUEL_CREW_MIN]).toEqual([1, 2]);
    const d = createValkyrnDuel(5);
    try {
      expect([d.interior.playerCount, d.interior.crew.length, d.present, d.helmPlayer]).toEqual([1, 1, [true], 0]);
      expect([d.crewClass, d.tactical.systems[0].cls, d.tactical.systems[0].hull]).toEqual([ShipClass.Valkyrn, ShipClass.Valkyrn, VALKYRN_HULL]);
    } finally { disposeDuel(d); }
    const solo = createDuel(DUEL_LAYOUT, 5, 0, 1);   // the Hound has no fixed crew: 1 is a legal local crew (Decision 16)
    try { expect([solo.interior.playerCount, solo.crewClass]).toEqual([1, ShipClass.Cutter]); } finally { disposeDuel(solo); }
  });
  it('throws when the crew argument disagrees with the layout\'s crew, or is outside 1..4', () => {
    expect(() => createDuel(VALKYRN_TEST, 5)).toThrow(/crewed by 1, not 2/);
    expect(() => createDuel(VALKYRN_TEST, 5, 0, 2)).toThrow(/crewed by 1, not 2/);
    for (const crew of [0, 5, 0.5]) expect(() => createDuel(DUEL_LAYOUT, 5, 0, crew), `crew ${crew}`).toThrow(/invalid duel crew/);
  });
  it('the Flight seat (spec §5): Navigation and Weapons in one group only for a crew of one; sitting there seats the pilot at both', () => {
    expect(() => createDuel(valkyrnTestLayout({ crew: 2 }), 5, 0, 2)).toThrow(/one console group/);
    const d = createValkyrnDuel(5);
    try {
      standAtStation(d, 0, d.nav);
      expect(step(d, [cmd(d, 0, { kind: 'sit', station: d.nav })])[0]).toMatchObject({ status: 'applied' });
      expect([d.interior.stations.occupant[d.nav], d.interior.stations.occupant[d.weapons]]).toEqual([0, 0]);
      expect(Seated.station[d.interior.crew[0]!]).toBe(d.nav);
    } finally { disposeDuel(d); }
  });
  it('the downed pilot loses the round', () => {
    const d = createValkyrnDuel(5);
    try {
      Health.cur[d.interior.crew[0]!] = 0;
      step(d);
      expect(d.events.flatMap((e) => (e.kind === 'downed' ? [e.player] : []))).toEqual([0]);
      expect(d.tactical.outcome).toBe(Outcome.EnemyWins);
    } finally { disposeDuel(d); }
  });
});

describe('the crew class (spec §6.1)', () => {
  it('comes from the cls argument, else the layout\'s shipClass, else the Cutter', () => {
    const fromLayout = createValkyrnDuel(5), fit = createValkyrnDuel(5, ShipClass.ValkyrnLaser), plain = createDuel(DUEL_LAYOUT, 5);
    try {
      expect([fromLayout.crewClass, fit.crewClass, plain.crewClass]).toEqual([ShipClass.Valkyrn, ShipClass.ValkyrnLaser, ShipClass.Cutter]);
      expect(fit.tactical.systems[0]).toMatchObject({ cls: ShipClass.ValkyrnLaser, hull: VALKYRN_HULL, laserCharge: LASER.chargeUnits, laserTargeted: true });
    } finally { disposeDuel(fromLayout); disposeDuel(fit); disposeDuel(plain); }
    expect(() => createValkyrnDuel(5, ShipClass.Hunter)).toThrow(/invalid crew ship class/);
    expect(() => createDuel(valkyrnTestLayout({ shipClass: 'skiff' }), 5, 0, 1)).toThrow(/unknown ship class skiff/);
  });
  it('a rematch keeps the class and the crew of one', () => {
    const d = createValkyrnDuel(5, ShipClass.ValkyrnLaser);
    try {
      d.tactical.systems[1].hull = 0;
      step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      expect(step(d, [cmd(d, 0, { kind: 'rematch' })])[0]).toMatchObject({ status: 'applied' });
      expect([d.round, d.interior.playerCount, d.crewClass, d.tactical.systems[0].cls]).toEqual([1, 1, ShipClass.ValkyrnLaser, ShipClass.ValkyrnLaser]);
    } finally { disposeDuel(d); }
  });
  it('the gun Valkyrn answers laserLock, laserCharge and laserFrequency unavailable; the laser fit applies them', () => {
    for (const [cls, want] of [[ShipClass.Valkyrn, 'unavailable'], [ShipClass.ValkyrnLaser, 'applied']] as const) {
      const d = createSeatedValkyrn(5, cls);
      try {
        holdInSight(d.tactical);   // Engineering spike spec §10.4: a lock needs the target seen
        const r = step(d, [cmd(d, 0, { kind: 'laserLock', room: 0 }), cmd(d, 0, { kind: 'laserCharge', held: true }), cmd(d, 0, { kind: 'laserFrequency', freq: 1 }), cmd(d, 0, { kind: 'torpLock', room: 2 })]);
        expect(r.map((x) => x.reason ?? x.status), `class ${cls}`).toEqual([want, want, want, 'applied']);
      } finally { disposeDuel(d); }
    }
  });
});

describe('the snapshot at a crew of one (spec §6.1, §7.3)', () => {
  for (const cls of [ShipClass.Valkyrn, ShipClass.ValkyrnLaser]) it(`class ${cls}: the header carries the crew and the class; it validates, loads and restores to the same hash`, () => {
    const d = createSeatedValkyrn(5, cls);
    try {
      for (let k = 0; k < 5; k++) step(d);
      const snap = saveDuelSnapshot(d, DIGEST);
      expect([snap.header.playerCount, snap.header.crewClass]).toEqual([1, cls]);
      const r = loadDuelSnapshot(VALKYRN_TEST, JSON.parse(JSON.stringify(snap)), DIGEST);
      try {
        expect([r.interior.playerCount, r.crewClass, hashDuel(r)]).toEqual([1, cls, hashDuel(d)]);
        step(d);
        restoreDuelSnapshot(r, validateDuelSnapshot(VALKYRN_TEST, saveDuelSnapshot(d, DIGEST), DIGEST), DIGEST);
        expect(hashDuel(r)).toBe(hashDuel(d));
      } finally { disposeDuel(r); }
    } finally { disposeDuel(d); }
  });
  it('validates systems[0].cls against the header, the header\'s class as a crew class, and refuses a restore of another class', () => {
    const d = createValkyrnDuel(5), fit = createValkyrnDuel(5, ShipClass.ValkyrnLaser);
    try {
      const snap = saveDuelSnapshot(d, DIGEST), withClass = (c: number) => { const s = structuredClone(snap); s.header.crewClass = c; return s; };
      expect(() => validateDuelSnapshot(VALKYRN_TEST, withClass(ShipClass.ValkyrnLaser), DIGEST)).toThrow(/slot identity/);
      for (const c of [ShipClass.Hunter, 4, -1, 1.5]) expect(() => validateDuelSnapshot(VALKYRN_TEST, withClass(c), DIGEST), `class ${c}`).toThrow(/crew class is invalid/);
      const cls = structuredClone(snap);
      cls.values[tacticalOffset(5, 'systems.0.cls')] = ShipClass.Cutter;
      expect(() => validateDuelSnapshot(VALKYRN_TEST, rehash(cls), DIGEST)).toThrow(/slot identity/);
      expect(() => restoreDuelSnapshot(fit, validateDuelSnapshot(VALKYRN_TEST, snap, DIGEST), DIGEST)).toThrow(/load it instead/);
    } finally { disposeDuel(d); disposeDuel(fit); }
  });
  it('the header\'s crew is 1..4 locally', () => {
    const d = createValkyrnDuel(5);
    try {
      const snap = saveDuelSnapshot(d, DIGEST);
      for (const n of [0, 5]) { const s = structuredClone(snap); s.header.playerCount = n; expect(() => validateDuelSnapshot(VALKYRN_TEST, s, DIGEST), `crew ${n}`).toThrow(/player count is invalid/); }
    } finally { disposeDuel(d); }
  });
});
