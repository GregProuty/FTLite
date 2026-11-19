// Engineering spike §7: in Single player a ship-view click reaches the sim on the next tick from any character, on foot
// or seated: bars move between systems, coolant cycles, a door is held open and an airlock opens. Paused, it is dropped.
import { describe, expect, it } from 'vitest';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { DoorState } from '../src/renderer/src/sim/grid';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import type { ShipCommand } from '../src/renderer/src/render/duel/shipControls';
import { seatDuelCrew } from './helpers/duelSeat';

const HOUND = parseShip(hound), TICK_MS = 1000 / 60;
const idle = (): KeySample => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() });

function rig() {
  let now = 0, keys = idle();
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: { w: 1280, h: 720 }, layout: HOUND,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = idle(); return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => { keys = idle(); }
  });
  const advance = (ms: number): void => {
    const end = now + ms;
    for (;;) { tasks.sort((a, b) => a.at - b.at); const t = tasks[0]; if (!t || t.at > end) break; tasks.shift(); now = Math.max(now, t.at); t.cb(); }
    now = end;
  };
  /** One frame carrying `ship`, a tick of wall time, and a frame after it. */
  const click = (...ship: ShipCommand[]): void => { keys = { ...idle(), ship }; rt.frame(1 / 60); advance(TICK_MS); rt.frame(1 / 60); };
  return { rt, click, advance, press: (p: Partial<Record<'pause', number>>) => { keys = { ...idle(), presses: { ...emptyPresses(), ...p } }; rt.frame(1 / 60); } };
}

describe('ship commands in Single player (spec §7)', () => {
  it('on foot: a Sensors bar out, then a Weapons bar in; coolant on Weapons; a door held; an airlock open', () => {
    const { rt, click } = rig(), d = rt.duel, der = d.interior.derived, bars = () => [...d.tactical.systems[0].bars];
    try {
      expect(rt.view()).toBe('interior');
      expect(bars()).toEqual([2, 2, 3, 1, 1]);
      click({ kind: 'shipPower', system: 3, delta: -1 });
      expect(bars()).toEqual([2, 2, 3, 0, 1]);
      click({ kind: 'shipPower', system: 1, delta: 1 });
      expect(bars()).toEqual([2, 3, 3, 0, 1]);
      click({ kind: 'shipCoolant', system: 1 });
      expect(d.power.coolant[1]).toBe(1);
      const edge = der.doorTileToEdge[7 * der.width + 12]!;
      click({ kind: 'shipDoor', edge });
      expect(d.interior.doors.state[edge]).toBe(DoorState.HeldOpen);
      const lock = der.airlockOfTile[7 * der.width]!;
      click({ kind: 'shipAirlock', index: lock });
      expect(d.interior.airlocks.open[lock]).toBe(1);
    } finally { rt.dispose(); }
  });
  it('seated at a console: the same click still applies (anyone in the ship view, spec §5)', () => {
    const { rt, click } = rig(), d = rt.duel;
    try {
      seatDuelCrew(d);
      click({ kind: 'shipPower', system: 4, delta: -1 });
      expect(d.tactical.systems[0].bars[4]).toBe(0);
    } finally { rt.dispose(); }
  });
  it('paused: a click is dropped, not held for later', () => {
    const { rt, click, press } = rig(), d = rt.duel;
    try {
      press({ pause: 1 });
      expect(rt.paused()).toBe(true);
      click({ kind: 'shipPower', system: 3, delta: -1 });
      press({ pause: 1 });
      click();
      expect(d.tactical.systems[0].bars[3]).toBe(1);
    } finally { rt.dispose(); }
  });
});
