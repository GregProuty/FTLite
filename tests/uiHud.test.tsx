// @vitest-environment jsdom
// The React sector HUD (UI-iii): hud.ts's strings at hud.ts's positions from the HUD model, the render rule, sharing
// and the region's error boundary.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { UiContext } from '../src/renderer/src/ui/context';
import { UiRoot } from '../src/renderer/src/ui/UiRoot';
import { createHudSink } from '../src/renderer/src/ui/sinks';
import { buildHudModel, clockLine, sectorLine, timeLine, directorText, mapTitle, type HudContext, type HudModel, type MapModel } from '../src/renderer/src/render/hudModel';
import { createCardUi } from '../src/renderer/src/clientControl/cardController';
import { sitDown } from '../src/renderer/src/sim/stations';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { INTERNAL_W } from '../src/shared/resolution';
import { LINE, PAD, textPx } from '../src/renderer/src/render/theme';
import { BANNER_Y, BLOCK_HP_X, CARD_ROW, CLOCK, CREDITS, CREDITS_LINES, EVENT_CARD, POWER, SUMMARY_TOP, THREATS, blockRect, cardRect } from '../src/renderer/src/render/hudLayout';
import { WINDOW } from '../src/renderer/src/render/enemyWindowModel';
import { cutterState, makeState } from './helpers/sim';
import { makeUi } from './helpers/uiStore';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const texts = () => Array.from(document.querySelectorAll('canvas')).map((c) => ({ text: c.dataset.text!, x: Number(c.dataset.x), y: Number(c.dataset.y), anchor: c.dataset.anchorx }));
const all = () => texts().map((t) => t.text);
const find = (t: string) => texts().find((c) => c.text === t);
const slots2: HudContext['slots'] = [{ status: 'active', key: 'kb:0' }, { status: 'bot', key: null }];
const empty4: HudContext['slots'] = Array.from({ length: 4 }, () => ({ status: 'empty' as const, key: null }));
const running = (patch: Partial<HudContext> = {}): HudModel => buildHudModel(makeState(2), { mode: 'player', player: 0, ui: createCardUi() }, { phase: 'running', message: '', slots: slots2, ...patch });
const lobby = (): HudModel => buildHudModel(null, { mode: 'couch', ui: createCardUi() }, { phase: 'lobby', message: 'CREW LOBBY', slots: empty4 });
function mount(menu = false) {
  const ui = makeUi(), sink = createHudSink(ui.store);
  let commits = 0;
  render(<UiContext.Provider value={{ store: ui.store, actions: ui.actions }}><Profiler id="hud" onRender={() => { commits++; }}><UiRoot menu={menu} /></Profiler></UiContext.Provider>);
  return { ...ui, sink, commits: () => commits };
}

describe('the side panels', () => {
  it('running: the clock card, the power title, a threat row and the first block', () => {
    const { sink } = mount(), m = running(); m.threats = [{ icon: 'icon.fire', text: 'Fire: Bridge' }];
    act(() => sink.update(m));
    [clockLine(m), sectorLine(m), timeLine(m), directorText(m), m.run.quirk].forEach((s, k) => expect(find(s)).toMatchObject({ x: CLOCK.x + PAD, y: CLOCK.y + k * LINE }));
    expect(find(`POWER ${m.power.used}/${m.power.capacity}`)).toMatchObject({ x: POWER.x + PAD, y: POWER.y });
    expect(find('Fire: Bridge')).toMatchObject({ x: THREATS.x + PAD, y: THREATS.y });   // no icon image in jsdom: the text starts at the row
    expect(find(`P1 ${m.players[0]!.character.name}`)).toMatchObject({ x: blockRect(0).x + PAD, y: blockRect(0).y });
    expect(find(m.message)).toBeUndefined(); expect(texts().some((t) => t.y === BANNER_Y)).toBe(false);
  });
  it('lobby and gameover: no side panels; the banner and the summary rows', () => {
    const { sink } = mount(), m = lobby();
    act(() => sink.update(m));
    expect(find(clockLine(m))).toBeUndefined(); expect(find(`POWER ${m.power.used}/${m.power.capacity}`)).toBeUndefined();
    expect(find('CREW LOBBY')).toMatchObject({ x: INTERNAL_W / 2, y: BANNER_Y, anchor: '0.5' });
    expect(find(m.lobbyShip)).toMatchObject({ x: INTERNAL_W / 2, y: SUMMARY_TOP + LINE, anchor: '0.5' });
    expect(find(m.lobbyLines[0]!)).toMatchObject({ y: SUMMARY_TOP + 2 * LINE });
    const g = running({ phase: 'gameover', message: 'GAME OVER' });
    act(() => sink.update(g));
    expect(find('GAME OVER')).toMatchObject({ x: INTERNAL_W / 2, y: BANNER_Y, anchor: '0.5' });
    g.summary!.forEach((s, k) => { if (k < 12 && s) expect(texts().find((t) => t.text === s && t.y === SUMMARY_TOP + k * LINE)).toBeDefined(); });
    expect(find(clockLine(g))).toBeUndefined();
  });
});

describe('the player blocks (ported from hudSlots.test.ts)', () => {
  it('empty slots, two online seats with a BOT, then the empty slots again', () => {
    const { sink } = mount();
    act(() => sink.update(lobby()));
    expect(all()).toContain('P3: press Interact to join');
    const m = running(); m.players[1]!.character.name = 'Lindqvist';
    act(() => sink.update(m));
    expect(all().some((t) => /P[34]/.test(t))).toBe(false);
    const bot = all().find((t) => /P2.*BOT/.test(t));
    expect(bot).toBeDefined(); expect(textPx(bot!)).toBeLessThan(BLOCK_HP_X);
    expect(all().some((t) => /RECONNECT|press Interact/.test(t))).toBe(false);
    act(() => sink.update(lobby()));
    expect(all()).toContain('P4: press Interact to join');
  });
  it('a reconnecting slot', () => {
    const { sink } = mount(), m = running(); m.players[1] = { ...m.players[1]!, status: 'reconnect' };
    act(() => sink.update(m));
    expect(find('P2: RECONNECT')).toMatchObject({ x: blockRect(1).x + PAD, y: blockRect(1).y });
  });
});

describe('the console card', () => {
  it('sits at cardRect, with the tab bar when tabbed', () => {
    const s = cutterState(); sitDown(s, 0, s.derived.stationOfKind[StationKind.Doors]!);
    const m = buildHudModel(s, { mode: 'player', player: 0, ui: createCardUi() }, { phase: 'running', message: '', slots: slots2 });
    expect(m.players[0]!.console).not.toBeNull();
    const { sink } = mount(); act(() => sink.update({ ...m, players: [{ ...m.players[0]!, tabs: null }, m.players[1]!] }));
    const r = cardRect(0, false), first = texts().filter((t) => t.x === r.x + PAD + CARD_ROW.nameX && t.y === r.y);
    expect(first.length).toBe(1);
    act(() => sink.update({ ...m, players: [{ ...m.players[0]!, tabs: [{ kind: 0, name: 'HELM', active: false, offline: false }, { kind: 6, name: 'DOORS', active: true, offline: false }], tabFocus: true }, m.players[1]!] }));
    const t = cardRect(0, true);
    expect(find('HELM')).toMatchObject({ x: t.x + PAD, y: t.y });
    expect(find('>DOORS')).toMatchObject({ y: t.y });
    expect(texts().some((c) => c.x === t.x + PAD + CARD_ROW.nameX && c.y === t.y + LINE + 2)).toBe(true);   // the body under the tab bar
  });
});

describe('the event card', () => {
  it('places the title and the choice rows with right-anchored votes', () => {
    const { sink } = mount(), m = running();
    m.eventCard = { title: 'DISTRESS', text: ['A ship calls.', ''], choices: [{ number: '1.', text: 'Help', enabled: true, blue: false, votes: ['P1', 'P2'] }, { number: '2.', text: 'Leave', enabled: false, blue: false, votes: [] }], status: 'Vote 5s', help: 'Confirm to vote' };
    act(() => sink.update(m));
    const CX = EVENT_CARD.x + 16, CW = EVENT_CARD.w - 32;
    expect(find('DISTRESS')).toMatchObject({ x: CX, y: EVENT_CARD.y + 6 });
    let y = EVENT_CARD.y + 6 + LINE + 6;
    expect(find('A ship calls.')).toMatchObject({ x: CX, y }); y += LINE + 10;
    expect(find('1.')).toMatchObject({ x: CX, y }); expect(find('Help')).toMatchObject({ x: CX + 28, y });
    expect(find('< P1 P2')).toMatchObject({ x: CX + CW, y, anchor: '1' }); y += LINE + 4;
    expect(find('Leave')).toMatchObject({ y }); expect(texts().filter((t) => t.text.startsWith('<')).length).toBe(1); y += LINE + 4 + 6;
    expect(find('Vote 5s')).toMatchObject({ x: CX, y }); expect(find('Confirm to vote')).toMatchObject({ x: CX, y: y + LINE });
  });
});

describe('the credits', () => {
  it('shows the lines from the scroll and the footer', () => {
    const lines = Array.from({ length: 40 }, (_, k) => `line ${k}`);
    const { sink } = mount(); act(() => sink.update(running({ credits: { lines, scroll: 5 } })));
    expect(find('line 5')).toMatchObject({ x: CREDITS.x + 16, y: CREDITS.y + 12 });
    expect(find(`line ${5 + CREDITS_LINES - 1}`)).toMatchObject({ y: CREDITS.y + 12 + (CREDITS_LINES - 1) * LINE });
    expect(find('line 4')).toBeUndefined(); expect(find(`line ${5 + CREDITS_LINES}`)).toBeUndefined();
    expect(find('Up/Down: scroll    Confirm or Cancel: close')).toMatchObject({ x: CREDITS.x + 16, y: CREDITS.y + CREDITS.h - LINE - 8 });
  });
});

describe('the map panel', () => {
  const map: MapModel = { columns: [{ nodes: [{ type: 'event', current: true, reachable: false, selected: false, past: false }] }, { nodes: [{ type: 'shop', current: false, reachable: true, selected: true, past: false }, { type: 'asteroid', current: false, reachable: false, selected: false, past: false }] }], edges: [{ from: [0, 0], to: [1, 0] }, { from: [0, 0], to: [1, 1] }], column: 0, sector: 0, fleet: 0, jump: 'READY' };
  it('shows while running with a map, its title, marks and EXIT', () => {
    const { sink } = mount(); act(() => sink.update({ ...running(), map }));
    expect(find(mapTitle(map))).toMatchObject({ x: WINDOW.x + PAD, y: WINDOW.y });
    expect(find('!')).toMatchObject({ anchor: '0.5' }); expect(find('$')).toBeDefined();
    expect(texts().filter((t) => t.text === 'EXIT').length).toBe(2);   // one per node on the last column
    expect(document.querySelectorAll('svg line').length).toBe(2);
    expect(document.querySelectorAll('svg polygon').length).toBe(3);   // the asteroid's rocks
  });
  it('is absent outside running or without a map', () => {
    const { sink } = mount(); act(() => sink.update({ ...running({ phase: 'paused', message: 'PAUSED' }), map }));
    expect(find(mapTitle(map))).toBeUndefined();
    act(() => sink.update({ ...running(), map: null })); expect(document.querySelector('svg')).toBeNull();
  });
});

describe('the render rule, sharing and the boundary (spec §8)', () => {
  it('sink.clear() removes the HUD', () => {
    const { sink } = mount(); act(() => sink.update(running()));
    expect(document.querySelector('[data-ui-stage]')).not.toBeNull();
    act(() => sink.clear()); expect(document.querySelector('[data-ui-stage]')).toBeNull(); expect(texts()).toEqual([]);
  });
  it('an unchanged model renders nothing and writes nothing', () => {
    const { sink, store, commits } = mount(), m = running();
    act(() => sink.update(m)); const after = commits();
    let writes = 0; const off = store.subscribe(() => { writes++; });
    act(() => sink.update(structuredClone(m))); act(() => sink.update(structuredClone(m)));
    expect(commits()).toBe(after); expect(writes).toBe(0); off();
  });
  it('a throwing HUD leaves the menu, and the next model after clear renders again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sink, store } = mount(true);
    act(() => sink.update({ ...running(), players: [null] as never }));
    expect(document.querySelector('[data-testid="session-menu"]')).not.toBeNull();
    const epoch = store.getState().epochs.hud;
    act(() => sink.clear()); act(() => sink.update(running()));
    expect(store.getState().epochs.hud).toBeGreaterThan(epoch);
    expect(find(clockLine(running()))).toBeDefined();
  });
});
