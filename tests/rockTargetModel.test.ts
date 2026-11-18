// Spike ii §6.5: the pure pieces of dropping a weapon on a rock: the pickRock hit test, the rock brackets in the map
// model, and the contact controller's pickRock request.
import { describe, expect, it } from 'vitest';
import { createCamera, worldToScreen } from '../src/renderer/src/render/tactical/camera';
import { pickRock, ROCK_PICK_MIN_PX, tacticalModel, type TacticalModelInput } from '../src/renderer/src/render/tactical/tacticalModel';
import { createContactController, type ContactSync } from '../src/renderer/src/app/duel/contactController';
import { NO_AXES } from '../src/renderer/src/sim/tactical/state';
import { arena, mover } from './helpers/rockArena';

const vp = { w: 1280, h: 720 };

describe('pickRock (spec §6.5)', () => {
  it('returns the live rock whose drawn circle holds the pointer, the nearest centre first, ties to the lower slot', () => {
    const st = arena(), camera = createCamera(0, 2000, 1), at = (x: number, y: number) => worldToScreen(camera, vp, x, y), input = { state: st, camera, viewport: vp };
    mover(st, 10, 0, 2000, 0, 0, 40); mover(st, 5, 30, 2000, 0, 0, 40);
    expect(pickRock(input, at(15, 2000))).toBe(5);    // equidistant: the lower slot
    expect(pickRock(input, at(25, 2000))).toBe(5);
    expect(pickRock(input, at(5, 2000))).toBe(10);
    expect(pickRock(input, at(200, 2000))).toBeNull();
    mover(st, 20, 300, 2000, 0, 0, 2);
    expect(ROCK_PICK_MIN_PX).toBe(6);
    expect(pickRock(input, at(305, 2000))).toBe(20);  // a 2 px rock picks within 6 px
  });
});

describe('the rock brackets (spec §6.5)', () => {
  it('a targeted rock wears its weapon\'s mark (the torpedo\'s while it flies too); a hover mark under the pointer; none outside the duel', () => {
    const st = arena(), camera = createCamera(0, 2000, 1);
    mover(st, 10, 0, 2000, 0, 0, 30); mover(st, 11, 100, 2000, 0, 0, 30); mover(st, 12, -100, 2000, 0, 0, 30);
    st.systems[0].laserRock = 10; st.systems[0].torpRockFlying = 11;
    const input: TacticalModelInput = { state: st, prev: st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading })), alpha: 1, camera, viewport: vp, console: 'weapons', axes: NO_AXES,
      ships: [0], paused: false, reserveRight: 0, contacts: true, rockHover: { rock: 12, weapon: 'torpedo' } };
    const marks = tacticalModel(input).rockMarks!;
    expect(marks.map((m) => [m.weapon, m.hover])).toEqual([['laser', false], ['torpedo', false], ['torpedo', true]]);
    expect(marks[0]).toMatchObject({ x: 640, y: 360, r: 35 });
    expect(tacticalModel({ ...input, contacts: false }).rockMarks).toBeUndefined();
  });
});

describe('the contact controller\'s pickRock (spec §6.5)', () => {
  const live: ContactSync = { shown: true, station: 'weapons', target: 1, active: () => true, epoch: 0, enemyKnown: 2 };
  it('with a weapon picked up: a rockLock request, the pick-up disarmed and the window closed; with none: nothing', () => {
    const c = createContactController();
    c.sync(live);
    c.pickRock(7);
    expect(c.takeRequests().rockLock).toBeUndefined();
    c.pickUp('torpedo');
    c.pickRock(7);
    expect(c.takeRequests().rockLock).toEqual({ weapon: 'torpedo', rock: 7 });
    expect([c.state(), c.aimWeapon()]).toEqual([null, null]);
    expect(c.takeRequests().rockLock).toBeUndefined();   // taken once
  });
});
