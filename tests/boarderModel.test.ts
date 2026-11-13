import { describe, it, expect } from 'vitest';
import { freshWalker, stepWalker, doorBetween, BOARDER_WALK_TILES_PER_S } from '../src/renderer/src/render/boarderModel';
import { makeState, quiet, room } from './helpers/sim';
import { roomCentre } from '../src/renderer/src/sim/boarders';

describe('boarderModel: boarders walk through doors', () => {
  it('walks from room to room via the door between them, at walking speed', () => {
    const s = makeState(1); quiet(s);
    const d = s.derived;
    let a = -1, b = -1;
    for (let e = 0; e < d.edgeA.length && a < 0; e++) if (d.edgeIsDoor[e]) { a = d.edgeA[e]!; b = d.edgeB[e]!; }
    const door = doorBetween(s, a, b)!; expect(door).not.toBeNull();
    const [ax, ay] = roomCentre(s, a), [bx, by] = roomCentre(s, b);
    const w = freshWalker({ x: ax, y: ay, room: a });
    const step = stepWalker(s, w, { x: bx, y: by, room: b }, 0.1);
    expect(Math.hypot(step.dx, step.dy)).toBeCloseTo(BOARDER_WALK_TILES_PER_S * 0.1, 9);
    expect(w.path[0]).toEqual(door);
    for (let i = 0; i < 200; i++) stepWalker(s, w, { x: bx, y: by, room: b }, 0.1);
    expect(w.x).toBeCloseTo(bx, 9); expect(w.y).toBeCloseTo(by, 9); expect(w.path).toHaveLength(0);
  });
  it('rooms with no shared door give null', () => {
    const s = makeState(1); quiet(s);
    expect(doorBetween(s, room(s, 'A'), room(s, 'A'))).toBeNull();
  });
});
