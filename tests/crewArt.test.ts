import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { AnimatedSprite, Graphics, Texture } from 'pixi.js';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Life, LifeState, Owner, Position, Seated } from '../src/renderer/src/sim/components';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, FACINGS } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES, featureReady } from '../src/renderer/src/render/fallback';
import type { GameAnimation, GameAssets } from '../src/renderer/src/render/assets';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createCrewLayer, CREW_COLORS } from '../src/renderer/src/render/crewSprites';
import { bubbleAnchor, CALLOUT_LIFT_PUNY } from '../src/renderer/src/render/calloutModel';
import { consoles, stationSides } from '../src/renderer/src/render/consoleModel';
import {
  CALLOUT_LIFT_DOWN_LIMEZU, CALLOUT_LIFT_LIMEZU, CARRY_LIFT_LIMEZU, CARRY_LIFT_PUNY, CREW_ART_NAMES, CREW_SHEETS, crewPose, crewSlot, facing4, footAnchorY, limezuSheet,
  LIMEZU_ANCHOR_Y, LIMEZU_FOOT_ROW, LIMEZU_HEAD_ROW
} from '../src/renderer/src/render/crewArt';
import { TILE_PX } from '../src/shared/resolution';
import { cutterState, RECRUITS } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

// AnimatedSprite.play() starts Pixi's shared ticker, which needs requestAnimationFrame (absent in node).
beforeAll(() => {
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number; cancelAnimationFrame?: (id: number) => void };
  g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= () => undefined;
});

/** Assets with every LimeZu and Puny name bound to its own named texture, and the other optional features missing. */
function fakeAssets(withCrewArt: boolean): GameAssets {
  const tex = new Map<string, Texture>(), named = (n: string): Texture => { let t = tex.get(n); if (!t) { t = new Texture(); t.label = n; tex.set(n, t); } return t; };
  const anim = (n: string): GameAnimation => ({ textures: Array.from({ length: 6 }, (_, i) => named(`${n}#${i}`)), fps: 6, loop: true });
  const missing = Object.values(FEATURE_NAMES).flat().filter((n) => !n.startsWith('crew.') || (!withCrewArt && CREW_ART_NAMES.includes(n)));
  return {
    has: (n) => !missing.includes(n), missing, fontFamily: 'm5x7',
    texture: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return named(n); },
    animation: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return anim(n); },
    nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }
  };
}
const spriteOf = (layer: ReturnType<typeof createCrewLayer>, i: number): AnimatedSprite => layer.container.children.filter((c) => c instanceof AnimatedSprite)[i] as AnimatedSprite;
const carriedOf = (layer: ReturnType<typeof createCrewLayer>, i: number): Graphics => (layer.container.children.find((c) => !(c instanceof AnimatedSprite)) as unknown as { children: Graphics[] }).children[i]!;

describe('the bought crew model (Art-ii spec section 1)', () => {
  it('folds eight facings to LimeZu four: n and s stay, east-ish to e, west-ish to w', () => {
    expect(FACINGS.map(facing4)).toEqual(['n', 'e', 'e', 'e', 's', 'w', 'w', 'w']);   // n ne e se s sw w nw
  });
  it('player slot pid % 4 picks sheet 04, 07, 13, 19', () => {
    expect([0, 1, 2, 3, 4, 5].map(crewSlot)).toEqual([0, 1, 2, 3, 0, 1]);
    expect(CREW_SHEETS).toEqual(['04', '07', '13', '19']);
  });
  it('the foot anchor and the carry offset come from the measured rows', () => {
    expect([LIMEZU_FOOT_ROW, LIMEZU_HEAD_ROW]).toEqual([31, 7]);
    expect(footAnchorY(LIMEZU_FOOT_ROW, 32)).toBe(1); expect(LIMEZU_ANCHOR_Y).toBe(1);
    expect([CARRY_LIFT_PUNY, CARRY_LIFT_LIMEZU]).toEqual([30, 54]);
    expect(CALLOUT_LIFT_LIMEZU).toBe(64); expect(CALLOUT_LIFT_DOWN_LIMEZU).toBe(26);
  });
  it('poses: idle and walk by the 4-way facing, seated the standing frame facing the wall, down the standing s frame turned +90 degrees about its centre', () => {
    expect(crewPose(2, 'idle', 'ne', null)).toEqual({ name: 'crew.p2.idle.e', animated: true, anchorY: 1, rotation: 0 });
    expect(crewPose(1, 'walk', 'sw', null)).toEqual({ name: 'crew.p1.walk.w', animated: true, anchorY: 1, rotation: 0 });
    expect(crewPose(0, 'seated', 's', 'n')).toEqual({ name: 'crew.p0.stand.n', animated: false, anchorY: 1, rotation: 0 });
    expect(crewPose(3, 'down', 'e', null)).toEqual({ name: 'crew.p3.stand.s', animated: false, anchorY: 0.5, rotation: Math.PI / 2 });
  });
  it('registers the 48 per-slot names as optional, grouped as crewArt, apart from the Puny crew names', () => {
    expect(CREW_ART_NAMES).toHaveLength(48);
    for (const n of CREW_ART_NAMES) expect(ASSET_NAMES[n], n).toBe('optional');
    expect(FEATURE_NAMES.crewArt).toEqual([...CREW_ART_NAMES]);
    expect(FEATURE_NAMES.crew.some((n) => CREW_ART_NAMES.includes(n))).toBe(false);
    expect(featureReady(new Set(['crew.p3.walk.s']), 'crewArt')).toBe(false);
  });
  it('the manifest binds each sheet with stand 0-3, idle 4-27 and walk 28-51 in LimeZu order right, up, left, down', () => {
    const sheet = limezuSheet(1);
    expect(sheet.frames).toEqual({ 'crew.p1.stand.e': 0, 'crew.p1.stand.n': 1, 'crew.p1.stand.w': 2, 'crew.p1.stand.s': 3 });
    expect(sheet.animations['crew.p1.idle.n']).toEqual({ frames: [10, 11, 12, 13, 14, 15], fps: 6, loop: true });
    expect(sheet.animations['crew.p1.walk.s']).toEqual({ frames: [46, 47, 48, 49, 50, 51], fps: 10, loop: true });
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    CREW_SHEETS.forEach((s, k) => {
      const e = real.find((x) => x.file === `paid/limezu/crew_${s}.png`)!;
      expect(e.license).toBe('paid'); expect(e.required).toBe(false);
      expect(e.source).toBe('https://limezu.itch.io/moderninteriors'); expect(e.retrieved).toBe('2026-11-16');
      expect(e.credit).toBe('Modern Interiors by LimeZu (limezu.itch.io)');
      expect(e.sheet).toEqual(limezuSheet(k));
    });
  });
  it('stationSides: every station has its console wall side, and a group\'s members share it', () => {
    const s = createSimState(parseShip(skiff), 2, 1, RECRUITS), sides = stationSides(s);
    expect(sides).toHaveLength(s.derived.stationTile.length);
    for (const c of consoles(s)) for (const m of c.members) expect(sides[m]).toBe(c.side);
    const helm = consoles(s).find((c) => c.members.length === 2)!;
    expect(sides[helm.members[0]!]).toBe(sides[helm.members[1]!]);
  });
  it('the callout tail sits over the head: 0.6 tile over Puny, 64 units over the bought crew', () => {
    const s = cutterState(), eid = s.crew[0]!, fit = { scale: 1, x: 0, y: 0 };
    expect(CALLOUT_LIFT_PUNY).toBeCloseTo(0.6 * TILE_PX);
    expect(bubbleAnchor(s, 0, fit).y).toBeCloseTo((Position.y[eid]! - 0.6) * TILE_PX);
    expect(bubbleAnchor(s, 0, fit, CALLOUT_LIFT_LIMEZU).y).toBeCloseTo(Position.y[eid]! * TILE_PX - 64);
  });
});

describe('the crew layer with the bought crew (Art-ii spec section 1)', () => {
  it('each player wears their slot\'s character, untinted, feet on the crew position; dead crew stay grey', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory());
    layer.draw(s, 1);
    s.crew.forEach((eid, i) => {
      const sp = spriteOf(layer, i);
      expect(sp.texture.label).toBe(`crew.p${crewSlot(Owner.pid[eid]!)}.idle.s#0`);
      expect(sp.tint).toBe(0xffffff); expect([sp.anchor.x, sp.anchor.y]).toEqual([0.5, 1]); expect(sp.rotation).toBe(0);
    });
    Life.state[s.crew[1]!] = LifeState.Dead; layer.draw(s, 1);
    expect(spriteOf(layer, 1).tint).toBe(0x777777);
  });
  it('downed: the standing s frame turned +90 degrees about its centre at 85 % alpha; getting up restores the foot anchor and rotation 0', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory()), eid = s.crew[0]!;
    Life.state[eid] = LifeState.Downed; layer.draw(s, 1);
    const sp = spriteOf(layer, 0);
    expect(sp.texture.label).toBe('crew.p0.stand.s'); expect(sp.rotation).toBeCloseTo(Math.PI / 2);
    expect([sp.anchor.x, sp.anchor.y]).toEqual([0.5, 0.5]); expect(sp.alpha).toBe(0.85);
    Life.state[eid] = LifeState.Conscious; layer.draw(s, 1);
    expect(sp.rotation).toBe(0); expect(sp.anchor.y).toBe(1); expect(sp.alpha).toBe(1);
  });
  it('seated: the standing frame facing the console\'s wall side', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory());
    const nav = s.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(s, 0, nav); expect(Seated.station[s.crew[0]!]).toBe(nav);
    layer.draw(s, 1);
    expect(spriteOf(layer, 0).texture.label).toBe(`crew.p0.stand.${stationSides(s)[nav]}`);
    expect(stationSides(s)[nav]).toBe('e');   // the Cutter's Bridge console against the bow wall
  });
  it('the carried torpedo rides 54 units over the bought crew, 30 over Puny', () => {
    for (const [art, lift] of [[true, CARRY_LIFT_LIMEZU], [false, CARRY_LIFT_PUNY]] as const) {
      const s = cutterState(), layer = createCrewLayer(fakeAssets(art), createRenderMemory());
      s.carrying[Owner.pid[s.crew[0]!]!] = 1; layer.draw(s, 1);
      const g = carriedOf(layer, 0), sp = spriteOf(layer, 0);
      expect(g.visible).toBe(true); expect(sp.y - g.y).toBeCloseTo(lift);
    }
  });
  it('without crewArt the Puny crew draw as before: tinted per player, the Puny anchor', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(false), createRenderMemory());
    layer.draw(s, 1);
    const sp = spriteOf(layer, 0);
    expect(sp.texture.label).toBe('crew.idle.s'); expect(sp.tint).toBe(CREW_COLORS[Owner.pid[s.crew[0]!]! % 4]); expect(sp.anchor.y).toBe(0.75);
  });
});
