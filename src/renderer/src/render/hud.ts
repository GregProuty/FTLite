import { Container, Graphics, Sprite, BitmapText, NineSliceSprite } from 'pixi.js';
import { INTERNAL_W, INTERNAL_H } from '../../../shared/resolution';
import type { GameAssets } from './assets';
import { glyphName, clockLine, sectorLine, navigationFooter, scienceFooter, engineeringFooter, targetRowText, targetWindow, WEAPONS_ROWS, SCIENCE_ROWS, type HudModel, type HudPlayer } from './hudModel';
import { drawIcon, tintColor } from './roomIcons';
import { createMapPanel } from './mapPanel';
import { featureReady } from './fallback';
import type { IconKind, IconTint } from './roomIconModel';
import { STATION_NAMES } from '../sim/stationKinds';
import { SKILL_NAMES } from '../sim/skills';
import { STATION_MAX, STATION_OVERDRIVE, UPGRADE_MAX } from '../sim/tuning';

const TEXT = 0xe8e8e8, DIM = 0x9aa0ad, FAINT = 0x5a606c, WARN = 0xff6b5a, CALL = 0xffd75a;   // CALL: a row asked for by a Power callout (spec Coop-i section 3)
const LINE = 18;                 // px per text line at 16 px m5x7
const CREDITS_LINES = 22;

/** HUD art is drawn at 1x (16 px font, 16 px glyphs and icons); the stage's integer letterbox scale does the rest. */
export function createHud(parent: Container, assets: GameAssets) {
  const missing = new Set(assets.missing);
  const glyphs = featureReady(missing, 'glyphs'), icons = featureReady(missing, 'icons');
  const text = (size = 16, tint = TEXT): BitmapText => { const t = new BitmapText({ text: '', style: { fontFamily: assets.fontFamily, fontSize: size } }); t.tint = tint; t.roundPixels = true; return t; };
  const panel = (x: number, y: number, w: number, h: number): NineSliceSprite => {
    const n = assets.nineSlice('ui.panel');
    const p = new NineSliceSprite({ texture: n.texture, leftWidth: n.left, topHeight: n.top, rightWidth: n.right, bottomHeight: n.bottom });
    p.width = w; p.height = h; p.position.set(x, y); return p;
  };
  const icon = (name: string | null): Sprite | null => (name && icons && assets.has(name)) ? new Sprite(assets.texture(name)) : null;
  const bar = (w: number): { root: Container; set(frac: number): void } => {
    const root = new Container(); const bg = new Sprite(assets.texture('ui.bar.bg')); bg.width = w; bg.height = 6; const fill = new Sprite(assets.texture('ui.bar.fill')); fill.height = 6;
    root.addChild(bg, fill);
    return { root, set(frac) { fill.width = Math.max(0, Math.min(1, frac)) * w; fill.visible = frac > 0; } };
  };

  const CELL = 7, CELL_STEP = CELL + 2, MAX_CELLS = Math.max(...STATION_MAX) + UPGRADE_MAX + STATION_OVERDRIVE;   // cells per row: the largest station maximum plus the bought levels and the overdrive cell (spec Loop-ii section 1)
  const STATUS_X = 112 + MAX_CELLS * CELL_STEP + 4, COOLANT_X = STATUS_X + 34;
  const cellRow = (withGlyph = false): { root: Container; set(o: { icon?: IconKind; iconTint?: IconTint; name: string; level: number; max: number; status: string; cursor: boolean; tint: number; failed?: boolean; heat?: number; coolant?: number; cols?: [string, string] }): void } => {
    const root = new Container();
    const mark = text(16, TEXT); mark.text = '>'; mark.visible = false; root.addChild(mark);
    const name = text(); name.position.set(withGlyph ? 26 : 12, 1); root.addChild(name);
    const glyph = new Graphics(); glyph.position.set(12 + 6, 10); root.addChild(glyph); let glyphKey = '';
    const cells = Array.from({ length: MAX_CELLS }, (_, c) => { const sp = new Sprite(assets.texture('ui.bar.bg')); sp.width = CELL; sp.height = CELL; sp.position.set(112 + c * CELL_STEP, 4); root.addChild(sp); return sp; });
    const heatBg = new Sprite(assets.texture('ui.bar.bg')); heatBg.position.set(112, 14); heatBg.width = MAX_CELLS * CELL_STEP - 2; heatBg.height = 2; heatBg.visible = false; root.addChild(heatBg);
    const heatFill = new Sprite(assets.texture('ui.bar.fill')); heatFill.position.set(112, 14); heatFill.height = 2; heatFill.tint = WARN; heatFill.visible = false; root.addChild(heatFill);
    const status = text(16, WARN); status.position.set(STATUS_X, 1); root.addChild(status);
    const coolant = text(16, DIM); coolant.position.set(COOLANT_X, 1); root.addChild(coolant);
    const colA = text(); colA.position.set(124, 1); root.addChild(colA); const colB = text(); colB.position.set(212, 1); root.addChild(colB);   // the Upgrades page's level and price columns
    return {
      root,
      set(o) {
        mark.visible = o.cursor; name.text = o.name; name.tint = o.tint;
        const gk = o.icon ?? ''; if (gk !== glyphKey) { glyphKey = gk; glyph.clear(); if (o.icon) drawIcon(glyph, o.icon, 0, 0, 12, 0xffffff); }
        glyph.tint = tintColor(o.iconTint ?? 'normal'); glyph.visible = !!o.icon;
        const shown = Math.max(o.max, o.level);
        cells.forEach((sp, c) => { sp.visible = c < shown; sp.texture = assets.texture(c < o.level ? 'ui.bar.fill' : 'ui.bar.bg'); sp.width = CELL; sp.height = CELL; sp.tint = o.failed || c >= o.max ? WARN : 0xffffff; });   // failed stations and the overdrive cell tint their cells
        const heat = o.heat ?? 0;
        heatBg.visible = heat > 0; heatFill.visible = heat > 0; heatFill.width = Math.max(0, Math.min(1, heat)) * heatBg.width;
        status.text = o.status; status.tint = o.status === 'OFF' || o.status === 'FAIL' ? WARN : DIM;   // occupant tags are informational, not warnings
        coolant.text = o.coolant ? `C${o.coolant}` : '';
        colA.text = o.cols?.[0] ?? ''; colB.text = o.cols?.[1] ?? ''; colA.tint = o.tint; colB.tint = o.tint;
      }
    };
  };

  // Top-left: hull and clock. Top-right: threats. Centre: banner. Bottom: four player blocks. Overlay: credits.
  parent.addChild(panel(8, 8, 240, 96));   // four lines: hull, clock and fuel; sector and node (spec Loop-i section 2); director; the ship quirk
  const top = text(); top.position.set(16, 18); parent.addChild(top);
  const sectorText = text(); sectorText.position.set(16, 36); parent.addChild(sectorText);
  const directorLine = text(16, DIM); directorLine.position.set(16, 54); parent.addChild(directorLine);
  const quirkLine = text(16, DIM); quirkLine.position.set(16, 72); parent.addChild(quirkLine);
  const mapPanel = createMapPanel(assets.fontFamily); mapPanel.root.position.set(INTERNAL_W - 248, 220); parent.addChild(mapPanel.root);   // spec Ship-and-map section 5: the band above the ship, between the clock and enemy panels
  parent.addChild(panel(INTERNAL_W - 248, 8, 240, 100));
  const threatRows = Array.from({ length: 4 }, (_, i) => { const row = new Container(); row.position.set(INTERNAL_W - 240, 16 + i * LINE); parent.addChild(row); return row; });
  parent.addChild(panel(8, 110, 240, 8 * LINE + 12));
  const powerTitle = text(); powerTitle.position.set(16, 116); parent.addChild(powerTitle);
  const powerRows = Array.from({ length: 7 }, (_, i) => { const r = cellRow(true); r.root.position.set(16, 116 + (i + 1) * LINE); parent.addChild(r.root); return r; });
  const banner = text(16); banner.scale.set(2); banner.anchor.set(0.5, 0); banner.position.set(INTERNAL_W / 2, 24); parent.addChild(banner);
  const progressLine = text(16, DIM); progressLine.anchor.set(0.5, 0); progressLine.position.set(INTERNAL_W / 2, 84); parent.addChild(progressLine);   // under the banner and its glyph row
  const noticeRows = [0, 1].map((k) => { const t = text(16, DIM); t.anchor.set(0.5, 0); t.position.set(INTERNAL_W / 2, 14 + k * LINE); t.visible = false; parent.addChild(t); return t; });   // spec Demo-i section 4: two lines top-centre between the clock and threat panels, running only
  const bannerGlyphs = new Container(); bannerGlyphs.position.set(INTERNAL_W / 2, 64); parent.addChild(bannerGlyphs);
  const summaryBack = new Graphics(); summaryBack.visible = false; parent.addChild(summaryBack);   // a dark backing so the game-over summary reads over the ship (Coop-i visual check)
  const summaryRows = Array.from({ length: 12 }, (_, k) => { const t = text(16, DIM); t.anchor.set(0.5, 0); t.position.set(INTERNAL_W / 2, 104 + k * LINE); t.visible = false; parent.addChild(t); return t; });

  const players = [0, 1, 2, 3].map((i) => {
    const x = 8 + i * 316, y = 626;
    parent.addChild(panel(x, y, 308, 90));
    const root = new Container(); root.position.set(x + 8, y + 8); parent.addChild(root);
    const name = text(); const hp = bar(96); hp.root.position.set(110, 2);
    const vote = text(16, CALL); vote.position.set(236, 0);   // spec Coop-ii section 3: the player's vote, right of the health bar and the oxygen icon
    const oxygen = icon('icon.oxygen'); if (oxygen) { oxygen.position.set(210, 0); oxygen.visible = false; root.addChild(oxygen); }
    const line2 = new Container(); line2.position.set(0, LINE);
    const line3 = new Container(); line3.position.set(0, LINE * 2);
    const line4 = new Container(); line4.position.set(0, LINE * 3);
    const progress = bar(216); progress.root.position.set(0, LINE * 4 - 1); progress.root.visible = false;   // under line 4, not across it (Coop-i visual check)
    root.addChild(name, hp.root, vote, line2, line3, line4, progress.root);
    const consoleRoot = new Container(); consoleRoot.position.set(x, y - (8 * LINE + 16)); consoleRoot.visible = false; parent.addChild(consoleRoot);
    const consolePanel = panel(0, 0, 308, 8 * LINE + 12); consoleRoot.addChild(consolePanel);
    const consoleRows = Array.from({ length: 8 }, (_, i) => { const r = cellRow(); r.root.position.set(8, 6 + i * LINE); consoleRoot.addChild(r.root); return r; });   // seven rows; the Engineering card uses an eighth (UPGRADES, spec Loop-ii section 2)
    const consoleSelector = new Container(); consoleSelector.position.set(8, 6); consoleSelector.visible = false; consoleRoot.addChild(consoleSelector);
    const consoleFooter = new Container(); consoleFooter.position.set(8, 6 + 7 * LINE); consoleRoot.addChild(consoleFooter);
    const consoleBar = bar(216); consoleBar.root.position.set(8, 6 + 7 * LINE + 14); consoleBar.root.visible = false; consoleRoot.addChild(consoleBar.root);   // a 2 px strip under the footer text: the Weapons footer now spans the row
    for (const c of consoleBar.root.children) (c as Sprite).height = 2;
    /** Size the card for 7 or 8 rows: it grows upward from the player block, the footer and strip follow the last row. */
    const sizeCard = (rows: number) => { consolePanel.height = (rows + 1) * LINE + 12; consoleRoot.position.y = y - ((rows + 1) * LINE + 16); consoleFooter.position.y = 6 + rows * LINE; consoleBar.root.position.y = 6 + rows * LINE + 14; };
    return { name, vote, hp, oxygen, line2, line3, line4, progress, consoleRoot, consoleRows, consoleSelector, consoleFooter, consoleBar, sizeCard };
  });

  const overlay = new Container(); overlay.visible = false;
  overlay.addChild(panel(40, 40, INTERNAL_W - 80, INTERNAL_H - 80));
  const creditLines = Array.from({ length: CREDITS_LINES }, (_, i) => { const t = text(); t.position.set(56, 56 + i * LINE); overlay.addChild(t); return t; });
  const creditsFooter = text(16, DIM); creditsFooter.position.set(56, INTERNAL_H - 64); creditsFooter.text = 'Up/Down: scroll    Confirm or Cancel: close'; overlay.addChild(creditsFooter);
  parent.addChild(overlay);

  /** Rebuild a row as [glyph] [icon] text, left to right. Rows are rebuilt only when their text key changes. */
  const rowKeys = new WeakMap<Container, string>();
  function fillRow(row: Container, parts: { glyph?: string | null; icon?: string | null; text: string; tint?: number }[]): void {
    const key = JSON.stringify(parts);
    if (rowKeys.get(row) === key) return;
    rowKeys.set(row, key);
    for (const c of row.removeChildren()) c.destroy();   // destroys the text/sprite objects, not the shared textures
    let x = 0;
    for (const p of parts) {
      if (!p.text && !p.glyph) continue;
      if (p.glyph && glyphs && assets.has(p.glyph)) { const g = new Sprite(assets.texture(p.glyph)); g.position.set(x, 0); row.addChild(g); x += 20; }
      const ic = icon(p.icon ?? null); if (ic) { ic.position.set(x, 0); row.addChild(ic); x += 20; }
      const t = text(16, p.tint ?? TEXT); t.text = p.text; t.position.set(x, 1); row.addChild(t); x += Math.ceil(t.width) + 12;
    }
  }

  let flashOn = new Set<number>();   // station kinds lit this frame by a Power callout: blinking at about 3 Hz for its 3 s
  function updatePlayer(ui: (typeof players)[number], p: HudPlayer, i: number, phase: HudModel['phase']): void {
    if (p.status === 'empty') { ui.name.text = `P${i + 1}: press Interact to join`; ui.name.tint = DIM; ui.vote.text = ''; ui.hp.root.visible = false; fillRow(ui.line2, []); fillRow(ui.line3, []); fillRow(ui.line4, []); ui.progress.root.visible = false; ui.consoleRoot.visible = false; if (ui.oxygen) ui.oxygen.visible = false; return; }
    if (p.status === 'reconnect') { ui.name.text = `P${i + 1}: RECONNECT`; ui.name.tint = WARN; ui.vote.text = ''; ui.hp.root.visible = false; fillRow(ui.line2, []); fillRow(ui.line3, []); fillRow(ui.line4, []); ui.progress.root.visible = false; ui.consoleRoot.visible = false; if (ui.oxygen) ui.oxygen.visible = false; return; }
    if (phase === 'lobby') {
      ui.name.text = `P${i + 1}  ${p.character.name}`; ui.vote.text = ''; ui.name.tint = TEXT; ui.hp.root.visible = false;
      fillRow(ui.line2, [{ text: p.character.asset && p.character.complication ? `${p.character.asset} / ${p.character.complication}` : '', tint: DIM }]); fillRow(ui.line3, []); fillRow(ui.line4, []);
      ui.progress.root.visible = false; ui.consoleRoot.visible = false; if (ui.oxygen) ui.oxygen.visible = false; return;
    }
    ui.name.text = `P${i + 1}  HP ${Math.ceil(p.health)}`; ui.name.tint = TEXT; ui.vote.text = p.vote;
    ui.hp.root.visible = true; ui.hp.set(p.health / 100);
    if (ui.oxygen) ui.oxygen.visible = p.lowOxygen;
    if (p.lifeText) { fillRow(ui.line2, [{ text: p.lifeText, tint: WARN }]); fillRow(ui.line3, []); }
    else if (p.seated !== null) {
      fillRow(ui.line2, [{ text: STATION_NAMES[p.seated]!, tint: DIM }]);
      fillRow(ui.line3, [{ glyph: glyphName('cancel', p.deviceKind), text: p.cancelPrompt }]);
    } else {
      fillRow(ui.line2, p.interactPrompt || !p.carrying ? [{ glyph: p.interactPrompt ? glyphName('interact', p.deviceKind) : null, icon: p.interactIcon, text: p.interactPrompt }] : [{ text: 'Carrying a torpedo', tint: DIM }]);   // spec Coop-ii section 2
      fillRow(ui.line3, [{ glyph: p.confirmPrompt ? glyphName('confirm', p.deviceKind) : null, icon: p.confirmIcon, text: p.confirmPrompt }]);
    }
    fillRow(ui.line4, [{ text: `${p.character.name}  ${SKILL_NAMES.map((n, k) => `${n[0]}${p.skills[k]}`).join(' ')}`, tint: DIM }]);
    ui.consoleRoot.visible = p.console !== null;
    ui.consoleBar.root.visible = false; ui.consoleSelector.visible = false;
    const engineering = !!p.console && 'rows' in p.console && !('kind' in p.console);
    ui.sizeCard(engineering ? 8 : 7);
    if (p.console && 'rows' in p.console && !('kind' in p.console)) {   // the Navigation panel now has rows too
      const c = p.console;
      if (c.page === 1) {   // the Upgrades page (spec Loop-ii section 2): kinds, Reactor, BACK; price columns; the scrap footer
        ui.consoleRows.forEach((r, k) => { const u = c.upgrades[k]; r.root.visible = !!u; if (u) r.set({ name: u.name, level: 0, max: 0, status: '', cursor: u.cursor, tint: u.cursor ? TEXT : u.enabled ? DIM : FAINT, cols: [u.level, u.price] }); });
      } else {
        c.rows.forEach((r, k) => ui.consoleRows[k]!.set({ name: r.name, level: r.level, max: r.max, status: r.failed ? 'FAIL' : r.unpowered ? 'OFF' : '', failed: r.failed, cursor: k === c.cursor, tint: flashOn.has(r.kind) ? CALL : k === c.cursor ? TEXT : DIM, heat: r.heat, coolant: r.coolant }));
        const up = c.cursor === c.rows.length; ui.consoleRows[c.rows.length]!.set({ name: 'UPGRADES', level: 0, max: 0, status: '', cursor: up, tint: up ? TEXT : DIM });
        ui.consoleRows.forEach((r) => { r.root.visible = true; });
      }
      fillRow(ui.consoleFooter, [{ text: engineeringFooter(c), tint: DIM }]);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'weapons') {
      const c = p.console;
      fillRow(ui.consoleSelector, ['Beam F1', 'F2', 'F3', 'Torp'].map((label, n) => ({ text: label, tint: n === c.selector ? TEXT : DIM })));
      ui.consoleSelector.visible = true;
      const vis = c.targets.slice(c.first, c.first + WEAPONS_ROWS);
      ui.consoleRows.forEach((r, k) => {
        const t = k >= 1 ? vis[k - 1] : undefined;
        r.root.visible = !!t;
        if (t) r.set({ name: targetRowText(t), level: 0, max: 0, status: '', cursor: k - 1 === c.cursor - c.first, tint: k - 1 === c.cursor - c.first ? TEXT : DIM });
      });
      fillRow(ui.consoleFooter, [
        { text: c.charge >= 1 ? 'Beam READY' : `Beam ${Math.floor(c.charge * 100)}%`, tint: c.charge >= 1 ? TEXT : DIM },
        { text: c.torpedo.loaded ? 'Torp LOADED' : c.torpedo.fed ? `Torp ${Math.floor(c.torpedo.load * 100)}%` : c.torpedo.fetch ? (c.torpedo.stock > 0 ? 'Torp FETCH' : 'Torp EMPTY') : c.torpedo.stock > 0 ? `Torp ${Math.floor(c.torpedo.load * 100)}%` : 'Torp EMPTY', tint: c.torpedo.loaded ? TEXT : DIM },
        { text: `Stock ${c.torpedo.stock}/${c.torpedo.cap}`, tint: DIM },
        { text: c.locked ? 'LOCKED' : '', tint: TEXT }   // a Science lock runs: any beam is tuned (spec Coop-i section 1)
      ]);
      ui.consoleBar.root.visible = true; ui.consoleBar.set(c.charge);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'science') {
      const c = p.console;
      const vis = c.targets.slice(c.first, c.first + SCIENCE_ROWS);
      ui.consoleRows.forEach((r, k) => {
        const t = vis[k];
        r.root.visible = !!t;
        if (t) r.set({ name: targetRowText(t, t.scan), level: 0, max: 0, status: '', cursor: k === c.cursor - c.first, tint: k === c.cursor - c.first ? TEXT : DIM });
      });
      fillRow(ui.consoleFooter, [{ text: scienceFooter(c), tint: TEXT }]);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'navigation') {
      const c = p.console;   // spec 7: event, shop or destination rows in a seven-row window, the cursor row lit, the footer carries evade and the jump state
      ui.consoleRows.forEach((r, k) => { const row = c.rows[c.first + k]; r.root.visible = !!row; if (row) r.set({ name: row.text, level: 0, max: 0, status: '', cursor: row.cursor, tint: row.text === 'EVADING' ? CALL : !row.selectable ? DIM : !row.enabled ? (row.text.startsWith('EVADE ') ? DIM : FAINT) : row.cursor ? TEXT : DIM }); });
      fillRow(ui.consoleFooter, [{ text: navigationFooter(c), tint: TEXT }]);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'doors') {
      const c = p.console;   // spec Demo-vii section 1: the selection, its state (WARN while an airlock is open) and the Confirm action on three rows; the footer counts open airlocks
      const lines = c.item === null ? [{ text: 'No doors', tint: DIM }]
        : [{ text: c.item, tint: TEXT }, { text: c.status, tint: c.status === 'AIRLOCK OPEN' ? WARN : DIM }, { text: c.action ? `Confirm: ${c.action}` : 'Doors offline', tint: c.action ? TEXT : WARN }];
      ui.consoleRows.forEach((r, k) => { const l = lines[k]; r.root.visible = !!l; if (l) r.set({ name: l.text, level: 0, max: 0, status: '', cursor: false, tint: l.tint }); });
      fillRow(ui.consoleFooter, [{ text: c.item !== null && c.openAirlocks > 0 ? `Open airlocks: ${c.openAirlocks}` : '', tint: WARN }]);
    } else if (p.console) {
      ui.consoleRows.forEach((r) => { r.root.visible = false; });
      fillRow(ui.consoleFooter, []);
    }
    if (!engineering) ui.consoleRows[7]!.root.visible = false;   // the eighth row is Engineering's alone
    ui.progress.root.visible = p.progress > 0; ui.progress.set(p.progress);
  }

  return {
    update(m: HudModel): void {
      top.text = clockLine(m); sectorText.text = sectorLine(m);
      mapPanel.update(m.phase === 'running' ? m.map : null);
      directorLine.text = `${m.director.phase}  stress ${Math.round(m.director.stress * 100)}%`; quirkLine.text = m.run.quirk ? `Ship: ${m.run.quirk}` : '';
      threatRows.forEach((row, i) => { const t = m.threats[i]; fillRow(row, t ? [{ icon: t.icon, text: t.text, tint: WARN }] : []); });
      powerTitle.text = `POWER ${m.power.used}/${m.power.capacity}`;
      flashOn = new Set(Math.floor(m.tick / 10) % 2 === 0 ? m.calloutFlash : []);
      for (let k = 0; k < 7; k++) {
        const st = m.stations.find((s) => s.kind === k);
        if (st) powerRows[k]!.set({ icon: st.icon, iconTint: st.iconTint, name: st.name, level: st.level, max: st.max, status: st.online ? (st.occupant !== null ? `P${st.occupant + 1}` : '') : 'OFF', cursor: flashOn.has(k), tint: flashOn.has(k) ? CALL : st.online ? TEXT : WARN, heat: st.heat, coolant: st.coolant });
        powerRows[k]!.root.visible = !!st;
      }
      banner.text = m.message; banner.visible = m.phase !== 'running'; noticeRows.forEach((t, k) => { const line = m.phase === 'running' ? m.notice[k] : undefined; t.visible = !!line; t.text = line ?? ''; });
      progressLine.text = m.progressLine; progressLine.visible = !!m.progressLine;
      // Cancel (and Confirm) glyphs appear only with the lobby and game-over banners, for the first joined player's device.
      const first = m.players.find((p) => p.status === 'active');
      const showBannerGlyphs = (m.phase === 'lobby' || m.phase === 'gameover') && !!first?.deviceKind;
      fillRow(bannerGlyphs, showBannerGlyphs ? [{ glyph: glyphName('confirm', first!.deviceKind), text: 'Confirm' }, { glyph: glyphName('cancel', first!.deviceKind), text: 'Cancel' }] : []);
      bannerGlyphs.position.x = INTERNAL_W / 2 - bannerGlyphs.width / 2;
      // The lobby card takes rows 2-11 (rows 0-1 hidden; row 8 is the callout line, spec Coop-i section 3; rows 9-11 the co-op lines, Coop-ii); the game-over summary keeps rows 0-11 (spec Demo-i section 3).
      summaryRows.forEach((t, k) => { const line = m.phase === 'lobby' ? m.lobbyLines[k - 2] : m.summary?.[k]; t.visible = !!line; t.text = line ?? ''; });
      const shown = summaryRows.filter((t) => t.visible), wide = Math.max(0, ...shown.map((t) => Math.ceil(t.width)));
      summaryBack.visible = m.phase === 'gameover' && shown.length > 0;
      if (summaryBack.visible) summaryBack.clear().rect(INTERNAL_W / 2 - wide / 2 - 12, 98, wide + 24, m.summary!.length * LINE + 12).fill({ color: 0x05060a, alpha: 0.88 });
      m.players.forEach((p, i) => updatePlayer(players[i]!, p, i, m.phase));
      overlay.visible = m.credits !== null;
      if (m.credits) creditLines.forEach((t, i) => { t.text = m.credits![m.creditsScroll + i] ?? ''; });
    }
  };
}
