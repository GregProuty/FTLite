// The main menu (main menu spec, 2026-11-16): exactly Single player, Multiplayer and Settings at home; Multiplayer holds
// Host, Join and Back; Single player hides the menu for the duel and comes back; Settings changes and persists the volume,
// toggles fullscreen live and lists the real bindings.
import { describe, expect, it, vi } from 'vitest';
import { createSessionMenu } from '../src/renderer/src/render/sessionMenu';
import { controlSections, keyLabel } from '../src/renderer/src/app/controlsList';
import { FIRE_HELD, INTERACT_HELD, MOVE_CODES, PRESS_CODES } from '../src/renderer/src/app/duel/input';
import { SECTOR_KEYS } from '../src/renderer/src/input/sources';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY, VOLUME_STEPS } from '../src/renderer/src/app/settingsStore';
import type { OnlineStatus } from '../src/shared/onlineSession';

class Element {
  tag = ''; offsetHeight = 56;
  children: Element[] = []; textContent = ''; value = ''; disabled = false; type = ''; style = { cssText: '' }; attributes = new Map<string, string>(); listeners = new Map<string, (e: unknown) => void>();
  append(...items: Element[]) { this.children.push(...items); } replaceChildren(...items: Element[]) { this.children = items; } setAttribute(k: string, v: string) { this.attributes.set(k, v); } addEventListener(k: string, f: (e: unknown) => void) { this.listeners.set(k, f); } focus() {} remove() {}
  find(id: string): Element | undefined { return this.attributes.get('data-testid') === id ? this : this.children.map(c => c.find(id)).find(Boolean); }
  fire(type = 'click') { if (!this.disabled) this.listeners.get(type)?.({ preventDefault() {}, stopPropagation() {} }); }
}
const doc = { createElement: (tag: string) => Object.assign(new Element(), { tag }) } as unknown as Document;
const buttons = (e: Element): string[] => [...(e.tag === 'button' ? [e.attributes.get('data-testid')!] : []), ...e.children.flatMap(buttons)];
const text = (e: Element): string => [e.textContent, ...e.children.map(text)].join(' ');
const HOME = ['single-player', 'multiplayer', 'settings'];
const idle: OnlineStatus = { phase: 'idle', role: null, ownSeat: null, snapshot: null, attachmentEpoch: 0, error: null, retryAtMs: null,
  mirror: { committed: null, receivedAgeMs: null, localPending: false, persistent: false, error: null }, persistent: true, actions: ['host', 'join', 'reconnect', 'forget-seat'] };
const make = (extra: Partial<Parameters<typeof createSessionMenu>[0]> = {}) => {
  const root = new Element();
  const menu = createSessionMenu({ root: root as unknown as HTMLElement, document: doc, api: {} as never, single: vi.fn(), online: vi.fn(), pause: vi.fn(), inputBlocked: vi.fn(), ...extra });
  return { root, menu };
};

describe('home', () => {
  it('shows exactly Single player, Multiplayer and Settings, even with a saved seat', () => {
    const { root, menu } = make();
    expect(buttons(root)).toEqual(HOME);
    menu.setStatus(idle); expect(buttons(root)).toEqual(HOME);
    expect(root.find('couch')).toBeUndefined(); menu.dispose();
  });
});

describe('multiplayer', () => {
  it('holds Host, Join and Back (and the saved-seat actions), reaches the forms, and Back returns to it and then home', () => {
    const { root, menu } = make();
    menu.setStatus(idle); root.find('multiplayer')!.fire();
    expect(root.find('page-title')!.textContent).toBe('Multiplayer');
    expect(buttons(root)).toEqual(['host', 'join', 'reconnect', 'forget-seat', 'back']);
    expect(root.find('host')!.disabled).toBe(false); expect(root.find('join')!.disabled).toBe(false);
    root.find('host')!.fire(); expect(root.find('capacity')).toBeDefined();
    root.find('back')!.fire(); expect(root.find('page-title')!.textContent).toBe('Multiplayer');
    root.find('join')!.fire(); expect(root.find('join-code')).toBeDefined();
    root.find('back')!.fire(); root.find('back')!.fire(); expect(buttons(root)).toEqual(HOME); menu.dispose();
  });
});

describe('leaving an online game', () => {
  it('returns home when the idle status arrives after Leave has settled', async () => {
    const home = vi.fn(), leave = vi.fn(async () => ({ ok: true as const }));
    const { root, menu } = make({ api: { leave } as never, home });
    const running: OnlineStatus = { ...idle, phase: 'running', role: 'host', ownSeat: 0, attachmentEpoch: 1, actions: ['leave'] };
    menu.setStatus(running); root.find('leave')!.fire(); expect(leave).toHaveBeenCalledOnce();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(home).not.toHaveBeenCalled();   // still running when the request settled
    menu.setStatus({ ...idle, actions: ['host', 'join', 'reconnect', 'retry'] });
    expect(home).toHaveBeenCalledOnce(); expect(buttons(root)).toEqual(HOME); menu.dispose();
  });
});

describe('single player', () => {
  it('hides the menu, keeps online input blocked and ignores online status, then returns home', () => {
    const single = vi.fn(), inputBlocked = vi.fn(), { root, menu } = make({ single, inputBlocked });
    root.find('single-player')!.fire();
    expect(single).toHaveBeenCalledOnce(); expect(root.style.cssText).toBe('display:none'); expect(root.children).toEqual([]);
    expect(inputBlocked).toHaveBeenLastCalledWith(true); expect(menu.reservedHeight()).toBe(0);
    menu.setStatus({ ...idle, phase: 'reconnecting', actions: ['leave'] }); expect(root.style.cssText).toBe('display:none');
    menu.leaveSingle(); expect(root.style.cssText).toContain('inset:0');
    menu.setStatus(idle); expect(buttons(root)).toEqual(HOME);
    root.find('single-player')!.fire(); expect(single).toHaveBeenCalledTimes(2); menu.dispose();
  });
  it('leaveSingle does nothing outside single player', () => {
    const { root, menu } = make(); root.find('multiplayer')!.fire(); menu.leaveSingle(); expect(root.find('page-title')!.textContent).toBe('Multiplayer'); menu.dispose();
  });
});

describe('settings', () => {
  it('changes the volume, toggles fullscreen live, lists the controls and goes Back', async () => {
    let volume = 0.5, full = false;
    const setVolume = vi.fn((v: number) => { volume = v; }), set = vi.fn(async (on: boolean) => { full = on; return on; });
    const { root, menu } = make({ settings: { volume: () => volume, setVolume, fullscreen: { get: async () => full, set }, controls: [{ title: 'Single player', rows: [{ keys: 'Tab', action: 'Switch' }] }] } });
    root.find('settings')!.fire();
    expect(root.find('page-title')!.textContent).toBe('Settings');
    expect(root.find('volume')!.value).toBe('0.5'); expect(root.find('volume')!.children.map(o => o.textContent)).toEqual(['Off', '25%', '50%', '75%', '100%']);
    expect(root.find('fullscreen')!.disabled).toBe(true);   // until the window's state is read
    await Promise.resolve(); await Promise.resolve();
    expect(root.find('fullscreen')!.textContent).toBe('Fullscreen: Off'); expect(root.find('fullscreen')!.disabled).toBe(false);
    root.find('volume')!.value = '0'; root.find('volume')!.fire('change'); expect(setVolume).toHaveBeenCalledWith(0);
    root.find('fullscreen')!.fire(); expect(set).toHaveBeenCalledWith(true); await Promise.resolve(); await Promise.resolve();
    expect(root.find('fullscreen')!.textContent).toBe('Fullscreen: On'); expect(root.find('volume')!.value).toBe('0');
    expect(text(root.find('controls')!)).toContain('Tab'); expect(text(root.find('controls')!)).toContain('Switch');
    root.find('back')!.fire(); expect(buttons(root)).toEqual(HOME); menu.dispose();
  });
  it('keeps the Settings page intact across status pushes and re-reads fullscreen when the window resizes', async () => {
    let full = false; const get = vi.fn(async () => full);
    const { root, menu } = make({ settings: { volume: () => 1, setVolume: vi.fn(), fullscreen: { get, set: vi.fn() }, controls: [] } });
    root.find('settings')!.fire(); await Promise.resolve(); await Promise.resolve();
    const select = root.find('volume'); menu.setStatus(idle); expect(root.find('volume')).toBe(select);
    full = true; menu.windowResized(); await Promise.resolve(); await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(2); expect(root.find('fullscreen')!.textContent).toBe('Fullscreen: On');
    menu.setStatus({ ...idle, phase: 'lobby', actions: ['leave'] }); expect(root.find('volume')).toBeUndefined();   // a session still takes over
    root.find('back'); menu.windowResized(); expect(get).toHaveBeenCalledTimes(2); menu.dispose();
  });
  it('disables fullscreen without the preload window bridge', () => {
    const { root, menu } = make({ settings: { volume: () => 1, setVolume: vi.fn(), controls: [] } });
    root.find('settings')!.fire(); expect(root.find('fullscreen')!.disabled).toBe(true); expect(root.find('volume')!.value).toBe('1'); menu.dispose();
  });
  it('persists the volume and falls back to the default on missing, malformed or unknown data', () => {
    const map = new Map<string, string>(), storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    saveSettings(storage, { version: 1, volume: 0.25 }); expect(loadSettings(storage)).toEqual({ version: 1, volume: 0.25 });
    for (const bad of ['{', '[]', '{"version":2,"volume":0}', '{"version":1,"volume":0.3}', '{"version":1,"volume":"1"}']) { map.set(SETTINGS_KEY, bad); expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS); }
    const throwing = { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS); expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
    expect(VOLUME_STEPS).toContain(DEFAULT_SETTINGS.volume);
  });
});

describe('the controls list', () => {
  it('names every bound key from the input tables, with no gamepad or second keyboard', () => {
    const sections = controlSections(), all = sections.flatMap(s => s.rows.map(r => r.keys)).join(' | ');
    expect(sections.map(s => s.title)).toEqual(['Single player', 'Multiplayer', 'Anywhere']);
    for (const code of Object.keys(PRESS_CODES)) expect(all).toContain(keyLabel(code));
    for (const code of [...Object.values(MOVE_CODES), INTERACT_HELD, FIRE_HELD]) expect(all).toContain(keyLabel(code));
    const sector = sections[1]!.rows.map(r => r.keys).join(' ');
    for (const code of [SECTOR_KEYS.up, SECTOR_KEYS.left, SECTOR_KEYS.down, SECTOR_KEYS.right, SECTOR_KEYS.interact, SECTOR_KEYS.confirm, SECTOR_KEYS.cancel, SECTOR_KEYS.callout]) expect(sector).toContain(keyLabel(code));
    expect(sections[0]!.rows.find(r => r.keys === 'M')!.action).toContain('main menu');
    expect(all).not.toMatch(/pad|stick|arrow/i);
    expect([keyLabel('KeyE'), keyLabel('Equal'), keyLabel('NumpadAdd'), keyLabel('Escape')]).toEqual(['E', '=', 'Num +', 'Esc']);
  });
});
