// Engineering spike §10.3, §11: the Weapons panel carries the three weapons' trimmed bars and the free Weapons bars; the
// beam's shots follow its bars (pew pew's bars do nothing on this branch: W-1's weapon); the keyboard queues weaponPower;
// WEAPONS OFFLINE only when the beam and the torpedo are both dark.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { PEW_ROW_H, STATION, stationTop, weaponCard, weaponPips } from '../src/renderer/src/render/duel/consoleLayout';
import { laserSituation, refusal, statusSentence, weaponsOffline } from '../src/renderer/src/render/duel/situationModel';
import { createDuelKeyboard, NO_HELD_FLAGS, type EventSource } from '../src/renderer/src/app/duel/input';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { initRocks } from '../src/renderer/src/sim/tactical/rocks';
import { placeMissile, Room } from '../src/renderer/src/sim/tactical/state';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound);
const OVERLAY = { zoomText: 'ZOOM 1.00', scaleBar: { px: 90, units: 100 }, snapHint: false };
const quiet: EventSource = { addEventListener() {}, removeEventListener() {} };

describe('the Weapons panel (spec §10.3, §11)', () => {
  it('round start: pew pew 1, beam 0, torpedo 1, no free bar, the beam fires 0 shots; two beam bars fire 2', () => {
    const d = createDuel(HOUND, 5);
    try {
      seatDuelCrew(d);
      const panel = () => consoleModel({ duel: d, me: 1, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!.weapons!;
      expect(panel()).toMatchObject({ weaponBars: [1, 0, 1], weaponFree: 0, burst: 0 });
      const sys = d.tactical.systems[0];
      sys.bars[1] = 4; sys.weaponPower[1] = 2;   // two more Weapons bars, both on the beam
      expect(panel()).toMatchObject({ weaponBars: [1, 2, 1], weaponFree: 0, burst: 2 });
    } finally { disposeDuel(d); }
  });
  // Merge with W-1 (SIM 58), replaced rule (kind a): W-1's PEW row stands in for Part ii's PEW PEW card (pew pew spec §1,
  // merge brief decision 4), so pew pew's bar pips sit on the PEW row and the beam's and the torpedo's under their cards.
  it('pew pew pips on the PEW row, the beam and torpedo pips under their cards, in slot order, inside the block', () => {
    const l = weaponCard('laser'), t = weaponCard('torpedo'), p0 = weaponPips(0), p1 = weaponPips(1), p2 = weaponPips(2);
    expect(t.x).toBeGreaterThan(l.x + l.w); expect(t.x + t.w).toBeLessThanOrEqual(STATION.x + STATION.w - 8);
    expect(p0.y).toBeGreaterThan(stationTop('weapons')); expect(p0.y + 10).toBeLessThanOrEqual(stationTop('weapons') + 6 + PEW_ROW_H);   // on the PEW row, above the cards
    expect(p1).toEqual({ x: l.x + 6, y: l.y + l.hitH + 2 }); expect(p2).toEqual({ x: t.x + 6, y: t.y + t.hitH + 2 });
    expect(l.pipsY + 14 + 24).toBeLessThanOrEqual(l.y + l.h);   // FIRE / LAUNCH under the pips, inside the card
  });
  it('weaponPower rides the keyboard\'s ship queue', () => {
    const kb = createDuelKeyboard(quiet);
    kb.ui.weaponPower?.(1, 1); kb.ui.weaponPower?.(2, -1);
    expect(kb.sample().ship).toEqual([{ kind: 'weaponPower', slot: 1, delta: 1 }, { kind: 'weaponPower', slot: 2, delta: -1 }]);
    kb.destroy();
  });
});

describe('WEAPONS OFFLINE only when the beam and the torpedo are both dark (spec §10.3, §11)', () => {
  it('round start: not offline, FIRE says BEAM UNPOWERED; the torpedo dark too: offline, whatever pew pew holds', () => {
    const d = createDuel(HOUND, 5), t = d.tactical, sys = t.systems[0], me = t.ships[0]!, e = t.ships[1]!;
    try {
      seatDuelCrew(d);
      t.map = { ...t.map, asteroids: [] }; t.grid = buildGrid([], t.map.rMap); t.rocks = initRocks(t.map);   // no rocks (feelIiModels' clearRocks): the line is clear by construction (nothing steps)
      e.x = me.x + hx(me.heading) * 200; e.y = me.y + hy(me.heading) * 200; e.active = true;   // dead ahead, in range and arc
      expect(lineOfSight(t, me.x, me.y, e.x, e.y)).toBe(true);   // the precondition
      expect(weaponsOffline(t)).toBe(false);
      expect(laserSituation(t).kind).toBe('none');   // the beam dark, the torpedo powered: the torpedo's card speaks
      expect(refusal(d, 'fire')).toBe('BEAM UNPOWERED');
      sys.weaponPower[2] = 0;   // pew pew keeps its 1 bar: it does not count
      expect(weaponsOffline(t)).toBe(true);
      expect(laserSituation(t).kind).toBe('offline');
      expect(statusSentence(laserSituation(t))).toBe('WEAPONS OFFLINE: POWER A WEAPON');   // merely unpowered: not a repair job
      t.systems[0].rooms[Room.Weapons] = 2;
      expect(statusSentence(laserSituation(t))).toBe('WEAPONS OFFLINE: REPAIR');   // the room damaged
      t.systems[0].rooms[Room.Weapons] = 0;
      expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual(['WEAPONS OFFLINE', 'WEAPONS OFFLINE']);
      sys.weaponPower.splice(0, 3, 0, 2, 0);   // the beam on 2 bars
      expect(weaponsOffline(t)).toBe(false);
      expect(refusal(d, 'fire')).toBeNull();
    } finally { disposeDuel(d); }
  });

  it('the beam dark, the torpedo powered: NO GUNNER and TORPEDO FLYING still speak, else none', () => {
    const d = createDuel(HOUND, 5), t = d.tactical, me = t.ships[0]!, e = t.ships[1]!;
    try {
      t.map = { ...t.map, asteroids: [] }; t.grid = buildGrid([], t.map.rMap); t.rocks = initRocks(t.map);
      e.x = me.x + hx(me.heading) * 200; e.y = me.y + hy(me.heading) * 200; e.active = true;
      expect(weaponsOffline(t)).toBe(false);
      expect(laserSituation(t, Infinity, true).kind).toBe('none');
      expect(statusSentence(laserSituation(t, Infinity, false))).toBe('NO GUNNER: SIT AT WEAPONS');
      placeMissile(t, 0, { x: 0, y: 0, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
      expect(statusSentence(laserSituation(t, Infinity, true))).toBe('LASER HOLDS: TORPEDO FLYING');
    } finally { disposeDuel(d); }
  });
});
