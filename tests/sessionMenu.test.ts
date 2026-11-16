import { expect, it, vi } from 'vitest';
import { createSessionMenu } from '../src/renderer/src/render/sessionMenu';
import type { OnlineStatus } from '../src/shared/onlineSession';
class Element {
  offsetHeight = 56;
  children: Element[] = []; textContent = ''; value = ''; disabled = false; hidden = false; type = ''; style = { cssText: '' }; attributes = new Map<string, string>(); listeners = new Map<string, (e: any) => void>();
  append(...items: Element[]) { this.children.push(...items); } replaceChildren(...items: Element[]) { this.children = items; } setAttribute(k: string, v: string) { this.attributes.set(k, v); } addEventListener(k: string, f: (e: any) => void) { this.listeners.set(k, f); } focus() {} remove() {}
  find(id: string): Element | undefined { return this.attributes.get('data-testid') === id ? this : this.children.map(c => c.find(id)).find(Boolean); }
  fire(type = 'click') { if (!this.disabled) this.listeners.get(type)?.({ preventDefault() {}, stopPropagation() {} }); }
}
it('reserves the measured strip height for online and couch, including wrapped controls', () => {
  const root = new Element(); const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, couch: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  expect(menu.reservedHeight()).toBe(0); root.find('couch')!.fire(); expect(menu.reservedHeight()).toBe(56);
  root.offsetHeight = 112; expect(menu.reservedHeight()).toBe(112);
  root.find('leave-couch')!.fire(); expect(menu.reservedHeight()).toBe(0);
  menu.setStatus({ phase: 'running', role: 'guest', ownSeat: 1, snapshot: null, attachmentEpoch: 1, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: [] });
  expect(menu.reservedHeight()).toBe(112); menu.dispose();
});
it('counts down a shared epoch deadline despite unequal process performance origins', () => {
  const root = new Element(); const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, couch: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  const now = vi.spyOn(Date, 'now').mockReturnValue(1800000000000);
  menu.setStatus({ phase: 'reconnecting', role: 'guest', ownSeat: 1, snapshot: null, attachmentEpoch: 1, error: null, retryAtMs: 1800000002500, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: [] });
  menu.frame(17); expect(root.find('reconnect-countdown')!.textContent).toContain('in 3s');
  now.mockReturnValue(1800000002000); menu.frame(2017); expect(root.find('reconnect-countdown')!.textContent).toContain('in 1s');
  now.mockRestore(); menu.dispose();
});
it('explains unavailable online in a connected but unconfigured app while leaving Couch playable', () => {
  const root = new Element(), couch = vi.fn();
  const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, api: {} as any, couch, online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  menu.setStatus({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: false, actions: ['forget-seat'] });
  expect(root.find('online-availability')!.textContent).toContain('configured local service'); expect(root.find('host')!.disabled).toBe(true);
  root.find('couch')!.fire(); expect(couch).toHaveBeenCalledOnce(); menu.dispose();
});
it('keeps a compact failure strip over the last game even when main clears the attachment epoch', () => {
  const root = new Element(); const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, api: {} as any, couch: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  const status: OnlineStatus = { phase: 'running', role: 'guest', ownSeat: 2, snapshot: null, attachmentEpoch: 1, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['leave'] };
  menu.setStatus(status); menu.setStatus({ ...status, phase: 'error', role: null, ownSeat: null, attachmentEpoch: 0, error: 'transport-lost', actions: ['retry'] });
  expect(root.style.cssText).not.toContain('inset:0'); expect(root.find('retry')).toBeDefined(); menu.dispose();
});
it('offers accessible capacity/code forms and deduplicates Join until settlement', async () => {
  const root = new Element(), join = vi.fn(() => new Promise<any>(() => {})), host = vi.fn(async () => ({ ok: true }));
  const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, api: { host, join } as any, couch: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  menu.setStatus({ phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect'] });
  root.find('host')!.fire(); expect(root.find('capacity')!.value).toBe('2'); root.find('capacity')!.value = '4'; root.find('host-form')!.fire('submit'); expect(host).toHaveBeenCalledWith(4);
  await Promise.resolve(); await Promise.resolve(); menu.home(); root.find('join')!.fire(); root.find('join-code')!.value = ' abcdef12 '; const form = root.find('join-form')!; form.fire('submit'); form.fire('submit'); expect(join).toHaveBeenCalledExactlyOnceWith('ABCDEF12');
  menu.dispose();
});
it('gates lobby capabilities and labels reconnect as a seat, with actionable compatibility errors', () => {
  const root = new Element(); const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, api: {} as any, couch: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  const status: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['reconnect'] };
  menu.setStatus(status); expect(root.find('reconnect')!.textContent).toBe('Reconnect saved seat');
  menu.setStatus({ ...status, phase: 'lobby', role: 'guest', actions: ['ready', 'leave'] }); expect(root.find('ready')!.disabled).toBe(false); expect(root.find('start')).toBeUndefined();
  menu.setStatus({ ...status, phase: 'error', error: 'incompatible', actions: ['join', 'retry'] }); expect(root.find('status')!.textContent).toContain('compatible'); expect(root.find('retry')).toBeDefined();
});
it('requires ready occupied humans and host capability before Start, and permits leaving during a pending Join', async () => {
  const root = new Element(), leave = vi.fn(async () => ({ ok: true }));
  let resolve!: (value: any) => void; const join = vi.fn(() => new Promise<any>(r => { resolve = r; }));
  const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: { createElement: () => new Element() } as unknown as Document, api: { join, leave } as any, couch: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn() });
  const status: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null, mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['join'] };
  menu.setStatus(status); root.find('join')!.fire(); root.find('join-code')!.value = 'ABCDEFGH'; root.find('join-form')!.fire('submit');
  menu.setStatus({ ...status, phase: 'joining', actions: ['leave'] }); expect(root.find('leave')!.disabled).toBe(false); root.find('leave')!.fire(); expect(leave).toHaveBeenCalledOnce();
  menu.setStatus(status); await Promise.resolve(); await Promise.resolve(); resolve({ ok: false, code: 'not-found' }); await Promise.resolve(); await Promise.resolve();
  expect(root.find('status')!.textContent).not.toContain('not found');
  const lobby = { ...status, phase: 'lobby' as const, role: 'host' as const, ownSeat: 0, actions: ['start', 'ready'] as const, snapshot: { capacity: 2, joinCode: 'ABCDEFGH', seats: [{ seatId: 0, occupied: true, connected: true, ready: false }] } as any };
  menu.setStatus(lobby); expect(root.find('start')!.disabled).toBe(true); lobby.snapshot.seats[0].ready = true; menu.setStatus(lobby); expect(root.find('start')!.disabled).toBe(false);
});
