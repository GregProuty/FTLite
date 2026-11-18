// Sci-1 (spec 2026-11-17-science-scans §3, §4.4, §10): the round with the behaviour on: the hold again after a rematch,
// the frequency strip, snapshots while holding and after Shield loot, an online-style replica restored from the authority's
// snapshots agreeing with it over a run with scans, designation, tuning and salvage, and a scripted enemy that fires
// nothing before it turns hostile.
import { describe, expect, it } from 'vitest';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand, DuelEnvelope } from '../src/renderer/src/sim/duel/commands';
import { hashDuel } from '../src/renderer/src/sim/duel/hash';
import { createScriptedPair, scriptedInput } from '../src/renderer/src/sim/duel/scripted';
import { loadDuelSnapshot, restoreDuelSnapshot, saveDuelSnapshot, validateDuelSnapshot } from '../src/renderer/src/sim/duel/snapshot';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { sitDown } from '../src/renderer/src/sim/stations';
import { derelictPos } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, HunterMode, Outcome } from '../src/renderer/src/sim/tactical/state';
import { DERELICT_NEAR_MAX, HOSTILE_AFTER_TICKS, LASER_CHARGE_UNITS } from '../src/renderer/src/sim/tactical/tuning';
import { applyWeaponsInput, IDLE_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { createSeatedDuel } from './helpers/duelSeat';
import { makeHostile } from './helpers/hostile';
import { CUTTER } from './helpers/scriptedDuel';

const DIGEST = __GAMEPLAY_CONTENT_DIGEST__;
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const cmd = (d: DuelState, player: number, command: DuelCommand): DuelEnvelope => ({ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command });
const step = (d: DuelState, commands: DuelEnvelope[] = []) => stepDuelTick(d, { held: [NONE, NONE], commands });
/** Player 1 at Weapons, the crew at (−600, −300) facing the enemy 300 east, the laser full and held, the enemy at 2 layers. */
function gunnery(): DuelState {
  const d = createDuel(CUTTER, 5), t = d.tactical;
  sitDown(d.interior, 1, d.weapons);
  Object.assign(t.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
  Object.assign(t.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
  t.systems[0].fireHeld = true; t.systems[0].laserCharge = LASER_CHARGE_UNITS; t.systems[1].shields = 2;
  return d;
}

describe('the round (spec §3, §4.1)', () => {
  it('a rematch starts round 2 holding, and the hold again lasts exactly 1800 steps', () => {
    const d = createSeatedDuel(CUTTER, 3);
    try {
      d.tactical.systems[1].hull = 0; step(d);
      expect(d.tactical.outcome).toBe(Outcome.CrewWins);
      step(d, [cmd(d, 0, { kind: 'rematch' })]);
      expect([d.round, d.tactical.startTick, d.tactical.hostileAt, d.tactical.hunter.mode]).toEqual([1, d.baseTick, -1, HunterMode.Hunt]);
      let n = 0;
      while (d.tactical.hostileAt < 0 && n <= HOSTILE_AFTER_TICKS) { step(d); n++; }
      expect([n, d.tactical.hostileAt]).toEqual([HOSTILE_AFTER_TICKS, HOSTILE_AFTER_TICKS - 1]);
      expect(d.tactical.events).toContainEqual({ kind: 'hostile', cause: 'clock' });
    } finally { disposeDuel(d); }
  });
  it('a scripted duel\'s enemy fires and launches nothing before it turns hostile', () => {
    const d = createSeatedDuel(CUTTER, 1), pair = createScriptedPair(1);
    try {
      while (d.tactical.hostileAt < 0 && d.tactical.outcome === Outcome.Running) {
        stepDuelTick(d, scriptedInput(pair, d));
        if (d.tactical.hostileAt < 0) expect([d.tactical.systems[1].shots, d.tactical.systems[1].missilesLaunched]).toEqual([0, 0]);
      }
      expect(d.tactical.hostileAt).toBeGreaterThanOrEqual(0);
    } finally { disposeDuel(d); }
  });
});

describe('the laser frequency (spec §4.4)', () => {
  it('a release tuned to the weak frequency in the same tick strips 2 layers; 1 when only 1 is up; off it 1', () => {
    const d = gunnery(), t = d.tactical;
    try {
      step(d, [cmd(d, 1, { kind: 'laserFrequency', freq: t.weakFreq }), cmd(d, 1, { kind: 'laserCharge', held: true })]);
      expect([t.systems[0].freq, t.systems[1].shields, t.systems[0].layersStripped]).toEqual([t.weakFreq, 0, 2]);
    } finally { disposeDuel(d); }
    const one = gunnery();
    try {
      one.tactical.systems[1].shields = 1; one.tactical.systems[0].freq = one.tactical.weakFreq;
      step(one, [cmd(one, 1, { kind: 'laserCharge', held: true })]);
      expect([one.tactical.systems[1].shields, one.tactical.systems[0].layersStripped]).toEqual([0, 1]);
    } finally { disposeDuel(one); }
    const off = gunnery();
    try {
      off.tactical.systems[0].freq = (off.tactical.weakFreq + 1) % 3;
      step(off, [cmd(off, 1, { kind: 'laserCharge', held: true })]);
      expect([off.tactical.systems[1].shields, off.tactical.systems[0].layersStripped]).toEqual([1, 1]);
    } finally { disposeDuel(off); }
  });
  it('the hunter\'s laser strips one layer whatever its freq', () => {
    const st = makeHostile(createTacticalState(5));
    Object.assign(st.ships[0], { x: -600, y: -300, vx: 0, vy: 0, heading: 64 });
    Object.assign(st.ships[1], { x: -300, y: -300, vx: 0, vy: 0, heading: 192 });
    st.systems[1].freq = st.weakFreq; st.systems[1].fireHeld = true; st.systems[1].laserCharge = LASER_CHARGE_UNITS;
    applyWeaponsInput(st, 1, { ...IDLE_INPUT, laserCharge: false });
    expect(st.systems[0].shields).toBe(classOf(st, 0).shields.layers - 1);
  });
});

describe('snapshots with the behaviour on (spec §10 Snapshots)', () => {
  it('a snapshot while holding (rt 600) and one after Shield loot both validate and restore to the same hash', () => {
    const d = createSeatedDuel(CUTTER, 5);
    try {
      for (let k = 0; k < 600; k++) step(d);
      expect(d.tactical.hostileAt).toBe(-1);
      for (const label of ['holding', 'shield loot']) {
        if (label === 'shield loot') { d.tactical.systems[0].shields = classOf(d.tactical, 0).shields.layers + 1; d.tactical.derelict.salvaged = true; }
        const r = loadDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(d, DIGEST))), DIGEST);
        try { expect(hashDuel(r), label).toBe(hashDuel(d)); } finally { disposeDuel(r); }
      }
    } finally { disposeDuel(d); }
  });
  it('a replica restored from the authority every 3 ticks agrees with it over a run with scans, designation, tuning and salvage', () => {
    const seed = Array.from({ length: 20 }, (_, k) => k + 1).find((s) => createTacticalState(s).derelict.orbitR <= DERELICT_NEAR_MAX)!;   // a wreck inside the belt
    const auth = createDuel(CUTTER, seed), replica = createDuel(CUTTER, seed);
    try {
      sitDown(auth.interior, 0, auth.weapons); sitDown(auth.interior, 1, auth.science);
      for (let k = 0; k < 900; k++) {
        const commands: DuelEnvelope[] = [];
        if (k === 2) commands.push(cmd(auth, 1, { kind: 'contactScan', contact: 0 }));
        if (k === 5) commands.push(cmd(auth, 1, { kind: 'designate', contact: 1 }));
        if (k === 7) commands.push(cmd(auth, 0, { kind: 'laserFrequency', freq: 2 }));
        if (k === 200) commands.push(cmd(auth, 1, { kind: 'contactScan', contact: 1 }));
        if (k >= 400 && k < 720) { const p = derelictPos(auth.tactical); Object.assign(auth.tactical.ships[0], { x: p.x, y: p.y, vx: p.vx, vy: p.vy }); }   // hold the crew on the wreck
        step(auth, commands);
        if (k % 3 === 2) {
          const snap = validateDuelSnapshot(CUTTER, JSON.parse(JSON.stringify(saveDuelSnapshot(auth, DIGEST))), DIGEST);
          restoreDuelSnapshot(replica, snap, DIGEST);
          expect(hashDuel(replica), `tick ${k}`).toBe(hashDuel(auth));
        }
      }
      expect([auth.tactical.known, auth.tactical.designated, auth.tactical.systems[0].freq, auth.tactical.derelict.salvaged]).toEqual([[1, 1], 1, 2, true]);
    } finally { disposeDuel(auth); disposeDuel(replica); }
  });
});
