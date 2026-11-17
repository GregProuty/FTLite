import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { ASSET_NAMES, BLAST_NAMES } from '../src/renderer/src/render/assetNames';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import type { GameAnimation } from '../src/renderer/src/render/assets';
import { addBlast, BLAST_CAP, blastFrame, liveBlasts, roomCentroid, tileCentre, type Blast, type BlastTimings } from '../src/renderer/src/render/blastModel';
import { createInteriorFeel, type FeelFrame } from '../src/renderer/src/render/interiorFeel';
import { sectorGradeInput } from '../src/renderer/src/render/gradeModel';
import { WORLD_BAND } from '../src/renderer/src/render/worldFit';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { cutterState, RECRUITS } from './helpers/sim';
import { createSimState } from './helpers/simLifetime';

const TIMING: BlastTimings = { room: { frames: 14, fps: 20 }, hit: { frames: 11, fps: 24 } };
const anim = (kind: string, frames: number, fps: number): GameAnimation => ({ textures: Array.from({ length: frames }, (_, i) => { const t = new Texture(); t.label = `${kind}#${i}`; return t; }), fps, loop: false });
const BLASTS = { room: anim('room', 14, 20), hit: anim('hit', 11, 24) };
const make = (blasts = true) => createInteriorFeel({ world: new Container(), band: WORLD_BAND, feel: () => 'full', blasts: blasts ? BLASTS : undefined });
const frame = (s: ReturnType<typeof cutterState>, over: Partial<FeelFrame> = {}): FeelFrame => ({ state: s, grade: sectorGradeInput(s), hit: null, sparks: [], working: [], artPx: 2, ...over });
/** The feel's blast sprites (the middle child of `above`, between the particles and the flash), visible ones only. */
const shown = (f: ReturnType<typeof make>): Sprite[] => ((f.above.children[1] as Container).children as Sprite[]).filter((s) => s.visible);

describe('the blast model (Art-ii spec section 3)', () => {
  it('a room blast sits on the room centroid rounded to 2 world units; a spark on its tile centre', () => {
    expect(tileCentre(5, 4)).toEqual({ x: 48, y: 48 });
    expect(roomCentroid([0, 1, 4, 5], 4)).toEqual({ x: 32, y: 32 });   // a 2 x 2 room: the shared corner
    expect(roomCentroid([0, 1, 2], 4)).toEqual({ x: 48, y: 16 });
    expect(roomCentroid([0, 1, 4], 4)).toEqual({ x: 2 * Math.round(((16 + 48 + 16) / 3) / 2), y: 2 * Math.round(((16 + 16 + 48) / 3) / 2) });
  });
  it('one shared cap of 4: a fifth cuts the oldest', () => {
    let list: Blast[] = [];
    for (let k = 0; k < 5; k++) list = addBlast(list, { kind: k % 2 ? 'hit' : 'room', x: k, y: 0, start: k });
    expect(BLAST_CAP).toBe(4);
    expect(list.map((b) => b.x)).toEqual([1, 2, 3, 4]);
  });
  it('frames run from the presentation clock and a blast is removed after its last frame', () => {
    const b: Blast = { kind: 'room', x: 0, y: 0, start: 1 };
    expect([1, 1.04, 1.05, 1.66].map((t) => blastFrame(b, t, TIMING))).toEqual([0, 0, 1, 13]);
    expect(liveBlasts([b], 1.69, TIMING)).toEqual([b]);
    expect(liveBlasts([b], 1 + 14 / 20, TIMING)).toEqual([]);
  });
  it('registers the two names as optional, grouped as blastArt, bound as one-shot animations in the manifest', () => {
    expect(BLAST_NAMES).toEqual(['fx.blast.room', 'fx.blast.hit']);
    for (const n of BLAST_NAMES) expect(ASSET_NAMES[n]).toBe('optional');
    expect(FEATURE_NAMES.blastArt).toEqual(['fx.blast.room', 'fx.blast.hit']);
    const real = parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    const room = real.find((e) => e.file === 'paid/pimen/explosion-room.png')!, hit = real.find((e) => e.file === 'paid/pimen/explosion-hit.png')!;
    expect(room.sheet!.animations['fx.blast.room']).toEqual({ frames: [...Array(14).keys()], fps: 20, loop: false });
    expect(hit.sheet!.animations['fx.blast.hit']).toEqual({ frames: [...Array(11).keys()], fps: 24, loop: false });
    for (const e of [room, hit]) expect([e.license, e.required, e.source, e.retrieved, e.credit]).toEqual(['paid', false, 'https://pimen.itch.io/explosion-effect', '2026-11-16', 'Explosion VFX by Pimen (pimen.itch.io)']);
    expect(real.some((e) => e.file === 'paid/pimen/explosion-big.png')).toBe(false);   // imported, unbound until a ship-death view
  });
});

describe('blasts in the interior feel (Art-ii spec section 3)', () => {
  it('one room blast per hit room at its centroid, 2x, centred, under the flash', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [0, 1] } }), 1 / 60);
    const live = shown(f);
    expect(live).toHaveLength(2);
    expect(live.map((b) => [b.x, b.y])).toEqual([0, 1].map((r) => { const c = roomCentroid(s.derived.roomTiles[r]!, s.derived.width); return [c.x, c.y]; }));
    expect([live[0]!.scale.x, live[0]!.anchor.x, live[0]!.anchor.y, live[0]!.texture.label]).toEqual([2, 0.5, 0.5, 'room#0']);
    expect(f.above.children).toHaveLength(3); expect(f.above.children[2]).toBeInstanceOf(Graphics);   // particles, blasts, then the flash on top
  });
  it('holds its frame through the hitstop and at presentation dt 0, then plays on and is removed after the last frame', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    for (let k = 0; k < 2; k++) f.draw(frame(s), 1 / 60);            // inside the 60 ms hitstop
    expect(shown(f)[0]!.texture.label).toBe('room#0');
    for (let k = 0; k < 10; k++) f.draw(frame(s), 0);                 // paused
    expect(shown(f)[0]!.texture.label).toBe('room#0');
    for (let k = 0; k < 6; k++) f.draw(frame(s), 1 / 60);
    expect(shown(f)[0]!.texture.label).not.toBe('room#0');
    for (let k = 0; k < 60; k++) f.draw(frame(s), 1 / 60);             // 14 frames at 20 fps is 0.7 s
    expect(shown(f)).toHaveLength(0);
  });
  it('a hit spark on each newly opened breach site, at the site tile centre; the cap of 4 cuts the oldest', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.breaches.active[0] = 1; f.draw(frame(s), 1 / 60);
    const c = tileCentre(s.derived.siteTile[0]!, s.derived.width);
    expect(shown(f).map((b) => [b.x, b.y, b.texture.label])).toEqual([[c.x, c.y, 'hit#0']]);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [0, 1, 2, 3] } }), 1 / 60);
    expect(shown(f)).toHaveLength(4);
    expect(shown(f).every((b) => (b.texture.label ?? '').startsWith('room'))).toBe(true);   // the spark, oldest, was cut
  });
  it('the duel: one room blast on the tile the hit smoke picks', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    f.draw(frame(s, { hit: { whole: true } }), 1 / 60);
    const live = shown(f);
    expect(live).toHaveLength(1);
    const tiles = s.derived.roomTiles.flat().map((t) => tileCentre(t, s.derived.width));
    expect(tiles.some((c) => c.x === live[0]!.x && c.y === live[0]!.y)).toBe(true);
  });
  it('reset and a layout change clear them; without blastArt nothing extra draws', () => {
    const f = make(), s = cutterState();
    f.draw(frame(s), 1 / 60);
    s.tick = 10; f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(shown(f)).toHaveLength(1);
    f.reset(); expect(shown(f)).toHaveLength(0);
    f.draw(frame(s), 1 / 60); s.tick = 15; f.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(shown(f)).toHaveLength(1);
    f.draw(frame(createSimState(parseShip(skiff), 2, 1, RECRUITS)), 1 / 60);   // a new ship
    expect(shown(f)).toHaveLength(0);
    const plain = make(false); plain.draw(frame(s), 1 / 60);
    s.tick = 20; plain.draw(frame(s, { hit: { rooms: [1] } }), 1 / 60);
    expect(plain.above.children).toHaveLength(2);   // the particles and the flash, as before
  });
});
