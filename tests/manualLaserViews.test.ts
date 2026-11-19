// W-2 manual laser (spec 2026-11-18-pew-pew-weapons-design §2, §5): the views. The Weapons map shows the MANUAL laser's aim
// line while Space would fire, from the own ship along the aim clamped into ±60° to the laser's reach (along the nose
// with no aim yet); none in AUTO, on the Helm, uncharged or with the own torpedo flying. Online, a MANUAL hit's gap event
// names the enemy room whose level rose.
import { describe, expect, it } from 'vitest';
import { duelCounters, gapEvents } from '../src/renderer/src/app/duel/onlineSource';
import { createCamera, worldToScreen, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import type { PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { createTacticalState, placeMissile, Room, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { AIM_STEPS, HEADING_COUNT, LASER_ARC_STEPS, LASER_CHARGE_UNITS, LASER_RANGE } from '../src/renderer/src/sim/tactical/tuning';

const vp = { w: 1280, h: 720 };
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons', laserAim: number | null): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships: [0, 1], paused: false, reserveRight: 236, missilePrev: [null, null], fx: createFx(), laserAim };
}
function northFacing(): TacticalState {
  const st = createTacticalState(5);
  Object.assign(st.ships[0], { heading: 0, headingAcc: 0, vx: 0, vy: 0 });
  return st;
}

describe('the MANUAL laser\'s aim line (spec §2)', () => {
  it('runs from the own marker along the aim clamped into ±60°, to the laser reach; along the nose with no aim', () => {
    const st = northFacing(), cam = createCamera(st.ships[0].x, st.ships[0].y, 0.5), own = worldToScreen(cam, vp, st.ships[0].x, st.ships[0].y);
    expect(combatModel(input(st, cam, 'weapons', 64 * HEADING_COUNT)).laserAim ?? null).toBeNull();   // AUTO: none
    st.systems[0].laserManual = true;
    const east = combatModel(input(st, cam, 'weapons', 64 * HEADING_COUNT)).laserAim!, a = (LASER_ARC_STEPS / AIM_STEPS) * 2 * Math.PI;
    expect([east.x1, east.y1]).toEqual([own.x, own.y]);
    expect(east.x2).toBeCloseTo(own.x + Math.sin(a) * LASER_RANGE * 0.5, 6); expect(east.y2).toBeCloseTo(own.y - Math.cos(a) * LASER_RANGE * 0.5, 6);
    const nose = combatModel(input(st, cam, 'weapons', null)).laserAim!;
    expect(nose.x2).toBeCloseTo(own.x, 6); expect(nose.y2).toBeCloseTo(own.y - LASER_RANGE * 0.5, 6);
  });
  it('shows only at Weapons while Space would fire: not on the Helm, uncharged, with a burst pending or the own torpedo flying', () => {
    const st = northFacing(), cam = createCamera(st.ships[0].x, st.ships[0].y, 1);
    st.systems[0].laserManual = true;
    expect(combatModel(input(st, cam, 'helm', 0)).laserAim ?? null).toBeNull();
    st.systems[0].laserCharge = LASER_CHARGE_UNITS - 1;
    expect(combatModel(input(st, cam, 'weapons', 0)).laserAim ?? null).toBeNull();
    st.systems[0].laserCharge = LASER_CHARGE_UNITS; st.systems[0].laserBurst = 1;
    expect(combatModel(input(st, cam, 'weapons', 0)).laserAim ?? null).toBeNull();
    st.systems[0].laserBurst = 0;
    placeMissile(st, 0, { x: st.ships[0].x + 500, y: st.ships[0].y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 });
    expect(combatModel(input(st, cam, 'weapons', 0)).laserAim ?? null).toBeNull();
  });
});

describe('the online view (spec §2)', () => {
  it('a MANUAL hit\'s gap event names the room whose level rose; an AUTO hit keeps the lock room', () => {
    for (const manual of [false, true]) {
      const st = createTacticalState(5);
      st.systems[0].laserManual = manual;
      st.systems[1].shields = 0;
      const before = [duelCounters(st, 0), duelCounters(st, 1)];
      st.systems[0].shots++; st.systems[0].laserHits++; st.systems[1].rooms[Room.Engines]++;
      const rooms = gapEvents(before, [null, null], st).flatMap((e) => (e.kind === 'laser' && e.ship === 0 ? [e.room] : []));
      expect(rooms, `manual ${manual}`).toEqual([manual ? Room.Engines : st.systems[0].lock]);
    }
  });
});
