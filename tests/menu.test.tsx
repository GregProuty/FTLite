// @vitest-environment jsdom
// The React main menu (React UI spec §5; main menu spec): the rendering cases of the old sessionMenu and mainMenu tests,
// ported one for one, plus the session-menu root's geometry, the strip height and the Menu's error boundary.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OnlineStatus } from '../src/shared/onlineSession';
import { RegionBoundary } from '../src/renderer/src/ui/RegionBoundary';
import { flush, idle } from './helpers/uiStore';
import { buttonIds, renderUi } from './helpers/uiRender';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const HOME = ['single-player', 'multiplayer', 'settings'];
const click = (id: string): void => { fireEvent.click(screen.getByTestId(id)); };
const text = (id: string): string => screen.getByTestId(id).textContent ?? '';

describe('home', () => {
  it('shows exactly Single player, Multiplayer and Settings, even with a saved seat', () => {
    const { actions, view } = renderUi();
    expect(buttonIds(view.container)).toEqual(HOME);
    act(() => actions.setStatus(idle)); expect(buttonIds(view.container)).toEqual(HOME);
    expect(screen.getByTestId('session-menu').getAttribute('aria-label')).toBe('FTLite session menu');
    expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('overlay');
    expect(text('status')).toBe('Choose how to play.'); expect(screen.getByTestId('status').getAttribute('aria-live')).toBe('polite');
  });
});

describe('multiplayer', () => {
  it('holds Host, Join and Back (and the saved-seat actions), reaches the forms, and Back returns to it and then home', () => {
    const { actions, view } = renderUi();
    act(() => actions.setStatus(idle)); click('multiplayer');
    expect(text('page-title')).toBe('Multiplayer');
    expect(buttonIds(view.container)).toEqual(['host', 'join', 'reconnect', 'forget-seat', 'back']);
    expect((screen.getByTestId('host') as HTMLButtonElement).disabled).toBe(false);
    click('host'); expect(screen.queryByTestId('capacity')).toBeNull(); expect(document.activeElement).toBe(screen.getByTestId('create-room'));   // a duel room has no capacity (H-2)
    click('back'); expect(text('page-title')).toBe('Multiplayer');
    click('join'); expect(document.activeElement).toBe(screen.getByTestId('join-code'));
    click('back'); click('back'); expect(buttonIds(view.container)).toEqual(HOME);
  });
  it('explains unavailable online while leaving Single player playable', () => {
    const { actions, deps } = renderUi();
    act(() => actions.setStatus({ ...idle, persistent: false, actions: ['forget-seat'] })); click('multiplayer');
    expect(text('online-availability')).toContain('configured local service'); expect(text('online-availability')).toContain('Single player is available');
    expect((screen.getByTestId('host') as HTMLButtonElement).disabled).toBe(true);
    click('back'); click('single-player'); expect(deps.single).toHaveBeenCalledOnce();
    act(() => actions.leaveSingle()); click('single-player'); expect(deps.single).toHaveBeenCalledTimes(2);
  });
  it('shows the different-build wording and Retry for an incompatible error', () => {
    const { actions } = renderUi();
    act(() => actions.setStatus({ ...idle, phase: 'error', error: 'incompatible', actions: ['join', 'retry'] }));
    expect(text('status')).toBe('The other computer runs a different FTLite build. Install the same build on both, then try again.');   // a duel Join tries one compatibility: incompatible means a different build (H-2 spec §2) expect(screen.getByTestId('retry')).toBeDefined();
  });
  it('labels reconnect as a seat only on Multiplayer', () => {
    const { actions } = renderUi();
    act(() => actions.setStatus({ ...idle, actions: ['reconnect'] })); expect(screen.queryByTestId('reconnect')).toBeNull();
    click('multiplayer'); expect(text('reconnect')).toBe('Reconnect saved seat');
  });
});

describe('the forms', () => {
  it('offers the duel Host form (no capacity) and submits it', () => {
    const host = vi.fn(async () => ({ ok: true as const })), join = vi.fn(() => new Promise<never>(() => {}));
    const { actions } = renderUi({ api: { host, join } });
    act(() => actions.setStatus({ ...idle, actions: ['host', 'join', 'reconnect'] }));
    click('multiplayer'); click('host');
    expect(screen.queryByTestId('capacity')).toBeNull(); expect(screen.getByTestId('host-form').querySelector('select')).toBeNull();
    expect(text('host-note')).toBe('A duel for two: one of you flies the Helm, the other mans Weapons.');
    fireEvent.submit(screen.getByTestId('host-form')); expect(host).toHaveBeenCalledWith();
  });
  it('validates the room code on submit', () => {
    const join = vi.fn(() => new Promise<never>(() => {})), { actions } = renderUi({ api: { join } });
    act(() => actions.setStatus({ ...idle, actions: ['join'] })); click('multiplayer'); click('join');
    const code = screen.getByTestId('join-code') as HTMLInputElement;
    expect(code.maxLength).toBe(32); expect(code.getAttribute('autocomplete')).toBe('off'); expect(code.getAttribute('spellcheck')).toBe('false');
    fireEvent.change(code, { target: { value: 'nope' } }); fireEvent.submit(screen.getByTestId('join-form'));
    expect(join).not.toHaveBeenCalled(); expect(text('status')).toBe('Enter an eight-character room code.');
    fireEvent.change(code, { target: { value: ' abcdef12 ' } }); fireEvent.submit(screen.getByTestId('join-form'));
    expect(join).toHaveBeenCalledExactlyOnceWith('ABCDEF12');
  });
});

const hiddenRoot = (): boolean => { const el = screen.getByTestId('session-menu'); return el.style.display === 'none' && el.childElementCount === 0; };

describe('single player', () => {
  it('hides the menu root (empty, display:none) during single player and returns home', () => {
    const { actions } = renderUi();
    click('single-player'); expect(hiddenRoot()).toBe(true);
    act(() => actions.setStatus({ ...idle, phase: 'reconnecting', actions: ['leave'] })); expect(hiddenRoot()).toBe(true);
    act(() => actions.leaveSingle()); expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('overlay');
  });
});

describe('settings', () => {
  it('changes the volume, toggles fullscreen live, lists the controls and goes Back', async () => {
    let full = false; const set = vi.fn(async (on: boolean) => { full = on; return on; });
    const { deps, view } = renderUi({ settings: { volume: 0.5, controls: [{ title: 'Single player', rows: [{ keys: 'Tab', action: 'Switch' }] }] }, deps: { fullscreen: { get: async () => full, set } } });
    click('settings');
    expect(text('page-title')).toBe('Settings');
    const volume = screen.getByTestId('volume') as HTMLSelectElement;
    expect(volume.value).toBe('0.5'); expect(Array.from(volume.options).map((o) => o.textContent)).toEqual(['Off', '25%', '50%', '75%', '100%']);
    expect((screen.getByTestId('fullscreen') as HTMLButtonElement).disabled).toBe(true);   // until the window's state is read
    await act(flush);
    expect(text('fullscreen')).toBe('Fullscreen: Off'); expect((screen.getByTestId('fullscreen') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(volume, { target: { value: '0' } }); expect(deps.setVolume).toHaveBeenCalledWith(0);
    click('fullscreen'); expect(set).toHaveBeenCalledWith(true); await act(flush);
    expect(text('fullscreen')).toBe('Fullscreen: On'); expect((screen.getByTestId('volume') as HTMLSelectElement).value).toBe('0');
    expect(text('fullscreen-note')).toBe('F11 also toggles fullscreen.');
    expect(text('controls')).toContain('Tab'); expect(text('controls')).toContain('Switch');
    click('back'); expect(buttonIds(view.container)).toEqual(HOME);
  });
  it('keeps the Settings page intact across an idle push and lets a session take over', async () => {
    const { actions } = renderUi({ deps: { fullscreen: { get: async () => false, set: vi.fn() } } });
    click('settings'); await act(flush);
    const select = screen.getByTestId('volume'); act(() => actions.setStatus(idle)); expect(screen.getByTestId('volume')).toBe(select);
    act(() => actions.setStatus({ ...idle, phase: 'lobby', actions: ['leave'] })); expect(screen.queryByTestId('volume')).toBeNull();
  });
  it('disables fullscreen without the window bridge and the volume without settings', () => {
    renderUi({ settings: null }); click('settings');
    expect((screen.getByTestId('fullscreen') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('volume') as HTMLSelectElement).disabled).toBe(true); expect((screen.getByTestId('volume') as HTMLSelectElement).value).toBe('1');
  });
});

describe('the session page and the strip', () => {
  const running: OnlineStatus = { ...idle, phase: 'running', role: 'guest', ownSeat: 2, attachmentEpoch: 1, actions: ['leave'] };
  it('is the strip while playing and reserves its measured height, then 0 after leaving', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.dataset.layout === 'strip' ? 112 : 0; });
    const leave = vi.fn(async () => ({ ok: true as const })), { store, actions } = renderUi({ api: { leave } });
    expect(store.getState().layout.stripHeight).toBe(0);
    act(() => actions.setStatus(running));
    const root = screen.getByTestId('session-menu');
    expect(root.getAttribute('data-layout')).toBe('strip'); expect(root.style.position).toBe('fixed'); expect(root.style.top).toBe('0px');
    expect(root.querySelector('h1')).toBeNull(); expect(store.getState().layout.stripHeight).toBe(112);
    click('leave'); await act(flush); act(() => actions.setStatus(idle));
    expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('overlay'); expect(store.getState().layout.stripHeight).toBe(0);
  });
  it('keeps a compact failure strip over the last game even when main clears the attachment epoch', () => {
    const { actions } = renderUi();
    act(() => actions.setStatus(running)); act(() => actions.setStatus({ ...running, phase: 'error', role: null, ownSeat: null, attachmentEpoch: 0, error: 'transport-lost', actions: ['retry'] }));
    expect(screen.getByTestId('session-menu').getAttribute('data-layout')).toBe('strip'); expect(screen.getByTestId('retry')).toBeDefined();
  });
  it('shows the committed receipt, the rollback warning, Re-host, Pause and Forget', () => {
    const rehost = vi.fn(async () => ({ ok: true as const })), pause = vi.fn(), { actions } = renderUi({ api: { rehost }, deps: { pause } });
    const status: OnlineStatus = { phase: 'saved', role: 'guest', ownSeat: 1, snapshot: null, attachmentEpoch: 2, error: 'host-lost', retryAtMs: null, persistent: true,
      mirror: { committed: { capturedTick: 1800 } as never, receivedAgeMs: 4000, localPending: true, persistent: true, error: null }, actions: ['rehost', 'leave', 'forget-seat'] };
    act(() => actions.setStatus(status));
    expect(text('mirror-status')).toContain('tick 1800'); expect(text('mirror-status')).toContain('received 4s ago');
    expect(text('rollback-warning')).toContain('roll back'); expect(text('pending-save')).toContain('not committed'); expect(screen.getByTestId('forget-seat')).toBeDefined();
    click('rehost'); click('rehost'); expect(rehost).toHaveBeenCalledOnce();
    act(() => actions.setStatus({ ...status, phase: 'paused', error: null })); expect(text('status')).toContain('Restored at tick 1800');
    click('pause'); expect(pause).toHaveBeenCalledOnce(); expect(text('pause')).toBe('Resume');
  });
  it('counts down a shared epoch deadline on each second', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(1800000000000);
    const { actions } = renderUi();
    act(() => actions.setStatus({ ...idle, phase: 'reconnecting', role: 'guest', ownSeat: 1, attachmentEpoch: 1, retryAtMs: 1800000002500, actions: [] }));
    expect(text('reconnect-countdown')).toBe('Retrying saved seat in 3s…');
    act(() => { vi.advanceTimersByTime(2000); }); expect(text('reconnect-countdown')).toBe('Retrying saved seat in 1s…');
  });
  it('changes the countdown exactly when the deadline crosses a whole second, not on the wall-clock boundary', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); vi.setSystemTime(1800000000000);
    const { actions } = renderUi();
    act(() => actions.setStatus({ ...idle, phase: 'reconnecting', role: 'guest', ownSeat: 1, attachmentEpoch: 1, retryAtMs: 1800000002500, actions: [] }));
    act(() => { vi.advanceTimersByTime(500); }); expect(text('reconnect-countdown')).toBe('Retrying saved seat in 2s…');
    act(() => { vi.advanceTimersByTime(999); }); expect(text('reconnect-countdown')).toBe('Retrying saved seat in 2s…');
    act(() => { vi.advanceTimersByTime(1); }); expect(text('reconnect-countdown')).toBe('Retrying saved seat in 1s…');
    act(() => { vi.advanceTimersByTime(1000); }); expect(text('reconnect-countdown')).toBe('Retrying saved seat in 0s…');
  });
  it('ages the checkpoint receipt exactly when its age crosses a whole second', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] }); vi.setSystemTime(1800000000000);
    const { actions } = renderUi();
    act(() => { vi.advanceTimersByTime(300); });
    const status: OnlineStatus = { ...idle, phase: 'saved', role: 'guest', ownSeat: 1, attachmentEpoch: 2, error: 'host-lost', actions: ['leave'],
      mirror: { committed: { capturedTick: 1800 } as never, receivedAgeMs: 4250, localPending: false, persistent: true, error: null } };
    act(() => actions.setStatus(status)); expect(text('mirror-status')).toContain('received 4s ago');
    act(() => { vi.advanceTimersByTime(749); }); expect(text('mirror-status')).toContain('received 4s ago');
    act(() => { vi.advanceTimersByTime(1); }); expect(text('mirror-status')).toContain('received 5s ago');
    act(() => { vi.advanceTimersByTime(1000); }); expect(text('mirror-status')).toContain('received 6s ago');
  });
  it('gates the lobby: Ready for a guest, Start for a host once every occupied seat is ready, Remove for other seats', () => {
    const removeSeat = vi.fn(async () => ({ ok: true as const })), { actions } = renderUi({ api: { removeSeat } });
    const seats = [{ seatId: 0, occupied: true, connected: true, ready: false }, { seatId: 1, occupied: true, connected: true, ready: true }];
    const lobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'guest', ownSeat: 1, actions: ['ready', 'leave'], snapshot: { capacity: 2, joinCode: 'ABCDEFGH', seats } as never };
    act(() => actions.setStatus(lobby));
    expect(text('room-code')).toBe('ROOM ABCDEFGH'); expect(text('assigned-seat')).toBe('You are Player 2');
    expect(text('roster')).toContain('P1: Not ready'); expect(text('ready')).toBe('Not ready'); expect((screen.getByTestId('ready') as HTMLButtonElement).disabled).toBe(false); expect(screen.queryByTestId('start')).toBeNull();
    const host: OnlineStatus = { ...lobby, role: 'host', ownSeat: 0, actions: ['start', 'ready', 'remove-seat', 'leave'] };
    act(() => actions.setStatus(host)); expect((screen.getByTestId('start') as HTMLButtonElement).disabled).toBe(true);
    click('remove-seat-1'); expect(removeSeat).toHaveBeenCalledWith(1); expect(screen.queryByTestId('remove-seat-0')).toBeNull();
  });
  it('shows the duel seat plan: Swap seats and Host/Guest flies Helm for the host, Host picks seats for the guest; Start carries the Helm player', () => {
    const start = vi.fn(async () => ({ ok: true as const })), { actions } = renderUi({ api: { start } });
    const seats = [{ seatId: 0, occupied: true, connected: true, ready: true }, { seatId: 1, occupied: true, connected: true, ready: true }];
    const hostLobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready', 'leave'],
      snapshot: { capacity: 2, joinCode: 'ABCDEFGH', seats, compatibility: { modeId: 'duel' } } as never };
    act(() => actions.setStatus(hostLobby));
    expect(text('seat-plan')).toBe('Host flies Helm'); expect(text('swap-seats')).toBe('Swap seats');
    click('swap-seats'); expect(text('seat-plan')).toBe('Guest flies Helm');
    click('start'); expect(start).toHaveBeenCalledWith(1);
    act(() => actions.setStatus({ ...hostLobby, role: 'guest', ownSeat: 1, actions: ['ready', 'leave'] }));
    expect(text('seat-plan')).toBe('Host picks seats'); expect(screen.queryByTestId('swap-seats')).toBeNull(); expect(screen.queryByTestId('start')).toBeNull();
  });
  it('shows no seat plan for a room that is not a duel', () => {
    const { actions } = renderUi();
    act(() => actions.setStatus({ ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready'], snapshot: { capacity: 1, joinCode: 'ABCDEFGH', seats: [{ seatId: 0, occupied: true, connected: true, ready: true }] } as never }));
    expect(screen.queryByTestId('seat-plan')).toBeNull(); expect(screen.queryByTestId('swap-seats')).toBeNull();
  });
  it('enables Start when every occupied seat is ready and connected and nothing is pending', () => {
    const { actions } = renderUi();
    const lobby: OnlineStatus = { ...idle, phase: 'lobby', role: 'host', ownSeat: 0, actions: ['start', 'ready'], snapshot: { capacity: 1, joinCode: 'ABCDEFGH', seats: [{ seatId: 0, occupied: true, connected: true, ready: true }] } as never };
    act(() => actions.setStatus(lobby)); expect((screen.getByTestId('start') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('the Menu error boundary', () => {
  it('lets Return to menu on Home re-render the Menu (the reset key includes resetEpoch)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ui = renderUi({ deps: { home: vi.fn(() => ui.store.setState((s) => ({ menu: { ...s.menu, localError: '' } }))) } });
    act(() => ui.store.setState((s) => ({ menu: { ...s.menu, localError: {} as never } })));   // an object child: the Menu throws on render
    expect(screen.getByText('Menu error')).toBeDefined(); expect(ui.store.getState().menu.page).toBe('home');
    fireEvent.click(screen.getByText('Return to menu')); expect(screen.queryByText('Menu error')).toBeNull(); expect(screen.getByTestId('single-player')).toBeDefined();
  });
  it('shows the fallback on a throw and retries when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true; function Flaky() { if (fail) throw Error('boom'); return <p data-testid="ok">ok</p>; }
    const tree = (key: string) => <RegionBoundary name="test" resetKey={key} fallback={<p data-testid="fallback">fallback</p>}><Flaky /></RegionBoundary>;
    const view = render(tree('a')); expect(screen.getByTestId('fallback')).toBeDefined();
    view.rerender(tree('a')); expect(screen.getByTestId('fallback')).toBeDefined();
    fail = false; view.rerender(tree('b')); expect(screen.getByTestId('ok')).toBeDefined();
  });
});
