// The menu's actions (React UI spec §2, §5): the cases of the old sessionMenu and mainMenu tests that are logic, ported
// one for one. Every action is one setState (or two around an awaited request), and preload calls are deduplicated.
import { describe, expect, it, vi } from 'vitest';
import { ERRORS, inputBlockedOf } from '../src/renderer/src/ui/menuState';
import type { OnlineStatus } from '../src/shared/onlineSession';
import { flush, idle, makeUi } from './helpers/uiStore';

describe('requests', () => {
  it('deduplicates a request until it settles', async () => {
    const rehost = vi.fn(async () => ({ ok: true as const })), { actions } = makeUi({ api: { rehost } });
    actions.rehost(); actions.rehost(); expect(rehost).toHaveBeenCalledOnce();
    await flush(); actions.rehost(); expect(rehost).toHaveBeenCalledTimes(2);
  });
  it('Host creates the duel room (no capacity) and enters the session; Join trims, upper-cases and deduplicates', async () => {
    const host = vi.fn(async () => ({ ok: true as const })), join = vi.fn(() => new Promise<never>(() => {}));
    const { store, deps, actions } = makeUi({ api: { host, join } });
    actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect'] });
    actions.openMultiplayer(); actions.openHost(); actions.host();
    expect(host).toHaveBeenCalledWith(); expect(deps.online).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('session');
    await flush(); actions.home(); expect(store.getState().menu.page).toBe('home');
    actions.openMultiplayer(); actions.openJoin(); actions.join(' abcdef12 '); actions.join(' abcdef12 ');
    expect(join).toHaveBeenCalledExactlyOnceWith('ABCDEF12');
  });
  it('rejects a malformed room code without a request', () => {
    const join = vi.fn(), { store, actions } = makeUi({ api: { join } });
    actions.openMultiplayer(); actions.openJoin(); actions.join('abc');
    expect(join).not.toHaveBeenCalled(); expect(store.getState().menu.localError).toBe('Enter an eight-character room code.');
  });
  it('shows a failed request in plain words and clears pending', async () => {
    const host = vi.fn(async () => ({ ok: false as const, code: 'not-found' as const })), { store, actions } = makeUi({ api: { host } });
    actions.host(); expect(store.getState().menu.pending).toBe(true); await flush();
    expect(store.getState().menu).toMatchObject({ pending: false, localError: ERRORS['not-found'] });
  });
  it('words a thrown request generically', async () => {
    const retry = vi.fn(async () => { throw Error('ipc'); }), { store, actions } = makeUi({ api: { retry } });
    actions.retry(); await flush(); expect(store.getState().menu.localError).toBe('Online request failed. Try again.');
  });
  it('lets Leave interrupt a pending Join and ignores the Join\'s late result', async () => {
    let resolve!: (value: unknown) => void;
    const join = vi.fn(() => new Promise((r) => { resolve = r; })), leave = vi.fn(async () => ({ ok: true as const }));
    const { store, deps, actions } = makeUi({ api: { join, leave } });
    const status: OnlineStatus = { ...idle, actions: ['join'] };
    actions.setStatus(status); actions.openMultiplayer(); actions.openJoin(); actions.join('ABCDEFGH');
    actions.setStatus({ ...status, phase: 'joining', actions: ['leave'] }); actions.leave(); expect(leave).toHaveBeenCalledOnce();
    actions.setStatus(status); await flush(); resolve({ ok: false, code: 'not-found' }); await flush();
    expect(store.getState().menu.localError).toBe(''); expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('home');
  });
  it('Leave returns home only when the idle status arrives after it settled', async () => {
    const leave = vi.fn(async () => ({ ok: true as const })), { store, deps, actions } = makeUi({ api: { leave } });
    actions.setStatus({ ...idle, phase: 'running', role: 'host', ownSeat: 0, attachmentEpoch: 1, actions: ['leave'] });
    actions.leave(); await flush(); expect(deps.home).not.toHaveBeenCalled();
    actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect', 'retry'] });
    expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu).toMatchObject({ page: 'home', hadView: false, leaving: false });
  });
  it('leave() runs Net-3d Leave only while the status offers it (the online duel passes it as deps.leave)', async () => {
    const leave = vi.fn(async () => ({ ok: true as const })), { store, deps, actions } = makeUi({ api: { leave } });
    actions.leave(); expect(leave).not.toHaveBeenCalled(); expect(store.getState().menu.leaving).toBe(false);
    actions.setStatus({ ...idle, phase: 'ended', role: 'guest', ownSeat: 1, attachmentEpoch: 1, actions: ['leave'] });
    actions.leave(); expect(leave).toHaveBeenCalledOnce(); expect(store.getState().menu.leaving).toBe(true); await flush();
    actions.setStatus(idle); expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('home');
    const offline = makeUi({ api: null }); offline.actions.setStatus({ ...idle, phase: 'ended', actions: ['leave'] }); offline.actions.leave();
    expect(offline.store.getState().menu.leaving).toBe(false);
  });
  it('forgetSeatNow interrupts a pending Join and does not enter the session', async () => {
    const join = vi.fn(() => new Promise<never>(() => {})), forgetSeat = vi.fn(async () => ({ ok: true as const }));
    const { deps, actions } = makeUi({ api: { join, forgetSeat } });
    actions.setStatus({ ...idle, actions: ['join', 'forget-seat'] }); actions.openMultiplayer(); actions.openJoin(); actions.join('ABCDEFGH');
    actions.forgetSeatNow(); expect(forgetSeat).toHaveBeenCalledOnce(); expect(deps.online).toHaveBeenCalledOnce(); await flush(); expect(deps.online).toHaveBeenCalledOnce();
  });
  it('forgets a saved seat from Multiplayer without entering the session', async () => {
    const forgetSeat = vi.fn(async () => ({ ok: true as const })), { store, deps, actions } = makeUi({ api: { forgetSeat } });
    actions.setStatus(idle); actions.openMultiplayer(); actions.forgetSavedSeat();
    expect(forgetSeat).toHaveBeenCalledOnce(); expect(deps.online).not.toHaveBeenCalled(); expect(store.getState().menu.page).toBe('multiplayer');
  });
});

describe('the duel seats (H-2 spec §2)', () => {
  const seats = [{ seatId: 0, occupied: true, connected: true, ready: true }, { seatId: 1, occupied: true, connected: true, ready: true }];
  const duelLobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready', 'leave'],
    snapshot: { capacity: 2, joinCode: 'ABCDEFGH', seats, compatibility: { modeId: 'duel' } } as never };
  it('Start carries the Helm player: the host by default, the guest after Swap seats, the host again after a second swap', async () => {
    const start = vi.fn(async () => ({ ok: true as const })), { store, actions } = makeUi({ api: { start } });
    actions.setStatus(duelLobby); actions.start(); expect(start).toHaveBeenLastCalledWith(0); await flush();
    actions.swapSeats(); expect(store.getState().menu.swapped).toBe(true); actions.start(); expect(start).toHaveBeenLastCalledWith(1); await flush();
    actions.swapSeats(); actions.start(); expect(start).toHaveBeenLastCalledWith(0);
  });
  it('a host on seat 1 swaps to seat 0; a new Host clears the swap; a non-duel room starts without a Helm player', async () => {
    const start = vi.fn(async () => ({ ok: true as const })), host = vi.fn(async () => ({ ok: true as const })), { store, actions } = makeUi({ api: { start, host } });
    actions.setStatus({ ...duelLobby, ownSeat: 1 }); actions.swapSeats(); actions.start(); expect(start).toHaveBeenLastCalledWith(0); await flush();
    actions.host(); expect(store.getState().menu.swapped).toBe(false); await flush();
    actions.setStatus({ ...duelLobby, snapshot: { ...duelLobby.snapshot!, compatibility: { modeId: 'sector' } } as never }); actions.start();
    expect(start).toHaveBeenLastCalledWith();
  });
});

describe('status pushes', () => {
  it('apply every transition in one setState, with the receipt time', () => {
    const { store, actions } = makeUi({ deps: { perfNow: () => 42 } }); let writes = 0; store.subscribe(() => { writes++; });
    actions.setStatus({ ...idle, phase: 'running', attachmentEpoch: 1, actions: [] });
    expect(writes).toBe(1); expect(store.getState().menu).toMatchObject({ page: 'session', hadView: true }); expect(store.getState().online.receivedAt).toBe(42);
    expect(inputBlockedOf(store.getState())).toBe(false);
  });
  it('call home before the idle state lands when a Leave finishes', () => {
    const order: string[] = [], { store, actions } = makeUi({ deps: { home: () => order.push(`home:${store.getState().menu.page}`) } });
    store.setState((s) => ({ menu: { ...s.menu, page: 'session', leaving: true, hadView: true } }));
    actions.setStatus(idle); expect(order).toEqual(['home:session']); expect(store.getState().menu.page).toBe('home');
  });
  it('a session takes over Settings; an idle push keeps it', () => {
    const { store, actions } = makeUi();
    actions.openSettings(); actions.setStatus(idle); expect(store.getState().menu.page).toBe('settings');
    actions.setStatus({ ...idle, phase: 'lobby', actions: ['leave'] }); expect(store.getState().menu.page).toBe('session');
  });
});

describe('pages', () => {
  it('Single player hides the menu, keeps input blocked, ignores online status and comes back', () => {
    const { store, deps, actions } = makeUi();
    actions.single(); expect(deps.single).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('single'); expect(inputBlockedOf(store.getState())).toBe(true);
    actions.setStatus({ ...idle, phase: 'reconnecting', actions: ['leave'] }); expect(store.getState().menu.page).toBe('single');
    actions.leaveSingle(); expect(store.getState().menu.page).toBe('home');
  });
  it('leaveSingle does nothing outside single player', () => {
    const { store, actions } = makeUi(); actions.openMultiplayer(); actions.leaveSingle(); expect(store.getState().menu.page).toBe('multiplayer');
  });
  it('Back goes up one level from every page that has it', () => {
    const { store, actions } = makeUi(); const page = () => store.getState().menu.page;
    actions.openMultiplayer(); actions.openHost(); actions.back(); expect(page()).toBe('multiplayer');
    actions.openJoin(); actions.back(); actions.back(); expect(page()).toBe('home');
    actions.openSettings(); actions.back(); expect(page()).toBe('home');
  });
  it('home() returns to the menu only from no status, idle or an error', () => {
    const { store, deps, actions } = makeUi();
    actions.setStatus({ ...idle, phase: 'lobby', actions: ['leave'] }); actions.home(); expect(deps.home).not.toHaveBeenCalled();
    actions.setStatus({ ...idle, phase: 'error', error: 'transport-lost', actions: ['retry'] }); actions.home();
    expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu.page).toBe('home');
  });
  it('Try another code and Return to menu leave the session page', () => {
    const { store, deps, actions } = makeUi();
    actions.setStatus({ ...idle, phase: 'error', error: 'not-found', actions: ['join'] }); actions.tryAnotherCode(); expect(store.getState().menu.page).toBe('join');
    const epoch = store.getState().menu.resetEpoch; actions.returnHome(); expect(store.getState().menu.resetEpoch).toBe(epoch + 1); expect(deps.home).toHaveBeenCalledOnce(); expect(store.getState().menu).toMatchObject({ page: 'home', hadView: false });
  });
});

describe('settings', () => {
  it('reads fullscreen on opening Settings and on a resize there, and toggles it live', async () => {
    let full = false; const get = vi.fn(async () => full), set = vi.fn(async (on: boolean) => { full = on; return on; });
    const { store, actions } = makeUi({ deps: { fullscreen: { get, set } } });
    actions.windowResized(); expect(get).not.toHaveBeenCalled();
    actions.openSettings(); actions.toggleFullscreen(); expect(set).not.toHaveBeenCalled();   // unknown until read
    await flush(); expect(store.getState().menu.fullscreen).toBe(false);
    actions.toggleFullscreen(); await flush(); expect(set).toHaveBeenCalledWith(true); expect(store.getState().menu.fullscreen).toBe(true);
    full = false; actions.windowResized(); await flush(); expect(get).toHaveBeenCalledTimes(2); expect(store.getState().menu.fullscreen).toBe(false);
  });
  it('setVolume updates the store and the caller', () => {
    const { store, deps, actions } = makeUi({ settings: { volume: 0.5 } });
    actions.setVolume(0); expect(store.getState().settings.volume).toBe(0); expect(deps.setVolume).toHaveBeenCalledWith(0);
  });
});

describe('the strip and disposal', () => {
  it('setStripHeight writes only changes', () => {
    const { store, actions } = makeUi(); let writes = 0; store.subscribe(() => { writes++; });
    actions.setStripHeight(56); actions.setStripHeight(56); actions.setStripHeight(0);
    expect(writes).toBe(2); expect(store.getState().layout.stripHeight).toBe(0);
  });
  it('makes no request and no write after dispose', async () => {
    const host = vi.fn(async () => ({ ok: true as const })), { store, actions } = makeUi({ api: { host } });
    actions.dispose(); actions.host(); await flush(); expect(host).not.toHaveBeenCalled(); expect(store.getState().menu.pending).toBe(false);
  });
});
