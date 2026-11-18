// @vitest-environment jsdom
// Menu CRT (2026-11-18): the main menu in the consoles' amber phosphor. The colours are CRT tones in every setting; the
// overlay panel's screen effects (glow, scanlines, vignette) follow the CRT setting and vanish when it is off.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { crtScale } from '../src/renderer/src/render/crt';
import { CRT, CRT_RAMP } from '../src/renderer/src/render/tactical/crtTheme';
import { hex } from '../src/renderer/src/ui/stage/color';
import * as styles from '../src/renderer/src/ui/menu/styles';
import { menuCss, SCREEN_CLASS } from '../src/renderer/src/ui/menu/styles';
import { setCrtSetting } from '../src/renderer/src/ui/store';
import { renderUi } from './helpers/uiRender';

afterEach(cleanup);
const RAMP = new Set(CRT_RAMP.map((c) => hex(c)));

describe('menu styles', () => {
  it('draws every solid colour from the CRT ramp', () => {
    for (const [name, style] of Object.entries(styles)) {
      if (typeof style !== 'object' || style === null) continue;
      for (const key of ['color', 'background', 'borderColor'] as const) {
        const v = (style as Record<string, unknown>)[key];
        if (typeof v === 'string' && v.startsWith('#')) expect(RAMP.has(v), `${name}.${key} ${v}`).toBe(true);
      }
    }
  });
  it('makes a chosen option the inverse bar and a hover fill main amber with glass text', () => {
    expect(styles.BUTTON_ON.background).toBe(hex(CRT.main)); expect(styles.BUTTON_ON.color).toBe(hex(CRT.glass));
    const css = menuCss(crtScale('subtle'));
    expect(css).toContain(`button:not(:disabled):hover`); expect(css).toContain(`background: ${hex(CRT.main)} !important; color: ${hex(CRT.glass)} !important`);
  });
});

describe('menuCss', () => {
  it('has glow, scanlines and vignette when full and subtle, scaled', () => {
    const full = menuCss(crtScale('full')), subtle = menuCss(crtScale('subtle'));
    for (const css of [full, subtle]) { expect(css).toContain('text-shadow'); expect(css).toContain('repeating-linear-gradient'); expect(css).toContain('inset 0 0'); }
    expect(full).toContain('text-shadow: 0 0 6px'); expect(subtle).toContain('text-shadow: 0 0 3px');
    expect(full).not.toBe(subtle);
  });
  it('keeps the amber and drops every screen effect when off, and never flickers', () => {
    const off = menuCss(crtScale('off'));
    expect(off).not.toContain('text-shadow'); expect(off).not.toContain('repeating-linear-gradient'); expect(off).not.toContain('inset 0 0');
    expect(off).toContain(hex(CRT.hot));
    for (const s of ['full', 'subtle', 'off'] as const) expect(menuCss(crtScale(s))).not.toMatch(/animation|@keyframes/);
  });
});

describe('the menu', () => {
  it('is a CRT screen in the overlay, and its stylesheet follows the CRT setting', () => {
    const { store } = renderUi();
    const root = screen.getByTestId('session-menu');
    expect(root.querySelector(`section.${SCREEN_CLASS}`)).not.toBeNull();
    expect(screen.getByTestId('menu-style').textContent).toBe(menuCss(crtScale(store.getState().crt)));
    act(() => setCrtSetting(store, 'off'));
    expect(screen.getByTestId('menu-style').textContent).toBe(menuCss(crtScale('off')));
    act(() => setCrtSetting(store, 'full'));
    expect(screen.getByTestId('menu-style').textContent).toContain('repeating-linear-gradient');
  });
});
