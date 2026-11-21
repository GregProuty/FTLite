// Engineering spike §10.2: the Helm carries the throttle cap (1 bar = 25 %); the app's throttle requests stop at the cap,
// and never reverse at 0 Engines bars. UI round §2.4: the per-console power strip is gone (the ship HUD shows the power on
// every view; the Science block shows the sensor range, scienceConsole.test.ts).
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { consoleModel } from '../src/renderer/src/render/duel/consoleModel';
import { NO_HELD_FLAGS, throttleRequest } from '../src/renderer/src/app/duel/input';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound);
const OVERLAY = { zoomText: 'ZOOM 1.00', scaleBar: { px: 90, units: 100 }, snapHint: false };
const steps = (up: number, down: number) => ({ throttleUp: up, throttleDown: down });

describe('the Helm\'s throttle cap on the console (spec §10.2)', () => {
  it('consoleModel: the Helm carries the cap 3 (75 %); the seats are the Helm and Weapons', () => {
    const d = createDuel(HOUND, 5);
    try {
      const at = (me: number) => consoleModel({ duel: d, me, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: OVERLAY })!;
      seatDuelCrew(d);
      expect(at(0).station).toBe('helm'); expect(at(0).helm?.cap).toBe(3);
      expect(at(1).station).toBe('weapons');
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
