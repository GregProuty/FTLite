// Sci-1 (spec 2026-11-17-science-scans §6.1, §7.3): the Science seat in the app: seatOf and the console station, the
// reach to sit, the tab strip, the console model, the runtime's view, camera and partner status, the readout mode and
// the CRT.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sitDown, standUp } from '../src/renderer/src/sim/stations';
import { consoleInReach, seatOf } from '../src/renderer/src/app/duel/controls';
import { emptyPresses, NO_HELD_FLAGS } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { consoleModel, consoleStation, consoleTabs } from '../src/renderer/src/render/duel/consoleModel';
import { STATION, stationTop, TABS, TABS_RIGHT } from '../src/renderer/src/render/duel/consoleLayout';
import { crewStatus } from '../src/renderer/src/render/duel/readoutModel';
import { crtActive } from '../src/renderer/src/render/crt';

const CUTTER = parseShip(cutter), HOUND = parseShip(hound);

describe('the Science seat (spec §6.1)', () => {
  it('seatOf and consoleStation name Science on the Cutter and on the Hound (whose Science shares a console group)', () => {
    for (const layout of [CUTTER, HOUND]) {
      const d = createDuel(layout, 5);
      try {
        sitDown(d.interior, 0, d.science);
        expect([seatOf(d, 0), consoleStation(d, 0)], layout.id).toEqual(['science', 'science']);
        standUp(d.interior, 0);
        expect(seatOf(d, 0)).toBe('standing');
      } finally { disposeDuel(d); }
    }
  });
  it('consoleInReach offers the free Science console from its tile, and not once it is taken', () => {
    const d = createDuel(CUTTER, 5);
    try {
      const tile = d.interior.derived.stationTile[d.science]!, W = d.interior.derived.width, eid = d.interior.crew[0]!;
      Position.x[eid] = (tile % W) + 0.5; Position.y[eid] = Math.floor(tile / W) + 0.5;
      expect(consoleInReach(d, 0)).toBe(d.science);
      sitDown(d.interior, 1, d.science);
      expect(consoleInReach(d, 0)).toBe(-1);
    } finally { disposeDuel(d); }
  });
});

describe('the Science console (spec §7.3)', () => {
  it('the tab strip has four tabs; a Science seat lights SCIENCE, and standing in reach opens it to E', () => {
    expect(TABS_RIGHT).toBe(TABS.x + 4 * TABS.w + 3 * TABS.gap);
    expect(consoleTabs({ seat: 'science', reach: null, repairNear: false, otherSeat: 'standing', mode: 'online' }))
      .toEqual({ tabs: { helm: 'locked', weapons: 'locked', science: 'current', ship: 'open' }, tabActions: { helm: null, weapons: null, science: null, ship: 'stand' } });
    expect(consoleTabs({ seat: 'standing', reach: 'science', repairNear: false, otherSeat: 'helm', mode: 'single' }))
      .toEqual({ tabs: { helm: 'open', weapons: 'locked', science: 'open', ship: 'current' }, tabActions: { helm: 'switch', weapons: null, science: 'interact', ship: null } });
  });
  it('the console model at Science: no Helm or Weapons block, the side column with SNAP', () => {
    const d = createDuel(CUTTER, 5);
    try {
      sitDown(d.interior, 0, d.science);
      expect(consoleModel({ duel: d, me: 0, mode: 'single', hidden: false, held: NO_HELD_FLAGS, overlay: { zoomText: 'ZOOM 0.50', scaleBar: { px: 50, units: 100 }, snapHint: false } }))
        .toMatchObject({ station: 'science', helm: null, weapons: null, side: { zoom: '0.50', free: false, snapLabel: 'SNAP' } });
    } finally { disposeDuel(d); }
  });
  it('the Science block sits at the bottom left, 96 high', () => {
    expect(STATION.h.science).toBe(96);
    expect(stationTop('science')).toBe(720 - 12 - 96);
  });
  it('the CRT is on at science (UI round §2.2: the readout heading and help are gone)', () => {
    expect(crtActive('science')).toBe(true);
  });
});

describe('the runtime at Science', () => {
  it('a Science seat views science with its own camera; the partner reads AT SCIENCE', () => {
    const rt = createDuelRuntime({
      now: () => 0, scheduler: { schedule: () => () => {} }, seed: 5, viewport: { w: 1280, h: 720 }, layout: CUTTER,
      sampleKeys: () => ({ moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() }),
      samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 })
    });
    try {
      sitDown(rt.duel.interior, 0, rt.duel.science);
      expect(rt.view()).toBe('science');
      expect(rt.cameras.science).not.toBe(rt.cameras.helm);
      rt.frame(1 / 60);
      standUp(rt.duel.interior, 0); sitDown(rt.duel.interior, 0, rt.duel.nav); sitDown(rt.duel.interior, 1, rt.duel.science);
      expect(crewStatus(rt.duel, 1)).toBe('SCIENCE');
    } finally { rt.dispose(); }
  });
});
