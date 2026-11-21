// @vitest-environment jsdom
// The pixel stage (React UI spec §4): internal pixels to whole device pixels, panels and bars from the theme, and text as
// a canvas carrying its string.
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { edge, boxCss } from '../src/renderer/src/ui/stage/geometry';
import { hex } from '../src/renderer/src/ui/stage/color';
import { Stage } from '../src/renderer/src/ui/stage/Stage';
import { Box } from '../src/renderer/src/ui/stage/Box';
import { Panel } from '../src/renderer/src/ui/stage/Panel';
import { Bar } from '../src/renderer/src/ui/stage/Bar';
import { PixelText } from '../src/renderer/src/ui/stage/PixelText';
import { UiContext } from '../src/renderer/src/ui/context';
import { setLayout } from '../src/renderer/src/ui/store';
import { useStage } from '../src/renderer/src/ui/stage/useStage';
import { makeUi } from './helpers/uiStore';

afterEach(cleanup);
const layout = { stripHeight: 0, scale: 1.5, offsetX: 10, offsetY: 4, stageW: 1280, stageH: 720, dpr: 1 };

describe('geometry', () => {
  it('rounds each edge to whole device pixels', () => {
    expect(edge(7, 10, 1.5, 1)).toBe(21);           // 10 + 10.5 -> 20.5 rounds to 21
    expect(edge(7, 10, 1.5, 1.25)).toBe(20.8);      // (10 + 10.5) * 1.25 = 25.625 -> 26 device px = 20.8 css
    expect(boxCss(1, 1, 3, 3, layout)).toEqual({ left: 12, top: 6, width: 4, height: 4 });   // left 11.5 -> 12, right 16; top 5.5 -> 6, bottom 10
  });
  it('writes theme colours as CSS', () => { expect(hex(0x141a24)).toBe('#141a24'); expect(hex(0x05060a, 0.5)).toBe('rgba(5, 6, 10, 0.5)'); });
});

describe('the primitives', () => {
  function stage(children: ReactNode) {
    const ui = makeUi(); setLayout(ui.store, layout);
    return render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Stage>{children}</Stage></UiContext.Provider>);
  }
  it('Stage covers the window below the strip and takes no pointer events', () => {
    stage(null); const s = document.querySelector('[data-ui-stage]') as HTMLElement;
    expect(s.style.position).toBe('fixed'); expect(s.style.pointerEvents).toBe('none'); expect(s.style.top).toBe('0px');
  });
  it('Box, Panel and Bar place themselves by boxCss', () => {
    stage(<><Box x={1} y={1} w={3} h={3} testId="b" /><Panel x={0} y={0} w={100} h={50} /><Bar x={0} y={0} w={10} h={2} fill={0.5} colour={0x6fd44e} /></>);
    const b = screen.getByTestId('b'); expect([b.style.left, b.style.top, b.style.width, b.style.height]).toEqual(['12px', '6px', '4px', '4px']);
    const panel = document.querySelector('[data-ui-panel]') as HTMLElement; expect(panel.style.borderStyle).toBe('solid');
    const fill = document.querySelector('[data-ui-bar-fill]') as HTMLElement; expect(fill.style.width).toBe('8px');   // round(5 internal * 1.5) = 7.5 -> edges 10..17.5 -> 10..18
  });
  it('PixelText renders its string, position and anchor without an atlas', () => {
    stage(<PixelText text="HULL" x={100} y={20} size={32} tint={0xf2f5fa} anchorX={1} />);
    const c = document.querySelector('canvas')!; expect(c.dataset.text).toBe('HULL'); expect(c.dataset.anchorx).toBe('1');
  });
});

describe('useStage (UI round §2.1)', () => {
  it('reads the stage size from the layout slice and follows setLayout', () => {
    const ui = makeUi(); const seen: string[] = [];
    function Probe() { const s = useStage(); seen.push(`${s.w}x${s.h}`); return null; }
    render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Probe /></UiContext.Provider>);
    expect(seen.at(-1)).toBe('1280x720');
    act(() => setLayout(ui.store, { stageW: 1707, stageH: 720 })); expect(seen.at(-1)).toBe('1707x720');
    const n = seen.length; act(() => setLayout(ui.store, { scale: 2 })); expect(seen.length).toBe(n);   // shallow: no re-render for other fields
  });
});
