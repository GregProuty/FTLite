// Keys and mouse in the page (web build spec §7.1, deviation W-4). The duel keyboard already prevents Tab, Space, the
// arrows and Backspace on its own keys; this guard covers the rest of the page during a match. F11 is left to browserFullscreen.ts (UI round §1.6);
// browser-reserved shortcuts (Ctrl+W, Ctrl+T) cannot be caught, and modified keys are left alone.
import { FREQ_CODES, GUN_FREQ_CODES, WEAPON_SELECT_CODES, INTERACT_HELD, MOVE_CODES, PING_CODE, PRESS_CODES, WEAPON_CODES } from '../duel/input';
import { SECTOR_KEYS } from '../../input/sources';
import { isPlaying, type MenuState } from '../../ui/menuState';

const SCROLL_AND_FOCUS = ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace'];
/** F3 is the latency overlay (render/duel/latencyOverlay.ts); Slash and Y are the sector's other callout keys (hudModel). */
const OTHER_BOUND = ['F3', 'Slash', 'KeyY'];
export const GUARDED_CODES: ReadonlySet<string> = new Set([...SCROLL_AND_FOCUS, ...Object.keys(PRESS_CODES), ...Object.keys(FREQ_CODES), ...Object.keys(WEAPON_CODES), ...Object.keys(GUN_FREQ_CODES), ...Object.keys(WEAPON_SELECT_CODES),
  ...Object.values(MOVE_CODES), INTERACT_HELD, PING_CODE, ...OTHER_BOUND, ...Object.entries(SECTOR_KEYS).filter(([k]) => k !== 'key').map(([, code]) => code)].filter(code => code !== 'F11'));

/** A match: Single player, or an online session that has shown its game (the menu is then the strip). */
export function inMatch(menu: MenuState): boolean { return menu.page === 'single' || isPlaying(menu); }

export interface GuardTarget {
  addEventListener(type: string, fn: (e: any) => void, opts?: AddEventListenerOptions): void;
  removeEventListener(type: string, fn: (e: any) => void, opts?: EventListenerOptions): void;
}
const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';
const textEntry = (target: unknown): boolean => !!(target as { closest?(selector: string): unknown } | null)?.closest?.(TEXT_ENTRY);

export function installPageGuards(target: GuardTarget, playing: () => boolean): () => void {
  const key = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || !GUARDED_CODES.has(e.code) || textEntry(e.target) || !playing()) return;
    e.preventDefault();
  };
  const menu = (e: MouseEvent): void => { if (!textEntry(e.target)) e.preventDefault(); };
  const wheel = (e: WheelEvent): void => { if (e.ctrlKey) e.preventDefault(); };   // Ctrl+wheel and touchpad pinch zoom the page
  const wheelOpts = { passive: false, capture: true };
  target.addEventListener('keydown', key); target.addEventListener('contextmenu', menu, { capture: true }); target.addEventListener('wheel', wheel, wheelOpts);
  return () => { target.removeEventListener('keydown', key); target.removeEventListener('contextmenu', menu, { capture: true }); target.removeEventListener('wheel', wheel, { capture: true }); };
}
