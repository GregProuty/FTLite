import { describe, it, expect } from 'vitest';
import { tokenLook, TOKEN_RADIUS } from '../src/renderer/src/render/tokenModel';
import { CREW_COLORS } from '../src/renderer/src/render/crewSprites';
import { TILE_PX } from '../src/shared/resolution';

describe('VTT tokens (Art-iv spec section 5)', () => {
  it('a conscious player: their colour, a rim, a facing tick on the rim, no ring or cross', () => {
    const t = tokenLook(1, 'conscious', false, 'e');
    expect(t.fill).toBe(CREW_COLORS[1]); expect(t.ring).toBeNull(); expect(t.cross).toBe(false);
    expect(t.tick!.x).toBeCloseTo(TOKEN_RADIUS, 6); expect(t.tick!.y).toBeCloseTo(0, 6);
  });
  it('about half a square (one tile) across', () => {
    expect(2 * TOKEN_RADIUS).toBeGreaterThan(0.8 * TILE_PX); expect(2 * TOKEN_RADIUS).toBeLessThanOrEqual(TILE_PX);
  });
  it('seated gets a bright ring; downed goes grey with a red cross and no tick; dead is grey', () => {
    expect(tokenLook(0, 'conscious', true, 's').ring).not.toBeNull();
    const d = tokenLook(0, 'downed', false, 's');
    expect(d.cross).toBe(true); expect(d.tick).toBeNull(); expect(d.fill).not.toBe(CREW_COLORS[0]);
    expect(d.crossColor).toBeTypeOf('number');
    expect(tokenLook(0, 'dead', false, 's').fill).toBe(d.fill);
  });
  it('diagonal facings put the tick on the rim', () => {
    const t = tokenLook(2, 'conscious', false, 'nw').tick!;
    expect(Math.hypot(t.x, t.y)).toBeCloseTo(TOKEN_RADIUS, 6); expect(t.x).toBeLessThan(0); expect(t.y).toBeLessThan(0);
  });
});
