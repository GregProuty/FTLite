import { describe, it, expect } from 'vitest';
import { moveAABB } from '../src/renderer/src/sim/movement';
import { solidAt, roomAt } from '../src/renderer/src/sim/grid';
import { Position, Life, LifeState } from '../src/renderer/src/sim/components';
import { CREW_SPEED, DT, CREW_HALF } from '../src/renderer/src/sim/tuning';
import { makeState, intents, run, teleport, room } from './helpers/sim';

const wallsOutside = (tx: number, ty: number): boolean => tx < 0 || ty < 0 || tx >= 10 || ty >= 10;

describe('moveAABB', () => {
  it('moves freely in open space', () => {
    const p = moveAABB(wallsOutside, 5, 5, 0.1, -0.2, 0.3);
    expect(p.x).toBeCloseTo(5.1); expect(p.y).toBeCloseTo(4.8);
  });
  it('stops at a wall and snaps flush to it', () => {
    const p = moveAABB(wallsOutside, 9.5, 5, 0.5, 0, 0.3);
    expect(p.x).toBeLessThanOrEqual(9.7); expect(p.x).toBeGreaterThan(9.69);
  });
  it('slides along a wall when moving diagonally into it', () => {
    const p = moveAABB(wallsOutside, 9.69, 5, 0.5, 0.3, 0.3);
    expect(p.x).toBeCloseTo(9.7, 5); expect(p.y).toBeCloseTo(5.3);
  });
  it('is deterministic (same inputs, same bits)', () => {
    const a = moveAABB(wallsOutside, 1.234, 5.678, 0.0333, -0.0111, 0.3);
    const b = moveAABB(wallsOutside, 1.234, 5.678, 0.0333, -0.0111, 0.3);
    expect(a).toEqual(b);
  });
});

describe('grid', () => {
  it('walls and outside are solid, floors are not, closed doors are solid', () => {
    const s = makeState();
    expect(solidAt(s, 0, 0)).toBe(true);
    expect(solidAt(s, -1, 5)).toBe(true);
    expect(solidAt(s, 1, 5)).toBe(false);
    expect(solidAt(s, 2, 4)).toBe(true); // door, closed
    expect(roomAt(s, 2.5, 9.5)).toBe(room(s, 'G'));
    expect(roomAt(s, 2.5, 4.5)).toBe(-1);
  });
});

describe('movementSystem', () => {
  it('moves a conscious crew member at CREW_SPEED', () => {
    const s = makeState(1);
    run(s, 60, () => intents({ moveX: 1 }));
    expect(Position.x[s.crew[0]!]).toBeCloseTo(2.5 + CREW_SPEED, 3);
  });
  it('diagonal movement is not faster than straight', () => {
    const s = makeState(1);
    teleport(s, 0, 10, 5.5);
    run(s, 10, () => intents({ moveX: 1, moveY: 1 }));
    const dx = Position.x[s.crew[0]!]! - 10, dy = Position.y[s.crew[0]!]! - 5.5;
    expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(CREW_SPEED * DT * 10, 3);
  });
  it('stops at the room wall', () => {
    const s = makeState(1);
    run(s, 300, () => intents({ moveX: -1 }));
    expect(Position.x[s.crew[0]!]).toBeCloseTo(1 + CREW_HALF, 3);
  });
  it('downed crew do not move', () => {
    const s = makeState(1);
    Life.state[s.crew[0]!] = LifeState.Downed;
    run(s, 30, () => intents({ moveX: 1 }));
    expect(Position.x[s.crew[0]!]).toBe(2.5);
  });
});
