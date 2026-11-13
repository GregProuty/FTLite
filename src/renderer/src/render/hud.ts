import { Container, Graphics, Sprite, BitmapText } from 'pixi.js';
import { INTERNAL_W } from '../../../shared/resolution';
import type { GameAssets } from './assets';
import { glyphName, clockLine, sectorLine, timeLine, directorText, navigationFooterLines, scienceFooter, engineeringFooter, targetRowText, weaponsStrip, weaponsFooterLines, weaponsLootLine, weaponsRowTexts, tabLabel, skillsLine, SCIENCE_ROWS, STATION_SHORT, type HudModel, type HudPlayer } from './hudModel';
import { drawIcon, tintColor } from './roomIcons';
import { createMapPanel } from './mapPanel';
import { featureReady } from './fallback';
import type { IconKind, IconTint } from './roomIconModel';
import { STATION_NAMES } from '../sim/stationKinds';
import { STATION_MAX, STATION_OVERDRIVE, UPGRADE_MAX } from '../sim/tuning';
import { makePanel } from './panel';
import { WINDOW } from './enemyWindowModel';
import { TEXT, DIM, AMBER, WARN, GOOD, BLUE, BLUE_LIT, SELECT_BG, BAR_ON, BAR_OFF, CELL_EDGE, BAR_FAIL, RULE, BACKDROP, BACKDROP_ALPHA, FONT_NATIVE, TEXT_SCALE, TITLE_SCALE, LINE, PAD, ROW_GAP, ROW_GLYPH } from './theme';
import { CLOCK, POWER, THREATS, THREAT_ROWS, blockRect, cardRect, POWER_ROW, CARD_ROW, BLOCK_HP_X, BLOCK_HP_W, BLOCK_O2_X, NOTICE, NOTICE_X, EVENT_CARD, SUMMARY_TOP, SUMMARY_W, BANNER_Y, BANNER_GLYPHS_Y, PROGRESS_Y, CREDITS, CREDITS_LINES, type CellColumns } from './hudLayout';

/** The HUD (spec Demo-x-c section 1, FTL's logic): dark themed panels, the m5x7 font at twice its native size, amber for headings and the selected row. Positions come from hudLayout, colours and sizes from theme. */
export function createHud(parent: Container, assets: GameAssets) {
  const missing = new Set(assets.missing);
  const glyphs = featureReady(missing, 'glyphs'), icons = featureReady(missing, 'icons');
  const text = (tint = TEXT, scale = TEXT_SCALE): BitmapText => { const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: FONT_NATIVE * scale } }); t.tint = tint; t.roundPixels = true; return t; };
  const panel = (x: number, y: number, w: number, h: number) => makePanel(x, y, w, h);
  const icon = (name: string | null): Sprite | null => (name && icons && assets.has(name)) ? new Sprite(assets.texture(name)) : null;
  /** A horizontal bar (health, progress, charge): dark track, coloured fill. */
  const bar = (w: number, h: number): { root: Graphics; set(frac: number, color?: number): void } => {
    const root = new Graphics();
    return { root, set(frac, color = BAR_ON) { const f = Math.max(0, Math.min(1, frac)); root.clear().rect(0, 0, w, h).fill(BAR_OFF); if (f > 0) root.rect(0, 0, Math.round(f * w), h).fill(color); } };
  };

  const MAX_CELLS = Math.max(...STATION_MAX) + UPGRADE_MAX + STATION_OVERDRIVE;   // cells per row: the largest station maximum plus the bought levels and the overdrive cell (spec Loop-ii section 1)
  type RowSet = { icon?: IconKind; iconTint?: IconTint; name: string; level: number; max: number; status: string; cursor: boolean; tint: number; failed?: boolean; heat?: number; coolant?: number; cols?: [string, string] };
  /** One row: the selected row's dark amber bar, an optional station glyph, the name, the power cells with the heat strip, the status and coolant; or the Upgrades page's two columns. */
  const cellRow = (c: CellColumns): { root: Container; set(o: RowSet): void } => {
    const root = new Container();
    const sel = new Graphics().rect(-4, 3, c.width + 8, LINE).fill(SELECT_BG); sel.visible = false; root.addChild(sel);
    const glyph = new Graphics(); glyph.position.set(8, 15); root.addChild(glyph); let glyphKey = '';
    const name = text(); name.position.set(c.nameX, 0); root.addChild(name);
    const cells = new Graphics(); root.addChild(cells); let cellKey = '';
    const status = text(WARN); status.position.set(c.statusX, 0); root.addChild(status);
    const coolant = text(DIM); coolant.position.set(c.coolantX, 0); root.addChild(coolant);
    const colA = text(); colA.position.set(c.colAX, 0); root.addChild(colA); const colB = text(); colB.position.set(c.colBX, 0); root.addChild(colB);   // the Upgrades page's level and price columns
    return {
      root,
      set(o) {
        sel.visible = o.cursor; name.text = o.name; name.tint = o.tint;
        const gk = c.glyph ? o.icon ?? '' : ''; if (gk !== glyphKey) { glyphKey = gk; glyph.clear(); if (gk) drawIcon(glyph, gk as IconKind, 0, 0, 16, 0xffffff); }
        glyph.tint = tintColor(o.iconTint ?? 'normal'); glyph.visible = !!gk;
        const shown = Math.max(o.max, o.level), heat = Math.max(0, Math.min(1, o.heat ?? 0));
        const ck = `${shown},${o.level},${o.max},${o.failed ? 1 : 0},${heat.toFixed(3)}`;
        if (ck !== cellKey) {   // cells: green on, dark off, red on a failed station; the overdrive cell past the maximum amber (spec Demo-x-c section 1)
          cellKey = ck; cells.clear();
          for (let k = 0; k < shown; k++) { const off = !o.failed && k >= o.level; cells.rect(c.cellsX + k * c.step, 8, c.cell, 14).fill(o.failed ? BAR_FAIL : off ? BAR_OFF : k >= o.max ? AMBER : BAR_ON); if (off) cells.rect(c.cellsX + k * c.step + 0.5, 8.5, c.cell - 1, 13).stroke({ width: 1, color: CELL_EDGE }); }
          if (heat > 0) { const w = MAX_CELLS * c.step - 2; cells.rect(c.cellsX, 23, w, 2).fill(BAR_OFF).rect(c.cellsX, 23, Math.round(heat * w), 2).fill(WARN); }
        }
        status.text = o.status; status.tint = o.status === 'OFF' || o.status === 'FAIL' ? WARN : DIM;   // occupant tags are informational, not warnings
        coolant.text = o.coolant ? `C${o.coolant}` : '';
        colA.text = o.cols?.[0] ?? ''; colB.text = o.cols?.[1] ?? ''; colA.tint = o.tint; colB.tint = o.tint;
      }
    };
  };

  /** Rebuild a row as [glyph] [icon] text, left to right (theme rowPx measures the same layout). Rows are rebuilt only when their key changes. */
  const rowKeys = new WeakMap<Container, string>();
  function fillRow(row: Container, parts: { glyph?: string | null; icon?: string | null; text: string; tint?: number }[], gap = ROW_GAP): void {
    const key = JSON.stringify(parts);
    if (rowKeys.get(row) === key) return;
    rowKeys.set(row, key);
    for (const c of row.removeChildren()) c.destroy();   // destroys the text/sprite objects, not the shared textures
    let x = 0;
    for (const p of parts) {
      if (!p.text && !p.glyph) continue;
      if (p.glyph && glyphs && assets.has(p.glyph)) { const g = new Sprite(assets.texture(p.glyph)); g.position.set(x, 7); row.addChild(g); x += ROW_GLYPH; }
      const ic = icon(p.icon ?? null); if (ic) { ic.position.set(x, 7); row.addChild(ic); x += ROW_GLYPH; }
      const t = text(p.tint ?? TEXT); t.text = p.text; t.position.set(x, 0); row.addChild(t); x += Math.ceil(t.width) + gap;
    }
  }

  const side = new Container(); parent.addChild(side);   // the clock, power and threat panels: hidden behind the lobby and game-over cards, whose banner spans the screen
  // The left column: the clock card over the power panel. The right column: the threats panel (the map and the enemy window below it).
  side.addChild(panel(CLOCK.x, CLOCK.y, CLOCK.w, CLOCK.h).g);
  const clockRows = [TEXT, TEXT, DIM, DIM, DIM].map((tint, k) => { const t = text(tint); t.position.set(CLOCK.x + PAD, CLOCK.y + k * LINE); side.addChild(t); return t; });
  const mapPanel = createMapPanel(assets.fontFamily); mapPanel.root.position.set(WINDOW.x, WINDOW.y); parent.addChild(mapPanel.root);   // the right column's window slot while a navigator sits (spec Demo-viii amendment R1, Demo-x-c section 3)
  side.addChild(panel(THREATS.x, THREATS.y, THREATS.w, THREATS.h).g);
  const threatRows = Array.from({ length: THREAT_ROWS }, (_, i) => { const row = new Container(); row.position.set(THREATS.x + PAD, THREATS.y + i * LINE); side.addChild(row); return row; });
  side.addChild(panel(POWER.x, POWER.y, POWER.w, POWER.h).g);
  const powerTitle = text(AMBER); powerTitle.position.set(POWER.x + PAD, POWER.y); side.addChild(powerTitle);
  const powerRows = Array.from({ length: 7 }, (_, i) => { const r = cellRow(POWER_ROW); r.root.position.set(POWER.x + PAD, POWER.y + (i + 1) * LINE); side.addChild(r.root); return r; });
  const summaryBack = new Graphics(); summaryBack.visible = false; parent.addChild(summaryBack);   // a dark backing so the lobby card and the game-over summary read over the ship (Coop-i visual check)
  const banner = text(TEXT, TITLE_SCALE); banner.anchor.set(0.5, 0); banner.position.set(INTERNAL_W / 2, BANNER_Y); parent.addChild(banner);
  const progressLine = text(DIM); progressLine.anchor.set(0.5, 0); progressLine.position.set(INTERNAL_W / 2, PROGRESS_Y); parent.addChild(progressLine);   // under the banner and its glyph row
  const noticeRows = [AMBER, TEXT].map((tint, k) => { const t = text(tint); t.anchor.set(0.5, 0); t.position.set(NOTICE_X, NOTICE.y + k * LINE); t.visible = false; parent.addChild(t); return t; });   // spec Demo-i section 4: two lines top-centre between the clock and threat panels, running only
  const bannerGlyphs = new Container(); bannerGlyphs.position.set(INTERNAL_W / 2, BANNER_GLYPHS_Y); parent.addChild(bannerGlyphs);
  const summaryRows = Array.from({ length: 12 }, (_, k) => { const t = text(DIM); t.anchor.set(0.5, 0); t.position.set(INTERNAL_W / 2, SUMMARY_TOP + k * LINE); t.visible = false; parent.addChild(t); return t; });

  const players = [0, 1, 2, 3].map((i) => {
    const b = blockRect(i);
    parent.addChild(panel(b.x, b.y, b.w, b.h).g);
    const root = new Container(); root.position.set(b.x + PAD, b.y); parent.addChild(root);
    const name = text(); const hp = bar(BLOCK_HP_W, 10); hp.root.position.set(BLOCK_HP_X, 10);
    const oxygen = icon('icon.oxygen'); if (oxygen) { oxygen.position.set(BLOCK_O2_X, 7); oxygen.visible = false; root.addChild(oxygen); }
    const line2 = new Container(); line2.position.set(0, LINE);
    const line3 = new Container(); line3.position.set(0, LINE * 2);
    const line4 = new Container(); line4.position.set(0, LINE * 3);
    const progress = bar(b.w - 2 * PAD, 3); progress.root.position.set(0, LINE * 4 - 3); progress.root.visible = false;   // along the block's bottom edge, under line 4
    root.addChild(name, hp.root, line2, line3, line4, progress.root);
    const consoleRoot = new Container(); consoleRoot.visible = false; parent.addChild(consoleRoot);
    const consolePanel = panel(0, 0, 10, 10); consoleRoot.addChild(consolePanel.g);
    const consoleTabs = new Container(); consoleTabs.position.set(PAD, 0); consoleTabs.visible = false; consoleRoot.addChild(consoleTabs);   // a console group's tab bar on the top line (spec Demo-x-a section 1)
    const tabRule = new Graphics(); tabRule.visible = false; consoleRoot.addChild(tabRule);
    const body = new Container(); body.position.x = PAD; consoleRoot.addChild(body);   // the card's lines, below the tab bar when there is one
    const consoleRows = Array.from({ length: 8 }, (_, k) => { const r = cellRow(CARD_ROW); r.root.position.set(0, k * LINE); body.addChild(r.root); return r; });   // seven rows; the Engineering card uses an eighth (UPGRADES, spec Loop-ii section 2)
    const consoleSelector = new Container(); consoleSelector.visible = false; body.addChild(consoleSelector);
    const footers = [7, 8].map((k) => { const f = new Container(); f.position.set(0, k * LINE); body.addChild(f); return f; });   // the two footer lines; Engineering's single footer is the second
    const consoleBar = bar(CARD_ROW.width, 3); consoleBar.root.position.set(0, 9 * LINE + 1); consoleBar.root.visible = false; body.addChild(consoleBar.root);   // the charge strip under the footer
    let sized = '';
    /** Place and size the card for its slot, with or without the tab bar's line. */
    const sizeCard = (tabbed: boolean) => {
      const key = `${tabbed}`; if (key === sized) return; sized = key;
      const r = cardRect(i, tabbed);
      consoleRoot.position.set(r.x, r.y); consolePanel.set(0, 0, r.w, r.h);
      body.position.y = tabbed ? LINE + 2 : 0;
      consoleTabs.visible = tabbed; tabRule.visible = tabbed;
      if (tabbed) tabRule.clear().rect(PAD, LINE + 1, r.w - 2 * PAD, 1).fill({ color: RULE });
    };
    return { name, hp, oxygen, line2, line3, line4, progress, consoleRoot, consoleTabs, consoleRows, consoleSelector, footers, consoleBar, sizeCard };
  });

  // The event card (spec Demo-x-b section 2, FTL's event window): over the world band, above the seated console cards.
  const card = new Container(); card.visible = false;
  const cardBack = new Graphics(); card.addChild(cardBack);
  const cardPanel = panel(EVENT_CARD.x, EVENT_CARD.y, EVENT_CARD.w, 200); card.addChild(cardPanel.g);
  const CX = EVENT_CARD.x + 16, CW = EVENT_CARD.w - 32;
  const cardTitle = text(AMBER); cardTitle.position.set(CX, EVENT_CARD.y + 6); card.addChild(cardTitle);
  const cardText = [0, 1].map(() => { const t = text(TEXT); card.addChild(t); return t; });
  const cardChoices = [0, 1, 2].map(() => { const n = text(); const l = text(); const v = text(AMBER); v.anchor.set(1, 0); card.addChild(n, l, v); return { n, l, v }; });
  const cardStatus = text(AMBER); card.addChild(cardStatus);
  const cardHelp = text(DIM); card.addChild(cardHelp);
  parent.addChild(card);
  function updateCard(m: HudModel): void {
    const c = m.eventCard; card.visible = !!c;
    if (!c) return;
    cardTitle.text = c.title;
    let y = EVENT_CARD.y + 6 + LINE + 6;
    cardText.forEach((t, k) => { const line = c.text[k]; t.visible = !!line; t.text = line ?? ''; t.position.set(CX, y); if (line) y += LINE; });
    y += 10;
    cardChoices.forEach((row, k) => {
      const ch = c.choices[k]; row.n.visible = row.l.visible = row.v.visible = !!ch;
      if (!ch) return;
      const tint = !ch.enabled ? DIM : ch.blue ? BLUE : TEXT;
      row.n.text = ch.number; row.n.tint = tint; row.n.position.set(CX, y);
      row.l.text = ch.text; row.l.tint = tint; row.l.position.set(CX + 28, y);
      row.v.text = ch.votes.length ? `< ${ch.votes.join(' ')}` : ''; row.v.position.set(CX + CW, y);
      y += LINE + 4;
    });
    y += 6;
    cardStatus.text = c.status; cardStatus.position.set(CX, y); y += LINE;
    cardHelp.text = c.help; cardHelp.position.set(CX, y); y += LINE + 6;
    cardPanel.set(EVENT_CARD.x, EVENT_CARD.y, EVENT_CARD.w, y - EVENT_CARD.y);
    cardBack.clear().rect(EVENT_CARD.x - 6, EVENT_CARD.y - 6, EVENT_CARD.w + 12, y - EVENT_CARD.y + 12).fill({ color: BACKDROP, alpha: 0.6 });
  }

  const overlay = new Container(); overlay.visible = false;
  overlay.addChild(panel(CREDITS.x, CREDITS.y, CREDITS.w, CREDITS.h).g);
  const creditLines = Array.from({ length: CREDITS_LINES }, (_, i) => { const t = text(); t.position.set(CREDITS.x + 16, CREDITS.y + 12 + i * LINE); overlay.addChild(t); return t; });
  const creditsFooter = text(DIM); creditsFooter.position.set(CREDITS.x + 16, CREDITS.y + CREDITS.h - LINE - 8); creditsFooter.text = 'Up/Down: scroll    Confirm or Cancel: close'; overlay.addChild(creditsFooter);
  parent.addChild(overlay);

  const blank = (ui: (typeof players)[number]): void => { ui.hp.root.visible = false; fillRow(ui.line2, []); fillRow(ui.line3, []); fillRow(ui.line4, []); ui.progress.root.visible = false; ui.consoleRoot.visible = false; if (ui.oxygen) ui.oxygen.visible = false; };
  let flashOn = new Set<number>();   // station kinds lit this frame by a Power callout: blinking at about 3 Hz for its 3 s
  function updatePlayer(ui: (typeof players)[number], p: HudPlayer, i: number, phase: HudModel['phase']): void {
    if (p.status === 'empty') { ui.name.text = `P${i + 1}: press Interact to join`; ui.name.tint = DIM; blank(ui); return; }
    if (p.status === 'reconnect') { ui.name.text = `P${i + 1}: RECONNECT`; ui.name.tint = WARN; blank(ui); return; }
    if (phase === 'lobby') {
      ui.name.text = `P${i + 1}  ${p.character.name}`; ui.name.tint = AMBER; blank(ui);
      fillRow(ui.line2, [{ text: p.character.asset && p.character.complication ? `${p.character.asset} / ${p.character.complication}` : '', tint: DIM }]);
      return;
    }
    ui.name.text = `P${i + 1} ${p.character.name}`; ui.name.tint = AMBER;
    ui.hp.root.visible = true; ui.hp.set(p.health / 100, p.health > 50 ? BAR_ON : p.health > 25 ? AMBER : WARN);
    if (ui.oxygen) ui.oxygen.visible = p.lowOxygen;
    if (p.lifeText) { fillRow(ui.line2, [{ text: p.lifeText, tint: WARN }]); fillRow(ui.line3, []); }
    else if (p.seated !== null) {
      fillRow(ui.line2, [{ text: STATION_NAMES[p.seated]!, tint: DIM }]);
      fillRow(ui.line3, [{ glyph: glyphName('cancel', p.deviceKind), text: p.cancelPrompt }]);
    } else {
      fillRow(ui.line2, p.interactPrompt || !p.carrying ? [{ glyph: p.interactPrompt ? glyphName('interact', p.deviceKind) : null, icon: p.interactIcon, text: p.interactPrompt }] : [{ text: 'Carrying a torpedo', tint: DIM }]);   // spec Coop-ii section 2
      fillRow(ui.line3, [{ glyph: p.confirmPrompt ? glyphName('confirm', p.deviceKind) : null, icon: p.confirmIcon, text: p.confirmPrompt }]);
    }
    fillRow(ui.line4, p.vote ? [{ text: p.vote, tint: AMBER }] : [{ text: skillsLine(p.skills), tint: DIM }]);   // the player's vote (spec Coop-ii section 3) in place of the skills while an event is open
    ui.consoleRoot.visible = p.console !== null;
    ui.consoleBar.root.visible = false; ui.consoleSelector.visible = false;
    const engineering = !!p.console && 'rows' in p.console && !('kind' in p.console);
    ui.sizeCard(!!p.tabs);
    if (p.tabs) {   // HELM | WEAPONS: the active tab lit (amber while the stick is on the bar, marked >), an offline tab red with ! (spec Demo-x-a section 1)
      const parts = p.tabs.flatMap((t, k) => [...(k ? [{ text: '|', tint: DIM }] : []), { text: tabLabel(t, p.tabFocus), tint: t.offline ? WARN : t.active ? (p.tabFocus ? AMBER : TEXT) : DIM }]);
      fillRow(ui.consoleTabs, parts);
    }
    const [footA, footB] = ui.footers as [Container, Container];
    if (p.console && 'rows' in p.console && !('kind' in p.console)) {   // the Navigation panel now has rows too
      const c = p.console;
      if (c.page === 1) {   // the Upgrades page (spec Loop-ii section 2): kinds, Reactor, BACK; price columns; the scrap footer
        ui.consoleRows.forEach((r, k) => { const u = c.upgrades[k]; r.root.visible = !!u; if (u) r.set({ name: u.name, level: 0, max: 0, status: '', cursor: u.cursor, tint: u.cursor ? AMBER : u.enabled ? TEXT : DIM, cols: [u.level, u.price] }); });
      } else {
        c.rows.forEach((r, k) => ui.consoleRows[k]!.set({ name: r.name, level: r.level, max: r.max, status: r.failed ? 'FAIL' : r.unpowered ? 'OFF' : '', failed: r.failed, cursor: k === c.cursor, tint: flashOn.has(r.kind) || k === c.cursor ? AMBER : TEXT, heat: r.heat, coolant: r.coolant }));
        const up = c.cursor === c.rows.length; ui.consoleRows[c.rows.length]!.set({ name: 'UPGRADES', level: 0, max: 0, status: '', cursor: up, tint: up ? AMBER : TEXT });
        ui.consoleRows.forEach((r) => { r.root.visible = true; });
      }
      fillRow(footA, []); fillRow(footB, [{ text: engineeringFooter(c), tint: DIM }]);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'weapons') {
      const c = p.console;
      fillRow(ui.consoleSelector, weaponsStrip(c).map((p) => ({ text: p.text, tint: p.lit ? AMBER : DIM })));   // spec Loop-iii section 4: Pulse F1 F2 F3, the filled slots, Torp
      ui.consoleSelector.visible = true;
      const texts = weaponsRowTexts(c), vis = texts.slice(c.first, c.first + c.rows), lootLine = weaponsLootLine(c);
      ui.consoleRows.forEach((r, k) => {
        if (k === 7) { r.root.visible = false; return; }
        if (lootLine && k === 6) { r.root.visible = true; r.set({ name: lootLine, level: 0, max: 0, status: '', cursor: false, tint: c.loot.some((l) => l.charge >= 1 && !l.empty) ? TEXT : DIM }); return; }   // the extra slots' charges above the footer
        const t = k >= 1 ? vis[k - 1] : undefined, on = k - 1 === c.cursor - c.first;
        r.root.visible = t !== undefined;
        if (t !== undefined) r.set({ name: t, level: 0, max: 0, status: '', cursor: on, tint: on ? AMBER : t.startsWith('SWAP') ? BLUE : TEXT });
      });
      const ready = c.charge >= 1 || c.torpedo.loaded, [a, b] = weaponsFooterLines(c);
      fillRow(footA, [{ text: a, tint: ready ? GOOD : TEXT }]); fillRow(footB, [{ text: b, tint: c.locked ? AMBER : DIM }]);   // the Pulse Laser and the tube; the stock and LOCKED under a Science lock (spec Coop-i section 1)
      ui.consoleBar.root.visible = true; ui.consoleBar.set(c.charge, c.charge >= 1 ? GOOD : BAR_ON);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'science') {
      const c = p.console;
      const rows = [...c.targets.map((t) => ({ text: targetRowText(t, t.scan), tint: TEXT })), { text: c.system.text, tint: c.system.enabled ? BLUE : DIM }, ...c.system.results.map((text) => ({ text, tint: text.startsWith('Hidden ship') ? WARN : text.startsWith('No ') ? DIM : GOOD }))];   // the targets, the system scan row, its results (spec Demo-x-b section 3)
      const vis = rows.slice(c.first, c.first + SCIENCE_ROWS);
      ui.consoleRows.forEach((r, k) => {
        const t = vis[k], on = k === c.cursor - c.first;
        r.root.visible = !!t;
        if (t) r.set({ name: t.text, level: 0, max: 0, status: '', cursor: on, tint: on ? (k + c.first === c.targets.length && c.system.enabled ? BLUE_LIT : AMBER) : t.tint });
      });
      fillRow(footA, [{ text: scienceFooter(c), tint: TEXT }]); fillRow(footB, []);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'navigation') {
      const c = p.console;   // spec 7: event, shop or destination rows in a seven-row window, the cursor row lit, the footer carries evade and the jump state
      ui.consoleRows.forEach((r, k) => { const row = c.rows[c.first + k]; r.root.visible = !!row; if (row) r.set({ name: row.text, level: 0, max: 0, status: '', cursor: row.cursor, tint: row.text === 'EVADING' ? AMBER : !row.selectable ? DIM : !row.enabled ? DIM : row.blue ? (row.cursor ? BLUE_LIT : BLUE) : row.cursor ? AMBER : TEXT }); });
      const [a, b] = navigationFooterLines(c);
      fillRow(footA, [{ text: a, tint: c.jump.ready ? GOOD : TEXT }]); fillRow(footB, [{ text: b, tint: DIM }]);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'doors') {
      const c = p.console;   // spec Demo-vii section 1: the selection, its state (WARN while an airlock is open) and the Confirm action on three rows; the footer counts open airlocks
      const lines = c.item === null ? [{ text: 'No doors', tint: DIM }]
        : [{ text: c.item, tint: AMBER }, { text: c.status, tint: c.status === 'AIRLOCK OPEN' ? WARN : DIM }, { text: c.action ? `Confirm: ${c.action}` : 'Doors offline', tint: c.action ? TEXT : WARN }];
      ui.consoleRows.forEach((r, k) => { const l = lines[k]; r.root.visible = !!l; if (l) r.set({ name: l.text, level: 0, max: 0, status: '', cursor: false, tint: l.tint }); });
      fillRow(footA, []); fillRow(footB, [{ text: c.item !== null && c.openAirlocks > 0 ? `Open airlocks: ${c.openAirlocks}` : '', tint: WARN }]);
    } else if (p.console) {
      ui.consoleRows.forEach((r) => { r.root.visible = false; });
      fillRow(footA, []); fillRow(footB, []);
    }
    if (!engineering) ui.consoleRows[7]!.root.visible = false;   // the eighth row is Engineering's alone
    ui.progress.root.visible = p.progress > 0; ui.progress.set(p.progress, AMBER);
  }

  return {
    update(m: HudModel): void {
      side.visible = m.phase !== 'lobby' && m.phase !== 'gameover';
      [clockLine(m), sectorLine(m), timeLine(m), directorText(m), m.run.quirk].forEach((s, k) => { clockRows[k]!.text = s; });
      mapPanel.update(m.phase === 'running' ? m.map : null);
      threatRows.forEach((row, i) => { const t = m.threats[i]; fillRow(row, t ? [{ icon: t.icon, text: t.text, tint: WARN }] : []); });
      powerTitle.text = `POWER ${m.power.used}/${m.power.capacity}`;
      flashOn = new Set(Math.floor(m.tick / 10) % 2 === 0 ? m.calloutFlash : []);
      for (let k = 0; k < 7; k++) {
        const st = m.stations.find((s) => s.kind === k);
        if (st) powerRows[k]!.set({ icon: st.icon, iconTint: st.iconTint, name: STATION_SHORT[k]!, level: st.level, max: st.max, status: st.online ? (st.occupant !== null ? `P${st.occupant + 1}` : '') : 'OFF', cursor: flashOn.has(k), tint: flashOn.has(k) ? AMBER : st.online ? TEXT : WARN, heat: st.heat, coolant: st.coolant });
        powerRows[k]!.root.visible = !!st;
      }
      banner.text = m.message; banner.visible = m.phase !== 'running'; noticeRows.forEach((t, k) => { const line = m.phase === 'running' ? m.notice[k] : undefined; t.visible = !!line; t.text = line ?? ''; });
      progressLine.text = m.progressLine; progressLine.visible = !!m.progressLine;
      // Cancel (and Confirm) glyphs appear only with the lobby and game-over banners, for the first joined player's device.
      const first = m.players.find((p) => p.status === 'active');
      const showBannerGlyphs = (m.phase === 'lobby' || m.phase === 'gameover') && !!first?.deviceKind;
      fillRow(bannerGlyphs, showBannerGlyphs ? [{ glyph: glyphName('confirm', first!.deviceKind), text: 'Confirm' }, { glyph: glyphName('cancel', first!.deviceKind), text: 'Cancel' }] : []);
      bannerGlyphs.position.x = INTERNAL_W / 2 - bannerGlyphs.width / 2;
      // The lobby card takes rows 1-11 (row 0 hidden; row 1 the ship, spec Demo-x-a section 3; row 8 the callout line, spec Coop-i section 3; rows 9-11 the co-op lines, Coop-ii); the game-over summary keeps rows 0-11 (spec Demo-i section 3).
      summaryRows.forEach((t, k) => { const line = m.phase === 'lobby' ? (k === 1 ? m.lobbyShip : m.lobbyLines[k - 2]) : m.summary?.[k]; t.visible = !!line; t.text = line ?? ''; t.tint = (m.phase === 'lobby' && k === 1) || (m.phase === 'gameover' && k === 0) ? AMBER : TEXT; });
      const shown = summaryRows.filter((t) => t.visible), wide = Math.min(SUMMARY_W, Math.max(0, ...shown.map((t) => Math.ceil(t.width))));
      summaryBack.visible = (m.phase === 'gameover' || m.phase === 'lobby') && shown.length > 0;
      if (summaryBack.visible) {
        const top = SUMMARY_TOP + (m.phase === 'lobby' ? LINE : 0), bottom = SUMMARY_TOP + 12 * LINE;
        summaryBack.clear().rect(INTERNAL_W / 2 - wide / 2 - 16, top - 6, wide + 32, Math.min(bottom, SUMMARY_TOP + (m.phase === 'lobby' ? 12 : m.summary!.length) * LINE) - top + 12).fill({ color: BACKDROP, alpha: BACKDROP_ALPHA }).stroke({ width: 2, color: RULE });
      }
      m.players.forEach((p, i) => updatePlayer(players[i]!, p, i, m.phase));
      updateCard(m);
      overlay.visible = m.credits !== null;
      if (m.credits) creditLines.forEach((t, i) => { t.text = m.credits![m.creditsScroll + i] ?? ''; });
    }
  };
}
