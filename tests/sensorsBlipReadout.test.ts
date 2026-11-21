// Sensors blip spec §3, §4: the sit-down card's place follows the ping's centre while the enemy is unseen; the lock
// refusal is unchanged. UI round §2.2: the OUTSIDE readout's ENEMY / BLIP rows are gone with the readout.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import { sitCard } from '../src/renderer/src/render/duel/sitModel';
import { lockRefusal } from '../src/renderer/src/render/duel/situationModel';
import type { FogView } from '../src/renderer/src/render/tactical/fogModel';
import { sitCardBelow } from '../src/renderer/src/app/duel/scene';

/** A hand-built fog view with the enemy unseen: a ping centred at (x, y), or no blip. */
const fogAt = (x: number, y: number, blip = true): FogView => ({ range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [], blip: blip ? { x, y, r: 375, age: 0 } : null });

describe('the lock refusal (sensors blip spec §3)', () => {
  it('the lock refusal still reads NO CONTACT on an unseen enemy', () => {
    const d = createDuel(parseShip(cutter), 5), [crew, enemy] = d.tactical.ships, r = sensorRange(d.tactical.systems[0]!);
    try {
      Object.assign(enemy!, { x: crew!.x + r * 2, y: crew!.y, active: true });
      expect(lockRefusal(d)).toBe('NO CONTACT');
      Object.assign(enemy!, { x: crew!.x + r / 2 });
      expect(lockRefusal(d)).toBeNull();
    } finally { disposeDuel(d); }
  });
});

describe('the sit-down card\'s place (sensors blip spec §3)', () => {
  it('unseen, it follows the ping\'s centre, not the enemy; with no blip, the enemy as today', () => {
    const t = createTacticalState(5), own = t.ships[0]!, e = t.ships[1]!;
    Object.assign(own, { x: 1000, y: 2000 });
    Object.assign(e, { x: 3000, y: 1500, active: true });       // the enemy is above the crew ship
    expect(sitCardBelow(t, fogAt(2900, 2300))).toBe(true);      // the ping's centre is below it
    expect(sitCardBelow(t, fogAt(2900, 1700))).toBe(false);
    expect(sitCardBelow(t, fogAt(0, 0, false))).toBe(false);    // no blip: the enemy's own place
    e.y = 2500;                                                 // the enemy below
    expect(sitCardBelow(t, fogAt(0, 0, false))).toBe(true);
    expect(sitCardBelow(t, fogAt(2900, 1700))).toBe(false);     // still the ping's centre while there is one
    expect(sitCard('helm', 0.5, false, sitCardBelow(t, fogAt(2900, 2300)))!.top).toBe(true);
    expect(sitCard('helm', 0.5, false, sitCardBelow(t, fogAt(2900, 1700)))!.top).toBe(false);
  });
});
