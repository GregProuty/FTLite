// @vitest-environment jsdom
// The tactical layer's CRT filters (CRT map spec section 3): none at glow 0, the bloom and the noise with a glow.
import { BitmapText, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { crtScale } from '../src/renderer/src/render/crt';
import { createTacticalLayer } from '../src/renderer/src/render/tactical/tacticalLayer';

describe('setCrt (CRT map spec section 3)', () => {
  it('off: no filter; subtle and full: the bloom and the noise; back to off removes them', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: { w: 1280, h: 720 } });
    layer.setCrt(crtScale('off')); expect(layer.bloom.filters ?? []).toHaveLength(0);
    layer.setCrt(crtScale('subtle')); expect(layer.bloom.filters).toHaveLength(2);
    layer.setCrt(crtScale('full')); expect(layer.bloom.filters).toHaveLength(2);
    layer.setCrt(crtScale('off')); expect(layer.bloom.filters ?? []).toHaveLength(0);
  });
  it('the lock label (its bar and text) is not under a filtered container', () => {
    const layer = createTacticalLayer({ fontFamily: 'm5x7', viewport: { w: 1280, h: 720 } });
    layer.setCrt(crtScale('full'));
    const underFilter = (o: { parent: unknown; filters?: unknown }): boolean => {
      for (let p = o as { parent: any; filters?: any } | null; p; p = p.parent) if (((p.filters as unknown[] | null) ?? []).length > 0) return true;
      return false;
    };
    const direct = layer.container.children;
    const lockText = direct.find((c) => c instanceof BitmapText), lockBar = direct.find((c) => c instanceof Graphics);
    expect(lockText).toBeDefined(); expect(lockBar).toBeDefined();
    expect(underFilter(lockText!)).toBe(false); expect(underFilter(lockBar!)).toBe(false);
    expect(underFilter(layer.bloom)).toBe(true);
  });
});
