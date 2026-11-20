// Valkyrn spec §6.1, §7.4, §10: the Flight map's crosshair (on the nose line at the gun's reach), lead pip (hot when the nose
// line passes within the Hunter's radius) and heat bar (OVERHEAT blinking while locked); the gun's sentence and refusals; the
// laser-only marks gone on a gun class; and the Hound's frames unchanged.
import { describe, expect, it } from 'vitest';
import valkyrnJson from '../src/renderer/src/sim/ship/valkyrn.json';
import houndJson from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { GUN } from '../src/renderer/src/sim/tactical/defs';
import { DT } from '../src/renderer/src/sim/tactical/tuning';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { createCamera, worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { createFx, pushGunHits } from '../src/renderer/src/render/tactical/fxModel';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { gunSightDraw } from '../src/renderer/src/render/duel/leadModel';
import { gunReason, laserSituation, refusal } from '../src/renderer/src/render/duel/situationModel';
import { enemyCharge, flashesFor, hitCallouts, pushHits } from '../src/renderer/src/render/tactical/hitModel';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';
import { chargeRow } from '../src/renderer/src/render/duel/readoutModel';
import { SIDE, TABS_RIGHT } from '../src/renderer/src/render/duel/consoleLayout';

const vp = { w: 1280, h: 720 };
const valkyrn = parseShip(valkyrnJson), hound = parseShip(houndJson);
function flying(): DuelState { const d = createDuel(valkyrn, 7, 0, 1); sitDown(d.interior, 0, d.nav); return d; }
function input(d: DuelState, flight = true): CombatModelInput {
  const st = d.tactical, s = st.ships[0];
  return { state: st, prev: st.ships.map((b) => ({ x: b.x, y: b.y, h: b.heading + b.headingAcc })), alpha: 1, camera: createCamera(s.x, s.y, 0.5), viewport: vp, console: 'helm',
    axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 156, reserveLeft: 228, infoBand: { left: TABS_RIGHT, right: SIDE.x }, missilePrev: [null, null], fx: createFx(), flight };
}
/** The enemy `dist` ahead of the crew's nose and `side` to starboard, moving with the crew. */
function place(d: DuelState, dist: number, side = 0): void {
  const t = d.tactical, s = t.ships[0], e = t.ships[t.systems[0].target]!, fx = hx(s.heading), fy = hy(s.heading);
  Object.assign(e, { x: s.x + fx * dist - fy * side, y: s.y + fy * dist + fx * side, vx: s.vx, vy: s.vy, active: true });
}

describe('the gun sight (Valkyrn spec §7.4)', () => {
  it('the crosshair sits on the nose line at the gun\'s reach', () => {
    const d = flying();
    try {
      const i = input(d), gs = gunSightDraw(i)!, s = d.tactical.ships[0], reach = GUN.speed * GUN.lifeTicks * DT;
      const want = worldToScreen(i.camera, vp, s.x + hx(s.heading) * reach, s.y + hy(s.heading) * reach);
      expect(gs.cross.x).toBeCloseTo(want.x, 6); expect(gs.cross.y).toBeCloseTo(want.y, 6);
    } finally { disposeDuel(d); }
  });
  it('the pip is on target dead ahead, off when the enemy is abeam; it draws a line to the enemy', () => {
    const d = flying();
    try {
      place(d, 300); const on = gunSightDraw(input(d))!.pip!;
      expect(on.on).toBe(true);
      expect(on.x).toBeCloseTo(on.enemy.x, 6);   // at rest relative to the crew, the pip is the enemy
      place(d, 300, 120); expect(gunSightDraw(input(d))!.pip!.on).toBe(false);
    } finally { disposeDuel(d); }
  });
  it('the heat bar fills with heat and blinks OVERHEAT while locked', () => {
    const d = flying(), sys = d.tactical.systems[0];
    try {
      sys.gunHeat = GUN.heatMax / 2;
      const warm = gunSightDraw(input(d))!.heat;
      expect([warm.fill, warm.locked, warm.label?.text]).toEqual([0.5, false, 'HEAT']);
      sys.gunHeat = GUN.heatMax; sys.gunLocked = true;
      expect(gunSightDraw({ ...input(d), t: 0 })!.heat.label?.text).toBe('OVERHEAT');
      expect(gunSightDraw({ ...input(d), t: 0.13 })!.heat.label).toBeNull();
    } finally { disposeDuel(d); }
  });
  it('the Hound (the autocannon, W-4 spec §2) draws its rounds; its frame off the Flight seat carries no gun sight', () => {
    const d = createDuel(hound, 7);
    try {
      expect(gunSightDraw(input(d))).not.toBeNull();   // W-4 spec §2: the Hound has a gun now (was: no gun sight)
      const c = combatModel(input(d, false));
      expect(['rounds' in c, (c as { gunSight?: unknown }).gunSight ?? null]).toEqual([true, null]);   // W-4 spec §2: the autocannon's rounds are drawn (was: no gun keys)
      expect(c.helmArc).toBeNull();   // W-4 spec §2: the Helm's arc is the laser's, and the Hound has none (was: not null)
    } finally { disposeDuel(d); }
  });
});

describe('the Flight frame on a gun class (Valkyrn spec §6.1, §8)', () => {
  it('no laser arc; the torpedo circle lit in range; the sentence is the gun\'s', () => {
    const d = flying();
    try {
      place(d, 300);
      const c = combatModel(input(d));
      expect([c.helmArc, c.torpedoRange?.lit, c.gunSight === null]).toEqual([null, true, false]);
      expect(c.status ?? null).toBeNull();   // nothing wrong: no sentence
      d.tactical.systems[0].gunLocked = true;
      expect(combatModel(input(d)).status?.label.text).toBe('GUN OVERHEAT');
      d.tactical.systems[0].rooms[Room.Weapons] = 2;
      expect(combatModel(input(d)).status?.label.text).toBe('WEAPONS OFFLINE');
    } finally { disposeDuel(d); }
  });
  it('the laser situation is none; FIRE refuses with the gun\'s reasons; LAUNCH as on the Hound', () => {
    const d = flying(), sys = d.tactical.systems[0];
    try {
      expect(laserSituation(d.tactical).kind).toBe('none');
      expect([refusal(d, 'fire'), gunReason(d.tactical)]).toEqual([null, null]);
      sys.gunLocked = true; expect(refusal(d, 'fire')).toBe('GUN OVERHEAT');
      sys.rooms[Room.Weapons] = 2; expect(refusal(d, 'fire')).toBe('WEAPONS OFFLINE');
      expect(refusal(d, 'launch')).toBe('WEAPONS OFFLINE');
    } finally { disposeDuel(d); }
  });
  it('no charge ring for a gun class, the readout reads HEAT, and a gun hit sparks, pops a strip and floats -1 on a hull step', () => {
    const d = flying(), sys = d.tactical.systems[0];
    try {
      sys.fireHeld = true;
      expect(enemyCharge(d.tactical, 0)).toBeNull();
      sys.gunHeat = GUN.heatMax / 4;
      expect([chargeRow(d).label, chargeRow(d).value]).toEqual(['HEAT', '25%']);
      const fx = createFx(), e = d.tactical.systems[0].target;
      const hits: ViewEvent[] = [
        { kind: 'gunHit', ship: e, room: -1, stripped: false, hull: false, level: false, x: 8, y: 18 },    // a shield hit that strips nothing: spark only
        { kind: 'gunHit', ship: e, room: -1, stripped: true, hull: false, level: false, x: 10, y: 20 },    // the strip: spark and pop
        { kind: 'gunHit', ship: e, room: 1, stripped: false, hull: false, level: false, x: 11, y: 21 },    // a room hit that only wears: spark only
        { kind: 'gunHit', ship: e, room: 1, stripped: false, hull: true, level: false, x: 12, y: 22 }      // the room hit that took a hull point: spark and -1
      ];
      pushGunHits(fx, hits);
      expect(fx.items.map((it) => it.kind)).toEqual(['spark', 'spark', 'pop', 'spark', 'spark']);
      expect(fx.floats.map((f) => f.text)).toEqual(['-1']);
    } finally { disposeDuel(d); }
  });
  it('a gun round on an enemy Room flashes it; only the round that raised its level calls it out (review R1-F4)', () => {
    const d = flying();
    try {
      const fx = createFx(), e = d.tactical.systems[0].target, rooms = d.tactical.systems[e]!.rooms;
      const wear: ViewEvent = { kind: 'gunHit', ship: e, room: Room.Engines, stripped: false, hull: false, level: false, x: 0, y: 0 };
      const shield: ViewEvent = { kind: 'gunHit', ship: e, room: -1, stripped: true, hull: false, level: false, x: 0, y: 0 };
      expect(hitCallouts([wear, shield], d.tactical)).toEqual([]);
      pushHits(fx, [wear, shield], d.tactical);
      expect(flashesFor(fx.struck, e).map((f) => f.room)).toEqual([Room.Engines]);
      expect(fx.callouts).toEqual([]);
      rooms[Room.Engines] = 1;
      expect(hitCallouts([{ ...wear, level: true }], d.tactical).map((c) => c.text)).toEqual(['GUN: ENGINES HIT']);
      rooms[Room.Engines] = 2;
      expect(hitCallouts([{ ...wear, level: true }], d.tactical).map((c) => [c.text, c.kind])).toEqual([['GUN: ENGINES OFFLINE', 'offline']]);
    } finally { disposeDuel(d); }
  });
});
