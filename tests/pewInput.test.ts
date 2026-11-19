// W-1 pew pew (spec 2026-11-18-pew-pew-weapons-design §1, §4, §5): a left click on the Weapons map asks for the pew at the
// pointer's bearing; the Single player runtime sends pewFire from the Weapons seat, or refuses NO CHARGE and queues
// nothing; the Settings list names the left click.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { controlSections } from '../src/renderer/src/app/controlsList';
import { emptyPresses, type KeyAction, type KeySample } from '../src/renderer/src/app/duel/input';
import { createMapRequests } from '../src/renderer/src/app/duel/mapRequests';
import { onWeaponsMap } from '../src/renderer/src/app/duel/flightPointer';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { CONTACT, SIDE, STATION, stationTop, STATUS, TABS } from '../src/renderer/src/render/duel/consoleLayout';
import { refusal } from '../src/renderer/src/render/duel/situationModel';
import { HEADING_COUNT } from '../src/renderer/src/sim/tactical/tuning';
import { seatDuelCrew } from './helpers/duelSeat';

const layout = parseShip(cutter), vp = { w: 1280, h: 720 };
function rig(pews: (number | null)[]) {
  let now = 0, keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
  const tasks: { at: number; cb: () => void }[] = [];
  const rt = createDuelRuntime({
    now: () => now, seed: 5, viewport: vp, layout,
    scheduler: { schedule(delay, cb) { const t = { at: now + delay, cb }; tasks.push(t); return () => { const i = tasks.indexOf(t); if (i >= 0) tasks.splice(i, 1); }; } },
    sampleKeys: () => { const k = keys; keys = { ...k, presses: emptyPresses() }; return k; },
    samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }),
    clearKeys: () => { keys = { ...keys, presses: emptyPresses() }; },
    takePew: () => pews.shift() ?? null
  });
  const press = (a: KeyAction): void => { keys = { ...keys, presses: { ...keys.presses, [a]: 1 } }; };
  const tick = (): void => { rt.frame(1 / 60); now += 1000 / 60; tasks.sort((a, b) => a.at - b.at); while (tasks[0] && tasks[0].at <= now) tasks.shift()!.cb(); rt.frame(1 / 60); };
  seatDuelCrew(rt.duel);
  press('switch'); tick(); tick();   // Tab takes the gunner (player 1, at Weapons)
  return { rt, tick };
}

describe('the map requests (spec §1)', () => {
  it('keep the latest pew aim until taken', () => {
    const r = createMapRequests();
    expect(r.takePew()).toBeNull();
    r.pew(100); r.pew(200);
    expect([r.takePew(), r.takePew()]).toEqual([200, null]);
  });
});

describe('the Weapons map pointer (spec §1)', () => {
  it('is the open map only: clear of the tab strip, the status table, the side column, the Weapons block and the open contact window', () => {
    expect(onWeaponsMap({ x: 640, y: 300 }, false, 13)).toBe(true);
    expect(onWeaponsMap({ x: -1, y: 300 }, false, 13)).toBe(false);
    expect(onWeaponsMap({ x: TABS.x + 5, y: TABS.y + 5 }, false, 13)).toBe(false);
    expect(onWeaponsMap({ x: STATUS.x + 5, y: STATUS.y + 5 }, false, 13)).toBe(false);
    expect(onWeaponsMap({ x: SIDE.x + 5, y: SIDE.y + 5 }, false, 13)).toBe(false);
    expect(onWeaponsMap({ x: STATION.x + 20, y: stationTop('weapons') + 10 }, false, 13)).toBe(false);   // the top of the Weapons block (the PEW row after Task 9)
    expect(onWeaponsMap({ x: CONTACT.x + 20, y: CONTACT.y + 20 }, true, 13)).toBe(false);
    expect(onWeaponsMap({ x: CONTACT.x + 20, y: CONTACT.y + 20 }, false, 13)).toBe(true);
  });
});

describe('the Single player runtime (spec §1, §4)', () => {
  it('a pew request at the Weapons seat goes out as pewFire {aim, aimAcc} and fires', () => {
    const pews: (number | null)[] = [];
    const { rt, tick } = rig(pews);
    try {
      expect(rt.view()).toBe('weapons');
      expect(refusal(rt.duel, 'pew')).toBeNull();
      pews.push(rt.duel.tactical.ships[0].heading * HEADING_COUNT + 77);
      tick();
      expect(rt.duel.tactical.systems[0].pewShots).toBe(1);
      expect(rt.duel.tactical.pew.filter((r) => r.active)).toHaveLength(1);
    } finally { rt.dispose(); }
  });
  it('with less than a third stored a click is refused NO CHARGE and nothing is queued', () => {
    const pews: (number | null)[] = [];
    const { rt, tick } = rig(pews);
    try {
      rt.duel.tactical.systems[0].pewCharge = 0;
      expect(refusal(rt.duel, 'pew')).toBe('NO CHARGE');
      pews.push(0); tick();
      expect(rt.takeRefusals()).toEqual([{ control: 'pew', reason: 'NO CHARGE' }]);
      expect(rt.duel.tactical.systems[0].pewShots).toBe(0);
      expect(rt.duel.tactical.pew.every((r) => !r.active)).toBe(true);
    } finally { rt.dispose(); }
  });
});

describe('the Settings controls list (spec §1)', () => {
  it('names the left click at Weapons', () => {
    const rows = controlSections()[0]!.rows;
    expect(rows.find((r) => r.keys === 'Left click')?.action).toMatch(/Weapons.*pew/);
  });
});
