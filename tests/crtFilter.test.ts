// @vitest-environment jsdom
// The tactical layer's CRT filters (CRT map spec section 3): none at glow 0, the bloom and the noise with a glow.
import { describe, expect, it } from 'vitest';
import { crtScale } from '../src/renderer/src/render/crt';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';

describe('setCrt (CRT map spec section 3)', () => {
  it('off: no filter; subtle and full: the bloom and the noise; back to off removes them', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: { w: 1280, h: 720 } });
    layer.setCrt(crtScale('off')); expect(layer.container.filters ?? []).toHaveLength(0);
    layer.setCrt(crtScale('subtle')); expect(layer.container.filters).toHaveLength(2);
    layer.setCrt(crtScale('full')); expect(layer.container.filters).toHaveLength(2);
    layer.setCrt(crtScale('off')); expect(layer.container.filters ?? []).toHaveLength(0);
  });
});
