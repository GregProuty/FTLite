// The menu's state and its pure rules (React UI spec §2, §5), moved line for line from render/sessionMenu.ts: the pages,
// the error strings, which actions are offered, the status line and how a status push moves the menu. No React here.
import type { OnlineErrorCode, OnlineStatus } from '../../../shared/onlineSession';
import type { ControlSection } from '../app/controlsList';

export type Page = 'home' | 'multiplayer' | 'settings' | 'host' | 'join' | 'session' | 'single';
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
}
export interface OnlineSlice { available: boolean; status: OnlineStatus | null; receivedAt: number }
export interface SettingsSlice { available: boolean; volume: number; fullscreenAvailable: boolean; controls: readonly ControlSection[] }
export interface LayoutSlice { stripHeight: number }
export interface UiState { menu: MenuState; online: OnlineSlice; settings: SettingsSlice; layout: LayoutSlice }
export type MenuView = Pick<UiState, 'menu' | 'online'>;

export const INITIAL_MENU: MenuState = { page: 'home', pending: false, localError: '', recovering: false, leaving: false, hadView: false, fullscreen: null, operation: 0, resetEpoch: 0 };
export const ROOM_CODE = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
export const ERRORS: Partial<Record<OnlineErrorCode, string>> = {
  'online-disabled': 'Online play needs a configured local service. Single player is available.',
  'not-found': 'Room not found. Check the eight-character code and try again.',
  'incompatible': 'This room needs compatible game content and ship data. Check both versions, then try again.',
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

export function menuMessage(v: MenuView): string {
  const m = v.menu, status = v.online.status;
  const phaseMessage = status?.phase === 'rehosting' ? 'Restoring the mirrored checkpoint…'
    : status?.phase === 'saving' ? 'Saving the final checkpoint…'
    : m.recovering && status?.phase === 'paused' && status.mirror.committed ? `Restored at tick ${status.mirror.committed.capturedTick}. Paused.` : null;
  return m.localError || phaseMessage || (status?.error ? ERRORS[status.error] ?? `Online stopped (${status.error}). Retry or leave.`
    : m.page === 'session' ? `${status?.phase ?? 'Connecting'}${m.pending ? '…' : ''}`
    : m.page === 'multiplayer' ? 'Host a crew or join one with its room code.' : m.page === 'settings' ? '' : 'Choose how to play.');
}

export function availabilityText(v: MenuView): string {
  const s = v.online.status;
  return !v.online.available || s?.phase === 'idle' && !s.actions.includes('host') && !s.actions.includes('join')
    ? ERRORS['online-disabled']! : 'Reconnect your saved seat to check the host and the last committed checkpoint.';
}

export function seatLabel(status: OnlineStatus, pid: number): string {
  const seat = status.snapshot?.seats.find((s) => s.seatId === pid);
  return ` P${pid + 1}: ${!seat?.occupied ? 'Bot' : !seat.connected ? 'Bot (human disconnected)' : seat.ready ? 'Ready' : 'Not ready'} `;
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
