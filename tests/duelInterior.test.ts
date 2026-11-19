import { describe, expect, it } from 'vitest';
import type { BitmapText, Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Life, LifeState, Position, Stable } from '../src/renderer/src/sim/components';
import type { HeldInput } from '../src/renderer/src/net/contracts';
import { createDuel, disposeDuel, DUEL_CREW_MAX, type DuelState } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { Room } from '../src/renderer/src/sim/tactical/state';
import { REPAIR_UNITS } from '../src/renderer/src/sim/duel/tuning';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { duelFit, interiorOverlay, INTERIOR_BAND, READOUT_COLUMN } from '../src/renderer/src/render/duel/interiorModel';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import { createInteriorCamera, interiorInput } from '../src/renderer/src/render/duel/interiorCamera';
import { TILE_PX } from '../src/shared/resolution';
import type { ViewEvent } from '../src/renderer/src/render/tactical/fxModel';

const layout = parseShip(cutter);
const NONE: HeldInput = { moveX: 0, moveY: 0, interactHeld: false };
const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
/** Assets with every optional feature missing, so each layer draws its Graphics fallback (no textures in node). */
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
let seq = 0;
const step = (d: DuelState, commands: { player: number; command: Parameters<typeof stepDuelTick>[1]['commands'][number]['command'] }[] = [], held: HeldInput[] = [NONE, NONE]) =>
  stepDuelTick(d, { held, commands: commands.map((c) => ({ runId: 'duel', id: { player: c.player, sequence: ++seq }, requestedTick: d.interior.tick, command: c.command })) });
const crewAt = (d: DuelState) => d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));

describe('the duel interior through the reused interior layers (H-1 spec §8, §13 risk 1)', () => {
  it('draws a duel interior: tiles, desks, both crew and the damage overlay, fitted left of the readout column', () => {
    const d = createSeatedDuel(layout, 5), view = createInteriorView(assets);
    d.tactical.systems[0].rooms[Room.Shields] = 2;
    view.draw(d, crewAt(d), 1, 1 / 60);
    const fit = duelFit(d.interior.derived.width, d.interior.derived.height, 1);
    expect(fit).toEqual({ scale: 1, x: 66, y: 173 });   // the 29 × 13 Cutter is 928 × 416 px: centred in 1060 × 678, never upscaled
    expect([view.world.x, view.world.y, view.world.scale.x]).toEqual([66, 173, 1]);
    expect(fit.x + 29 * TILE_PX).toBeLessThanOrEqual(INTERIOR_BAND.w);
    expect(INTERIOR_BAND.w).toBe(1280 - READOUT_COLUMN);
    expect(count(view.container)).toBeGreaterThan(10);
    for (const eid of d.interior.crew) expect(view.memory.lastDrawn.get(Stable.id[eid]!)).toEqual({ x: Position.x[eid]!, y: Position.y[eid]! });
    view.destroy(); disposeDuel(d);
  });
  it('a warm-up of 2 frames, then 60 frames of walking, damage, repair and reseating add no display objects', () => {
    const d = createSeatedDuel(layout, 5), view = createInteriorView(assets);
    let prev = crewAt(d);
    const frame = (k: number): void => {
      prev = crewAt(d);
      if (k === 1) step(d, [{ player: 0, command: { kind: 'stand' } }]);
      else if (k === 20) { d.tactical.systems[0].rooms[Room.Engines] = 1; d.tactical.systems[0].rooms[Room.Weapons] = 2; step(d); }
      else if (k === 40) { d.repair[Room.Engines] = REPAIR_UNITS / 2; step(d, [{ player: 1, command: { kind: 'stand' } }]); }
      else if (k === 55) { d.tactical.systems[0].rooms[Room.Engines] = 0; d.tactical.systems[0].rooms[Room.Weapons] = 0; step(d); }
      else step(d, [], [{ moveX: -1, moveY: 0, interactHeld: false }, NONE]);
      view.draw(d, prev, 0.5, 1 / 60);
    };
    frame(0); frame(1);
    const n0 = count(view.container);
    for (let k = 2; k < 62; k++) frame(k);
    expect(count(view.container)).toBe(n0);
    view.destroy(); disposeDuel(d);
  });
  it('the overlay: damaged rooms tinted by level with a marker and progress; role consoles free or occupied', () => {
    const d = createSeatedDuel(layout, 5);
    expect(interiorOverlay(d).tints).toEqual([]);
    expect(interiorOverlay(d).consoles.map((c) => c.free)).toEqual([false, false]);   // player 0 at Navigation, player 1 at Weapons
    d.tactical.systems[0].rooms[Room.Shields] = 1; d.repair[Room.Shields] = REPAIR_UNITS / 4;
    step(d, [{ player: 1, command: { kind: 'stand' } }]);
    const o = interiorOverlay(d);
    expect(o.tints.map((t) => [t.tacticalRoom, t.level])).toEqual([[Room.Shields, 1]]);
    expect(o.tints[0]!.tiles.length).toBe(d.interior.derived.roomTiles[d.interior.derived.roomIndex.get('R')!]!.length);
    expect(o.markers).toEqual([{ tacticalRoom: Room.Shields, level: 1, x: 16.5 * TILE_PX, y: 8.5 * TILE_PX, progress: 0.25, label: 'SHIELDS 1', fire: false }]);
    expect(o.consoles.map((c) => [c.station, c.free])).toEqual([[d.nav, false], [d.weapons, true]]);
    disposeDuel(d);
  });
  it('light and feel (Art-i spec sections 5-8): the spec order, and a hit on the crew ship flashes and shakes only the interior world', () => {
    const d = createSeatedDuel(layout, 5), view = createInteriorView(assets);
    const kids = view.world.children;
    expect(view.container.children[1]).toBe(view.world);                                      // the starfield first, under the world
    expect((kids[3] as Container).blendMode).toBe('multiply');                                // the battlemap, tiles, the props (Art-iii), then the grade
    const lights = kids.findIndex((k) => k.blendMode === 'add');
    expect(lights).toBe(13);                                                                   // after effects.above (the air tint, Engineering spike §6; the station badges, start-aboard spec §2, sit after the desks)
    expect(kids.length - lights - 1).toBe(30);                                                 // the marks, the three marker labels, the sixteen hazard labels (Engineering spike §6), the four downed labels (duel-health; one per player of the largest crew, Sci-2 spec §7), the healing marks and four REVIVED labels (duel polish i spec §D) and the badge labels above the lights
    view.draw(d, crewAt(d), 1, 1 / 60);
    expect([view.world.x, view.world.y]).toEqual([66, 173]);
    const hit = { kind: 'laser', ship: 1, hit: true, x1: 0, y1: 0, x2: 1, y2: 1 } as unknown as ViewEvent;
    view.draw(d, crewAt(d), 1, 1 / 60, [hit]);
    expect(Math.abs(view.world.x - 66) + Math.abs(view.world.y - 173)).toBe(12);              // 6 art pixels (cos 0) at world scale 1
    expect(view.container.x).toBe(0);
    view.destroy(); disposeDuel(d);
  });
});

describe('the interior view places its world from the zoom camera (interior zoom spec)', () => {
  it('level 0 is the fit; +1 follows the active character on whole pixels; the hit shake goes on top', () => {
    const d = createSeatedDuel(layout, 5), view = createInteriorView(assets), camera = createInteriorCamera();
    view.draw(d, crewAt(d), 1, 1 / 60, [], 1 / 60, { camera, active: 0 });
    expect([view.world.x, view.world.y, view.world.scale.x]).toEqual([66, 173, 1]);
    interiorInput(camera, { notches: 1, anchor: null, dragX: 0, dragY: 0, follow: false });
    view.draw(d, crewAt(d), 1, 1 / 60, [], 1 / 60, { camera, active: 0 });
    const eid = d.interior.crew[0]!, cx = Position.x[eid]! * TILE_PX * 1.5;
    expect(view.world.scale.x).toBe(1.5);
    expect(view.world.x).toBe(Math.min(0, Math.max(1060 - 29 * TILE_PX * 1.5, Math.round(530 - cx))));
    expect(view.world.y).toBe(69);   // 624 px tall: centred in the 678-px band
    const at = { x: view.world.x, y: view.world.y };
    const hit = { kind: 'laser', ship: 1, hit: true, x1: 0, y1: 0, x2: 1, y2: 1 } as unknown as ViewEvent;
    view.draw(d, crewAt(d), 1, 1 / 60, [hit], 1 / 60, { camera, active: 0 });
    expect(Math.abs(view.world.x - at.x) + Math.abs(view.world.y - at.y)).toBe(18);   // 6 art pixels at 3 screen px each
    view.destroy(); disposeDuel(d);
  });
});

describe('healing and revive feedback in the interior (duel polish i spec §D)', () => {
  it('a revive shows its pooled REVIVED label over the character, with no display-object growth', () => {
    const d = createSeatedDuel(layout, 5), view = createInteriorView(assets), e1 = d.interior.crew[1]!;
    const revived = () => view.world.children.filter((k) => (k as BitmapText).text === 'REVIVED');
    try {
      Life.state[e1] = LifeState.Downed;
      view.draw(d, crewAt(d), 1, 1 / 60);
      const n0 = count(view.container);
      expect(revived()).toHaveLength(DUEL_CREW_MAX);   // one per player of the largest crew (Sci-2 spec §7)
      expect(revived().every((t) => !t.visible)).toBe(true);
      Life.state[e1] = LifeState.Conscious; d.tactical.tick += 1;
      view.draw(d, crewAt(d), 1, 1 / 60);
      const shown = revived().filter((t) => t.visible);
      expect(shown).toHaveLength(1);
      expect(shown[0]!.x).toBe(Math.round(Position.x[e1]! * TILE_PX));
      for (let k = 0; k < 30; k++) { d.tactical.tick += 1; view.draw(d, crewAt(d), 1, 1 / 60); }
      expect(count(view.container)).toBe(n0);
    } finally { view.destroy(); disposeDuel(d); }
  });
});
