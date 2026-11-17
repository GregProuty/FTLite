// hud.ts's updatePlayer console branch as data (UI-iii): the card's eight cell rows (null hidden), the Weapons selector
// strip, the two footer lines and the charge strip. Pure; ConsoleCard places them.
import { engineeringFooter, navigationFooterLines, scienceFooter, targetRowText, weaponsFooterLines, weaponsFooterTone, weaponsLootLine, weaponsRowTexts, weaponsStrip, SCIENCE_ROWS, type HudPlayer } from '../../render/hudModel';
import { AMBER, BAR_ON, BLUE, BLUE_LIT, DIM, GOOD, TEXT, WARN } from '../../render/theme';
import type { CellRowSet } from '../stage/CellRow';
import type { RowPart } from '../stage/rowLayout';

export interface ConsoleRowsView { rows: (CellRowSet | null)[]; selector: RowPart[] | null; footA: RowPart[]; footB: RowPart[]; bar: { fill: number; colour: number } | null }
const ROWS = 8;
const plain = (name: string, cursor: boolean, tint: number): CellRowSet => ({ name, level: 0, max: 0, status: '', cursor, tint });
const line = (text: string, tint: number): RowPart[] => (text ? [{ text, tint }] : []);

export function consoleRows(p: HudPlayer, flash: readonly number[]): ConsoleRowsView {
  const rows: (CellRowSet | null)[] = Array.from({ length: ROWS }, () => null);
  const view: ConsoleRowsView = { rows, selector: null, footA: [], footB: [], bar: null };
  const con = p.console;
  if (!con) return view;
  if ('rows' in con && !('kind' in con)) {   // Engineering: the only panel without a kind, and the only one with an eighth row
    const c = con;
    if (c.page === 1) c.upgrades.slice(0, ROWS).forEach((u, k) => { rows[k] = { ...plain(u.name, u.cursor, u.cursor ? AMBER : u.enabled ? TEXT : DIM), cols: [u.level, u.price] }; });
    else {
      c.rows.slice(0, ROWS).forEach((r, k) => { rows[k] = { name: r.name, level: r.level, max: r.max, status: r.failed ? 'FAIL' : r.unpowered ? 'OFF' : '', failed: r.failed, cursor: k === c.cursor, tint: flash.includes(r.kind) || k === c.cursor ? AMBER : TEXT, heat: r.heat, coolant: r.coolant }; });
      const up = c.cursor === c.rows.length; if (c.rows.length < ROWS) rows[c.rows.length] = plain('UPGRADES', up, up ? AMBER : TEXT);
    }
    view.footB = line(engineeringFooter(c), DIM);
    return view;
  }
  if (con.kind === 'weapons') {
    const c = con;
    view.selector = weaponsStrip(c).map((s) => ({ text: s.text, tint: s.lit ? AMBER : s.match ? GOOD : DIM }));
    const vis = weaponsRowTexts(c).slice(c.first, c.first + c.rows), lootLine = weaponsLootLine(c);
    for (let k = 1; k < 7; k++) {
      if (lootLine && k === 6) { rows[k] = plain(lootLine, false, c.loot.some((l) => l.charge >= 1 && !l.empty) ? TEXT : DIM); continue; }   // the extra slots' charges above the footer
      const t = vis[k - 1], on = k - 1 === c.cursor - c.first;
      if (t !== undefined) rows[k] = plain(t, on, on ? AMBER : t.startsWith('SWAP') ? BLUE : TEXT);
    }
    const ready = c.charge >= 1 || c.torpedo.loaded, [a, b] = weaponsFooterLines(c), tone = weaponsFooterTone(c);
    view.footA = line(a, ready ? GOOD : TEXT); view.footB = line(b, tone === 'hit' ? GOOD : tone === 'miss' ? TEXT : tone === 'plain' ? DIM : AMBER);
    view.bar = { fill: c.charge, colour: c.charge >= 1 ? GOOD : BAR_ON };
    return view;
  }
  if (con.kind === 'science') {
    const c = con;
    const all = [...c.targets.map((t) => ({ text: targetRowText(t, t.scan), tint: TEXT })), { text: c.system.text, tint: c.system.enabled ? BLUE : DIM }, ...c.system.results.map((text) => ({ text, tint: text.startsWith('Hidden ship') ? WARN : text.startsWith('No ') ? DIM : GOOD }))];
    all.slice(c.first, c.first + SCIENCE_ROWS).slice(0, ROWS - 1).forEach((t, k) => { const on = k === c.cursor - c.first; rows[k] = plain(t.text, on, on ? (k + c.first === c.targets.length && c.system.enabled ? BLUE_LIT : AMBER) : t.tint); });
    view.footA = line(scienceFooter(c), TEXT);
    return view;
  }
  if (con.kind === 'navigation') {
    const c = con;
    for (let k = 0; k < ROWS - 1; k++) { const row = c.rows[c.first + k]; if (row) rows[k] = plain(row.text, row.cursor, row.text === 'EVADING' ? AMBER : !row.selectable ? DIM : !row.enabled ? DIM : row.blue ? (row.cursor ? BLUE_LIT : BLUE) : row.cursor ? AMBER : TEXT); }
    const [a, b] = navigationFooterLines(c);
    view.footA = line(a, c.jump.ready ? GOOD : TEXT); view.footB = line(b, DIM);
    return view;
  }
  if (con.kind === 'doors') {
    const c = con;
    const lines = c.item === null ? [{ text: 'No doors', tint: DIM }]
      : [{ text: c.item, tint: AMBER }, { text: c.status, tint: c.status === 'AIRLOCK OPEN' ? WARN : DIM }, { text: c.action ? `Confirm: ${c.action}` : 'Doors offline', tint: c.action ? TEXT : WARN }];
    lines.forEach((l, k) => { rows[k] = plain(l.text, false, l.tint); });
    view.footB = line(c.item !== null && c.openAirlocks > 0 ? `Open airlocks: ${c.openAirlocks}` : '', WARN);
  }
  return view;
}
