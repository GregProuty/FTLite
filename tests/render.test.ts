import { describe, it, expect } from 'vitest';
import { stageFit } from '../src/renderer/src/render/letterbox';
import { syncCache } from '../src/renderer/src/render/cache';
import type { Container } from 'pixi.js';
import { createEnemyWindowLayer } from '../src/renderer/src/render/enemyWindow';
import { enemyWindowModel, stepWindowAnim, freshWindowAnim, hitFlashOf } from '../src/renderer/src/render/enemyWindowModel';
import { EnemyRoom, leave } from '../src/renderer/src/sim/enemy';
import { ENEMY_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { makeState, quiet, placeEnemy } from './helpers/sim';

describe('stageFit', () => {
  it('fills the window with the stage at a smooth scale (UI round §2.1)', () => {
    expect(stageFit(1280, 720)).toEqual({ w: 1280, h: 720, scale: 1, offsetX: 0, offsetY: 0 });
    expect(stageFit(1920, 1080)).toEqual({ w: 1280, h: 720, scale: 1.5, offsetX: 0, offsetY: 0 });
    expect(stageFit(2560, 1440)).toEqual({ w: 1280, h: 720, scale: 2, offsetX: 0, offsetY: 0 });
    const f = stageFit(1366, 768); expect({ w: f.w, h: f.h }).toEqual({ w: 1281, h: 720 }); expect(f.scale).toBeCloseTo(1366 / 1281, 12); expect(f.offsetX).toBe(0); expect(f.offsetY).toBe(0);   // the rounded width binds; under a pixel spare
  });
});

describe('syncCache', () => {
  it('creates entries for new ids and destroys stale ones (recycled slot between frames)', () => {
    const cache = new Map<number, { id: number; dead: boolean }>();
    const destroyed: number[] = [];
    const create = (id: number) => ({ id, dead: false });
    const destroy = (o: { id: number; dead: boolean }) => { o.dead = true; destroyed.push(o.id); };
    syncCache(cache, [1, 2, 3], create, destroy);
    expect([...cache.keys()]).toEqual([1, 2, 3]);
    syncCache(cache, [1, 3, 4], create, destroy);   // 2 removed, 4 reuses a slot but has a new StableId
    expect(destroyed).toEqual([2]);
    expect(cache.has(2)).toBe(false); expect(cache.get(4)!.dead).toBe(false);
  });
});

describe('enemy window layer (spec Demo-viii section 2)', () => {
  const count = (c: Container): number => c.children.reduce((n, k) => n + 1 + count(k as Container), 0);
  it('makes every display object on creation: 60 frames of arriving, fighting, burning, a shot and the break-up add none', () => {
    const layer = createEnemyWindowLayer({ fontFamily: 'm5x7', fire: null, panel: null });
    const s = makeState(2); quiet(s); s.tick = 1000; let a = stepWindowAnim(freshWindowAnim(), s);
    placeEnemy(s); s.enemy.nextShotTick = 1e9;
    const frame = () => { a = stepWindowAnim(a, s); const v = enemyWindowModel(s, s.tick, a); layer.draw(v, true, 1 / 60, hitFlashOf(s, v)); s.tick++; };
    frame(); const n0 = count(layer.container); expect(layer.container.visible).toBe(true);
    for (let i = 0; i < 20; i++) frame();
    s.enemy.roomFire[EnemyRoom.Shields] = 10; s.enemy.roomBreach[EnemyRoom.Hold] = 10; s.weapons.lastShotTick = s.tick; s.weapons.lastShotTarget = ENEMY_SLOT; s.weapons.lastShotResult = 2;
    for (let i = 0; i < 20; i++) frame();
    s.telemetry.enemiesDestroyed++; leave(s, false);
    for (let i = 0; i < 20; i++) frame();
    expect(count(layer.container)).toBe(n0);
    a = stepWindowAnim(a, s); layer.draw(enemyWindowModel(s, s.tick + 200, a), true, 1 / 60, null); expect(layer.container.visible).toBe(false);
  });
  it('is hidden when not shown (a navigator at Navigation)', () => {
    const layer = createEnemyWindowLayer({ fontFamily: 'm5x7', fire: null, panel: null });
    const s = makeState(2); quiet(s); placeEnemy(s); const a = stepWindowAnim(freshWindowAnim(), s);
    layer.draw(enemyWindowModel(s, s.tick, a), false, 1 / 60, null); expect(layer.container.visible).toBe(false);
  });
});
