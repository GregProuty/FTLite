import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { StationKind, STATION_IDS } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, CONSOLE_ART_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import type { GameAssets } from '../src/renderer/src/render/assets';
import {
  consoleArtName, consolePlacement, consoles, CONSOLE_TINT, deskPicture, SIDE_ROTATION, WALL_GAP, type Side
} from '../src/renderer/src/render/consoleModel';
import { createConsoleLayer } from '../src/renderer/src/render/consoleLayer';
import { createInteriorFeel, type FeelFrame } from '../src/renderer/src/render/interiorFeel';
import { sectorGradeInput } from '../src/renderer/src/render/gradeModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { TILE_PX } from '../src/shared/resolution';
import { cutterState, RECRUITS } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

const T = TILE_PX;
/** The imported console sizes in art pixels (art/import.json, Art-ii spec section 2). */
const SIZE: Record<string, [number, number]> = {
  navigation: [12, 15], weapons: [12, 15], science: [13, 16], doors: [13, 15], engineering: [16, 27], lifeSupport: [16, 23], medbay: [24, 14]
};
function fakeAssets(withConsoleArt: boolean): GameAssets {
  const missing = Object.values(FEATURE_NAMES).flat().filter((n) => !(withConsoleArt && n.startsWith('console.')));
  const tex = new Map<string, Texture>();
  const named = (n: string): Texture => {
    let t = tex.get(n);
    if (!t) { const [w, h] = SIZE[n.slice('console.'.length)]!; t = new Texture({ source: new TextureSource({ width: w, height: h }) }); t.label = n; tex.set(n, t); }
    return t;
  };
  return {
    has: (n) => !missing.includes(n), missing, fontFamily: 'm5x7',
    texture: (n) => { if (missing.includes(n)) throw new Error(`missing ${n}`); return named(n); },
    animation: (n) => { throw new Error(`no animation ${n}`); }, nineSlice: (n) => { throw new Error(`no nine-slice ${n}`); }
  };
}

describe('the bought consoles: names, placement and tints (Art-ii spec section 2)', () => {
  it('names each console console.<STATION_IDS id> by its group\'s first member, all optional, grouped as consoleArt', () => {
    expect(CONSOLE_ART_NAMES).toEqual(['console.navigation', 'console.weapons', 'console.science', 'console.engineering', 'console.lifeSupport', 'console.medbay', 'console.doors']);
    for (const n of CONSOLE_ART_NAMES) expect(ASSET_NAMES[n]).toBe('optional');
    expect(FEATURE_NAMES.consoleArt).toEqual([...CONSOLE_ART_NAMES]);
    const s = cutterState();
    for (const c of consoles(s)) expect(consoleArtName(s, c.members)).toBe(`console.${STATION_IDS[s.derived.stationKind[c.members[0]!]!]}`);
    const k = createSimState(parseShip(skiff), 2, 1, RECRUITS), helm = consoles(k).find((c) => c.members.length === 2)!;
    expect(consoleArtName(k, helm.members)).toBe(`console.${STATION_IDS[k.derived.stationKind[helm.members[0]!]!]}`);
  });
  it('the art faces south: a quarter turn per side, clockwise positive', () => {
    expect(SIDE_ROTATION).toEqual({ n: 0, e: Math.PI / 2, s: Math.PI, w: -Math.PI / 2 });
  });
  it('the back edge sits on the wall face (the turned desk\'s outer edge), centred along the wall, top-left on an even unit', () => {
    for (const side of ['n', 'e', 's', 'w'] as Side[]) for (const flush of [true, false]) for (const [w, h] of Object.values(SIZE)) {
      const p = consolePlacement(side, flush, w, h), desk = deskPicture(side, flush, 'free').desk, at = `${side} ${flush} ${w}x${h}`;
      expect(Number.isInteger(p.left / 2) && Number.isInteger(p.top / 2), at).toBe(true);
      expect([p.width, p.height], at).toEqual(side === 'n' || side === 's' ? [2 * w, 2 * h] : [2 * h, 2 * w]);
      expect([p.cx, p.cy], at).toEqual([p.left + p.width / 2, p.top + p.height / 2]);
      if (side === 'n') expect(p.top, at).toBe(desk.y);
      if (side === 's') expect(p.top + p.height, at).toBe(desk.y + desk.h);
      if (side === 'w') expect(p.left, at).toBe(desk.x);
      if (side === 'e') expect(p.left + p.width, at).toBe(desk.x + desk.w);
      const along = side === 'n' || side === 's' ? p.left + p.width / 2 : p.top + p.height / 2;
      expect(Math.abs(along - T / 2), at).toBeLessThanOrEqual(1);   // centred on the tile's centre line, within the even floor
    }
    expect(consolePlacement('n', true, 12, 15)).toMatchObject({ left: 4, top: -WALL_GAP, width: 24, height: 30 });
    expect(consolePlacement('e', true, 16, 27)).toMatchObject({ left: T + WALL_GAP - 54, top: 0, width: 54, height: 32 });
    expect(consolePlacement('s', false, 13, 16)).toMatchObject({ left: 2, top: T - 32, width: 26, height: 32 });
  });
  it('tints by look: free plain, occupied 80 %, down 60 %', () => {
    expect(CONSOLE_TINT).toEqual({ free: 0xffffff, occupied: 0xcccccc, down: 0x999999 });
  });
  it('art/import.json cuts each console as its own one-frame output, so the image is exactly the art', () => {
    const cfg = JSON.parse(readFileSync('art/import.json', 'utf8')) as { outputs: { pack: string; frames: { w: number; h: number }[]; output: string; columns: number }[] };
    for (const id of STATION_IDS) {
      const o = cfg.outputs.find((x) => x.output === `public/assets/paid/maru/console-${id}.png`)!;
      expect(o.frames, id).toHaveLength(1); expect(o.columns).toBe(1);
      expect([o.frames[0]!.w, o.frames[0]!.h], id).toEqual(SIZE[id]);
    }
  });
  it('the manifest binds the seven sprites by name as paid Maru-98 art', () => {
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    for (const id of STATION_IDS) {
      const e = real.find((x) => x.name === `console.${id}`)!;
      expect(e.file).toBe(`paid/maru/console-${id}.png`);
      expect([e.license, e.required, e.source, e.retrieved, e.credit]).toEqual(['paid', false, 'https://maru-98.itch.io/', '2026-11-16', 'Mars colony pixel art by Maru-98 (maru-98.itch.io)']);
    }
  });
});

describe('the console layer with the bought consoles (Art-ii spec section 2)', () => {
  it('draws one turned, tinted sprite per console in a child container at index 0, and no desk or screen strip', () => {
    const s = cutterState(), layer = createConsoleLayer(fakeAssets(true));
    layer.container.addChild(new Graphics());   // the interior feel's fixtures, added after the layer is built
    layer.draw(s);
    const art = layer.container.children[0] as Container, g = layer.container.children[1] as Graphics, list = consoles(s);
    expect(art.children).toHaveLength(list.length);
    expect(g.context.instructions).toHaveLength(0);
    list.forEach((c, i) => {
      const sp = art.children[i] as Sprite, p = consolePlacement(c.side, c.flush, sp.texture.width, sp.texture.height);
      expect(sp.texture.label).toBe(consoleArtName(s, c.members));
      expect([sp.x, sp.y, sp.rotation, sp.anchor.x, sp.anchor.y, sp.scale.x]).toEqual([c.x + p.cx, c.y + p.cy, SIDE_ROTATION[c.side], 0.5, 0.5, 2]);
      expect(sp.tint).toBe(0xffffff);
    });
  });
  it('redraws only when a look or the layout changes; an occupied console dims, a down one dims more', () => {
    const s = cutterState(), layer = createConsoleLayer(fakeAssets(true)), art = layer.container.children[0] as Container;
    layer.draw(s); const first = art.children[0];
    layer.draw(s); expect(art.children[0]).toBe(first);
    const w = s.derived.stationOfKind[StationKind.Weapons]!, k = consoles(s).findIndex((c) => c.members.includes(w));
    sitDown(s, 0, w); layer.draw(s);
    expect((art.children[k] as Sprite).tint).toBe(CONSOLE_TINT.occupied);
    s.stations.failed[w] = 1; layer.draw(s);
    expect((art.children[k] as Sprite).tint).toBe(CONSOLE_TINT.down);
  });
  it('without consoleArt the procedural desks and screen strips draw as before', () => {
    const s = cutterState(), layer = createConsoleLayer(fakeAssets(false));
    layer.draw(s);
    expect((layer.container.children[0] as Container).children).toHaveLength(0);
    expect((layer.container.children[1] as Graphics).context.instructions.length).toBeGreaterThan(0);
  });
  it('the interior feel blinks no screen cursor over the bought consoles; the glows stay', () => {
    const frame = (st: ReturnType<typeof cutterState>): FeelFrame => ({ state: st, grade: sectorGradeInput(st), hit: null, sparks: [], working: [], artPx: 2 });
    const s = cutterState(), lamps = (f: ReturnType<typeof createInteriorFeel>): number => f.fixtures.context.instructions.length;
    const plain = createInteriorFeel({ world: new Container(), band: WORLD_BAND, feel: () => 'full' });
    const art = createInteriorFeel({ world: new Container(), band: WORLD_BAND, feel: () => 'full', consoleArt: true });
    plain.draw(frame(s), 1 / 60); art.draw(frame(s), 1 / 60);
    expect(lamps(plain) - lamps(art)).toBe(consoles(s).filter((c) => c.look !== 'down').length);   // one cursor rect per powered console, gone
    expect((art.lights.children[0] as Container).children.length).toBe((plain.lights.children[0] as Container).children.length);
    plain.destroy(); art.destroy();
  });
});
