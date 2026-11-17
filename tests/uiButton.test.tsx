// @vitest-environment jsdom
// Spec 2026-11-17-artemis-consoles §3: the console button's looks and its pointer rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { Button, buttonColours } from '../src/renderer/src/ui/stage/Button';
import { CRT } from '../src/renderer/src/render/tactical/crtTheme';
import { AMBER, PANEL_FILL } from '../src/renderer/src/render/theme';
import { makeUi } from './helpers/uiStore';

afterEach(() => cleanup());
function mount(el: React.ReactElement) {
  const ui = makeUi();
  const r = render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}>{el}</UiContext.Provider>);
  return { ...r, el: () => document.querySelector('[data-testid="console-fire"]') as HTMLElement };
}

describe('Button (spec §3)', () => {
  it('colours by look and screen', () => {
    expect(buttonColours('lit', true)).toEqual({ outline: CRT.main, fill: CRT.main, text: CRT.glass });
    for (const look of ['idle', 'hover', 'disabled'] as const) {
      expect(buttonColours(look, true).fill).toBe(CRT.glass); expect(buttonColours(look, false).fill).toBe(PANEL_FILL);
    }
    expect(buttonColours('disabled', true)).toMatchObject({ outline: CRT.faint, text: CRT.faint });
    expect(buttonColours('lit', false)).toEqual({ outline: AMBER, fill: AMBER, text: PANEL_FILL });
  });
  it('is not focusable and takes pointer events', () => {
    const { el } = mount(<Button name="fire" x={10} y={10} w={80} h={22} label="FIRE" onPress={() => {}} />);
    expect(el().getAttribute('role')).toBe('button'); expect(el().hasAttribute('tabindex')).toBe(false);
    expect(el().style.pointerEvents).toBe('auto');
  });
  it('a press acts on a primary pointerdown only', () => {
    const onPress = vi.fn(); const { el } = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onPress={onPress} />);
    fireEvent.pointerDown(el(), { button: 2 }); fireEvent.pointerDown(el(), { button: 1 }); expect(onPress).not.toHaveBeenCalled();
    fireEvent.pointerDown(el(), { button: 0 }); expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('prevents the context menu and middle-click defaults', () => {
    const { el } = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onPress={() => {}} />);
    for (const type of ['contextmenu', 'auxclick', 'mousedown']) {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 1 }); el().dispatchEvent(e); expect(e.defaultPrevented).toBe(true);
    }
  });
  it('a hold releases exactly once: on pointerup, pointercancel, lost capture and unmount', () => {
    for (const end of ['pointerUp', 'pointerCancel', 'lostPointerCapture', 'unmount'] as const) {
      const onHold = vi.fn(); const r = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onHold={onHold} />);
      fireEvent.pointerDown(r.el(), { button: 0, pointerId: 1 });
      if (end === 'unmount') r.unmount(); else { fireEvent[end](r.el(), { pointerId: 1 }); fireEvent.pointerUp(document.body); }
      expect([end, onHold.mock.calls]).toEqual([end, [[true], [false]]]);
      cleanup();
    }
  });
  it('a hold whose button becomes disabled releases', () => {
    const onHold = vi.fn();
    const r = mount(<Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" onHold={onHold} />);
    fireEvent.pointerDown(r.el(), { button: 0 });
    const ui = makeUi();
    act(() => r.rerender(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Button name="fire" x={0} y={0} w={80} h={22} label="FIRE" disabled onHold={onHold} /></UiContext.Provider>));
    expect(onHold.mock.calls).toEqual([[true], [false]]);
  });
  it('draws the label and a right-aligned key hint', () => {
    mount(<Button name="fire" x={10} y={10} w={120} h={22} label="FIRE" hint="SPC" onPress={() => {}} />);
    const t = Array.from(document.querySelectorAll('canvas')).map((c) => (c as HTMLCanvasElement).dataset.text);
    expect(t).toEqual(expect.arrayContaining(['FIRE', 'SPC']));
  });
});
