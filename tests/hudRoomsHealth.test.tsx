// @vitest-environment jsdom
// UI round spec §2.2, §2.4a: the old readout's room rows live on the HUD's power columns (damaged, offline, FIRE, the
// repair or extinguish bar), and the active player's health shows under the shields only when hurt or downed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Health, Life, LifeState } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { DuelSystem } from '../src/renderer/src/sim/duel/power';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { REPAIR_UNITS, DUEL_EXTINGUISH_UNITS } from '../src/renderer/src/sim/duel/tuning';
import { HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import { HEALTH_ROW, shipHud, type ShipHudView } from '../src/renderer/src/render/duel/shipHudModel';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import type { ConsoleView } from '../src/renderer/src/render/duel/consoleModel';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); });
const layout = parseShip(cutter);

describe('room state on the power columns (spec §2.4a)', () => {
  it('ok, damaged with repair progress, offline, and no room on SENS and O2', () => {
    const d = createDuel(layout, 5), rooms = d.tactical.systems[0].rooms;
    rooms[Room.Shields] = 1; d.repair[Room.Shields] = REPAIR_UNITS / 2; rooms[Room.Engines] = 2;
    const cols = shipHud(d, 0).power.systems;
    expect(cols[DuelSystem.Weapons]!.room).toEqual({ state: 'ok', progress: 0 });
    expect(cols[DuelSystem.Shields]!.room).toEqual({ state: 'damaged', progress: 0.5 });
    expect(cols[DuelSystem.Engines]!.room).toEqual({ state: 'offline', progress: 0 });
    expect([cols[DuelSystem.Sensors]!.room, cols[DuelSystem.Oxygen]!.room]).toEqual([null, null]);
    disposeDuel(d);
  });
  it('a burning room reads fire with the extinguish progress', () => {
    const d = createDuel(layout, 5);
    try {
      const p = d.points.find((q) => q.tacticalRoom === Room.Weapons)!;
      igniteRoom(d.interior, p.room);
      d.interior.rooms.fireRepair[p.room] = 180 / DUEL_EXTINGUISH_UNITS;
      expect(shipHud(d, 0).power.systems[DuelSystem.Weapons]!.room).toEqual({ state: 'fire', progress: 0.25 });
    } finally { disposeDuel(d); }
  });
  it('health: null at full, the fill when hurt, downed', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    try {
      expect(shipHud(d, 0).health).toBeNull();
      expect(HEALTH_ROW.y).toBe(132);   // below the shield panel (owner 2026-11-20; was 124)
      expect(HEALTH_ROW.barY + HEALTH_ROW.barH).toBeLessThanOrEqual(150);   // still inside the HUD's top block
      Health.cur[eid] = 40;
      expect(shipHud(d, 0).health).toEqual({ fill: 40 / HEALTH_MAX, downed: false });
      expect(shipHud(d, 1).health).toBeNull();
      Health.cur[eid] = 0; Life.state[eid] = LifeState.Downed;
      expect(shipHud(d, 0).health).toEqual({ fill: 0, downed: true });
    } finally { disposeDuel(d); }
  });
});

describe('the HUD draws them (spec §2.4a)', () => {
  it('a burning WEAP column and a hurt player render the fire block and the health bar', () => {
    const d = createDuel(layout, 5), eid = d.interior.crew[0]!;
    let h: ShipHudView;
    try {
      const p = d.points.find((q) => q.tacticalRoom === Room.Weapons)!;
      igniteRoom(d.interior, p.room); Health.cur[eid] = 40; h = JSON.parse(JSON.stringify(shipHud(d, 0))) as ShipHudView;
    } finally { disposeDuel(d); }
    const shipConsole: ConsoleView = { station: 'ship', tabs: { helm: 'open', weapons: 'locked', science: 'locked', ship: 'current' }, tabActions: { helm: 'interact', weapons: null, science: null, ship: null }, helm: null, weapons: null, science: null };
    const v: DuelUiView = { end: null, banners: { interior: null, tactical: null, notice: null, alert: null }, overlay: null, crt: false, console: shipConsole, hud: h };
    const ui = makeUi(), duel = createDuelSink(ui.store);
    ui.actions.setConsole({ press: vi.fn(), hold: vi.fn(), lock: vi.fn(), torpLock: vi.fn(), throttle: vi.fn(), frequency: vi.fn(), ship: vi.fn() });
    render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
    act(() => duel.frame(v));
    expect(document.querySelectorAll('[data-ui-hud-room="fire"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-ui-hud-health="40"]')).toHaveLength(1);
  });
});
