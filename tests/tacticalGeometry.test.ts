import { describe, expect, it } from 'vitest';
import { inArc, lineOfSight, roomAtImpact, segmentNear, sideOf } from '../src/renderer/src/sim/tactical/geometry';
import { createTacticalState, Room } from '../src/renderer/src/sim/tactical/state';
import { LASER_ARC_COS } from '../src/renderer/src/sim/tactical/tuning';

describe('arcs without angles (spec §4)', () => {
  it('is inside ±60° of the nose and outside beyond it', () => {
    expect(inArc(0, 0, -10, LASER_ARC_COS)).toBe(true);     // dead ahead (north)
    expect(inArc(0, 10, -10, LASER_ARC_COS)).toBe(true);    // 45°
    expect(inArc(0, 10, -5, LASER_ARC_COS)).toBe(false);    // about 63°
    expect(inArc(0, 0, 10, LASER_ARC_COS)).toBe(false);     // behind
    expect(inArc(64, 10, 0, LASER_ARC_COS)).toBe(true);     // heading east, target east
  });
  it('counts a zero vector as inside', () => {
    expect(inArc(0, 0, 0, LASER_ARC_COS)).toBe(true);
  });
  it('sideOf: +1 clockwise of the nose, −1 anticlockwise, 0 on the line (y down)', () => {
    expect(sideOf(0, 1, 0)).toBe(1);
    expect(sideOf(0, -1, 0)).toBe(-1);
    expect(sideOf(0, 0, -5)).toBe(0);
  });
});

describe('line of sight (spec §7a)', () => {
  it('segmentNear measures to the closest point of the segment, clamped to its ends', () => {
    expect(segmentNear(0, 0, 10, 0, 5, 1, 2)).toBe(true);
    expect(segmentNear(0, 0, 10, 0, 5, 3, 2)).toBe(false);
    expect(segmentNear(0, 0, 10, 0, 13, 0, 2)).toBe(false);
    expect(segmentNear(0, 0, 0, 0, 1, 0, 2)).toBe(true);   // zero-length segment is a point
  });
  it('is blocked by the planet and by an asteroid, and clear in empty space', () => {
    const st = createTacticalState(5), a = st.map.asteroids[0]!;
    expect(lineOfSight(st, -300, 0, 300, 0)).toBe(false);
    expect(lineOfSight(st, -600, -300, -300, -300)).toBe(true);
    expect(lineOfSight(st, a.x - 200, a.y, a.x + 200, a.y)).toBe(false);
  });
});

describe('room by impact point (spec §5)', () => {
  it('nose is Weapons, stern is Engines, flanks are Shields', () => {
    const s = createTacticalState(5).ships[0];
    Object.assign(s, { x: 0, y: 0, heading: 0 });
    expect(roomAtImpact(s, 0, -10)).toBe(Room.Weapons);
    expect(roomAtImpact(s, 0, 10)).toBe(Room.Engines);
    expect(roomAtImpact(s, 10, 0)).toBe(Room.Shields);
    expect(roomAtImpact(s, -10, -1)).toBe(Room.Shields);
    expect(roomAtImpact(s, 5, -5)).toBe(Room.Weapons);    // exactly on the diagonal counts as nose
  });
});
