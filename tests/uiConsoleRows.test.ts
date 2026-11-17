// The console card's pure rules (hud.ts's updatePlayer console branch as data): one case per console kind, literal
// fixture panels typed from hudModel's interfaces.
import { describe, expect, it } from 'vitest';
import { consoleRows } from '../src/renderer/src/ui/hud/consoleRows';
import { engineeringFooter, navigationFooterLines, scienceFooter, targetRowText, weaponsFooterLines, weaponsLootLine, weaponsRowTexts, weaponsStrip, type ConsolePanel, type DebrisTarget, type DoorsPanel, type EngineeringPanel, type HudPlayer, type NavigationPanel, type SciencePanel, type WeaponsPanel } from '../src/renderer/src/render/hudModel';
import { AMBER, BAR_ON, BLUE, BLUE_LIT, DIM, GOOD, TEXT, WARN } from '../src/renderer/src/render/theme';

const of = (console: ConsolePanel): HudPlayer => ({ console } as HudPlayer);
const target = (room: string, extra: Partial<DebrisTarget> = {}): DebrisTarget => ({ stableId: 1, kind: 'debris', room, eta: 4, frequency: null, hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null, ...extra });

describe('Engineering', () => {
  const rows = Array.from({ length: 7 }, (_, k) => ({ kind: k, name: `S${k}`, level: 2, max: 3, failed: k === 1, heat: 0.5, coolant: k === 2 ? 1 : 0, overdriven: false, unpowered: k === 3 }));
  const eng = (patch: Partial<EngineeringPanel> = {}): EngineeringPanel => ({ rows, cursor: 4, pool: 2, coolantFree: 1, page: 0, upgrades: [], scrap: 30, ...patch });
  it('page 0: station rows with FAIL/OFF, cursor and flash amber, UPGRADES in the eighth row', () => {
    const v = consoleRows(of(eng()), [5]);
    expect(v.rows).toHaveLength(8);
    expect(v.rows[0]).toEqual({ name: 'S0', level: 2, max: 3, status: '', failed: false, cursor: false, tint: TEXT, heat: 0.5, coolant: 0 });
    expect(v.rows[1]).toMatchObject({ status: 'FAIL', failed: true, tint: TEXT });
    expect(v.rows[2]).toMatchObject({ coolant: 1 });
    expect(v.rows[3]).toMatchObject({ status: 'OFF' });
    expect(v.rows[4]).toMatchObject({ cursor: true, tint: AMBER });
    expect(v.rows[5]).toMatchObject({ cursor: false, tint: AMBER });   // flashing
    expect(v.rows[7]).toEqual({ name: 'UPGRADES', level: 0, max: 0, status: '', cursor: false, tint: TEXT });
    expect(consoleRows(of(eng({ cursor: 7 })), []).rows[7]).toMatchObject({ cursor: true, tint: AMBER });
    expect(v.footA).toEqual([]); expect(v.footB).toEqual([{ text: engineeringFooter(eng()), tint: DIM }]);
    expect(v.selector).toBeNull(); expect(v.bar).toBeNull();
  });
  it('page 1: the upgrades with their level and price columns', () => {
    const upgrades = [{ row: 0, name: 'Nav', level: 'L2', price: '20', enabled: true, cursor: true }, { row: 1, name: 'Wpn', level: 'L1', price: '30', enabled: false, cursor: false }, { row: 2, name: 'BACK', level: '', price: '', enabled: true, cursor: false }];
    const c = eng({ page: 1, upgrades }), v = consoleRows(of(c), []);
    expect(v.rows[0]).toEqual({ name: 'Nav', level: 0, max: 0, status: '', cursor: true, tint: AMBER, cols: ['L2', '20'] });
    expect(v.rows[1]).toMatchObject({ tint: DIM, cols: ['L1', '30'] });
    expect(v.rows[2]).toMatchObject({ name: 'BACK', tint: TEXT });
    expect(v.rows.slice(3)).toEqual([null, null, null, null, null]);
    expect(v.footB).toEqual([{ text: engineeringFooter(c), tint: DIM }]);
  });
});

describe('Weapons', () => {
  const base: WeaponsPanel = { kind: 'weapons', charge: 0.5, selector: 0, torpedo: { stock: 2, cap: 4, loaded: false, load: 0.3, fetch: false, fed: false }, targets: ['Bridge', 'Cargo', 'Engines'].map((r, k) => target(r, { stableId: k })), cursor: 1, first: 0, locked: false, loot: [], swap: null, rows: 6, enemyFreq: 2, freqUnknown: false, shieldsUp: true, shot: null };
  it('the selector strip, the target window from first, the footers and the charge bar', () => {
    const v = consoleRows(of(base), []), texts = weaponsRowTexts(base);
    expect(v.selector).toEqual(weaponsStrip(base).map((p) => ({ text: p.text, tint: p.lit ? AMBER : p.match ? GOOD : DIM })));
    expect(v.selector!.slice(0, 2).map((p) => p.tint)).toEqual([AMBER, GOOD]);   // selector 0 lit, the enemy's frequency 2 green
    expect(v.rows[0]).toBeNull();
    expect(v.rows[1]).toEqual({ name: texts[0], level: 0, max: 0, status: '', cursor: false, tint: TEXT });
    expect(v.rows[2]).toMatchObject({ name: texts[1], cursor: true, tint: AMBER });
    expect(v.rows[3]).toMatchObject({ name: texts[2], tint: TEXT });
    expect(v.rows.slice(4)).toEqual([null, null, null, null]);
    const [a, b] = weaponsFooterLines(base);
    expect(v.footA).toEqual([{ text: a, tint: TEXT }]); expect(v.footB).toEqual([{ text: b, tint: AMBER }]);   // Match freq 2
    expect(v.bar).toEqual({ fill: 0.5, colour: BAR_ON });
  });
  it('scrolls by first, tints SWAP blue, puts the loot line in row 6 and never row 7', () => {
    const many = Array.from({ length: 6 }, (_, k) => target(`R${k}`, { stableId: k }));
    const c: WeaponsPanel = { ...base, targets: many, swap: 'SWAP Ion > slot 1', first: 2, cursor: 6, charge: 1, loot: [{ selector: 4, short: 'Ion', charge: 1, powered: true, empty: false }], selector: 0, enemyFreq: null, shot: { text: 'Hit', tone: 'hit' } };
    const v = consoleRows(of(c), []), texts = weaponsRowTexts(c);
    expect(v.selector![0]).toMatchObject({ tint: AMBER });
    expect(v.rows[1]).toMatchObject({ name: texts[2] });
    expect(v.rows[5]).toMatchObject({ name: texts[6], tint: AMBER, cursor: true });   // the SWAP row under the cursor stays amber
    expect(v.rows[6]).toEqual({ name: weaponsLootLine(c), level: 0, max: 0, status: '', cursor: false, tint: TEXT });
    expect(v.rows[7]).toBeNull();
    expect(v.footA[0]!.tint).toBe(GOOD); expect(v.footB).toEqual([{ text: 'Hit', tint: GOOD }]);
    expect(v.bar).toEqual({ fill: 1, colour: GOOD });
    const swapRow = consoleRows(of({ ...c, cursor: 2 }), []).rows[5];
    expect(swapRow).toMatchObject({ name: texts[6], tint: BLUE });
    const empty = consoleRows(of({ ...c, loot: [{ selector: 4, short: 'Pod', charge: 1, powered: true, empty: true }] }), []).rows[6];
    expect(empty).toMatchObject({ tint: DIM });
  });
  it('the second footer: miss TEXT, plain DIM, locked AMBER; a loaded torpedo lights the first', () => {
    const tone = (c: Partial<WeaponsPanel>) => consoleRows(of({ ...base, ...c }), []).footB[0]!.tint;
    expect(tone({ shot: { text: 'Missed', tone: 'miss' } })).toBe(TEXT);
    expect(tone({ enemyFreq: null })).toBe(DIM);
    expect(tone({ locked: true })).toBe(AMBER);
    expect(tone({ shot: { text: 'Ion', tone: 'strip' } })).toBe(AMBER);
    expect(consoleRows(of({ ...base, torpedo: { ...base.torpedo, loaded: true } }), []).footA[0]!.tint).toBe(GOOD);
  });
});

describe('Science', () => {
  const sci: SciencePanel = { kind: 'science', leadSeconds: 6.4, targets: [{ ...target('Bridge'), scan: 0 }, { ...target('Cargo', { stableId: 2 }), scan: 0.5 }], cursor: 0, first: 0, scanning: true, lock: '', system: { text: 'SYSTEM SCAN', enabled: true, results: ['Hidden ship detected: cloaked raider', 'No boarders', 'Crate: 10 scrap'] } };
  it('targets, the system row and its results, the cursor amber', () => {
    const v = consoleRows(of(sci), []);
    expect(v.rows[0]).toEqual({ name: targetRowText(sci.targets[0]!, 0), level: 0, max: 0, status: '', cursor: true, tint: AMBER });
    expect(v.rows[1]).toMatchObject({ name: targetRowText(sci.targets[1]!, 0.5), tint: TEXT, cursor: false });
    expect(v.rows[2]).toMatchObject({ name: 'SYSTEM SCAN', tint: BLUE });
    expect(v.rows[3]).toMatchObject({ tint: WARN }); expect(v.rows[4]).toMatchObject({ tint: DIM }); expect(v.rows[5]).toMatchObject({ tint: GOOD });
    expect(v.rows.slice(6)).toEqual([null, null]);
    expect(v.footA).toEqual([{ text: scienceFooter(sci), tint: TEXT }]); expect(v.footB).toEqual([]);
    expect(v.selector).toBeNull(); expect(v.bar).toBeNull();
  });
  it('the enabled system row under the cursor is BLUE_LIT; disabled is DIM; the window starts at first', () => {
    expect(consoleRows(of({ ...sci, cursor: 2 }), []).rows[2]).toMatchObject({ cursor: true, tint: BLUE_LIT });
    expect(consoleRows(of({ ...sci, cursor: 2, system: { ...sci.system, enabled: false } }), []).rows[2]).toMatchObject({ tint: AMBER });
    expect(consoleRows(of({ ...sci, system: { ...sci.system, enabled: false } }), []).rows[2]).toMatchObject({ tint: DIM });
    const v = consoleRows(of({ ...sci, first: 1, cursor: 2 }), []);
    expect(v.rows[0]).toMatchObject({ name: targetRowText(sci.targets[1]!, 0.5) }); expect(v.rows[1]).toMatchObject({ name: 'SYSTEM SCAN', tint: BLUE_LIT });
  });
});

describe('Navigation', () => {
  const row = (text: string, o: Partial<NavigationPanel['rows'][number]> = {}) => ({ text, selectable: true, enabled: true, cursor: false, blue: false, ...o });
  const nav: NavigationPanel = { kind: 'navigation', evadeChance: 0.2, jump: { charge: 0.4, ready: false }, here: 'Beacon', fuel: 5, fuelAfter: 4, first: 1, scrap: 12,
    rows: [row('skipped'), row('EVADING', { cursor: true }), row('Header', { selectable: false }), row('Locked', { enabled: false }), row('Blue', { blue: true }), row('BlueLit', { blue: true, cursor: true }), row('Cursor', { cursor: true }), row('Plain'), row('Eighth')] };
  it('a seven-row window from first, tinted per hud.ts', () => {
    const v = consoleRows(of(nav), []);
    expect(v.rows[0]).toEqual({ name: 'EVADING', level: 0, max: 0, status: '', cursor: true, tint: AMBER });
    expect(v.rows.slice(1, 7).map((r) => [r!.name, r!.tint])).toEqual([['Header', DIM], ['Locked', DIM], ['Blue', BLUE], ['BlueLit', BLUE_LIT], ['Cursor', AMBER], ['Plain', TEXT]]);
    expect(v.rows[7]).toBeNull();   // the eighth row is Engineering's alone
    const [a, b] = navigationFooterLines(nav);
    expect(v.footA).toEqual([{ text: a, tint: TEXT }]); expect(v.footB).toEqual([{ text: b, tint: DIM }]);
    expect(consoleRows(of({ ...nav, jump: { charge: 1, ready: true } }), []).footA[0]!.tint).toBe(GOOD);
  });
});

describe('Doors', () => {
  it('no doors: one DIM row', () => {
    const v = consoleRows(of({ kind: 'doors', item: null }), []);
    expect(v.rows[0]).toEqual({ name: 'No doors', level: 0, max: 0, status: '', cursor: false, tint: DIM });
    expect(v.rows.slice(1)).toEqual([null, null, null, null, null, null, null]);
    expect(v.footA).toEqual([]); expect(v.footB).toEqual([]);
  });
  it('the item, its status and the Confirm action; open airlocks in the footer', () => {
    const d: DoorsPanel = { kind: 'doors', item: 'Airlock  Engines', status: 'AIRLOCK OPEN', action: 'Close airlock', openAirlocks: 2 };
    const v = consoleRows(of(d), []);
    expect(v.rows.slice(0, 3).map((r) => [r!.name, r!.tint, r!.cursor])).toEqual([['Airlock  Engines', AMBER, false], ['AIRLOCK OPEN', WARN, false], ['Confirm: Close airlock', TEXT, false]]);
    expect(v.rows[3]).toBeNull();
    expect(v.footB).toEqual([{ text: 'Open airlocks: 2', tint: WARN }]);
    const off = consoleRows(of({ ...d, status: 'Auto', action: '', openAirlocks: 0 }), []);
    expect(off.rows.slice(1, 3).map((r) => [r!.name, r!.tint])).toEqual([['Auto', DIM], ['Doors offline', WARN]]);
    expect(off.footB).toEqual([]);
  });
});
