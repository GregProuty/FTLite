// Engineering spike §10.3, §11: the Weapons panel carries the three weapons' trimmed bars and the free Weapons bars; the
// beam's shots follow its bars (pew pew's bars do nothing on this branch: W-1's weapon); the keyboard queues weaponPower;
// WEAPONS OFFLINE only when the beam and the torpedo are both dark.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { CARD_ORDER, STATION, weaponCard } from '../src/renderer/src/render/duel/consoleLayout';
import { laserSituation, refusal, weaponsOffline } from '../src/renderer/src/render/duel/situationModel';
import { createDuelKeyboard, NO_HELD_FLAGS, type EventSource } from '../src/renderer/src/app/duel/input';
import { hx, hy } from '../src/renderer/src/sim/tactical/direction';
import { lineOfSight } from '../src/renderer/src/sim/tactical/geometry';
import { buildGrid } from '../src/renderer/src/sim/tactical/grid';
import { initRocks } from '../src/renderer/src/sim/tactical/rocks';
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
  it('three cards side by side in slot order, inside the block', () => {
    expect(CARD_ORDER).toEqual(['pew', 'laser', 'torpedo']);
    const [p, l, t] = CARD_ORDER.map((c) => weaponCard(c));
    expect(l!.x).toBeGreaterThan(p!.x + p!.w); expect(t!.x).toBeGreaterThan(l!.x + l!.w);
    expect(t!.x + t!.w).toBeLessThanOrEqual(STATION.x + STATION.w - 8);
    expect(p!.pipsY).toBe(p!.y + p!.hitH + 2);
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
      expect([refusal(d, 'fire'), refusal(d, 'launch')]).toEqual(['WEAPONS OFFLINE', 'WEAPONS OFFLINE']);
      sys.weaponPower.splice(0, 3, 0, 2, 0);   // the beam on 2 bars
      expect(weaponsOffline(t)).toBe(false);
      expect(refusal(d, 'fire')).toBeNull();
    } finally { disposeDuel(d); }
  });
});
