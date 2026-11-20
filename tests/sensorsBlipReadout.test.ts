// Sensors blip spec §3, §4: the OUTSIDE readout's ENEMY row reads BLIP ~<n>, the range from the crew ship to the ping's
// centre to the nearest 100, when the frame's fog view is passed and the enemy is unseen; NO CONTACT with none; today's
// rows when seen. The scene passes the fog to the drawn readout, and the sit-down card's place follows the ping's centre
// while the enemy is unseen. The lock refusal is unchanged.
import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import hound from '../src/renderer/src/sim/ship/hound.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { sensorRange } from '../src/renderer/src/sim/tactical/science';
import { createTacticalState } from '../src/renderer/src/sim/tactical/state';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { DEFAULT_FEEL } from '../src/renderer/src/render/feel';
import { readoutRows, READOUT_W, type ReadoutRow } from '../src/renderer/src/render/duel/readoutModel';
import { sitCard } from '../src/renderer/src/render/duel/sitModel';
import { lockRefusal } from '../src/renderer/src/render/duel/situationModel';
import type { FogView } from '../src/renderer/src/render/tactical/fogModel';
import { PAD, textPx } from '../src/renderer/src/render/theme';
import { emptyPresses, type KeySample } from '../src/renderer/src/app/duel/input';
import { createDuelRuntime } from '../src/renderer/src/app/duel/runtime';
import { createDuelScene, sitCardBelow } from '../src/renderer/src/app/duel/scene';
import { createDuelSink } from '../src/renderer/src/ui/sinks';
import { createUiStore } from '../src/renderer/src/ui/store';

const vp = { w: 1280, h: 720 };
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
/** A hand-built fog view with the enemy unseen: a ping centred at (x, y), or no blip. */
const fogAt = (x: number, y: number, blip = true): FogView => ({ range: 900, seen: { enemy: false, derelict: false, missile: false }, ghosts: [], blip: blip ? { x, y, r: 375, age: 0 } : null });
const enemyRow = (rows: readonly ReadoutRow[]): string | undefined => rows.find((x) => x.label === 'ENEMY')?.value;

describe('the OUTSIDE readout (sensors blip spec §3)', () => {
  it('ENEMY BLIP ~1800 for a ping centre 1760 u away with the fog passed; NO CONTACT with none; today\'s rows when seen', () => {
    const d = createDuel(parseShip(cutter), 5), [crew, enemy] = d.tactical.ships, r = sensorRange(d.tactical.systems[0]!);
    try {
      Object.assign(enemy!, { x: crew!.x + r * 2, y: crew!.y, active: true });
      const blip = readoutRows({ duel: d, mode: 'interior', active: 0, fog: fogAt(crew!.x + 1760, crew!.y) });
      expect(enemyRow(blip)).toBe('BLIP ~1800');
      expect(blip.some((x) => x.label === 'BEARING')).toBe(false);   // no bearing row, as today
      expect(textPx('ENEMY') + 6 + textPx('BLIP ~1800')).toBeLessThanOrEqual(READOUT_W - 2 * PAD);   // it fits the column, as NO CONTACT does
      const plain = readoutRows({ duel: d, mode: 'interior', active: 0 });   // no fog passed (the count-only calls, the old tests)
      expect(enemyRow(plain)).toBe('NO CONTACT');
      expect(blip.length).toBe(plain.length);                         // so the count-only calls count the drawn rows
      expect(enemyRow(readoutRows({ duel: d, mode: 'interior', active: 0, fog: null }))).toBe('NO CONTACT');
      expect(enemyRow(readoutRows({ duel: d, mode: 'interior', active: 0, fog: fogAt(0, 0, false) }))).toBe('NO CONTACT');   // a fog with no blip
      Object.assign(enemy!, { x: crew!.x + r / 2 });
      const seen = readoutRows({ duel: d, mode: 'interior', active: 0, fog: fogAt(crew!.x + 1760, crew!.y) });   // seen: a blip in the view is ignored
      expect(enemyRow(seen)).toBe(String(Math.round(r / 2)));
      expect(seen.find((x) => x.label === 'BEARING')?.value).toBe('090');
    } finally { disposeDuel(d); }
  });
  it('the lock refusal still reads NO CONTACT on an unseen enemy', () => {
    const d = createDuel(parseShip(cutter), 5), [crew, enemy] = d.tactical.ships, r = sensorRange(d.tactical.systems[0]!);
    try {
      Object.assign(enemy!, { x: crew!.x + r * 2, y: crew!.y, active: true });
      expect(lockRefusal(d)).toBe('NO CONTACT');
      Object.assign(enemy!, { x: crew!.x + r / 2 });
      expect(lockRefusal(d)).toBeNull();
    } finally { disposeDuel(d); }
  });
});

describe('the sit-down card\'s place (sensors blip spec §3)', () => {
  it('unseen, it follows the ping\'s centre, not the enemy; with no blip, the enemy as today', () => {
    const t = createTacticalState(5), own = t.ships[0]!, e = t.ships[1]!;
    Object.assign(own, { x: 1000, y: 2000 });
    Object.assign(e, { x: 3000, y: 1500, active: true });       // the enemy is above the crew ship
    expect(sitCardBelow(t, fogAt(2900, 2300))).toBe(true);      // the ping's centre is below it
    expect(sitCardBelow(t, fogAt(2900, 1700))).toBe(false);
    expect(sitCardBelow(t, fogAt(0, 0, false))).toBe(false);    // no blip: the enemy's own place
    e.y = 2500;                                                 // the enemy below
    expect(sitCardBelow(t, fogAt(0, 0, false))).toBe(true);
    expect(sitCardBelow(t, fogAt(2900, 1700))).toBe(false);     // still the ping's centre while there is one
    expect(sitCard('helm', 0.5, false, sitCardBelow(t, fogAt(2900, 2300)))!.top).toBe(true);
    expect(sitCard('helm', 0.5, false, sitCardBelow(t, fogAt(2900, 1700)))!.top).toBe(false);
  });
});

describe('the scene passes the frame\'s fog to the drawn readout (sensors blip spec §3)', () => {
  it('standing with the enemy beyond sensor range, the OUTSIDE strip reads ENEMY BLIP ~<n>; in range, the exact range', () => {
    const now = 0;
    const keys: KeySample = { moveX: 0, moveY: 0, interactHeld: false, fireHeld: false, presses: emptyPresses() };
    const rt = createDuelRuntime({ now: () => now, seed: 5, viewport: vp, layout: parseShip(hound), scheduler: { schedule() { return () => {}; } },
      sampleKeys: () => keys, samplePointer: () => ({ x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }), clearKeys: () => {} });
    const stage = new Container(), store = createUiStore({ onlineAvailable: false } as never);
    const renderer = { app: { stage }, assets, stageScale: () => 1, feel: () => DEFAULT_FEEL, crt: () => 'off' as const };
    const scene = createDuelScene(renderer as never, { seed: 5, pauseText: 'PAUSED', ui: createDuelSink(store) });
    const shown = (): string => enemyRow(store.getState().duel?.readout.rows ?? []) ?? '';
    try {
      const ships = () => rt.duel.tactical.ships;   // read again after each frame: the test holds no ship across a step
      Object.assign(ships()[1]!, { x: ships()[0]!.x + 3000, y: ships()[0]!.y, active: true });   // far beyond the start range of 900
      rt.frame(1 / 60); scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      expect(rt.view()).toBe('interior');   // both stand at the start: the ship view, with the OUTSIDE strip
      expect(shown()).toMatch(/^BLIP ~\d+00$/);
      const n = Number(shown().slice('BLIP ~'.length)), dist = Math.hypot(ships()[1]!.x - ships()[0]!.x, ships()[1]!.y - ships()[0]!.y);
      expect(Math.abs(n - dist)).toBeLessThanOrEqual(0.8 * 600 + 50);   // within the largest circle's offset, plus the rounding
      Object.assign(ships()[1]!, { x: ships()[0]!.x + 600, y: ships()[0]!.y });   // inside the range
      scene.draw(rt, 1 / 60, { banner: null, layerPaused: false, end: null });
      expect(shown()).toMatch(/^\d+$/);
    } finally { scene.dispose(); rt.dispose(); }
  });
});
