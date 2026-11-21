import { fixtureCouchViewer } from './helpers/cardUi';
import { describe, it, expect } from 'vitest';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState, type SimState } from './helpers/simLifetime';
import { textPx, rowPx, TEXT_SCALE, TITLE_SCALE, PAD, contrast, TEXT_PAIRS, FONT_SIZE, FONT_NATIVE, LINE } from '../src/renderer/src/render/theme';
import { CLOCK, POWER, THREATS, POWER_ROW, CARD_ROW, CARD_INNER_W, BLOCK_INNER_W, BLOCK_HP_X, BLOCK_HP_W, BLOCK_O2_X, NOTICE, EVENT_CARD, SUMMARY_W, CREDITS, hudLayout, blockRect, cardRect, overlaps, inside } from '../src/renderer/src/render/hudLayout';
import { buildHudModel, clockLine, sectorLine, timeLine, directorText, weaponsStrip, weaponsFooterLines, weaponsLootLine, navigationFooterLines, scienceFooter, engineeringFooter, targetRowText, tabLabel, skillsLine, seatName, runNotice, lobbyLines, upgradeRowText, STATION_SHORT, HIDDEN_SHIP, HELM_NOTICE, EVENT_CARD_HELP, objectThreatText, type HudModel, type WeaponsPanel, type NavigationPanel, type SciencePanel, type EngineeringPanel, type DebrisTarget, type DoorsPanel } from '../src/renderer/src/render/hudModel';
import { STATION_NAMES } from '../src/renderer/src/sim/stationKinds';
import { PHASE_NAMES } from '../src/renderer/src/sim/director';
import { QUIRK_NAMES } from '../src/renderer/src/sim/quirks';
import { CHARACTERS, ASSET_NAMES, COMPLICATION_NAMES } from '../src/renderer/src/sim/characters';
import { WEAPON_DEFS } from '../src/renderer/src/sim/weaponDefs';
import { EVENT_DEFS, choiceLabel } from '../src/renderer/src/sim/events';
import { navRows } from '../src/renderer/src/sim/run';
import { STATION_MAX, STATION_OVERDRIVE, UPGRADE_MAX, COOLANT_POOL, TORP_CAP, SECTOR_COLUMNS, SECTORS } from '../src/renderer/src/sim/tuning';
import { buildCreditLines } from '../src/renderer/src/render/creditsText';
import { parseManifest } from '../src/renderer/src/render/manifest';
import { readFileSync } from 'node:fs';
import { makeState, quiet, mapM, setEvent, RECRUITS, LAYOUT, CUTTER } from './helpers/sim';
import { worldBand, WORLD_BAND } from '../src/renderer/src/render/worldFit';
import { enemyWindowX, windowRoomCentre, WINDOW } from '../src/renderer/src/render/enemyWindowModel';

/** The HUD at the larger font (spec Demo-x-c section 1): every text colour readable, every panel and card fitting its longest content. Widths are the font's real advances (theme textPx). */
const SHIPS = [LAYOUT, CUTTER, parseShip(skiff)];
const states = (): SimState[] => SHIPS.map((l) => { const s = createSimState(l, 2, 1, RECRUITS); quiet(s); return s; });
const fits = (s: string, w: number, scale = TEXT_SCALE): void => { expect(textPx(s, scale), `${s} (${textPx(s, scale)} px > ${w})`).toBeLessThanOrEqual(w); };
const roomNames = [...new Set(SHIPS.flatMap((l) => l.rooms.map((r) => r.name)))];
const MAX_CELLS = Math.max(...STATION_MAX) + UPGRADE_MAX + STATION_OVERDRIVE;

describe('the theme (spec Demo-x-c section 1)', () => {
  it('every text colour on its panel reaches 4.5 : 1', () => {
    for (const p of TEXT_PAIRS) expect(contrast(p.fg, p.bg), p.name).toBeGreaterThanOrEqual(4.5);
  });
  it('the font draws at a whole-pixel scale of its native 16 px, at least 1.5x the old 16 px size, and a line holds its glyphs', () => {
    expect(Number.isInteger(FONT_SIZE / FONT_NATIVE)).toBe(true); expect(FONT_SIZE / 16).toBeGreaterThanOrEqual(1.5);
    expect(LINE).toBeGreaterThanOrEqual(9 * TEXT_SCALE + 4);   // m5x7: seven-pixel caps and two-pixel descenders, then a gap
  });
  it('textPx uses the font advances: digits and most letters 6, i and l 3, m and w 8, at the HUD scale', () => {
    expect(textPx('0')).toBe(12); expect(textPx('il')).toBe(12); expect(textPx('mw')).toBe(32); expect(textPx('ab', 1)).toBe(12);
  });
});

describe('the left column at the larger font', () => {
  const inner = CLOCK.w - 2 * PAD;
  it('the clock card: hull and fuel, the sector, the time, the director and the quirk at their longest', () => {
    const base = buildHudModel(null, fixtureCouchViewer(null), { slots: [], phase: 'running', message: '' });
    const m: HudModel = { ...base, hull: 100, simSeconds: 9999, run: { column: SECTOR_COLUMNS - 1, columns: SECTOR_COLUMNS, sector: SECTORS - 1, fuel: 99, quirk: '' } };
    for (const s of [clockLine(m), sectorLine(m), timeLine(m)]) fits(s, inner);
    for (const phase of PHASE_NAMES) fits(directorText({ ...m, director: { phase, stress: 1 } }), inner);
    for (const q of QUIRK_NAMES) fits(q, inner);
  });
  it('the power rows: the short name, seven cells, the status and the coolant in their columns', () => {
    for (const n of STATION_SHORT) expect(POWER_ROW.nameX + textPx(n)).toBeLessThan(POWER_ROW.cellsX);
    expect(POWER_ROW.cellsX + MAX_CELLS * POWER_ROW.step).toBeLessThanOrEqual(POWER_ROW.statusX);
    for (const st of ['OFF', 'FAIL', 'P4']) expect(POWER_ROW.statusX + textPx(st)).toBeLessThan(POWER_ROW.coolantX);
    expect(POWER_ROW.coolantX + textPx(`C${COOLANT_POOL}`)).toBeLessThanOrEqual(POWER_ROW.width);
    fits('POWER 99/99', inner);
  });
});

describe('the console cards at the larger font', () => {
  const W = CARD_INNER_W;
  it('Engineering: every station name before the cells, the cells, FAIL and the coolant inside the card; the Upgrades page columns', () => {
    for (const n of [...STATION_NAMES, 'UPGRADES']) expect(CARD_ROW.nameX + textPx(n), n).toBeLessThan(CARD_ROW.cellsX);
    expect(CARD_ROW.cellsX + MAX_CELLS * CARD_ROW.step).toBeLessThanOrEqual(CARD_ROW.statusX);
    expect(CARD_ROW.statusX + textPx('FAIL')).toBeLessThan(CARD_ROW.coolantX);
    expect(CARD_ROW.coolantX + textPx(`C${COOLANT_POOL}`)).toBeLessThanOrEqual(W);
    const s = makeState(2); quiet(s);
    for (let lvl = 0; lvl <= UPGRADE_MAX; lvl++) {
      s.run.upgrades.fill(lvl); s.run.reactorBonus = Math.min(5, lvl * 2); s.run.scrap = 9999;
      const p = engineeringPanel(s);
      for (const u of p.upgrades) { expect(CARD_ROW.nameX + textPx(u.name), upgradeRowText(u)).toBeLessThan(CARD_ROW.colAX); expect(CARD_ROW.colAX + textPx(u.level)).toBeLessThan(CARD_ROW.colBX); expect(CARD_ROW.colBX + textPx(u.price)).toBeLessThanOrEqual(W); }
      fits(engineeringFooter({ ...p, page: 1 }), W); fits(engineeringFooter({ ...p, page: 0, pool: 99, coolantFree: COOLANT_POOL }), W);
    }
  });
  it('Weapons: the strip with two filled slots, every target row, the loot line, the SWAP row and both footer lines', () => {
    const loot = WEAPON_DEFS.slice(1);
    for (const a of loot) for (const b of loot) {
      const c = weapons({ loot: [{ selector: 4, short: a.short, charge: 0.99, powered: false, empty: true }, { selector: 5, short: b.short, charge: 0.99, powered: true, empty: false }] });
      for (const f of [{}, { freqUnknown: true, shieldsUp: true }, { enemyFreq: 1, shieldsUp: true }, { enemyFreq: 2 }, { enemyFreq: 3 }]) { const d = { ...c, ...f }; expect(rowPx(weaponsStrip(d)), weaponsStrip(d).map((p) => p.text).join(' ')).toBeLessThanOrEqual(W); }   // the marked selector and freq ? (spec Demo-xiv section 1)
      fits(weaponsLootLine(c), W); fits(`SWAP: cargo ${a.short} for ${b.short}`, W);
    }
    for (const row of targetRows()) fits(row, W);
    for (const loaded of [true, false]) for (const fetch of [true, false]) {
      const c = weapons({ locked: true, charge: 0.99, torpedo: { stock: TORP_CAP, cap: TORP_CAP, loaded, load: 0.99, fetch, fed: false } });
      for (const l of weaponsFooterLines(c)) fits(l, W);
      for (const freq of [1, 2, 3]) for (const l of weaponsFooterLines({ ...c, locked: false, enemyFreq: freq, shieldsUp: true, selector: freq % 3 })) fits(l, W);   // Match freq N (spec Demo-xiv section 1)
    }
  });
  it('Science: every target row with its scan, the system scan row and results, the footer', () => {
    for (const row of targetRows()) fits(row, W);
    for (const t of ['Scan system  (detect 100%)', 'Scanning system  100%', 'System scanned', HIDDEN_SHIP, 'No hidden ship found', 'Cache found: +999 scrap', 'Cache found: +9 fuel', 'Charted 99 beacons', 'No beacons charted']) fits(t, W);
    fits(scienceFooter({ leadSeconds: 99, scanning: true, lock: 'LOCKED 99s' } as SciencePanel), W);
  });
  it('Navigation: every event row and label at depth 0 and 17, the destination rows and both footer lines', () => {
    for (const st of [calm(), deep()]) {
      for (let id = 0; id < EVENT_DEFS.length; id++) {
        setEvent(st, id);
        for (const r of navRows(st)) fits(r.text, W);
        EVENT_DEFS[id]!.choices.forEach((_, k) => fits(choiceLabel(st, id, k), W));
      }
      st.run.event = -1; for (const r of navRows(st)) fits(r.text, W);
    }
    const p = { evadeChance: 1, jump: { charge: 0.99, ready: false }, fuel: 99, fuelAfter: 98, scrap: 9999 } as NavigationPanel;
    for (const l of [...navigationFooterLines(p), ...navigationFooterLines({ ...p, jump: { charge: 1, ready: true } })]) fits(l, W);
  });
  it('Doors: every door and airlock on every ship, its state and its action', () => {
    for (const s of states()) {
      const d = s.derived, names = s.layout.rooms;
      const items = [...Array.from({ length: d.edgeIsDoor.length }, (_, e) => (d.edgeIsDoor[e] ? `Door  ${names[d.edgeA[e]!]!.name} / ${names[d.edgeB[e]!]!.name}` : '')), ...Array.from(d.airlockRoom, (r) => `Airlock  ${names[r]!.name}`)];
      for (const t of items) if (t) fits(t, W);
    }
    for (const t of ['AIRLOCK OPEN', 'Airlock closed', 'Sealed', 'Sealing', 'Held open', 'Auto', 'Confirm: Close airlock', 'Confirm: Open airlock', 'Confirm: Hold open', 'Confirm: Release', 'Confirm: Seal', 'Doors offline', 'Open airlocks: 9', 'No doors']) fits(t, W);
    void ({} as DoorsPanel);
  });
  it('the tab bar: the Ops group with two tabs offline and the stick on the bar', () => {
    const names = ['SCIENCE', 'ENGINEERING', 'DOORS'];
    for (let off = 0; off < 3; off++) {
      const tabs = names.map((name, k) => ({ kind: k, name, active: k === 2, offline: k !== off }));
      const parts = tabs.flatMap((t, k) => [...(k ? [{ text: '|' }] : []), { text: tabLabel(t, true) }]);
      expect(rowPx(parts), parts.map((p) => p.text).join(' ')).toBeLessThanOrEqual(W);
    }
    expect(tabLabel({ kind: 1, name: 'WEAPONS', active: true, offline: true }, true)).toBe('>WEAPONS!');
  });
});

describe('the player blocks at the larger font', () => {
  it('the name before the health bar, the bar before the oxygen icon, the icon inside', () => {
    for (const c of CHARACTERS) for (let i = 1; i <= 4; i++) expect(textPx(`P${i} ${c.name}`), c.name).toBeLessThan(BLOCK_HP_X);
    expect(BLOCK_HP_X + BLOCK_HP_W).toBeLessThan(BLOCK_O2_X); expect(BLOCK_O2_X + 16).toBeLessThanOrEqual(BLOCK_INNER_W);
  });
  it('every line: join and reconnect, the lobby traits, every prompt with its glyph and icon, the skills at level 10, the vote, downed', () => {
    for (const t of ['P4: press Interact to join', 'P4: RECONNECT', 'DOWNED 99s', 'Carrying a torpedo', 'VOTE 3', skillsLine([10, 10, 10, 10, 10, 10])]) fits(t, BLOCK_INNER_W);
    for (const c of CHARACTERS) fits(`P4  ${c.name}`, BLOCK_INNER_W);
    for (const a of ASSET_NAMES) for (const b of COMPLICATION_NAMES) if (a && b) fits(`${a} / ${b}`, BLOCK_INNER_W);
    const prompts = ['Fight boarder', 'Revive P4', 'Repair fire', 'Repair breach', 'Repair power', 'Take torpedo', 'Load torpedo', 'Unseal door', 'Seal door', 'Vote 3', 'Agree: jump', 'Stand'];
    for (const p of prompts) expect(rowPx([{ glyph: true, icon: true, text: p }]), p).toBeLessThanOrEqual(BLOCK_INNER_W);
    for (const s of states()) for (let i = 0; i < s.derived.stationKind.length; i++) expect(rowPx([{ glyph: true, text: `Sit: ${seatName(s, i)}` }]), seatName(s, i)).toBeLessThanOrEqual(BLOCK_INNER_W);
    for (const n of STATION_NAMES) fits(n, BLOCK_INNER_W);
  });
});

describe('the notices, threats, event card, lobby, summary and credits at the larger font', () => {
  it('every event notice at depth 0 and 17, the helm line and the fixed lines fit between the columns', () => {
    for (const st of [calm(), deep()]) for (let id = 0; id < EVENT_DEFS.length; id++) { setEvent(st, id); for (const l of runNotice(st)) fits(l, NOTICE.w); }
    for (const l of [HELM_NOTICE, `${HIDDEN_SHIP}   contact 99s`, 'Jump away, or strike first: shields down 10s', 'Other crew: press Confirm to agree  10s', 'JUMP READY   someone take Navigation', 'The Pursuit has caught up: elite ship approaching', 'ENEMY SURRENDERS   hold fire 99s for +999 scrap', 'SHOP at sector 3 node 8   scrap 9999', 'FIELD CLEARED   +999 scrap', 'ENEMY DEFEATED   +10 hull', 'Found: Missile Pod (cargo)', 'Cargo full: sold for 99', 'SCAN: hidden ship detected', 'cache +40 scrap, 9 beacons charted']) fits(l, NOTICE.w);
    for (const w of WEAPON_DEFS.slice(1)) fits(`Hull +25 (30)  Torps +2 (20)  Fuel +2 (12)  ${w.short} (${w.price})`, NOTICE.w);
  });
  it('every threat line fits the threats panel after its icon', () => {
    const W = THREATS.w - 2 * PAD - 20;
    for (const r of roomNames) for (const t of [`Boarders: ${r} x9`, `Fire: ${r}`, `Breach: ${r}`, `Airlock open: ${r}`, ...(['Shot', 'Rock', 'Debris'] as const).flatMap((k) => [objectThreatText(k, r, 99, 3), objectThreatText(k, r, 99, null)])]) fits(t, W);
    for (const n of STATION_NAMES) fits(`Power: ${n}`, W);
    for (const d of EVENT_DEFS) fits(`Event: ${d.title}`, W);
    for (const t of ['Helm offline', 'Hidden ship: contact 99s', 'Shop here']) fits(t, W);
    const s = makeState(2); quiet(s); s.enemy.present = 1; s.enemy.maxHull = 100; s.enemy.hull = 100; s.enemy.sysHp.fill(0); s.enemy.fleeing = 1;
    for (const t of buildHudModel(s, fixtureCouchViewer(s), { slots: [], phase: 'running', message: '' }).threats) fits(t.text, W);
  });
  it('the event card: the title, the text rows, each choice with four voters, the status and the help', () => {
    const inner = EVENT_CARD.w - 32;
    for (const st of [calm(), deep()]) EVENT_DEFS.forEach((d, id) => {
      for (const t of [d.title, ...d.text]) fits(t, inner);
      d.choices.forEach((_, k) => expect(28 + textPx(choiceLabel(st, id, k)) + 16 + textPx('< P1 P2 P3 P4'), choiceLabel(st, id, k)).toBeLessThanOrEqual(inner));
    });
    for (const t of ['Waiting for the first vote', 'Deciding in 15s', EVENT_CARD_HELP]) fits(t, inner);
  });
  it('the lobby card for 1 to 4 players, a four-player game-over summary, the banners and the credits', () => {
    for (let n = 1; n <= 4; n++) for (const l of lobbyLines(n)) fits(l, SUMMARY_W);
    const s = makeState(4); quiet(s); s.tick = 3599 * 60; s.ended = 1;
    const m = buildHudModel(s, fixtureCouchViewer(s), { slots: Array.from({ length: 4 }, () => ({ status: 'active' as const, key: 'kb:0' })), phase: 'gameover', message: '', credits: null, progress: { bestScore: 99999, runs: 999, victories: 99, newUnlocks: ['Reyes', 'Dubois'], unlocked: [] } });
    for (const l of m.summary!) fits(l, SUMMARY_W);
    for (const b of ['Press Interact to join. Confirm: start. Cancel: credits', 'New seed. Press Interact to join. Confirm: start. Cancel: credits', 'CREW LOST after 3599s. Confirm: same seed. Cancel: new seed.', 'PAUSED']) fits(b, 1280 - 16, TITLE_SCALE);
    for (const l of buildCreditLines(parseManifest(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8'))))) fits(l, CREDITS.w - 32);
    expect(POWER.y + POWER.h).toBeGreaterThan(CLOCK.y + CLOCK.h);
  });
});

function calm(): SimState { const s = makeState(2, 1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); s.run.column = 1; s.run.node = 2; return s; }
function deep(): SimState { const s = calm(); s.run.sector = 2; s.run.column = 5; return s; }
function engineeringPanel(s: SimState): EngineeringPanel {
  return { rows: [], cursor: 0, pool: 0, coolantFree: 0, page: 1, upgrades: upgradeRowsOfState(s), scrap: 9999 };
}
function upgradeRowsOfState(s: SimState): EngineeringPanel['upgrades'] {
  const kinds = STATION_NAMES.map((name, k) => ({ row: k, name, level: `lvl ${STATION_MAX[k]! + UPGRADE_MAX}/${STATION_MAX[k]! + UPGRADE_MAX}`, price: s.run.upgrades[k]! >= UPGRADE_MAX ? 'MAX' : '60', enabled: true, cursor: false }));
  return [...kinds, { row: 7, name: 'Reactor', level: '+1 bar', price: '999', enabled: true, cursor: false }, { row: 8, name: 'BACK', level: '', price: '', enabled: true, cursor: false }];
}
function weapons(o: Partial<WeaponsPanel>): WeaponsPanel {
  return { kind: 'weapons', charge: 0, selector: 0, torpedo: { stock: 0, cap: TORP_CAP, loaded: false, load: 0, fetch: false, fed: false }, targets: [], cursor: 0, first: 0, locked: false, loot: [], swap: null, rows: 6, enemyFreq: null, freqUnknown: false, shieldsUp: false, shot: null, ...o };
}
/** Every target row at its longest: debris, shots and rocks in every room with a scan running, and the enemy's rows. */
function targetRows(): string[] {
  const base: DebrisTarget = { stableId: 1, kind: 'debris', room: '', eta: 99, frequency: null, hull: null, system: null, status: null, shieldsUp: null, layers: null, layersMax: null, weaponCharge: null, fleeSeconds: null };
  const out: string[] = [];
  for (const room of roomNames) for (const kind of ['debris', 'shot', 'rock'] as const) out.push(targetRowText({ ...base, kind, room }, 0.99), targetRowText({ ...base, kind, room, frequency: 3 }));
  const enemy: DebrisTarget = { ...base, kind: 'enemy', room: 'Enemy ship', hull: 1, shieldsUp: true, layers: 4, layersMax: 4, weaponCharge: 1, fleeSeconds: 99, frequency: null };
  out.push(targetRowText(enemy, 0.99), targetRowText({ ...enemy, fleeSeconds: 0, eta: 999 }, 0.99));
  out.push(targetRowText({ ...enemy, shieldsUp: false }, 0.99), targetRowText({ ...enemy, shieldsUp: false, fleeSeconds: 0, eta: 999 }, 0.99), targetRowText({ ...enemy, frequency: 3, fleeSeconds: 0, eta: 999 }));   // plain words (spec Demo-xii section 3)
  for (let sys = 0; sys < 3; sys++) out.push(targetRowText({ ...enemy, system: sys, status: { hp: 30, repairIn: null, ionIn: 99 } }), targetRowText({ ...enemy, system: sys, status: { hp: 0, repairIn: 99 } }));
  return out;
}

describe('the sector HUD anchors to the stage (UI round 2b)', () => {
  const stages = [{ w: 1280, h: 720 }, { w: 1707, h: 720 }, { w: 1280, h: 960 }];
  it('is the reference layout at 1280x720, under the long-standing names', () => {
    const r = hudLayout({ w: 1280, h: 720 });
    expect(r).toBe(hudLayout());
    expect(r.THREATS).toEqual(THREATS); expect(r.NOTICE).toEqual(NOTICE); expect(r.EVENT_CARD).toEqual(EVENT_CARD); expect(r.CREDITS).toEqual(CREDITS);
    for (let i = 0; i < 4; i++) { expect(r.blockRect(i)).toEqual(blockRect(i)); expect(r.cardRect(i, true)).toEqual(cardRect(i, true)); }
  });
  for (const st of stages) it(`at ${st.w}x${st.h} every rect is on the stage, the margins hold and nothing new overlaps`, () => {
    const r = hudLayout(st), stage = { x: 0, y: 0, w: st.w, h: st.h }, ref = hudLayout();
    expect(r.THREATS.x + r.THREATS.w).toBe(st.w - 8);
    expect(r.blockRect(0).y + r.blockRect(0).h).toBe(st.h - 8);
    const all = [CLOCK, POWER, r.THREATS, r.blockRect(0), r.blockRect(1), r.blockRect(2), r.blockRect(3), r.cardRect(0, true), r.cardRect(1, true), r.cardRect(2, true), r.cardRect(3, true), r.NOTICE, r.CREDITS];
    for (const a of all) expect(inside(a, stage)).toBe(true);
    const refAll = [CLOCK, POWER, ref.THREATS, ref.blockRect(0), ref.blockRect(1), ref.blockRect(2), ref.blockRect(3), ref.cardRect(0, true), ref.cardRect(1, true), ref.cardRect(2, true), ref.cardRect(3, true), ref.NOTICE];
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (!overlaps(refAll[i]!, refAll[j]!)) expect(overlaps(all[i]!, all[j]!), `${i}/${j}`).toBe(false);
    expect(r.CREDITS.x + r.CREDITS.w).toBe(st.w - 40); expect(r.CREDITS.y + r.CREDITS.h).toBe(st.h - 40);
    expect(r.NOTICE.x + r.NOTICE.w / 2 - (CLOCK.x + CLOCK.w + r.THREATS.x) / 2).toBe(0);
    expect(r.EVENT_CARD.x).toBeGreaterThanOrEqual(0); expect(r.EVENT_CARD.x + r.EVENT_CARD.w).toBeLessThanOrEqual(st.w);   // final review
    for (const tabbed of [false, true]) expect(r.cardRect(2, tabbed).x + r.cardRect(2, tabbed).w).toBe(st.w - 8);
  });
  it('the sector Pixi pieces anchor with it (final review): the enemy window under THREATS, the ship band centred between the columns', () => {
    for (const st of stages) {
      const r = hudLayout(st), band = worldBand(st), dw = st.w - 1280;
      expect(enemyWindowX(st)).toBe(r.THREATS.x); expect(enemyWindowX(st)).toBe(WINDOW.x + dw);
      expect(band.x).toBe(WORLD_BAND.x + dw / 2); expect(band.x).toBe(r.EVENT_CARD.x);
      expect({ y: band.y, w: band.w, h: band.h }).toEqual({ y: WORLD_BAND.y, w: WORLD_BAND.w, h: WORLD_BAND.h });
      expect(windowRoomCentre(0, enemyWindowX(st)).x - windowRoomCentre(0).x).toBe(dw);
    }
    expect(enemyWindowX({ w: 1707, h: 720 })).toBe(872 + 427); expect(worldBand({ w: 1707, h: 720 }).x).toBe(256 + 213.5);
    expect(enemyWindowX()).toBe(WINDOW.x); expect(worldBand()).toBe(WORLD_BAND);   // 1280x720 unchanged
  });
});
