// Spec 2026-11-17-artemis-consoles §2, §6.1, §6.3: the console layout and view model.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { createDuel, disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { canLaunch } from '../src/renderer/src/sim/tactical/weapons';
import { CONSOLE_RESERVE, CONTACT, CONTACT_BOX, CONTACT_RESERVE, EDGE, SIDE, SIDE_H, STATION, STATUS, TABS, TABS_RIGHT, stationTop } from '../src/renderer/src/render/duel/consoleLayout';
import { INTERNAL_H, INTERNAL_W } from '../src/shared/resolution';
import { consoleModel, consoleStation, consoleTabs, type ConsoleModelInput } from '../src/renderer/src/render/duel/consoleModel';
import { consoleInReach, repairInReach } from '../src/renderer/src/app/duel/controls';
import { NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { chargeRow } from '../src/renderer/src/render/duel/readoutModel';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
let seq = 0;
const step = (d: DuelState, player: number, command: DuelCommand | null) =>
  stepDuelTick(d, { held: [NONE, NONE], commands: command ? [{ runId: 'duel', id: { player, sequence: ++seq }, requestedTick: d.interior.tick, command }] : [] });
const put = (d: DuelState, pid: number, tile: number): void => { const W = d.interior.derived.width, eid = d.interior.crew[pid]!; Position.x[eid] = (tile % W) + 0.5; Position.y[eid] = Math.floor(tile / W) + 0.5; };
const model = (d: DuelState, over: Partial<ConsoleModelInput> = {}) => consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: null, ...over });
// createDuel seats player 0 at the Helm (nav) and player 1 at Weapons (duelControls.test.ts 'seatOf').

describe('console layout (spec §2)', () => {
  it('has the spec numbers', () => {
    expect(TABS_RIGHT).toBe(408); expect(CONSOLE_RESERVE).toEqual({ left: 228, right: 156 });
    expect(SIDE.x).toBe(1136); expect(STATUS).toMatchObject({ x: 12, y: 42, w: 204 }); expect(STATION).toMatchObject({ x: 12, w: 300 });
    expect(stationTop('helm')).toBe(508); expect(stationTop('weapons')).toBe(440);   // W-1: the PEW row; merge with the Engineering spike (kind a): the bar pips, +24 (was 464)
  });
  it('the contact window (enemy ship window spec §4.1): right edge, below the side column, overlapping nothing', () => {
    expect(SIDE_H).toBe(96);
    expect(CONTACT).toEqual({ x: 968, y: 150, w: 300, h: 420 });
    expect(CONTACT.x + CONTACT.w).toBe(INTERNAL_W - EDGE);
    expect(CONTACT.y).toBe(SIDE.y + SIDE_H + EDGE);
    expect(CONTACT_RESERVE).toBe(324);
    expect(CONTACT_BOX).toEqual({ x: 980, y: 210, w: 276, h: 200 });
    expect(CONTACT_BOX.x >= CONTACT.x && CONTACT_BOX.x + CONTACT_BOX.w <= CONTACT.x + CONTACT.w).toBe(true);
    expect(CONTACT_BOX.y >= CONTACT.y && CONTACT_BOX.y + CONTACT_BOX.h <= CONTACT.y + CONTACT.h).toBe(true);
    type R = { x: number; y: number; w: number; h: number };
    const rect = (x: number, y: number, w: number, h: number): R => ({ x, y, w, h });
    const overlap = (a: R, b: R): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const others: [string, R][] = [
      ['tabs', rect(TABS.x, TABS.y, TABS_RIGHT - TABS.x, TABS.h)],
      ['status', rect(STATUS.x, STATUS.y, STATUS.w, INTERNAL_H - STATUS.y)],
      ['helm block', rect(STATION.x, stationTop('helm'), STATION.w, STATION.h.helm)],
      ['weapons block', rect(STATION.x, stationTop('weapons'), STATION.w, STATION.h.weapons)],
      ['side column', rect(SIDE.x, SIDE.y, SIDE.w, SIDE_H)],
      ['scale bar row', rect(0, INTERNAL_H - 40, INTERNAL_W, 40)],
      ['info line row', rect(0, 0, INTERNAL_W, 30)],
      ['screen centre ± 80', rect(INTERNAL_W / 2 - 80, INTERNAL_H / 2 - 80, 160, 160)]
    ];
    for (const [name, r] of others) expect(overlap(CONTACT, r), name).toBe(false);
  });
});

describe('tabs (spec §6.3)', () => {
  it('seated at the Helm: HELM current, SHIP open (X); WEAPONS open (Tab) in single player only', () => {
    const d = createSeatedDuel(layout, 5);
    expect(model(d)).toMatchObject({ station: 'helm', tabs: { helm: 'current', weapons: 'open', ship: 'open' }, tabActions: { helm: null, weapons: 'switch', ship: 'stand' } });
    expect(model(d, { mode: 'online' })).toMatchObject({ tabs: { helm: 'current', weapons: 'locked', ship: 'open' }, tabActions: { weapons: null } });
    disposeDuel(d);
  });
  it('standing in reach of the free Weapons console with no repair in reach: WEAPONS open (E), SHIP current', () => {
    const d = createSeatedDuel(layout, 5);
    step(d, 1, { kind: 'stand' }); step(d, 0, { kind: 'stand' });
    put(d, 0, d.interior.derived.stationTile[d.weapons]!);
    expect(consoleInReach(d, 0)).toBe(d.weapons); expect(repairInReach(d, 0)).toBe(-1);   // the fixture's preconditions
    expect(model(d, { mode: 'online' })).toMatchObject({ station: 'ship', tabs: { ship: 'current', weapons: 'open', helm: 'locked' }, tabActions: { weapons: 'interact' } });
    disposeDuel(d);
  });
  it('standing in reach of a console and of a repair: the console stays locked (E would repair)', () => {
    expect(consoleTabs({ seat: 'standing', reach: 'weapons', repairNear: true, otherSeat: 'standing', mode: 'online' }).tabs.weapons).toBe('locked');
    expect(consoleTabs({ seat: 'standing', reach: 'weapons', repairNear: false, otherSeat: 'standing', mode: 'online' })).toMatchObject({ tabs: { weapons: 'open' }, tabActions: { weapons: 'interact' } });
    // single player: the other character at the Helm opens HELM by Tab even while E would repair
    expect(consoleTabs({ seat: 'standing', reach: 'weapons', repairNear: true, otherSeat: 'helm', mode: 'single' })).toMatchObject({ tabs: { helm: 'open', weapons: 'locked' }, tabActions: { helm: 'switch' } });
  });
  it('standing out of reach: online both consoles locked; single player opens the one the other character sits at', () => {
    const d = createSeatedDuel(layout, 5);
    step(d, 0, { kind: 'stand' });   // player 1 still at Weapons
    put(d, 0, 0);
    expect(model(d, { mode: 'online' })!.tabs).toEqual({ helm: 'locked', weapons: 'locked', science: 'locked', ship: 'current' });
    expect(model(d)).toMatchObject({ tabs: { helm: 'locked', weapons: 'open', ship: 'current' }, tabActions: { weapons: 'switch' } });
    disposeDuel(d);
  });
});

describe('station panels', () => {
  it('Weapons: lock, charge, magazine, launch and the missile', () => {
    const d = createSeatedDuel(layout, 5, 0, 2, ShipClass.ValkyrnLaser);   // W-4 spec §14.1: the beam's charge row, on the laser fit
    const w = model(d, { me: 1 })!.weapons!;
    expect(w.lock).toBe(d.tactical.systems[0].lock); expect(w.canLaunch).toBe(canLaunch(d.tactical, 0)); expect(w.missileFlying).toBe(false);
    expect(w.magazine).toMatch(/^\d+\/\d+$/);
    expect([w.charge.label, w.charge.value]).toEqual(['CHARGE', chargeRow(d).value]);
    while (!canLaunch(d.tactical, 0)) step(d, 1, null);
    step(d, 1, { kind: 'missileLaunch' });
    const after = model(d, { me: 1 })!.weapons!; expect(after.missileFlying).toBe(true); expect(after.canLaunch).toBe(false);
    expect(model(d, { me: 1 })!.helm).toBeNull();
    disposeDuel(d);
  });
  it('Helm: heading in degrees and speed', () => {
    const d = createSeatedDuel(layout, 5), s = d.tactical.ships[0]!;
    s.heading = 64; s.vx = 3; s.vy = 4;
    expect(model(d)!.helm).toMatchObject({ heading: 90, speed: 5 });
    disposeDuel(d);
  });
  it('the side column from the map overlay', () => {
    const d = createSeatedDuel(layout, 5), overlay = { zoomText: 'ZOOM 0.90', scaleBar: { px: 90, units: 100 }, snapHint: true };
    expect(model(d, { me: 1, overlay })!.side).toEqual({ zoom: '0.90', free: true, snapLabel: 'CAMERA' });
    expect(model(d, { overlay })!.side!.snapLabel).toBe('SNAP');
    disposeDuel(d);
  });
  it('consoleStation: the seat, or SHIP while standing (enemy ship window spec §6.5 step 1)', () => {
    const d = createSeatedDuel(layout, 5);
    expect(consoleStation(d, 0)).toBe('helm'); expect(consoleStation(d, 1)).toBe('weapons');
    step(d, 0, { kind: 'stand' });
    expect(consoleStation(d, 0)).toBe('ship'); expect(model(d)!.station).toBe('ship');
    disposeDuel(d);
  });
  it('hidden gives null', () => {
    const d = createSeatedDuel(layout, 5); expect(model(d, { hidden: true })).toBeNull(); disposeDuel(d);
  });
});

describe('the Helm throttle on the console (Artemis spec §4.2, §6.1)', () => {
  it('shows the level it is given (the local base), else the duel’s', () => {
    const d = createSeatedDuel(layout, 5);
    try {
      expect(model(d)!.helm!.throttle).toBe(0);
      d.throttle = 3; expect(model(d)!.helm!.throttle).toBe(3);
      expect(model(d, { throttle: 4 })!.helm!.throttle).toBe(4);
    } finally { disposeDuel(d); }
  });
});
