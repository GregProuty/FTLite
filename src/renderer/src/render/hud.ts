import { Container, Sprite, BitmapText, NineSliceSprite } from 'pixi.js';
import { INTERNAL_W, INTERNAL_H } from '../../../shared/resolution';
import type { GameAssets } from './assets';
import { glyphName, type HudModel, type HudPlayer } from './hudModel';
import { featureReady } from './fallback';
import { STATION_NAMES } from '../sim/stationKinds';
import { STATION_MAX, COOLANT_POOL } from '../sim/tuning';

const TEXT = 0xe8e8e8, DIM = 0x9aa0ad, WARN = 0xff6b5a;
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
    const root = new Container(); const bg = new Sprite(assets.texture('ui.bar.bg')); bg.width = w; const fill = new Sprite(assets.texture('ui.bar.fill'));
    root.addChild(bg, fill);
    return { root, set(frac) { fill.width = Math.max(0, Math.min(1, frac)) * w; fill.visible = frac > 0; } };
  };

  const CELL = 8, MAX_CELLS = Math.max(...STATION_MAX) + 1;   // cells per row: the largest station maximum plus the overdrive cell
  const cellRow = (): { root: Container; set(o: { name: string; level: number; max: number; status: string; cursor: boolean; tint: number; failed?: boolean; heat?: number; coolant?: number }): void } => {
    const root = new Container();
    const mark = text(16, TEXT); mark.text = '>'; mark.visible = false; root.addChild(mark);
    const name = text(); name.position.set(12, 1); root.addChild(name);
    const cells = Array.from({ length: MAX_CELLS }, (_, c) => { const sp = new Sprite(assets.texture('ui.bar.bg')); sp.width = CELL; sp.height = CELL; sp.position.set(112 + c * (CELL + 2), 4); root.addChild(sp); return sp; });
    const heatBg = new Sprite(assets.texture('ui.bar.bg')); heatBg.position.set(112, 14); heatBg.width = MAX_CELLS * (CELL + 2) - 2; heatBg.height = 2; heatBg.visible = false; root.addChild(heatBg);
    const heatFill = new Sprite(assets.texture('ui.bar.fill')); heatFill.position.set(112, 14); heatFill.height = 2; heatFill.tint = WARN; heatFill.visible = false; root.addChild(heatFill);
    const status = text(16, WARN); status.position.set(150, 1); root.addChild(status);
    const coolant = text(16, DIM); coolant.position.set(196, 1); root.addChild(coolant);
    return {
      root,
      set(o) {
        mark.visible = o.cursor; name.text = o.name; name.tint = o.tint;
        const shown = Math.max(o.max, o.level);
        cells.forEach((sp, c) => { sp.visible = c < shown; sp.texture = assets.texture(c < o.level ? 'ui.bar.fill' : 'ui.bar.bg'); sp.width = CELL; sp.height = CELL; sp.tint = o.failed || c >= o.max ? WARN : 0xffffff; });   // failed stations and the overdrive cell tint their cells
        const heat = o.heat ?? 0;
        heatBg.visible = heat > 0; heatFill.visible = heat > 0; heatFill.width = Math.max(0, Math.min(1, heat)) * heatBg.width;
        status.text = o.status; status.tint = o.status === 'OFF' || o.status === 'FAIL' ? WARN : DIM;   // occupant tags are informational, not warnings
        coolant.text = o.coolant ? `C${o.coolant}` : '';
      }
    };
  };

  // Top-left: hull and clock. Top-right: threats. Centre: banner. Bottom: four player blocks. Overlay: credits.
  parent.addChild(panel(4, 4, 200, 40));
  const top = text(); top.position.set(12, 14); parent.addChild(top);
  parent.addChild(panel(INTERNAL_W - 232, 4, 228, 100));
  const threatRows = Array.from({ length: 4 }, (_, i) => { const row = new Container(); row.position.set(INTERNAL_W - 224, 12 + i * LINE); parent.addChild(row); return row; });
  parent.addChild(panel(INTERNAL_W - 232, 108, 228, 8 * LINE + 12));
  const powerTitle = text(); powerTitle.position.set(INTERNAL_W - 224, 114); parent.addChild(powerTitle);
  const powerRows = Array.from({ length: 7 }, (_, i) => { const r = cellRow(); r.root.position.set(INTERNAL_W - 224, 114 + (i + 1) * LINE); parent.addChild(r.root); return r; });
  const banner = text(16); banner.scale.set(2); banner.anchor.set(0.5, 0); banner.position.set(INTERNAL_W / 2, 24); parent.addChild(banner);
  const bannerGlyphs = new Container(); bannerGlyphs.position.set(INTERNAL_W / 2, 64); parent.addChild(bannerGlyphs);

  const players = [0, 1, 2, 3].map((i) => {
    const x = 4 + i * 238, y = INTERNAL_H - 94;
    parent.addChild(panel(x, y, 234, 90));
    const root = new Container(); root.position.set(x + 8, y + 8); parent.addChild(root);
    const name = text(); const hp = bar(96); hp.root.position.set(110, 2);
    const oxygen = icon('icon.oxygen'); if (oxygen) { oxygen.position.set(210, 0); oxygen.visible = false; root.addChild(oxygen); }
    const line2 = new Container(); line2.position.set(0, LINE);
    const line3 = new Container(); line3.position.set(0, LINE * 2);
    const line4 = new Container(); line4.position.set(0, LINE * 3);
    const progress = bar(216); progress.root.position.set(0, LINE * 4 - 6); progress.root.visible = false;
    root.addChild(name, hp.root, line2, line3, line4, progress.root);
    const consoleRoot = new Container(); consoleRoot.position.set(x, y - (8 * LINE + 16)); consoleRoot.visible = false; parent.addChild(consoleRoot);
    consoleRoot.addChild(panel(0, 0, 234, 8 * LINE + 12));
    const consoleRows = Array.from({ length: 7 }, (_, i) => { const r = cellRow(); r.root.position.set(8, 6 + i * LINE); consoleRoot.addChild(r.root); return r; });
    const consoleSelector = new Container(); consoleSelector.position.set(8, 6); consoleSelector.visible = false; consoleRoot.addChild(consoleSelector);
    const consoleFooter = new Container(); consoleFooter.position.set(8, 6 + 7 * LINE); consoleRoot.addChild(consoleFooter);
    const consoleBar = bar(216); consoleBar.root.position.set(8, 6 + 7 * LINE + 14); consoleBar.root.visible = false; consoleRoot.addChild(consoleBar.root);   // a 2 px strip under the footer text: the Weapons footer now spans the row
    for (const c of consoleBar.root.children) (c as Sprite).height = 2;
    return { name, hp, oxygen, line2, line3, line4, progress, consoleRoot, consoleRows, consoleSelector, consoleFooter, consoleBar };
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

  function updatePlayer(ui: (typeof players)[number], p: HudPlayer, i: number): void {
    if (p.status === 'empty') { ui.name.text = `P${i + 1}: press Interact to join`; ui.name.tint = DIM; ui.hp.root.visible = false; fillRow(ui.line2, []); fillRow(ui.line3, []); fillRow(ui.line4, []); ui.progress.root.visible = false; ui.consoleRoot.visible = false; if (ui.oxygen) ui.oxygen.visible = false; return; }
    if (p.status === 'reconnect') { ui.name.text = `P${i + 1}: RECONNECT`; ui.name.tint = WARN; ui.hp.root.visible = false; fillRow(ui.line2, []); fillRow(ui.line3, []); fillRow(ui.line4, []); ui.progress.root.visible = false; ui.consoleRoot.visible = false; if (ui.oxygen) ui.oxygen.visible = false; return; }
    ui.name.text = `P${i + 1}  HP ${Math.ceil(p.health)}`; ui.name.tint = TEXT;
    ui.hp.root.visible = true; ui.hp.set(p.health / 100);
    if (ui.oxygen) ui.oxygen.visible = p.lowOxygen;
    if (p.lifeText) { fillRow(ui.line2, [{ text: p.lifeText, tint: WARN }]); fillRow(ui.line3, []); }
    else if (p.seated !== null) {
      fillRow(ui.line2, [{ text: STATION_NAMES[p.seated]!, tint: DIM }]);
      fillRow(ui.line3, [{ glyph: glyphName('cancel', p.deviceKind), text: p.cancelPrompt }]);
    } else {
      fillRow(ui.line2, [{ glyph: p.interactPrompt ? glyphName('interact', p.deviceKind) : null, icon: p.interactIcon, text: p.interactPrompt }]);
      fillRow(ui.line3, [{ glyph: p.confirmPrompt ? glyphName('confirm', p.deviceKind) : null, icon: p.confirmIcon, text: p.confirmPrompt }]);
    }
    fillRow(ui.line4, [{ text: ['N', 'E', 'W', 'S', 'C', 'R'].map((l, k) => `${l}${p.skills[k]}`).join(' '), tint: DIM }]);
    ui.consoleRoot.visible = p.console !== null;
    ui.consoleBar.root.visible = false; ui.consoleSelector.visible = false;
    if (p.console && 'rows' in p.console) {
      const c = p.console;
      c.rows.forEach((r, k) => ui.consoleRows[k]!.set({ name: r.name, level: r.level, max: r.max, status: r.failed ? 'FAIL' : '', failed: r.failed, cursor: k === c.cursor, tint: k === c.cursor ? TEXT : DIM, heat: r.heat, coolant: r.coolant }));
      ui.consoleRows.forEach((r) => { r.root.visible = true; });
      fillRow(ui.consoleFooter, [{ text: `pool ${c.pool}   coolant ${c.coolantFree}/${COOLANT_POOL}`, tint: DIM }]);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'weapons') {
      const c = p.console;
      fillRow(ui.consoleSelector, ['Beam F1', 'F2', 'F3', 'Torp'].map((label, n) => ({ text: label, tint: n === c.selector ? TEXT : DIM })));
      ui.consoleSelector.visible = true;
      ui.consoleRows.forEach((r, k) => {
        const t = k >= 1 ? c.targets[k - 1] : undefined;
        r.root.visible = !!t;
        if (t) r.set({ name: `${t.room} ${t.eta}s F${t.frequency ?? '?'}`, level: 0, max: 0, status: '', cursor: k - 1 === c.cursor, tint: k - 1 === c.cursor ? TEXT : DIM });
      });
      fillRow(ui.consoleFooter, [
        { text: c.charge >= 1 ? 'Beam READY' : `Beam ${Math.floor(c.charge * 100)}%`, tint: c.charge >= 1 ? TEXT : DIM },
        { text: c.torpedo.loaded ? 'Torp LOADED' : c.torpedo.stock > 0 ? `Torp ${Math.floor(c.torpedo.load * 100)}%` : 'Torp EMPTY', tint: c.torpedo.loaded ? TEXT : DIM },
        { text: `Stock ${c.torpedo.stock}/${c.torpedo.cap}`, tint: DIM }
      ]);
      ui.consoleBar.root.visible = true; ui.consoleBar.set(c.charge);
    } else if (p.console && 'kind' in p.console && p.console.kind === 'science') {
      const c = p.console;
      ui.consoleRows.forEach((r, k) => {
        const t = c.targets[k];
        r.root.visible = !!t;
        if (t) r.set({ name: `${t.room} ${t.eta}s F${t.frequency ?? '?'}${t.frequency === null && t.scan > 0 ? ` ${Math.floor(t.scan * 100)}%` : ''}`, level: 0, max: 0, status: '', cursor: k === c.cursor, tint: k === c.cursor ? TEXT : DIM });
      });
      fillRow(ui.consoleFooter, [{ text: `Lead ${Math.round(c.leadSeconds)}s${c.scanning ? '   Scanning' : ''}`, tint: TEXT }]);
    } else if (p.console && 'kind' in p.console) {
      ui.consoleRows.forEach((r) => { r.root.visible = false; });
      const text = `Evade ${Math.round(p.console.evadeChance * 100)}%`;
      fillRow(ui.consoleFooter, [{ text, tint: TEXT }]);
    } else if (p.console) {
      ui.consoleRows.forEach((r) => { r.root.visible = false; });
      fillRow(ui.consoleFooter, [{ text: 'rooms' in p.console ? `Door ${p.console.rooms[0]} - ${p.console.rooms[1]}` : 'No doors', tint: TEXT }]);
    }
    ui.progress.root.visible = p.progress > 0; ui.progress.set(p.progress);
  }

  return {
    update(m: HudModel): void {
      top.text = `HULL ${Math.round(m.hull)}   TIME ${m.simSeconds}s`;
      threatRows.forEach((row, i) => { const t = m.threats[i]; fillRow(row, t ? [{ icon: t.icon, text: t.text, tint: WARN }] : []); });
      powerTitle.text = `POWER ${m.power.used}/${m.power.capacity}`;
      for (let k = 0; k < 7; k++) {
        const st = m.stations.find((s) => s.kind === k);
        if (st) powerRows[k]!.set({ name: st.name, level: st.level, max: st.max, status: st.online ? (st.occupant !== null ? `P${st.occupant + 1}` : '') : 'OFF', cursor: false, tint: st.online ? TEXT : WARN, heat: st.heat, coolant: st.coolant });
        powerRows[k]!.root.visible = !!st;
      }
      banner.text = m.message;
      // Cancel (and Confirm) glyphs appear only with the lobby and game-over banners, for the first joined player's device.
      const first = m.players.find((p) => p.status === 'active');
      const showBannerGlyphs = (m.phase === 'lobby' || m.phase === 'gameover') && !!first?.deviceKind;
      fillRow(bannerGlyphs, showBannerGlyphs ? [{ glyph: glyphName('confirm', first!.deviceKind), text: 'Confirm' }, { glyph: glyphName('cancel', first!.deviceKind), text: 'Cancel' }] : []);
      bannerGlyphs.position.x = INTERNAL_W / 2 - bannerGlyphs.width / 2;
      m.players.forEach((p, i) => updatePlayer(players[i]!, p, i));
      overlay.visible = m.credits !== null;
      if (m.credits) creditLines.forEach((t, i) => { t.text = m.credits![m.creditsScroll + i] ?? ''; });
    }
  };
}
