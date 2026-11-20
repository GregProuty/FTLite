// The menu's state and its pure rules (React UI spec §2, §5), moved line for line from render/sessionMenu.ts: the pages,
// the error strings, which actions are offered, the status line and how a status push moves the menu. No React here.
import type { DuelCrewSize, OnlineErrorCode, OnlineStatus } from '../../../shared/onlineSession';
import type { ControlSection } from '../app/controlsList';
import type { Volumes } from '../app/audio';

export type Page = 'home' | 'multiplayer' | 'settings' | 'host' | 'join' | 'session' | 'single' | 'ship';
export type MenuAction = OnlineStatus['actions'][number];

export interface MenuState {
  page: Page; pending: boolean; localError: string; recovering: boolean;
  /** Leave was pressed; the idle status that follows returns home. */
  leaving: boolean;
  /** The session has shown a game view (an attachment epoch arrived); the menu is then the strip. */
  hadView: boolean;
  fullscreen: boolean | null;
  /** The latest request's id: a result for an older one is ignored. */
  operation: number;
  /** Bumped by returnHome so the menu's error boundary resets even when the page and phase are unchanged. */
  resetEpoch: number;
  /** The duel crew the host form creates a room for (Sci-2 spec §5.3): 2, 3 or 4, default 3. */
  crew: DuelCrewSize;
}
export interface OnlineSlice { available: boolean; status: OnlineStatus | null; receivedAt: number }
/** Audio-i spec section 6: the three volumes, each one of VOLUME_STEPS. */
/** Feel-i: `shake`, the console maps' screen shake setting. */
/** Valkyrn spec §9: one Single player ship as the picker shows it (filled by main.ts from the fleet's solo list). */
export interface ShipChoice { id: string; name: string; line: string }
/** Valkyrn spec §8, §9: `ships` the picker's list, `soloShip` the remembered choice, `valkyrnLaserFit` the developer switch. */
export interface SettingsSlice extends Volumes {
  available: boolean; fullscreenAvailable: boolean; controls: readonly ControlSection[]; shake: import('../render/shake').ShakeSetting; mapGrid: import('../render/tactical/mapGrid').MapGridSetting;
  ships: readonly ShipChoice[]; soloShip: string; valkyrnLaserFit: boolean; throttleTapMs: number; fpsCounter: boolean;   // helm round 2 §6.3; UI round §1.7
}
/** The canvas's place (React UI spec §4): the strip above it, the letterbox scale and offsets, the device pixel ratio. */
export interface LayoutSlice { stripHeight: number; scale: number; offsetX: number; offsetY: number; dpr: number }
/** Browser-only menu facts (web build spec §5.4, §7.4, §7.5, §7.7); all off in Electron. `unsupported` replaces Home's
 *  Multiplayer button, `note` is the Safari line, `onlineBlocked` the Multiplayer screen's one-tab text, `playtestLog`
 *  shows Settings' Download playtest log and `playtestLogText` its last result. `web`: the page runs in a browser (no
 *  preload), where the page takes F11 for the Fullscreen API (UI round §1.6; was the browser's own, review R1-F7). */
export interface BrowserSlice { web: boolean; update: boolean; unsupported: string | null; note: string | null; onlineBlocked: string | null; playtestLog: boolean; playtestLogText: string }
export const INITIAL_BROWSER: BrowserSlice = { web: false, update: false, unsupported: null, note: null, onlineBlocked: null, playtestLog: false, playtestLogText: '' };
export const NO_PLAYTEST_RECORDS_TEXT = 'No playtest records yet.', PLAYTEST_LOG_FAILED_TEXT = 'The playtest log could not be read.';
/** Settings' fullscreen note in a browser: UI round §1.6 made F11 the page's, so the switch follows it. */
export const BROWSER_F11_TEXT = 'F11 also toggles fullscreen.';
export interface UiState {
  menu: MenuState; online: OnlineSlice; settings: SettingsSlice; layout: LayoutSlice; browser: BrowserSlice;
  duel: import('./views').DuelUiView | null; flight: import('./views').FlightUiView | null;
  hud: import('../render/hudModel').HudModel | null;
  /** The online duel's F3 latency overlay lines (H-2b); null while hidden. */
  latency: readonly string[] | null;
  /** UI round §1.7: the last FPS reading (main.ts's meter, at most twice a second); null before the first. */
  fps: number | null;
  /** The CRT strength setting (CRT map spec section 4), written at boot and by the dev F10 cycle (app/crtBoot.ts). */
  crt: import('../render/crt').CrtSetting;
  /** Bumped by a sink each time its slice goes null -> non-null: the regions' error-boundary reset keys (spec §2). */
  epochs: { duel: number; flight: number; hud: number };
}
export type MenuView = Pick<UiState, 'menu' | 'online'>;

export const INITIAL_MENU: MenuState = { page: 'home', pending: false, localError: '', recovering: false, leaving: false, hadView: false, fullscreen: null, operation: 0, resetEpoch: 0, crew: 3 };
export const ROOM_CODE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
export const ERRORS: Partial<Record<OnlineErrorCode, string>> = {
  'online-disabled': 'Online play needs a configured local service. Single player is available.',
  'not-found': 'Room not found. Check the eight-character code and try again.',
  'incompatible': 'This lobby runs a different version. Both players should reload.',
  'unauthorized': 'This seat is no longer authorized. Return to the menu or forget the saved seat.',
  'host-lost': 'Host disconnected. Reconnect or re-host the last committed checkpoint when available.',
  'no-checkpoint': 'No committed checkpoint is available for this room.',
  'save-invalid': 'The saved checkpoint is corrupt or incompatible. Reconnect to check the service again.',
  'save-too-large': 'The saved checkpoint exceeds the size limit.',
  'save-unavailable': 'The latest save could not be committed. Recovery uses the last committed checkpoint.',
  'conflict': 'Another player may have claimed this room. Reconnect to check the current host.',
  'suspended': 'Online play stopped when the computer suspended. Reconnect explicitly to continue.',
  'retry-exhausted': 'Reconnection timed out. Retry to make a new attempt.',
  'storage-write-failed': 'Your seat could not be saved. This session can play, but restart recovery is unavailable.',
};

export function isPlaying(m: MenuState): boolean { return m.page === 'session' && m.hadView; }
/** Online input is blocked everywhere but a viewed session (single player's duel owns its own keyboard). */
export function inputBlockedOf(s: Pick<UiState, 'menu'>): boolean { return !isPlaying(s.menu); }
export function can(v: MenuView, action: MenuAction): boolean { return v.online.available && !!v.online.status?.actions.includes(action) && !v.menu.pending; }
export function failureText(code: string): string { return ERRORS[code as OnlineErrorCode] ?? `Online request failed (${code}). Try again.`; }

/** The lobby's status line (owner 2026-11-18: the bare phase word read as a bug). */
export const LOBBY_MESSAGE = 'Everyone presses Ready, then the host starts.';

export function menuMessage(v: MenuView): string {
  const m = v.menu, status = v.online.status;
  const phaseMessage = status?.phase === 'rehosting' ? 'Restoring the mirrored checkpoint…'
    : status?.phase === 'saving' ? 'Saving the final checkpoint…'
    : m.recovering && status?.phase === 'paused' && status.mirror.committed ? `Restored at tick ${status.mirror.committed.capturedTick}. Paused.` : null;
  return m.localError || phaseMessage || (status?.error ? ERRORS[status.error] ?? `Online stopped (${status.error}). Retry or leave.`
    : m.page === 'session' && status?.phase === 'lobby' && !m.pending ? LOBBY_MESSAGE
    : m.page === 'session' ? `${status?.phase ?? 'Connecting'}${m.pending ? '…' : ''}`
    : m.page === 'multiplayer' ? 'Host a crew or join one with its room code.' : m.page === 'ship' ? 'Choose your ship.' : m.page === 'settings' ? '' : 'Choose how to play.');
}

export function availabilityText(v: MenuView): string {
  const s = v.online.status;
  return !v.online.available || s?.phase === 'idle' && !s.actions.includes('host') && !s.actions.includes('join')
    ? ERRORS['online-disabled']! : 'Reconnect your saved seat to check the host and the last committed checkpoint.';
}

/** A lobby seat's line. A duel seat (Sci-2 spec §5.3): EMPTY (no one has claimed it), JOINED (connected, not ready), READY,
 *  DISCONNECTED (claimed, not connected). The sector keeps its Bot labels. */
export function seatLabel(status: OnlineStatus, pid: number): string {
  const seat = status.snapshot?.seats.find((s) => s.seatId === pid);
  if (isDuel(status)) return ` P${pid + 1}: ${!seat?.occupied ? 'EMPTY' : !seat.connected ? 'DISCONNECTED' : seat.ready ? 'READY' : 'JOINED'} `;
  return ` P${pid + 1}: ${!seat?.occupied ? 'Bot' : !seat.connected ? 'Bot (human disconnected)' : seat.ready ? 'Ready' : 'Not ready'} `;
}
/** A duel room (H-2 spec §2): the lobby shows the seat plan and Start carries the Helm player. */
export function isDuel(status: OnlineStatus | null): boolean { return status?.snapshot?.compatibility?.modeId === 'duel'; }
/** The Helm player Start carries for a duel (H-2 spec §2): the host's own seat. Since a round starts aboard with nobody
 *  seated (start-aboard spec §1) it seats no one; the lobby's Swap seats was removed (owner 2026-11-17). */
export function helmPlayerOf(status: OnlineStatus): number {
  return status.ownSeat ?? 0;
}
export function startAllowed(v: MenuView): boolean {
  return can(v, 'start') && !!v.online.status?.snapshot?.seats.every((s) => !s.occupied || s.ready && s.connected);
}

/** `receivedAt` and `perfNow` are performance.now() readings: the age grows while the menu shows it. */
export function receiptText(status: OnlineStatus, receivedAt: number, perfNow: number): string | null {
  const committed = status.mirror.committed; if (!committed) return null;
  const age = status.mirror.receivedAgeMs;
  return `Last mirrored checkpoint: tick ${committed.capturedTick}, ${age === null ? 'receipt age unknown' : `received ${Math.floor((age + Math.max(0, perfNow - receivedAt)) / 1000)}s ago`}.`;
}
/** `retryAtMs` and `dateNow` are epoch milliseconds (the deadline is shared across processes). */
export function countdownText(retryAtMs: number, dateNow: number): string { return `Retrying saved seat in ${Math.max(0, Math.ceil((retryAtMs - dateNow) / 1000))}s…`; }

/** How one status push moves the menu (sessionMenu's setStatus). `goHome`: call the router's home before applying it. */
export function applyStatus(m: MenuState, next: OnlineStatus): { menu: MenuState; goHome: boolean } {
  const out = { ...m }; let goHome = false;
  if (next.phase === 'saved' || next.phase === 'rehosting' || next.phase === 'reconnecting') out.recovering = true;
  if (next.phase === 'idle' || next.phase === 'running') out.recovering = false;
  if (next.attachmentEpoch > 0) out.hadView = true;
  if (out.page !== 'single' && next.phase !== 'idle') out.page = 'session';
  if (next.phase === 'idle' && out.page === 'session' && !out.pending && !out.hadView) out.page = 'home';
  if (next.phase === 'idle' && out.leaving && out.page === 'session' && !out.pending) { out.leaving = false; goHome = true; out.hadView = false; out.page = 'home'; }
  return { menu: out, goHome };
}
