// The menu's pure rules (React UI spec §5), moved line for line from render/sessionMenu.ts.
import { describe, expect, it } from 'vitest';
import { applyStatus, availabilityText, can, countdownText, ERRORS, INITIAL_MENU, inputBlockedOf, isPlaying, menuMessage, receiptText, seatLabel, startAllowed, type MenuState, type MenuView } from '../src/renderer/src/ui/menuState';
import { createUiStore } from '../src/renderer/src/ui/store';
import type { OnlineStatus } from '../src/shared/onlineSession';

const idle: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect', 'forget-seat'] };
const menu = (patch: Partial<MenuState> = {}): MenuState => ({ ...INITIAL_MENU, ...patch });
const view = (m: Partial<MenuState>, status: OnlineStatus | null, available = true): MenuView => ({ menu: menu(m), online: { available, status, receivedAt: 0 } });

describe('applyStatus', () => {
  it('moves a non-idle push to the session page, except from single player', () => {
    expect(applyStatus(menu(), { ...idle, phase: 'lobby' }).menu.page).toBe('session');
    expect(applyStatus(menu({ page: 'settings' }), { ...idle, phase: 'lobby' }).menu.page).toBe('session');   // a session takes over Settings
    expect(applyStatus(menu({ page: 'single' }), { ...idle, phase: 'reconnecting' }).menu.page).toBe('single');
  });
  it('keeps Settings and home on an idle push', () => {
    expect(applyStatus(menu({ page: 'settings' }), idle).menu.page).toBe('settings');
    expect(applyStatus(menu(), idle).menu.page).toBe('home');
  });
  it('returns home from a session that never had a view once idle and settled', () => {
    expect(applyStatus(menu({ page: 'session' }), idle).menu.page).toBe('home');
    expect(applyStatus(menu({ page: 'session', pending: true }), idle).menu.page).toBe('session');
    expect(applyStatus(menu({ page: 'session', hadView: true }), idle).menu.page).toBe('session');
  });
  it('remembers a view and recovery, and clears recovery on idle or running', () => {
    const viewed = applyStatus(menu(), { ...idle, phase: 'running', attachmentEpoch: 1 }).menu;
    expect(viewed.hadView).toBe(true); expect(viewed.recovering).toBe(false);
    for (const phase of ['saved', 'rehosting', 'reconnecting'] as const) expect(applyStatus(menu(), { ...idle, phase }).menu.recovering).toBe(true);
    expect(applyStatus(menu({ recovering: true }), { ...idle, phase: 'paused' }).menu.recovering).toBe(true);
    expect(applyStatus(menu({ recovering: true }), { ...idle, phase: 'running' }).menu.recovering).toBe(false);
  });
  it('finishes a Leave on the idle push: home once, view cleared', () => {
    const r = applyStatus(menu({ page: 'session', leaving: true, hadView: true }), idle);
    expect(r.goHome).toBe(true); expect(r.menu).toMatchObject({ page: 'home', leaving: false, hadView: false });
    expect(applyStatus(menu({ page: 'session', leaving: true, hadView: true, pending: true }), idle).goHome).toBe(false);
    expect(applyStatus(menu({ page: 'session', hadView: true }), idle).goHome).toBe(false);
  });
});

describe('the derived rules', () => {
  it('blocks input except while playing a viewed session', () => {
    expect(inputBlockedOf({ menu: menu() })).toBe(true);
    expect(inputBlockedOf({ menu: menu({ page: 'session' }) })).toBe(true);
    expect(inputBlockedOf({ menu: menu({ page: 'session', hadView: true }) })).toBe(false);
    expect(isPlaying(menu({ page: 'single', hadView: true }))).toBe(false);
  });
  it('allows an action only when offered, the bridge exists and nothing is pending', () => {
    expect(can(view({}, { ...idle, actions: ['host'] }), 'host')).toBe(true);
    expect(can(view({}, { ...idle, actions: ['join'] }), 'host')).toBe(false);
    expect(can(view({ pending: true }, idle), 'host')).toBe(false);
    expect(can(view({}, idle, false), 'host')).toBe(false);
    expect(can(view({}, null), 'host')).toBe(false);
  });
  it('words the status line as today', () => {
    expect(menuMessage(view({}, null))).toBe('Choose how to play.');
    expect(menuMessage(view({ page: 'multiplayer' }, idle))).toBe('Host a crew or join one with its room code.');
    expect(menuMessage(view({ page: 'settings' }, idle))).toBe('');
    expect(menuMessage(view({ page: 'session', pending: true }, null))).toBe('Connecting…');
    expect(menuMessage(view({ page: 'session' }, { ...idle, phase: 'lobby' }))).toBe('lobby');
    expect(menuMessage(view({ localError: 'x' }, { ...idle, phase: 'rehosting' }))).toBe('x');
    expect(menuMessage(view({}, { ...idle, phase: 'rehosting' }))).toBe('Restoring the mirrored checkpoint…');
    expect(menuMessage(view({}, { ...idle, phase: 'saving' }))).toBe('Saving the final checkpoint…');
    const committed = { ...idle, phase: 'paused' as const, mirror: { ...idle.mirror, committed: { capturedTick: 1800 } as never } };
    expect(menuMessage(view({ recovering: true }, committed))).toBe('Restored at tick 1800. Paused.');
    expect(menuMessage(view({ recovering: false, page: 'session' }, committed))).toBe('paused');
    expect(menuMessage(view({}, { ...idle, phase: 'error', error: 'host-lost' }))).toBe(ERRORS['host-lost']);
    expect(menuMessage(view({}, { ...idle, phase: 'error', error: 'transport-lost' }))).toBe('Online stopped (transport-lost). Retry or leave.');
  });
  it('explains unavailable online', () => {
    expect(availabilityText(view({}, idle, false))).toBe(ERRORS['online-disabled']);
    expect(availabilityText(view({}, { ...idle, actions: ['forget-seat'] }))).toBe(ERRORS['online-disabled']);
    expect(availabilityText(view({}, idle))).toBe('Reconnect your saved seat to check the host and the last committed checkpoint.');
  });
  it('labels seats and gates Start on ready, connected humans', () => {
    const lobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready'],
      snapshot: { capacity: 3, joinCode: 'ABCDEFGH', seats: [{ seatId: 0, occupied: true, connected: true, ready: false }, { seatId: 1, occupied: true, connected: false, ready: true }] } as never };
    expect([0, 1, 2].map((pid) => seatLabel(lobby, pid))).toEqual([' P1: Not ready ', ' P2: Bot (human disconnected) ', ' P3: Bot ']);
    expect(startAllowed(view({}, lobby))).toBe(false);
    const ready = { ...lobby, snapshot: { ...lobby.snapshot!, seats: [{ seatId: 0, occupied: true, connected: true, ready: true }] } } as OnlineStatus;
    expect(startAllowed(view({}, ready))).toBe(true);
  });
  it('words the checkpoint receipt and the countdown', () => {
    const s = { ...idle, mirror: { ...idle.mirror, committed: { capturedTick: 1800 } as never, receivedAgeMs: 4000 } };
    expect(receiptText(s, 1000, 1000)).toBe('Last mirrored checkpoint: tick 1800, received 4s ago.');
    expect(receiptText(s, 1000, 3500)).toBe('Last mirrored checkpoint: tick 1800, received 6s ago.');
    expect(receiptText({ ...s, mirror: { ...s.mirror, receivedAgeMs: null } }, 0, 0)).toBe('Last mirrored checkpoint: tick 1800, receipt age unknown.');
    expect(receiptText(idle, 0, 0)).toBeNull();
    expect(countdownText(1800000002500, 1800000000000)).toBe('Retrying saved seat in 3s…');
    expect(countdownText(1800000002500, 1800000002000)).toBe('Retrying saved seat in 1s…');
    expect(countdownText(1800000002500, 1800000009000)).toBe('Retrying saved seat in 0s…');
  });
});

describe('createUiStore', () => {
  it('starts at home with no status and the given settings', () => {
    const s = createUiStore({ onlineAvailable: true, settings: { master: 0.5, music: 0.25, effects: 1, fullscreenAvailable: true, controls: [] } }).getState();
    expect(s.menu).toEqual(INITIAL_MENU); expect(s.online).toEqual({ available: true, status: null, receivedAt: 0 });
    expect(s.settings).toEqual({ available: true, master: 0.5, music: 0.25, effects: 1, fullscreenAvailable: true, controls: [], shake: 'full' });   // Feel-i: shake defaults full expect(s.layout).toEqual({ stripHeight: 0, scale: 1, offsetX: 0, offsetY: 0, dpr: 1 });
  });
  it('marks settings unavailable without them', () => {
    expect(createUiStore({ onlineAvailable: false }).getState().settings).toEqual({ available: false, master: 1, music: 1, effects: 1, fullscreenAvailable: false, controls: [], shake: 'full' });
  });
});
