// Sci-1 (spec 2026-11-17-science-scans §4.5, §9, §10 Derelict): the derelict's orbit (table trig, the circular speed,
// prograde) and salvage: the hold counts only within range and speed, resets when either fails, completes on the 300th
// step once, applies each loot, and a trap costs 3 hull and can decide the round. The hunter's slot is switched off in
// these states so nothing shoots during the long holds.
import { describe, expect, it } from 'vitest';
import { stepDuel } from '../src/renderer/src/sim/tactical/duel';
import { circularSpeed } from '../src/renderer/src/sim/tactical/map';
import { derelictPos, salvageStep } from '../src/renderer/src/sim/tactical/science';
import { classOf, createTacticalState, type Derelict, Loot, Outcome, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { DT, SALVAGE_TICKS } from '../src/renderer/src/sim/tactical/tuning';
import { tickWeapons, UNCREWED_INPUT } from '../src/renderer/src/sim/tactical/weapons';
import { makeHostile } from './helpers/hostile';

function wreck(over: Partial<Derelict> = {}): TacticalState {
  const st = makeHostile(createTacticalState(5));
  Object.assign(st.derelict, { orbitR: 900, phase: 40, loot: Loot.Hull, trapped: false, salvage: 0, salvaged: false }, over);
  st.ships[1].active = false;   // no hunter: hostility and the enemy's weapons stay out of the salvage
  return st;
}
/** n steps with the crew ship put onto the derelict (its place and velocity, plus dv on x) before each. */
function hold(st: TacticalState, n: number, dv = 0): void {
  for (let k = 0; k < n; k++) {
    const p = derelictPos(st);
    Object.assign(st.ships[0], { x: p.x, y: p.y, vx: p.vx + dv, vy: p.vy });
    stepDuel(st, UNCREWED_INPUT);
  }
}
/** One salvage step that completes the hold, after `prep`. */
function finish(over: Partial<Derelict>, prep: (st: TacticalState) => void = () => {}): TacticalState {
  const st = wreck({ ...over, salvage: SALVAGE_TICKS - 1 });
  prep(st);
  const p = derelictPos(st);
  Object.assign(st.ships[0], { x: p.x, y: p.y, vx: p.vx, vy: p.vy });
  salvageStep(st);
  return st;
}

describe('derelictPos (spec §4.5)', () => {
  it('stays on its orbit at the circular speed, tangential, moving one tick of its velocity per tick', () => {
    const st = wreck({ orbitR: 1450, phase: 200 }), v = circularSpeed(1450);
    for (const rt of [0, 1, 600, 5999, 54000]) {
      st.tick = rt;
      const p = derelictPos(st);
      expect(Math.hypot(p.x, p.y), `radius at ${rt}`).toBeCloseTo(1450, 6);
      expect(Math.hypot(p.vx, p.vy), `speed at ${rt}`).toBeCloseTo(v, 6);
      expect(Math.abs(p.x * p.vx + p.y * p.vy) / (1450 * v), `tangential at ${rt}`).toBeLessThan(0.02);
      st.tick = rt + 1;
      const q = derelictPos(st);
      expect(Math.hypot(q.x - p.x, q.y - p.y) / (v * DT), `step at ${rt}`).toBeCloseTo(1, 1);
      expect((q.x - p.x) * p.vx + (q.y - p.y) * p.vy, `along its velocity at ${rt}`).toBeGreaterThan(0);
    }
  });
  it('starts at its phase (heading 64 is due east) and reads rt from startTick', () => {
    const st = wreck({ orbitR: 800, phase: 64 });
    const p = derelictPos(st);
    expect(p.x).toBeCloseTo(800, 6); expect(p.y).toBeCloseTo(0, 6);
    st.tick = 5000; st.startTick = 5000;
    expect(derelictPos(st)).toEqual(p);
  });
});

describe('salvage (spec §4.5)', () => {
  it('counts each step within 60 and 40 u/s, resets when either fails, and salvages on the 300th, once (unscanned: a gamble)', () => {
    const st = wreck({ loot: Loot.Hull }); st.systems[0].hull = 30;
    hold(st, 100); expect(st.derelict.salvage).toBe(100);
    hold(st, 1, 50); expect(st.derelict.salvage).toBe(0);                  // 50 u/s relative: too fast
    hold(st, 10); expect(st.derelict.salvage).toBe(10);
    const p = derelictPos(st);
    Object.assign(st.ships[0], { x: p.x + 100, y: p.y, vx: p.vx, vy: p.vy }); stepDuel(st, UNCREWED_INPUT);
    expect(st.derelict.salvage).toBe(0);                                    // 100 away: out of range
    hold(st, SALVAGE_TICKS - 1);
    expect([st.derelict.salvage, st.derelict.salvaged]).toEqual([SALVAGE_TICKS - 1, false]);
    hold(st, 1);
    expect([st.derelict.salvage, st.derelict.salvaged, st.systems[0].hull, st.known[1]]).toEqual([0, true, 38, 0]);
    expect(st.events.filter((e) => e.kind === 'salvage')).toEqual([{ kind: 'salvage', loot: Loot.Hull, trapped: false }]);
    hold(st, 60);
    expect([st.derelict.salvage, st.systems[0].hull]).toEqual([0, 38]);
    expect(st.events.filter((e) => e.kind === 'salvage')).toEqual([]);
  });
  it('applies each loot: Hull +8 capped at the class hull, Missiles to a full magazine, Shield +1 up to layers + 1', () => {
    const c = classOf(createTacticalState(5), 0);
    expect(finish({ loot: Loot.Hull }, (st) => { st.systems[0].hull = 20; }).systems[0].hull).toBe(28);
    expect(finish({ loot: Loot.Hull }, (st) => { st.systems[0].hull = c.hull - 3; }).systems[0].hull).toBe(c.hull);
    expect(finish({ loot: Loot.Missiles }, (st) => { st.systems[0].magazine = 1; }).systems[0].magazine).toBe(c.slots.missile.magazine);
    expect(finish({ loot: Loot.Shield }, (st) => { st.systems[0].shields = 0; }).systems[0].shields).toBe(1);
    expect(finish({ loot: Loot.Shield }, (st) => { st.systems[0].shields = c.shields.layers; }).systems[0].shields).toBe(c.shields.layers + 1);
    expect(finish({ loot: Loot.Shield }, (st) => { st.systems[0].shields = c.shields.layers + 1; }).systems[0].shields).toBe(c.shields.layers + 1);
  });
  it('the extra Shield layer is kept but never regained above the class layers', () => {
    const st = finish({ loot: Loot.Shield }), layers = classOf(st, 0).shields.layers;
    expect(st.systems[0].shields).toBe(1 + 1);   // Engineering spike spec §2: the crew starts at 1 layer (2 Shields bars), the loot adds 1 (was layers + 1)
    expect(layers).toBe(2);
    for (let k = 0; k < 1000; k++) tickWeapons(st, 0, UNCREWED_INPUT);
    expect([st.systems[0].shields, st.systems[0].shieldClock]).toEqual([1, 0]);   // Engineering spike spec §2: layers above the bars' cap (1 at 2 bars) drop at once, so the loot's layer is lost (Decision 21; was [layers + 1, 0])
  });
  it('a trap costs 3 hull after the loot, with a salvage event saying so; at 2 hull it decides the round in that step', () => {
    const st = finish({ loot: Loot.Missiles, trapped: true }, (s) => { s.systems[0].hull = 10; });
    expect(st.systems[0].hull).toBe(7);
    expect(st.events).toContainEqual({ kind: 'salvage', loot: Loot.Missiles, trapped: true });
    const dead = wreck({ loot: Loot.Missiles, trapped: true, salvage: SALVAGE_TICKS - 1 }); dead.systems[0].hull = 2;
    hold(dead, 1);
    expect([dead.systems[0].hull, dead.outcome]).toEqual([0, Outcome.EnemyWins]);
  });
  it('a decided round runs no salvage, and an already salvaged derelict counts nothing', () => {
    const st = wreck(); st.outcome = Outcome.CrewWins;
    hold(st, 5); expect(st.derelict.salvage).toBe(0);
    const done = wreck({ salvaged: true }); hold(done, 5); expect(done.derelict.salvage).toBe(0);
  });
});
