// @vitest-environment jsdom
// The CRT screen in the React overlays (CRT map spec sections 1-4): only with `crt` true, on the letterbox rectangle,
// after the banners and before the end card and the latency overlay; the strength setting from the store; the panels'
// double border (UI round §2.2: the readout and its inverse bars are gone); nothing changes with `crt` false (the interior).
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createDuelSink, createFlightSink, createLatencySink } from '../src/renderer/src/ui/sinks';
import { setCrtSetting, setLayout } from '../src/renderer/src/ui/store';
import type { DuelUiView } from '../src/renderer/src/ui/views';
import { makeUi } from './helpers/uiStore';

afterEach(cleanup);
const banners = { interior: null, tactical: 'PAUSED', notice: null };
const view = (patch: Partial<DuelUiView> = {}): DuelUiView => ({
  end: null, banners, overlay: { zoomText: 'ZOOM 0.50', scaleBar: { px: 80, units: 500 }, snapHint: false }, crt: true, ...patch });
function mount() {
  const ui = makeUi(); const duel = createDuelSink(ui.store), flight = createFlightSink(ui.store), latency = createLatencySink(ui.store);
  act(() => setLayout(ui.store, { scale: 1.5, offsetX: 0, offsetY: 0, dpr: 1 }));
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><UiRoot menu={false} /></UiContext.Provider>);
  return { ...ui, duel, flight, latency };
}
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const all = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

describe('the CRT screen (CRT map spec section 3)', () => {
  it('crt false: no CRT screen, a glow wrapper with no filter, no inverse bars, the themed panel', () => {
    const { duel } = mount(); act(() => duel.frame(view({ crt: false })));
    expect(q('[data-ui-crt]')).toBeNull(); expect(q('[data-ui-crt-glow]')!.style.filter).toBe('none'); expect(all('[data-ui-inverse]')).toHaveLength(0);
    expect(q('[data-ui-panel]')!.dataset.uiPanel).toBe('');
  });
  it('crt true at subtle (the default): scanlines, mask, vignette and the bezel on the letterbox rectangle; a double-bordered panel', () => {
    const { duel } = mount(); act(() => duel.frame(view()));
    const screen = q('[data-ui-crt]')!;
    expect([screen.style.left, screen.style.top, screen.style.width, screen.style.height]).toEqual(['0px', '0px', '1920px', '1080px']);
    for (const part of ['scanlines', 'mask', 'vignette', 'bezel']) expect(q(`[data-ui-crt-${part}]`), part).not.toBeNull();
    expect(q('[data-ui-crt-glow]')!.style.filter).toContain('drop-shadow');
    const panel = q('[data-ui-panel]')!; expect(panel.dataset.uiPanel).toBe('crt'); expect(panel.style.borderStyle).toBe('double');
  });
  it('off keeps the bezel and drops every screen effect and the glow', () => {
    const { duel, store } = mount(); act(() => { setCrtSetting(store, 'off'); duel.frame(view()); });
    expect(q('[data-ui-crt-bezel]')).not.toBeNull();
    for (const part of ['scanlines', 'mask', 'vignette', 'flicker']) expect(q(`[data-ui-crt-${part}]`), part).toBeNull();
    expect(q('[data-ui-crt-glow]')!.style.filter).toBe('none');
  });
  it('sits after the banners and before the end card and the latency overlay, which stay un-themed', () => {
    const { duel, latency } = mount();
    act(() => { duel.frame(view({ end: { title: 'VICTORY', tint: 0x8fe06a, length: 'DUEL LENGTH 1:23', prompt: 'ENTER' } })); latency.frame(['RTT 3 MS']); });
    const order = all('[data-ui-crt], canvas[data-text="PAUSED"], canvas[data-text="VICTORY"], canvas[data-text="RTT 3 MS"]').map((e) => e.dataset.text ?? 'crt');
    expect(order).toEqual(['PAUSED', 'crt', 'VICTORY', 'RTT 3 MS']);
    const panels = all('[data-ui-panel]').map((p) => p.dataset.uiPanel);
    expect(panels).toEqual(['crt', '']);   // UI round §1.5: the pause line's panel on the CRT, the end card as today (§2.2: no readout panel)
  });
  it('the flight view is a CRT screen too', () => {
    const { flight } = mount(); act(() => flight.frame({ feel: [['SPEED', '1 u/s']], banners, overlay: null, crt: true }));
    expect(q('[data-ui-crt-bezel]')).not.toBeNull(); expect(q('[data-ui-panel]')!.dataset.uiPanel).toBe('crt');
  });
});
