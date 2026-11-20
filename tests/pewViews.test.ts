// W-1 pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §5): the views. The Weapons map draws every round as a short streak; a pew hit sparks, pops a stripped layer and floats -1 on a
// crew hull hit; the online view's gap events carry the pew from its counters.
import { describe, expect, it } from 'vitest';
import { duelCounters, gapEvents } from '../src/renderer/src/app/duel/onlineSource';
import { createCamera, worldToScreen, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx, pushPewHits } from '../src/renderer/src/render/tactical/fxModel';
import { fineHeadingOf, type PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel, PEW_HALF, PEW_STREAK_S, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { firePew } from '../src/renderer/src/sim/tactical/pew';
import { classOf, createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, HEADING_COUNT, PEW_RANGE } from '../src/renderer/src/sim/tactical/tuning';

const vp = { w: 1280, h: 720 };
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons'): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx: createFx() };
}
function northFacing(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[0], { heading: 0, headingAcc: 0, vx: 0, vy: 0 });
  return st;
}

describe('fineHeadingOf', () => {
  it('is the fine heading of a screen direction, north 0 clockwise', () => {
    expect([fineHeadingOf(0, -1), fineHeadingOf(1, 0), fineHeadingOf(0, 1), fineHeadingOf(-1, 0)]).toEqual([0, AIM_STEPS / 4, AIM_STEPS / 2, (3 * AIM_STEPS) / 4]);
    expect(fineHeadingOf(1, -1)).toBe(AIM_STEPS / 8);
  });
});

describe('the Weapons map (spec §1)', () => {
  // W-4 spec §10: the Hound's turreted pew draws the selected arc and the muzzle lines (tests/w4Map.test.ts). The crew class's
  // pew always has a turret, so no class keeps the W-1 cone / aim-line rules: the aim-line case and the cone (with its model
  // fields) are deleted; this case pins the turret arc's width.
  it("the Hound's Weapons map turret arc keeps the pew's width", () => {
    const st = northFacing(), cam = createCamera(st.ships[0].x, st.ships[0].y, 0.5);
    const c = combatModel(input(st, cam, 'weapons'));
    expect(PEW_HALF).toBeCloseTo(Math.PI / 3, 12);
    expect(c.turretArc!.half).toBeCloseTo(PEW_HALF, 3);
    expect(c.turretArc!.r).toBe(PEW_RANGE * 0.5);
    expect(c.turretArc!.half).toBeCloseTo((classOf(st, 0).slots.pew!.arcSteps / AIM_STEPS) * 2 * Math.PI, 12);
  });
  it('draws every pew round as a short streak ending at the round, on any console', () => {
    const st = northFacing(), cam = createCamera(st.ships[0].x, st.ships[0].y, 1);
    firePew(st, 0, 0);
    const r = st.pew.find((e) => e.active)!, tip = worldToScreen(cam, vp, r.x, r.y), tail = worldToScreen(cam, vp, r.x - r.vx * PEW_STREAK_S, r.y - r.vy * PEW_STREAK_S);
    for (const console of ['helm', 'weapons'] as const) expect(combatModel(input(st, cam, console)).pewRounds).toEqual([{ x1: tail.x, y1: tail.y, x2: tip.x, y2: tip.y }]);
  });
});

describe('pew hits and the online view (spec §1)', () => {
  it('a hit sparks; a stripped layer pops; a crew hull hit floats -1', () => {
    const fx = createFx();
    pushPewHits(fx, [{ kind: 'pewHit', ship: 1, owner: 0, stripped: true, hull: false, room: -1, level: false, x: 1, y: 2 }, { kind: 'pewHit', ship: 1, owner: 0, stripped: false, hull: true, room: -1, level: false, x: 3, y: 4 }]);
    expect(fx.items.map((i) => i.kind)).toEqual(['spark', 'pop', 'spark']);
    expect(fx.floats.map((f) => f.text)).toEqual(['-1']);
  });
  it('the gap events carry each pew round fired and each that hit, from the counters', () => {
    const st = createTacticalState(5), before = [duelCounters(st, 0), duelCounters(st, 1)];
    firePew(st, 0, st.ships[0].heading * HEADING_COUNT); st.systems[0].pewHits++;
    const ev = gapEvents(before, [null, null], st).filter((e) => e.kind === 'pewFire' || e.kind === 'pewHit');
    expect(ev.map((e) => [e.kind, e.ship])).toEqual([['pewFire', 0], ['pewHit', 1]]);
  });
});
