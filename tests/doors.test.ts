import { describe, it, expect } from 'vitest';
import { DoorState, solidAt } from '../src/renderer/src/sim/grid';
import { toggleSeal } from '../src/renderer/src/sim/doors';
import { Position, Life, LifeState } from '../src/renderer/src/sim/components';
import { DOOR_CLOSE_DELAY } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, teleport, seconds } from './helpers/sim';

const G_DOOR = 5; // edge index of the G<->I door at tile (2,7)

describe('doors', () => {
  it('opens when a conscious crew member comes within the zone and closes after the delay', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 9.2);              // 1.7 tiles below the door centre (2.5, 7.5)
    run(s, 1);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
    run(s, 20, () => intents({ moveY: -1 }));   // walks up into the zone
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);
    expect(solidAt(s, 2, 7)).toBe(false);
    run(s, 40, () => intents({ moveY: 1 }));    // walks away
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);  // still within the close delay
    run(s, seconds(DOOR_CLOSE_DELAY) + 2);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
  });
  it('lets crew walk through into the corridor', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 8.5);
    run(s, seconds(1.5), () => intents({ moveY: -1 }));
    expect(Position.y[s.crew[0]!]).toBeLessThan(7);
  });
  it('a downed crew member in the zone does not hold it open', () => {
    const s = makeState(2);                // a second, conscious player keeps the run alive
    teleport(s, 1, 20.5, 5.5);             // far away in the corridor, outside every door zone
    teleport(s, 0, 2.5, 8.4);              // inside the 1-tile zone (0.9 from the door centre) but not overlapping the door tile (needs < 0.8)
    run(s, 1);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);
    Life.state[s.crew[0]!] = LifeState.Downed; Life.bleed[s.crew[0]!] = 30;
    run(s, seconds(DOOR_CLOSE_DELAY) + 2);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
  });
  it('a sealed door never auto-opens and blocks movement; toggling unseals', () => {
    const s = makeState(1);
    toggleSeal(s, G_DOOR);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Sealed);
    teleport(s, 0, 2.5, 8.5);
    run(s, seconds(1), () => intents({ moveY: -1 }));
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Sealed);
    expect(Position.y[s.crew[0]!]).toBeGreaterThan(8);
    toggleSeal(s, G_DOOR);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Closed);
  });
  it('sealing with a crew member on the door tile is deferred until clear', () => {
    const s = makeState(1);
    teleport(s, 0, 2.5, 7.5);   // standing in the doorway
    run(s, 1);
    toggleSeal(s, G_DOOR);
    run(s, 1);
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Open);
    expect(s.doors.sealRequested[G_DOOR]).toBe(1);
    run(s, seconds(1), () => intents({ moveY: 1 }));   // steps off the tile
    expect(s.doors.state[G_DOOR]).toBe(DoorState.Sealed);
    expect(s.doors.sealRequested[G_DOOR]).toBe(0);
  });
});
