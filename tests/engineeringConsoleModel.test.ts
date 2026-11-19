// Engineering spike §9.3, §10.2, §10.4: each console shows its own system's power strip (Helm → Engines, Weapons →
// Weapons, Science → Sensors with the range); the Helm carries the throttle cap (1 bar = 25 %); the app's throttle
// requests stop at the cap, and never reverse at 0 Engines bars.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { powerStrip } from '../src/renderer/src/render/duel/shipHudModel';
import { NO_HELD_FLAGS, throttleRequest } from '../src/renderer/src/app/duel/input';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound);
const OVERLAY = { zoomText: 'ZOOM 1.00', scaleBar: { px: 90, units: 100 }, snapHint: false };
const steps = (up: number, down: number) => ({ throttleUp: up, throttleDown: down });

describe('powerStrip (spec §9.3, §10)', () => {
  it('Engines at round start (3 of 5, one spare); Sensors with its 900 range; damage shows as lost', () => {
    const d = createDuel(HOUND, 5), sys = d.tactical.systems[0];
    try {
      expect(powerStrip(d, 2)).toEqual({ system: 2, name: 'ENG', bars: 3, capacity: 5, slots: 5, max: 4, lost: 0, heat: 0, heatMax: 240, failed: false, overdriven: false, spare: 1 });
      expect(powerStrip(d, 3)).toMatchObject({ system: 3, name: 'SENS', bars: 1, range: 900 });
      expect(powerStrip(d, 1)).toMatchObject({ system: 1, name: 'WEAP', bars: 2, capacity: 10, slots: 10 });
      sys.rooms[Room.Engines] = 1;
      expect(powerStrip(d, 2)).toMatchObject({ capacity: 2, lost: 3 });   // knock ceil(5 / 2) = 3
    } finally { disposeDuel(d); }
  });
  it('consoleModel: the Helm shows the Engines strip and the cap 3 (75 %); Weapons its strip; standing shows none', () => {
    const d = createDuel(HOUND, 5);
    try {
      const at = (me: number) => consoleModel({ duel: d, me, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!;
      expect(at(0).power ?? null).toBeNull();   // both standing at the start: the ship view's HUD has the power
      seatDuelCrew(d);
      expect(at(0).station).toBe('helm'); expect(at(0).power?.system).toBe(2); expect(at(0).helm?.cap).toBe(3);
      expect(at(1).station).toBe('weapons'); expect(at(1).power?.system).toBe(1);
    } finally { disposeDuel(d); }
  });
});

describe('throttleRequest with a cap (spec §10.2)', () => {
  it('W and the notch clicks stop at the cap; without bars there is no reverse; the default cap is today\'s', () => {
    expect(throttleRequest(3, steps(1, 0), null, 3)).toBeNull();     // already at the cap
    expect(throttleRequest(2, steps(2, 0), null, 3)).toBe(3);
    expect(throttleRequest(0, steps(0, 0), 4, 3)).toBe(3);           // a 100 click at a cap of 3
    expect(throttleRequest(0, steps(0, 1), null, 0)).toBeNull();     // 0 Engines bars: no reverse
    expect(throttleRequest(1, steps(0, 3), null, 1)).toBe(-1);
    expect(throttleRequest(3, steps(1, 0), null)).toBe(4);           // no cap given: up to 4 as before
  });
});
