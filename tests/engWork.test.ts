// Engineering spike spec §4: hit rolls (fire, then breach, per hit), venting through a breach and patching it at its
// site tile, firefighting at a non-point room's breach-site tile, the work precedence (fire > breach > repair), and
// low-air damage to standing and seated crew.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { hitRolls } from '../src/renderer/src/sim/duel/fire';
import { healthPhase } from '../src/renderer/src/sim/duel/health';
import { siteOfRoom } from '../src/renderer/src/sim/duel/hazards';
import { DUEL_BREACH_CHANCE_LASER, DUEL_EXTINGUISH_UNITS, DUEL_FIRE_CHANCE_LASER, LOW_AIR_FRAC } from '../src/renderer/src/sim/duel/tuning';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { roomBreached } from '../src/renderer/src/sim/hazards/oxygen';
import { Position } from '../src/renderer/src/sim/components';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Room, type DuelEvent } from '../src/renderer/src/sim/tactical/state';
import { DT, O2_DAMAGE } from '../src/renderer/src/sim/tuning';
import { nextFloat } from '../src/shared/rng';

const HOUND = parseShip(hound);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false }, HOLD: HeldInput = { moveX: 0, moveY: 0, interactHeld: true };
const room = (id: string) => HOUND.rooms.findIndex((r) => r.id === id);
function quiet(seed = 4): DuelState { const d = createDuel(HOUND, seed); d.tactical.ships[1]!.active = false; return d; }
function withDuel(f: (d: DuelState) => void): void { const d = quiet(); try { f(d); } finally { disposeDuel(d); } }
const place = (d: DuelState, pid: number, x: number, y: number) => { const e = d.interior.crew[pid]!; Position.x[e] = x; Position.y[e] = y; };
const hold = (d: DuelState, ticks: number) => { for (let k = 0; k < ticks; k++) stepDuelTick(d, { held: [HOLD, NONE], commands: [] }); };
const laser = (room: number): DuelEvent => ({ kind: 'laser', ship: 1, hit: true, stripped: false, room, x1: 0, y1: 0, x2: 0, y2: 0 });

describe('engineering spike: breaches and work (spec §4)', () => {
  it('per hit: the fire roll, then the breach roll, two draws; none for a burning room or an active site', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const d = quiet(seed);
      try {
        const point = d.points.find((p) => p.tacticalRoom === Room.Weapons)!, site = siteOfRoom(d, point.room);
        const probe = { ...d.interior.rng.hazards }, fire = nextFloat(probe) < DUEL_FIRE_CHANCE_LASER, breach = nextFloat(probe) < DUEL_BREACH_CHANCE_LASER;
        hitRolls(d, [laser(Room.Weapons)]);
        expect(d.interior.rng.hazards).toEqual(probe);
        expect(d.interior.rooms.fire[point.room]! > 0).toBe(fire);
        expect(d.interior.breaches.active[site]).toBe(breach ? 1 : 0);
        igniteRoom(d.interior, point.room); activateBreach(d.interior, site);
        const still = { ...d.interior.rng.hazards };
        hitRolls(d, [laser(Room.Weapons)]);
        expect(d.interior.rng.hazards).toEqual(still);
      } finally { disposeDuel(d); }
    }
  });
  it('a breach vents its room; patching it at its site tile stops the venting', () => withDuel((d) => {
    const O = room('O'), site = siteOfRoom(d, O);                 // the Hound's O site is (10, 4)
    activateBreach(d.interior, site);
    place(d, 0, 10.5, 5.5);
    hold(d, DUEL_EXTINGUISH_UNITS / 4 - 1);
    expect(roomBreached(d.interior, O)).toBe(true);
    hold(d, 1);
    expect(roomBreached(d.interior, O)).toBe(false);
  }));
  it('a fire in a non-point room is put out at its breach-site tile', () => withDuel((d) => {
    const Q = room('Q');                                          // no repair point; site (15, 5)
    igniteRoom(d.interior, Q); place(d, 0, 15.5, 6.5);
    hold(d, DUEL_EXTINGUISH_UNITS / 4);
    expect(d.interior.rooms.fire[Q]).toBe(0);
  }));
  it('work precedence: fire, then breach, then repair', () => withDuel((d) => {
    const R = room('R'), site = siteOfRoom(d, R);                 // point (4, 11), site (4, 13): both in reach of (4.5, 12.5)
    igniteRoom(d.interior, R); activateBreach(d.interior, site); d.tactical.systems[0].rooms[Room.Shields] = 1;
    place(d, 0, 4.5, 12.5);
    hold(d, 1);
    expect(d.interior.rooms.fireRepair[R]).toBeGreaterThan(0);
    expect(d.interior.breaches.repair[site]).toBe(0); expect(d.repair[Room.Shields]).toBe(0);
    hold(d, DUEL_EXTINGUISH_UNITS / 4);
    expect(d.interior.rooms.fire[R]).toBe(0);
    expect(d.interior.breaches.repair[site]).toBeGreaterThan(0); expect(d.repair[Room.Shields]).toBe(0);
    hold(d, DUEL_EXTINGUISH_UNITS / 4);
    expect(d.interior.breaches.active[site]).toBe(0);
    hold(d, 2);
    expect(d.repair[Room.Shields]).toBeGreaterThan(0);
  }));
  it('low air hurts every conscious character below 25 %, seated ones too, with cause air', () => withDuel((d) => {
    sitDown(d.interior, 1, d.weapons);
    for (let r = 0; r < d.interior.rooms.o2.length; r++) d.interior.rooms.o2[r] = (LOW_AIR_FRAC - 0.01) * d.interior.derived.volume[r]!;
    d.events = [];
    healthPhase(d, []);
    const hurt = d.events.filter((e) => e.kind === 'crewHurt' && e.cause === 'air');
    expect(hurt.map((e) => (e.kind === 'crewHurt' ? e.player : -1)).sort()).toEqual([0, 1]);
    expect(hurt.every((e) => e.kind === 'crewHurt' && Math.abs(e.amount - O2_DAMAGE * DT) < 1e-12)).toBe(true);
  }));
});
