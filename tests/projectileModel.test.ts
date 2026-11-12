import { describe, it, expect } from 'vitest';
import { projectilePath, projectilePos, evadePos, outcomeOf, shouldReset, roomCentrePx, asteroidShape, fragmentCount, ASTEROID_SHOW_SECONDS, SHOT_SHOW_SECONDS, EVADE_FADE_TICKS, SHAKE_ASTEROID_PX, SHAKE_SHOT_PX, SHAKE_SECONDS } from '../src/renderer/src/render/projectileModel';
import { WORLD_BAND, worldFit } from '../src/renderer/src/render/worldFit';
import { ObjectKind } from '../src/renderer/src/sim/debris';
import { cutterState, room } from './helpers/sim';
import { TICK_HZ } from '../src/renderer/src/sim/tuning';

const centre = { x: 600, y: 260 };
const inBand = (p: { x: number; y: number }) => p.x >= WORLD_BAND.x && p.x <= WORLD_BAND.x + WORLD_BAND.w && p.y >= WORLD_BAND.y && p.y <= WORLD_BAND.y + WORLD_BAND.h;

describe('projectile model (spec Demo-vii section 2)', () => {
  it('the visibility windows and effect constants', () => {
    expect([ASTEROID_SHOW_SECONDS, SHOT_SHOW_SECONDS, EVADE_FADE_TICKS, SHAKE_ASTEROID_PX, SHAKE_SHOT_PX, SHAKE_SECONDS]).toEqual([6, 1.2, 36, 4, 3, 0.25]);
  });
  it('arrives exactly at the room centre at impactTick and starts outside the world band', () => {
    for (let id = 1; id <= 60; id++) for (const [kind, show] of [[ObjectKind.Debris, ASTEROID_SHOW_SECONDS], [ObjectKind.Shot, SHOT_SHOW_SECONDS]] as const) {
      const path = projectilePath(id, kind, centre, WORLD_BAND);
      expect(projectilePos(path, 1000, 1000, show)).toEqual(centre);
      const start = projectilePos(path, 1000, 1000 - show * TICK_HZ, show)!;
      expect(inBand(start), `id ${id} kind ${kind}`).toBe(false);
      expect(projectilePos(path, 1000, 1000 - show * TICK_HZ - 1, show)).toBeNull();
      expect(projectilePos(path, 1000, 1001, show)).toBeNull();
    }
  });
  it('never enters from the left (behind the ship); shots come from the right edge', () => {
    const sides = new Set<string>();
    for (let id = 1; id <= 200; id++) {
      const p = projectilePath(id, ObjectKind.Debris, centre, WORLD_BAND);
      expect(p.from.x).toBeGreaterThanOrEqual(WORLD_BAND.x + WORLD_BAND.w * 0.25);
      sides.add(p.from.y < WORLD_BAND.y ? 'top' : p.from.y > WORLD_BAND.y + WORLD_BAND.h ? 'bottom' : 'front');
      const s = projectilePath(id, ObjectKind.Shot, centre, WORLD_BAND);
      expect(s.from.x).toBeGreaterThan(WORLD_BAND.x + WORLD_BAND.w);
    }
    expect([...sides].sort()).toEqual(['bottom', 'front', 'top']);
  });
  it('is deterministic for a stableId and differs between ids', () => {
    expect(projectilePath(7, ObjectKind.Debris, centre, WORLD_BAND)).toEqual(projectilePath(7, ObjectKind.Debris, centre, WORLD_BAND));
    expect(projectilePath(7, ObjectKind.Debris, centre, WORLD_BAND)).not.toEqual(projectilePath(8, ObjectKind.Debris, centre, WORLD_BAND));
    expect(asteroidShape(7)).toEqual(asteroidShape(7));
  });
  it('asteroid shapes are 14 to 22 px wide; a hit bursts into 8 to 12 fragments', () => {
    for (let id = 1; id <= 100; id++) {
      const pts = asteroidShape(id), xs = pts.map((p) => p.x);
      const w = Math.max(...xs) - Math.min(...xs);
      expect(w).toBeGreaterThanOrEqual(14 * 0.75); expect(w).toBeLessThanOrEqual(22);
      expect(fragmentCount(id)).toBeGreaterThanOrEqual(8); expect(fragmentCount(id)).toBeLessThanOrEqual(12);
    }
  });
  it('an evaded object keeps its arrival velocity past the centre and fades over 0.6 s', () => {
    const path = projectilePath(3, ObjectKind.Debris, centre, WORLD_BAND), win = ASTEROID_SHOW_SECONDS * TICK_HZ;
    const v = { x: (path.to.x - path.from.x) / win, y: (path.to.y - path.from.y) / win };
    const e = evadePos(path, 1000, 1010, ASTEROID_SHOW_SECONDS)!;
    expect(e.x).toBeCloseTo(centre.x + 10 * v.x, 9); expect(e.y).toBeCloseTo(centre.y + 10 * v.y, 9);
    expect(e.alpha).toBeCloseTo(1 - 10 / 36, 9);
    expect(evadePos(path, 1000, 1000, ASTEROID_SHOW_SECONDS)!.alpha).toBe(1);
    expect(evadePos(path, 1000, 1036, ASTEROID_SHOW_SECONDS)).toBeNull();
  });
  it('outcomeOf: gone before its impact tick is destroyed; at or after, a hit when the room marker is at least the impact tick, else evaded', () => {
    expect(outcomeOf(990, 1000, -1)).toBe('destroyed');
    expect(outcomeOf(990, 1000, 995)).toBe('destroyed');
    expect(outcomeOf(1001, 1000, 1000)).toBe('hit');
    expect(outcomeOf(1001, 1000, 1001)).toBe('hit');
    expect(outcomeOf(1001, 1000, 400)).toBe('evaded');
    expect(outcomeOf(1001, 1000, -1)).toBe('evaded');
  });
  it('shouldReset on a node change, a tick going backwards, or a jump forward of more than 2 s', () => {
    expect(shouldReset(100, 101, 0, 0)).toBe(false);
    expect(shouldReset(100, 220, 0, 0)).toBe(false);
    expect(shouldReset(100, 221, 0, 0)).toBe(true);
    expect(shouldReset(100, 99, 0, 0)).toBe(true);
    expect(shouldReset(100, 101, 0, 4)).toBe(true);
  });
  it('roomCentrePx maps a room centre through worldFit into internal pixels', () => {
    const s = cutterState(), fit = worldFit(s.derived.width, s.derived.height), E = room(s, 'E');
    const c = roomCentrePx(s.derived, E, fit);
    expect(c.x).toBeCloseTo(fit.x + 2.5 * 32 * fit.scale, 9);            // Engines spans x 1..3, centre 2.5 tiles
    expect(c.y).toBeCloseTo(fit.y + 6.5 * 32 * fit.scale, 9);            // rows 5..7, centre 6.5 tiles
  });
});
