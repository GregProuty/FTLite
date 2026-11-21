// UI round Part 3 §3: the interior view draws the shield bubble, the hex shimmer and the enemy shots only when given a look.
import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { Position } from '../src/renderer/src/sim/components';
import { disposeDuel } from '../src/renderer/src/sim/duel/state';
import { createSeatedDuel } from './helpers/duelSeat';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { FEATURE_NAMES } from '../src/renderer/src/render/fallback';
import { createInteriorView } from '../src/renderer/src/render/duel/interiorView';
import { addShieldHit, createShieldFx, stepShieldFx } from '../src/renderer/src/render/shieldFx';
import { createShots, pushShots, stepShots } from '../src/renderer/src/render/duel/enemyShots';

const layout = parseShip(cutter);
const assets: GameAssets = {
  has: () => false,
  texture: (n) => { throw new Error(`no texture ${n} in tests`); },
  animation: (n) => { throw new Error(`no animation ${n} in tests`); },
  nineSlice: (n) => { throw new Error(`no nine-slice ${n} in tests`); },
  missing: Object.values(FEATURE_NAMES).flat(), fontFamily: 'm5x7'
};
const crewAt = (d: ReturnType<typeof createSeatedDuel>) => d.interior.crew.map((eid) => ({ x: Position.x[eid]!, y: Position.y[eid]! }));
/** The drawing-instruction count of every Graphics child of the world; the shield Graphics is the one that grows with a look. */
const instructions = (view: ReturnType<typeof createInteriorView>): number[] =>
  view.world.children.filter((c) => (c as Graphics).context !== undefined).map((c) => (c as Graphics).context.instructions.length);

describe('the interior shield and enemy shots', () => {
  it('draws nothing without a look and something with a fresh stopped hit and a flying shot', () => {
    const d = createSeatedDuel(layout, 5), view = createInteriorView(assets);
    view.draw(d, crewAt(d), 1, 1 / 60);
    const plain = instructions(view);
    const shield = createShieldFx(2), shots = createShots();
    addShieldHit(shield, 0, 0, true, false);
    stepShieldFx(shield, 0.05);
    pushShots(shots, [{ target: 0, a: 0, kind: 'laser', stopped: true, drop: true, room: -1, miss: false }], view.frame(d), 600);
    stepShots(shots, 0.03);
    view.draw(d, crewAt(d), 1, 1 / 60, [], 1 / 60, undefined, null, null, { shield, shots, up: 1 });
    const lit = instructions(view);
    expect(lit.reduce((a, b) => a + b, 0)).toBeGreaterThan(plain.reduce((a, b) => a + b, 0));
    view.draw(d, crewAt(d), 1, 1 / 60);   // no look again: the extra drawing is gone
    expect(instructions(view)).toEqual(plain);
    view.destroy(); disposeDuel(d);
  });
});
