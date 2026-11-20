import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { AnimatedSprite, Container, Texture } from 'pixi.js';
import { Life, LifeState, Owner, Position } from '../src/renderer/src/sim/components';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, FACINGS } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES, featureReady } from '../src/renderer/src/render/fallback';
import type { GameAnimation, GameAssets } from '../src/renderer/src/render/assets';
import { createRenderMemory } from '../src/renderer/src/render/memory';
import { createCrewLayer, CREW_COLORS } from '../src/renderer/src/render/crewSprites';
import { createBoarderLayer } from '../src/renderer/src/render/boarderLayer';
import { stationSides } from '../src/renderer/src/render/consoleModel';
import {
  BOARDER_BAR_LIFT_3D, boarderPose, CALLOUT_LIFT_3D, CALLOUT_LIFT_DOWN_3D, CARRY_LIFT_3D, CREW3D_BODIES, CREW3D_DIRECTIONS, CREW3D_KEY, CREW3D_META, CREW3D_NAMES,
  CREW3D_SCALE, CREW3D_SHEETS, crew3dAnchorY, crew3dBody, crew3dHeadLift, crew3dMaskName, crew3dName, crew3dPose, crew3dSheet, loadCrew3d, nextCrew3d, saveCrew3d,
  type Crew3dPoseInput
} from '../src/renderer/src/render/crew3dModel';
import { installCrew3d } from '../src/renderer/src/app/crew3dBoot';
import { TILE_PX } from '../src/shared/resolution';
import { cutterState, makeState, placeBoarder, quiet, room } from './helpers/sim';

// AnimatedSprite.play() starts Pixi's shared ticker, which needs requestAnimationFrame (absent in node).
beforeAll(() => {
  const g = globalThis as { requestAnimationFrame?: (cb: () => void) => number; cancelAnimationFrame?: (id: number) => void };
  g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= () => undefined;
});

const standing: Crew3dPoseInput = { pid: 0, life: 'conscious', seated: false, seatSide: null, working: null, facing: 's', moving: false };
const CREW_FRAMES = { idle: 4, walk: 8, work: 6, repair: 6, firefight: 6, down: 1 }, BOARDER_FRAMES = { idle: 4, walk: 8, attack: 6 };

/** Assets with every crew3d and Puny name bound to its own named texture (or none of the crew3d names), the other optional features missing. */
function fakeAssets(with3d: boolean): GameAssets {
  const tex = new Map<string, Texture>(), named = (n: string): Texture => { let t = tex.get(n); if (!t) { t = new Texture(); t.label = n; tex.set(n, t); } return t; };
  const frames = (n: string): number => { const [, char, anim] = n.split('.'); return CREW3D_META.characters[char!]?.animations.find((a) => a.name === anim)?.frames ?? 6; };
  const anim = (n: string): GameAnimation => ({ textures: Array.from({ length: frames(n) }, (_, i) => named(`${n}#${i}`)), fps: 6, loop: true });
  const missing = Object.values(FEATURE_NAMES).flat().filter((n) => !(n.startsWith('crew.') && !n.startsWith('crew.p')) && !(with3d && n.startsWith('crew3d.')));
  return {
    has: (n) => !missing.includes(n), missing, fontFamily: 'm5x7',
    texture: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return named(n); },
    animation: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return anim(n); },
    nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }
  };
}
/** The i-th 3D figure of a crew layer: its root, the rendered sprite and the colour layer. */
function figureOf(layer: ReturnType<typeof createCrewLayer>, i: number): { root: Container; base: AnimatedSprite; mask: AnimatedSprite } {
  const roots = layer.container.children.filter((c) => c.children.length === 2 && c.children.every((k) => k instanceof AnimatedSprite));
  const root = roots[i] as Container;
  return { root, base: root.children[0] as AnimatedSprite, mask: root.children[1] as AnimatedSprite };
}

describe('the Crew3D model (spec section 4)', () => {
  it('the sheet rows are the game\'s eight facings, in order', () => {
    expect(CREW3D_DIRECTIONS).toEqual([...FACINGS]);
  });
  it('a frame covers 2 x 2 tiles, and the ground point is the anchor', () => {
    expect(CREW3D_META.frame * CREW3D_SCALE).toBe(2 * TILE_PX);
    for (const char of [...CREW3D_BODIES, 'boarder']) {
      expect(crew3dAnchorY(char, 'idle')).toBeGreaterThan(0.5); expect(crew3dAnchorY(char, 'idle')).toBeLessThan(1);   // standing: the feet sit below the frame centre
      expect(crew3dHeadLift(char)).toBeGreaterThan(TILE_PX); expect(crew3dHeadLift(char)).toBeLessThan(1.6 * TILE_PX);   // about 1.3 tiles tall on screen
    }
    expect(crew3dAnchorY('crewA', 'down')).toBeCloseTo(0.5);   // a body on the deck is centred on its position
  });
  it('every animation has the spec\'s frame count, for both bodies and the boarder', () => {
    for (const char of CREW3D_BODIES) expect(Object.fromEntries(CREW3D_META.characters[char]!.animations.map((a) => [a.name, a.frames]))).toEqual(CREW_FRAMES);
    expect(Object.fromEntries(CREW3D_META.characters.boarder!.animations.map((a) => [a.name, a.frames]))).toEqual(BOARDER_FRAMES);
    expect(CREW3D_META.characters.crewA!.cells).toBe(31 * 8); expect(CREW3D_META.characters.boarder!.cells).toBe(18 * 8);
    expect(CREW3D_BODIES.every((c) => CREW3D_META.characters[c]!.mask)).toBe(true); expect(CREW3D_META.characters.boarder!.mask).toBe(false);
  });
  it('body and colour are a pure function of the player: slots alternate the bodies, the colour layer takes the player colour', () => {
    expect([0, 1, 2, 3, 4].map(crew3dBody)).toEqual(['crewA', 'crewB', 'crewA', 'crewB', 'crewA']);
    expect([0, 1, 2, 3, 5].map((pid) => crew3dPose({ ...standing, pid }).maskTint)).toEqual([CREW_COLORS[0], CREW_COLORS[1], CREW_COLORS[2], CREW_COLORS[3], CREW_COLORS[1]]);
    expect(crew3dPose(standing).tint).toBe(0xffffff);
  });
  it('pose priority: down, then working, then seated, then walk, then idle', () => {
    const working = { kind: 'fire' as const, facing: 'ne' as const };
    const all: Crew3dPoseInput = { ...standing, life: 'downed', seated: true, seatSide: 'e', working, moving: true };
    expect(crew3dPose(all).anim).toBe('down');
    expect(crew3dPose({ ...all, life: 'conscious' }).anim).toBe('firefight');
    expect(crew3dPose({ ...all, life: 'conscious', working: null }).anim).toBe('work');
    expect(crew3dPose({ ...all, life: 'conscious', working: null, seated: false }).anim).toBe('walk');
    expect(crew3dPose(standing).anim).toBe('idle');
  });
  it('fire, breach and power work play firefight, repair and work, aimed at the target; a seat faces its console', () => {
    for (const [kind, anim] of [['fire', 'firefight'], ['breach', 'repair'], ['power', 'work'], ['repair', 'repair']] as const) {
      const p = crew3dPose({ ...standing, pid: 1, facing: 's', working: { kind, facing: 'nw' } });
      expect([p.anim, p.facing, p.name, p.mask]).toEqual([anim, 'nw', `crew3d.crewB.${anim}.nw`, `crew3d.crewB.${anim}.nw.mask`]);
    }
    expect(crew3dPose({ ...standing, seated: true, seatSide: 'e', facing: 'w' }).name).toBe('crew3d.crewA.work.e');
    expect(crew3dPose({ ...standing, seated: true, seatSide: null, facing: 'w' }).name).toBe('crew3d.crewA.work.w');
  });
  it('downed crew lie at 85 % alpha in their colour; dead crew turn grey on both layers', () => {
    const downed = crew3dPose({ ...standing, pid: 2, life: 'downed' }), dead = crew3dPose({ ...standing, pid: 2, life: 'dead' });
    expect([downed.anim, downed.alpha, downed.tint, downed.maskTint]).toEqual(['down', 0.85, 0xffffff, CREW_COLORS[2]]);
    expect([dead.anim, dead.alpha, dead.tint, dead.maskTint]).toEqual(['down', 1, 0x777777, 0x777777]);
  });
  it('a boarder attacks while it fights, walks when it moves, else idles', () => {
    expect(boarderPose(true, false, 'e').name).toBe('crew3d.boarder.attack.e');
    expect(boarderPose(true, true, 'e').name).toBe('crew3d.boarder.walk.e');
    expect(boarderPose(false, false, 'sw').name).toBe('crew3d.boarder.idle.sw');
  });
  it('the lifts follow the measured head: the torpedo 6 over it, the bubble 10 more, the health bar 5 over a boarder', () => {
    expect(CARRY_LIFT_3D).toBe(Math.max(...CREW3D_BODIES.map(crew3dHeadLift)) + 6);
    expect(CALLOUT_LIFT_3D).toBe(CARRY_LIFT_3D + 10); expect(CALLOUT_LIFT_DOWN_3D).toBe(26);
    expect(BOARDER_BAR_LIFT_3D).toBe(crew3dHeadLift('boarder') + 5);
  });
});

describe('the Crew3D names and manifest (spec sections 1 and 5)', () => {
  it('every name a pose can return exists, for both bodies, every state and all 8 directions', () => {
    const names = new Set(CREW3D_NAMES);
    for (const pid of [0, 1]) for (const facing of FACINGS) for (const input of [
      standing, { ...standing, moving: true }, { ...standing, seated: true }, { ...standing, life: 'downed' as const }, { ...standing, life: 'dead' as const },
      ...(['fire', 'breach', 'power', 'repair'] as const).map((kind) => ({ ...standing, working: { kind, facing } }))
    ]) { const p = crew3dPose({ ...input, pid, facing }); expect(names.has(p.name), p.name).toBe(true); expect(names.has(p.mask), p.mask).toBe(true); }
    for (const facing of FACINGS) for (const [f, m] of [[false, false], [true, false], [false, true]] as const) expect(names.has(boarderPose(f, m, facing).name)).toBe(true);
  });
  it('registers the names as optional, grouped as the crew3d feature', () => {
    expect(CREW3D_NAMES).toHaveLength(2 * 2 * 6 * 8 + 3 * 8);   // two bodies with a colour layer, and the boarder
    for (const n of CREW3D_NAMES) expect(ASSET_NAMES[n], n).toBe('optional');
    expect(FEATURE_NAMES.crew3d).toEqual([...CREW3D_NAMES]);
    expect(featureReady(new Set([crew3dMaskName('crewB', 'walk', 'n')]), 'crew3d')).toBe(false);
    expect(featureReady(new Set(['crew.p0.idle.s']), 'crew3d')).toBe(true);
  });
  it('a sheet block walks the cells in order: animation, then direction, then frame', () => {
    const sheet = crew3dSheet('crewA', false);
    expect(sheet.frameW).toBe(128); expect(sheet.frameH).toBe(128);
    expect(sheet.animations[crew3dName('crewA', 'idle', 'n')]).toEqual({ frames: [0, 1, 2, 3], fps: 4, loop: true });
    expect(sheet.animations[crew3dName('crewA', 'idle', 'ne')]!.frames).toEqual([4, 5, 6, 7]);
    expect(sheet.animations[crew3dName('crewA', 'walk', 'n')]!.frames).toEqual([32, 33, 34, 35, 36, 37, 38, 39]);
    expect(sheet.animations[crew3dName('crewA', 'down', 'nw')]).toEqual({ frames: [247], fps: 1, loop: false });
    expect(Object.keys(crew3dSheet('crewA', true).animations).every((n) => n.endsWith('.mask'))).toBe(true);
  });
  it('the manifest binds each rendered sheet as the project\'s own art, optional, with the model\'s block', () => {
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    expect(CREW3D_SHEETS.map((s) => s.file)).toEqual(['art/crew3d/crewA.png', 'art/crew3d/crewA.mask.png', 'art/crew3d/crewB.png', 'art/crew3d/crewB.mask.png', 'art/crew3d/boarder.png']);
    for (const s of CREW3D_SHEETS) {
      const e = real.find((x) => x.file === s.file)!;
      expect(e, s.file).toBeDefined(); expect(e.license).toBe('original'); expect(e.required).toBe(false);
      expect(e.sheet).toEqual(crew3dSheet(s.char, s.mask));
    }
  });
  it('the sheets hold every cell, and a colour layer only covers pixels of its figure', () => {
    for (const s of CREW3D_SHEETS) {
      const png = PNG.sync.read(readFileSync(join('public/assets', s.file))), c = CREW3D_META.characters[s.char]!;
      expect(png.width).toBe(CREW3D_META.columns * CREW3D_META.frame);
      expect(png.height).toBe(Math.ceil(c.cells / CREW3D_META.columns) * CREW3D_META.frame);
    }
    const base = PNG.sync.read(readFileSync('public/assets/art/crew3d/crewA.png')), mask = PNG.sync.read(readFileSync('public/assets/art/crew3d/crewA.mask.png'));
    let painted = 0, stray = 0;
    for (let i = 3; i < mask.data.length; i += 4) if (mask.data[i]! > 0) { painted++; if (base.data[i] !== 255) stray++; }
    expect(painted).toBeGreaterThan(10000); expect(stray).toBe(0);
  });
});

describe('the crew layer with the 3D crew (spec section 4)', () => {
  it('each member is a figure and its colour layer on the same frame, tinted with the player colour, the ground point on the crew position', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory());
    layer.draw(s, 1);
    s.crew.forEach((eid, i) => {
      const f = figureOf(layer, i), pid = Owner.pid[eid]!, char = crew3dBody(pid);
      expect(f.base.texture.label).toBe(`crew3d.${char}.idle.s#0`); expect(f.mask.texture.label).toBe(`crew3d.${char}.idle.s.mask#0`);
      expect(f.base.tint).toBe(0xffffff); expect(f.mask.tint).toBe(CREW_COLORS[pid % 4]);
      expect(f.base.scale.x).toBe(CREW3D_SCALE); expect([f.base.anchor.x, f.base.anchor.y]).toEqual([0.5, crew3dAnchorY(char, 'idle')]);
      expect(f.mask.anchor.y).toBe(f.base.anchor.y);
      expect(f.root.position.x).toBeCloseTo(Position.x[eid]! * TILE_PX); expect(f.root.position.y).toBeCloseTo(Position.y[eid]! * TILE_PX);
    });
  });
  it('the colour layer follows the figure\'s frame', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory());
    layer.draw(s, 1);
    const f = figureOf(layer, 0);
    f.base.gotoAndStop(2); layer.draw(s, 1);
    expect(f.mask.texture.label).toBe('crew3d.crewA.idle.s.mask#2');
  });
  it('working crew play the work pose toward the target; seated crew face the console; downed and dead crew lie down', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory()), a = s.crew[0]!;
    const at = { x: (Position.x[a]! + 3) * TILE_PX, y: Position.y[a]! * TILE_PX };
    layer.draw(s, 1, undefined, [], [{ pid: 0, kind: 'fire', ...at }]);
    expect(figureOf(layer, 0).base.texture.label).toBe('crew3d.crewA.firefight.e#0');
    layer.draw(s, 1, undefined, [], [{ pid: 0, kind: 'breach', x: at.x, y: at.y - 3 * TILE_PX }]);
    expect(figureOf(layer, 0).base.texture.label).toBe('crew3d.crewA.repair.ne#0');
    const nav = s.derived.stationOfKind[StationKind.Navigation]!;
    sitDown(s, 0, nav); layer.draw(s, 1);
    expect(figureOf(layer, 0).base.texture.label).toBe(`crew3d.crewA.work.${stationSides(s)[nav]}#0`);
    Life.state[a] = LifeState.Downed; layer.draw(s, 1);
    const f = figureOf(layer, 0);
    expect(f.base.texture.label).toMatch(/^crew3d[.]crewA[.]down[.][a-z]+#0$/);   // lying where it sat, in the facing it had
    expect([f.root.alpha, f.base.anchor.y]).toEqual([0.85, crew3dAnchorY('crewA', 'down')]);
    Life.state[a] = LifeState.Dead; layer.draw(s, 1);
    expect([f.base.tint, f.mask.tint, f.root.alpha]).toEqual([0x777777, 0x777777, 1]);
  });
  it('lower on the screen draws in front, and the carried torpedo stays on top', () => {
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory());
    layer.draw(s, 1);
    expect(layer.container.sortableChildren).toBe(true);
    s.crew.forEach((eid, i) => expect(figureOf(layer, i).root.zIndex).toBe(Position.y[eid]!));
    const carried = layer.container.children.find((c) => !(c.children[0] instanceof AnimatedSprite))!;
    expect(carried.zIndex).toBeGreaterThan(1e9);
  });
  it('the dev toggle falls back to the old art and comes back; without the sheets the old art draws', () => {
    let on = true;
    const s = cutterState(), layer = createCrewLayer(fakeAssets(true), createRenderMemory(), () => on);
    layer.draw(s, 1); expect(figureOf(layer, 0).root).toBeDefined();
    on = false; layer.draw(s, 1);
    expect(layer.container.children.filter((c) => c instanceof AnimatedSprite)).toHaveLength(s.crew.length);   // the Puny sprites
    expect(layer.container.sortableChildren).toBe(false);
    on = true; layer.draw(s, 1); expect(figureOf(layer, 0).base.texture.label).toBe('crew3d.crewA.idle.s#0');
    const old = createCrewLayer(fakeAssets(false), createRenderMemory());
    old.draw(s, 1); expect(old.container.children.filter((c) => c instanceof AnimatedSprite)).toHaveLength(s.crew.length);
  });
});

describe('the boarder layer with the 3D boarder (spec section 4)', () => {
  it('a boarder is the rendered raider, untinted, idle when alone and attacking a crew member in its room', () => {
    const s = makeState(1); quiet(s);
    const layer = createBoarderLayer(fakeAssets(true));
    const eid = s.crew[0]!;
    Life.state[eid] = LifeState.Downed;                       // nobody to fight
    placeBoarder(s, room(s, 'A')); layer.draw(s);
    const body = (layer.container.children[0] as Container).children[0] as AnimatedSprite;
    expect(body.texture.label).toBe('crew3d.boarder.idle.s#0'); expect(body.tint).toBe(0xffffff); expect(body.scale.x).toBe(CREW3D_SCALE);
    Life.state[eid] = LifeState.Conscious;
    const [cx, cy] = [(layer.container.children[0] as Container).position.x / TILE_PX, (layer.container.children[0] as Container).position.y / TILE_PX];
    Position.x[eid] = cx + 0.9; Position.y[eid] = cy;         // in the boarder's room, to its east
    layer.draw(s);
    expect(body.texture.label).toMatch(/^crew3d[.]boarder[.]attack[.]e#/);
  });
  it('the dev toggle rebuilds the figure in the old art', () => {
    let on = true;
    const s = makeState(1); quiet(s);
    const layer = createBoarderLayer(fakeAssets(true), () => on);
    placeBoarder(s, room(s, 'A')); layer.draw(s);
    on = false; layer.draw(s);
    const body = (layer.container.children[0] as Container).children[0] as AnimatedSprite;
    expect(body.texture.label).toBe('crew.idle.s');
  });
});

describe('the Crew3D dev toggle (spec section 4)', () => {
  const store = (init: Record<string, string> = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
  it('defaults to on, round-trips through storage, and survives a denied storage', () => {
    expect(loadCrew3d(() => store())).toBe('on');
    const st = store(); saveCrew3d(() => st, 'off'); expect(st.m.get(CREW3D_KEY)).toBe('off'); expect(loadCrew3d(() => st)).toBe('off');
    expect(loadCrew3d(() => store({ [CREW3D_KEY]: 'nonsense' }))).toBe('on');
    expect(loadCrew3d(() => { throw new Error('denied'); })).toBe('on');
    expect(() => saveCrew3d(() => { throw new Error('denied'); }, 'off')).not.toThrow();
    expect([nextCrew3d('on'), nextCrew3d('off')]).toEqual(['off', 'on']);
  });
  it('F8 switches and saves in dev builds only', () => {
    for (const dev of [true, false]) {
      const st = store({ [CREW3D_KEY]: 'off' }), handlers: ((e: { code: string }) => void)[] = [];
      let setting = 'on';
      installCrew3d({ crew3d: () => setting as 'on' | 'off', setCrew3d: (v) => { setting = v; } }, { storage: () => st, keys: { addEventListener: (_t, cb) => { handlers.push(cb); } }, dev });
      expect(setting).toBe('off');   // read at boot
      for (const h of handlers) { h({ code: 'F9' }); h({ code: 'F8' }); }
      expect(setting).toBe(dev ? 'on' : 'off'); expect(st.m.get(CREW3D_KEY)).toBe(dev ? 'on' : 'off');
    }
  });
});

// The rig script smoke test (spec section 5): only where Blender is installed. One pose in one direction through the
// whole pipeline: frame size, a transparent background, and the feet on the recorded ground row.
const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
describe.skipIf(!existsSync(BLENDER))('the sprite render script (spec section 5)', () => {
  it('renders one idle frame facing south: 128 px, transparent around the figure, feet at the ground row', () => {
    const out = mkdtempSync(join(tmpdir(), 'ftlite-crew3d-'));
    const r = spawnSync(BLENDER, ['--background', '--factory-startup', '--disable-autoexec', '--python', 'tools/sprite-render/render.py', '--', 'tools/sprite-render/lookdev.json',
      '--preview', out, '--only', 'crewA', '--cells', 'idle:0', '--dirs', 's'], { encoding: 'utf8', timeout: 110_000 });
    expect(r.status, r.stderr).toBe(0);
    const png = PNG.sync.read(readFileSync(join(out, 'crewA-preview.png'))), f = CREW3D_META.frame;
    expect([png.width, png.height]).toEqual([f, f]);
    const alpha = (x: number, y: number): number => png.data[(y * f + x) * 4 + 3]!;
    expect([alpha(0, 0), alpha(f - 1, 0), alpha(0, f - 1)]).toEqual([0, 0, 0]);
    const solidRows = Array.from({ length: f }, (_, y) => y).filter((y) => Array.from({ length: f }, (_, x) => alpha(x, y)).some((a) => a === 255));
    const ground = CREW3D_META.characters.crewA!.animations.find((a) => a.name === 'idle')!.originRow;
    const head = CREW3D_META.characters.crewA!.headRow;   // the highest idle pixel over all 8 directions (the crest reaches higher side-on)
    expect(solidRows[0]!).toBeGreaterThanOrEqual(head); expect(solidRows[0]!).toBeLessThan(head + 10);
    expect(solidRows[solidRows.length - 1]!).toBeGreaterThan(ground); expect(solidRows[solidRows.length - 1]!).toBeLessThan(ground + 12);   // the boots just in front of the ground point
    expect(existsSync(join(out, 'crewA-preview.mask.png'))).toBe(true);
  }, 120_000);
});
