// The menu's look: the amber phosphor of the console screens (Menu CRT, 2026-11-18; CRT map spec section 2's ramp).
// Every colour is a CRT tone: glass-black panels, dim amber borders, main amber text, hot headings and keys, mid notes.
// The inline styles here give the base look; menuCss (below) adds what inline styles cannot: hover/focus inversion, the
// heading tones, the option list, and on the overlay panel the CRT screen effects scaled by the CRT setting.
import type { CSSProperties } from 'react';
import type { CrtScale } from '../../render/crt';
import { CRT } from '../../render/tactical/crtTheme';
import { hex } from '../stage/color';

const GLASS = hex(CRT.glass), FAINT = hex(CRT.faint), DIM = hex(CRT.dim), MID = hex(CRT.mid), MAIN = hex(CRT.main), HOT = hex(CRT.hot);

/** The class on the menu root (both layouts) and on the overlay panel (the CRT screen); menuCss styles them. */
export const MENU_CLASS = 'ftl-menu', SCREEN_CLASS = 'ftl-menu-screen';

export const ROOT_OVERLAY: CSSProperties = { position: 'fixed', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hex(0x030302, 0.95), color: MAIN, font: '16px monospace' };
export const ROOT_STRIP: CSSProperties = { position: 'fixed', left: 0, right: 0, top: 0, zIndex: 20, color: MAIN, background: hex(CRT.glass, 0.92), borderBottom: `1px solid ${DIM}`, font: '14px monospace', padding: '6px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' };
export const PANEL_OVERLAY: CSSProperties = { position: 'relative', width: 'min(620px,88vw)', maxHeight: '88vh', overflow: 'auto', scrollbarColor: `${DIM} ${GLASS}`, boxSizing: 'border-box', padding: 30, border: `2px solid ${DIM}`, borderRadius: 10, background: GLASS, boxShadow: '0 12px 70px #000' };
export const PANEL_STRIP: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
/** The version line at the foot of the menu panel (owner 2026-11-17): small and dim. */
export const VERSION: CSSProperties = { margin: '18px 0 0', font: '12px monospace', color: DIM };
/** A hollow amber button; hovered or focused it fills (menuCss), as the readout's inverse bar does. */
export const BUTTON: CSSProperties = { font: 'inherit', color: MAIN, background: 'transparent', border: `1px solid ${MID}`, padding: '9px 14px', margin: 4, cursor: 'pointer' };
export const BUTTON_OFF: CSSProperties = { ...BUTTON, color: DIM, border: `1px solid ${FAINT}`, cursor: 'default' };
/** A chosen option among buttons (Sci-2's CREW 2 3 4): the inverse bar, main amber with glass text. */
export const BUTTON_ON: CSSProperties = { ...BUTTON, background: MAIN, color: GLASS, border: `1px solid ${MAIN}` };
export const NAV: CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2, maxWidth: 280 };
export const CONTROL: CSSProperties = { display: 'block', margin: '10px 0', padding: 10, background: GLASS, color: MAIN, border: `1px solid ${MID}`, font: 'inherit' };
export const VOLUME: CSSProperties = { ...CONTROL, margin: '8px 0 14px', padding: 8 };
export const TABLE: CSSProperties = { borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 };
export const KEYS: CSSProperties = { padding: '2px 14px 2px 0', color: HOT, whiteSpace: 'nowrap', verticalAlign: 'top' };
export const ACTION: CSSProperties = { padding: '2px 0' };

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/** The menu's stylesheet for a CRT strength. The colour rules always apply (the amber stays with the setting off, as on
 *  the consoles); the screen effects on the overlay panel scale with it, and a zero strength leaves its rule out:
 *  glow is a text-shadow, scanline a 3 px repeating band behind the text, vignette an inset shadow. No flicker on a menu. */
export function menuCss(scale: CrtScale): string {
  const m = `.${MENU_CLASS}`, s = `.${SCREEN_CLASS}`;
  const rules = [
    `${m} h1, ${m} h2, ${m} h3, ${m} h4, ${m} strong { color: ${HOT}; }`,   // headings and the room code
    `${m} [role="status"], ${m} p { color: ${MID}; }`,
    `${m} button:not(:disabled):hover, ${m} button:not(:disabled):focus-visible { background: ${MAIN} !important; color: ${GLASS} !important; border-color: ${MAIN} !important; outline: none; }`,
    `${m} select:focus-visible, ${m} input:focus-visible { outline: 1px solid ${HOT}; }`,
    `${m} option { background: ${GLASS}; color: ${MAIN}; }`,
    `${m} input::placeholder { color: ${DIM}; }`
  ];
  if (scale.glow > 0) rules.push(`${s} { text-shadow: 0 0 ${n(6 * scale.glow)}px ${hex(CRT.main, 0.55 * scale.glow)}; }`);
  if (scale.vignette > 0) rules.push(`${s} { box-shadow: 0 12px 70px #000, inset 0 0 ${n(90 * scale.vignette)}px ${hex(0x000000, 0.75 * scale.vignette)}; }`);
  if (scale.scanline > 0) {
    const line = hex(0x000000, 0.28 * scale.scanline);   // a background layer, not ::after: the long Settings panel scrolls
    rules.push(`${s} { background: repeating-linear-gradient(to bottom, transparent 0, transparent 2px, ${line} 2px, ${line} 3px), ${GLASS} !important; }`);
  }
  return rules.join('\n');
}
