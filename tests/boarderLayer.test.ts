import { describe, it, expect } from 'vitest';
import { createBoarderLayer } from '../src/renderer/src/render/boarderLayer';
import { TILE_PX } from '../src/shared/resolution';
import { makeState, quiet, placeBoarder, room } from './helpers/sim';
import { damageBoarder } from '../src/renderer/src/sim/boarders';

describe('boarderLayer', () => {
  it('draws one marker per boarder at the room centre in pixels, keyed by StableId, and removes a dead one', () => {
    const s = makeState(1); quiet(s); const layer = createBoarderLayer();
    layer.draw(s); expect(layer.container.children).toHaveLength(0);
    const k = placeBoarder(s, room(s, 'A')); layer.draw(s);
    expect(layer.container.children).toHaveLength(1); expect(layer.container.children[0]!.position.x).toBeCloseTo(2.4 * TILE_PX, 9); expect(layer.container.children[0]!.position.y).toBeCloseTo(2.5 * TILE_PX, 9);
    damageBoarder(s, k, 1000, 0); layer.draw(s); expect(layer.container.children).toHaveLength(0);
  });
});
