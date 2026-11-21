// How a readout row draws on the CRT screen (CRT map spec section 2): crtRowLook, moved out of the deleted ReadoutPanel
// (UI round §2.2); the Weapons cards use it.
import { describe, expect, it } from 'vitest';
import type { ReadoutRow } from '../src/renderer/src/render/duel/readoutModel';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import { crtRowLook } from '../src/renderer/src/ui/duel/crtRowLook';

describe('the CRT row look (CRT map spec section 2)', () => {
  const r = (patch: Partial<ReadoutRow>): ReadoutRow => ({ label: 'HULL', value: '10/40', labelTint: 1, valueTint: 2, ...patch });
  it('labels mid and values main; a heading main', () => {
    expect(crtRowLook(r({}), 0)).toMatchObject({ label: CRT.mid, value: CRT.main, inverse: null, bar: CRT.main });
    expect(crtRowLook(r({ label: 'LASER', value: '' }), 0)).toMatchObject({ label: CRT.main, inverse: null });
  });
  it('good and warn: hot text and a hot bar, never dimmer than a plain value', () => {
    for (const e of ['good', 'warn'] as const) expect(crtRowLook(r({ emphasis: e }), 0)).toMatchObject({ value: CRT.hot, bar: CRT.hot, inverse: null });
  });
  it('alert: the value on an inverse bar (glass text) alternating main and hot at 2 Hz; an alert heading inverts its label', () => {
    expect(crtRowLook(r({ emphasis: 'alert' }), 0)).toMatchObject({ inverse: 'value', value: CRT.glass, block: CRT.main });
    expect(crtRowLook(r({ emphasis: 'alert' }), 0.3)).toMatchObject({ inverse: 'value', value: CRT.glass, block: CRT.hot });
    expect(crtRowLook(r({ label: 'TORPEDO INBOUND', value: '', emphasis: 'alert' }), 0)).toMatchObject({ inverse: 'label', label: CRT.glass });
  });
  it('enemy: the HUNTER heading and the LOCK value on a main inverse bar; enemy pips stay text-free (hollow pips)', () => {
    expect(crtRowLook(r({ label: 'HUNTER', value: '', emphasis: 'enemy' }), 0)).toMatchObject({ inverse: 'label', label: CRT.glass, block: CRT.main });
    expect(crtRowLook(r({ label: 'LOCK', value: 'SHIELDS', emphasis: 'enemy' }), 0)).toMatchObject({ inverse: 'value', value: CRT.glass, block: CRT.main });
    expect(crtRowLook(r({ label: 'SHIELD', value: '', pips: { n: 1, max: 2, colour: 0 }, emphasis: 'enemy' }), 0)).toMatchObject({ inverse: null, label: CRT.mid });
  });
  it('crew: the crew heading main text, no bar', () => {
    expect(crtRowLook(r({ label: 'HOUND', value: '', emphasis: 'crew' }), 0)).toMatchObject({ label: CRT.main, inverse: null });
  });
});

