import { Container, Graphics, BitmapText, AnimatedSprite, type Texture } from 'pixi.js';
import { drawIcon } from './roomIcons';
import { WINDOW, SHIP_MARGIN, type EnemyWindowView, type Rect } from './enemyWindowModel';
import { ENEMY_LAYOUT, ENEMY_TILE } from './enemyShipLayout';
import { EnemyRoom } from '../sim/enemy';

/** The enemy ship window layer (spec Demo-viii section 2): draws an EnemyWindowView. Every display object is made once; a frame only clears and redraws Graphics, moves sprites and sets text. */
/** `x` (UI round 2b final review): the window's left edge on the stage (enemyWindowX(stage)); WINDOW.x when left out. */
export interface EnemyWindowLayer { container: Container; draw(view: EnemyWindowView, shown: boolean, dt: number, hitFlash: { room: number | 'hull'; alpha: number } | null, x?: number): void; reset(): void }
export interface EnemyWindowOptions { fontFamily: string; fire: { textures: Texture[]; fps: number } | null; panel: ((w: number, h: number) => Container) | null }

import { TEXT, DIM, WARN, AMBER, GOOD, FONT_SIZE, BAR_OFF, CELL_EDGE, PANEL_FILL, PANEL_ALPHA, PANEL_BORDER, PANEL_BORDER_W, PANEL_INNER } from './theme';
import { ROLE } from './palette';   // the door colours are palette roles (Art-i spec section 4)
const FAINT = CELL_EDGE;
const PANEL = 0x10131a, HULL = 0x3b4352, HULL_EDGE = 0x22262f, FLOOR = 0x5d6675, FLOOR_DAMAGED = 0x7a6a52, FLOOR_DOWN = 0x7a2a2a, FLOOR_ION = 0x2f5f9a, ION_TEXT = 0x8fd0ff, WALL = 0x14171d;
const SHIELD = 0x6fc3ff, RETICLE = AMBER, CREW = 0xc0396b, CREW_HEAD = 0xf0c8a0, FLAME = 0xff8c1a, FLAME_CORE = 0xffd060, HOLE = 0x05060a;
const FIRE_PER_ROOM = 2, PIECE_COUNT = 5;

/** Which side of each room is outer hull, for the breach hole: Weapons left (the bow), Engines right, Shields bottom, Piloting top, Hold top. */
const HOLE_SIDE: readonly ('top' | 'bottom' | 'left' | 'right')[] = ['left', 'right', 'bottom', 'top', 'top'];
/** Under the ship: the charge bar, then two text lines (spec Demo-x-c section 3). */
const CHARGE_Y = 288, STATUS_Y = 292, PROBLEM_Y = 314;

/** A themed panel (spec Demo-x-c section 1): the dark fill, a 2 px border and a 1 px inner highlight. */
function drawPanel(g: Graphics, x: number, y: number, w: number, h: number): Graphics {
  const b = PANEL_BORDER_W;
  g.rect(x, y, w, h).fill({ color: PANEL_FILL, alpha: PANEL_ALPHA });
  g.rect(x + b / 2, y + b / 2, w - b, h - b).stroke({ width: b, color: PANEL_BORDER });
  g.rect(x + b + 0.5, y + b + 0.5, w - 2 * b - 1, h - 2 * b - 1).stroke({ width: 1, color: PANEL_INNER });
  return g;
}

export function createEnemyWindowLayer(opts: EnemyWindowOptions): EnemyWindowLayer {
  const container = new Container(); container.visible = false;
  const frame = opts.panel ? opts.panel(WINDOW.w, WINDOW.h) : drawPanel(new Graphics(), 0, 0, WINDOW.w, WINDOW.h);   // the themed panel (spec Demo-x-c section 1)
  container.addChild(frame);
  const clip = new Graphics(); clip.rect(2, 2, WINDOW.w - 4, WINDOW.h - 4).fill(0xffffff);   // amendment R4: the break-up pieces and the fly-out stay inside the frame
  const content = new Container(); content.mask = clip; container.addChild(clip, content);
  const back = new Graphics(), ship = new Container(), shipG = new Graphics(), fires = new Container(), crewG = new Graphics(), over = new Graphics();
  ship.addChild(shipG, fires, crewG);
  content.addChild(back, ship, over);
  const mk = (tint: number): BitmapText => { const t = new BitmapText({ text: '', style: { fontFamily: opts.fontFamily, fontSize: FONT_SIZE } }); t.tint = tint; t.roundPixels = true; return t; };
  const freq = mk(TEXT); freq.anchor.set(1, 0); freq.position.set(WINDOW.w - SHIP_MARGIN, -4);
  const status = mk(TEXT); status.position.set(SHIP_MARGIN, STATUS_Y);
  const problem = mk(WARN); problem.position.set(SHIP_MARGIN, PROBLEM_Y);
  const title = mk(RETICLE); title.anchor.set(1, 0); title.position.set(WINDOW.w - SHIP_MARGIN, STATUS_Y);   // the ship's name, right of the status line (spec Loop-iv section 2)
  const repair = [0, 1, 2, 3].map(() => { const t = mk(WARN); t.anchor.set(0.5, 0.5); ship.addChild(t); return t; });
  content.addChild(freq, status, problem, title);
  const flames: (AnimatedSprite | null)[] = Array.from({ length: ENEMY_LAYOUT.rooms.length * FIRE_PER_ROOM }, () => {
    if (!opts.fire) return null;
    const s = new AnimatedSprite(opts.fire.textures); s.animationSpeed = opts.fire.fps / 60; s.loop = true; s.width = ENEMY_TILE; s.height = ENEMY_TILE; s.visible = false; s.play(); fires.addChild(s); return s;
  });
  let clock = 0;

  function brackets(g: Graphics, r: Rect, pad: number, color: number): void {
    const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad, l = 10, st = { width: 3, color };
    g.moveTo(x0, y0 + l).lineTo(x0, y0).lineTo(x0 + l, y0).stroke(st); g.moveTo(x1 - l, y0).lineTo(x1, y0).lineTo(x1, y0 + l).stroke(st);
    g.moveTo(x0, y1 - l).lineTo(x0, y1).lineTo(x0 + l, y1).stroke(st); g.moveTo(x1 - l, y1).lineTo(x1, y1).lineTo(x1, y1 - l).stroke(st);
  }
  function shieldGlyph(g: Graphics, cx: number, cy: number, s: number, color: number): void {
    g.poly([cx, cy - 0.45 * s, cx + 0.38 * s, cy - 0.3 * s, cx + 0.32 * s, cy + 0.12 * s, cx, cy + 0.45 * s, cx - 0.32 * s, cy + 0.12 * s, cx - 0.38 * s, cy - 0.3 * s], true).stroke({ width: 2, color });
    g.moveTo(cx, cy - 0.25 * s).lineTo(cx, cy + 0.25 * s).stroke({ width: 2, color });
  }
  /** A rotated rectangle as a polygon (the break-up pieces). */
  function piece(g: Graphics, r: Rect, dx: number, dy: number, rot: number, color: number, alpha: number): void {
    const cx = r.x + r.w / 2 + dx, cy = r.y + r.h / 2 + dy, c = Math.cos(rot), s = Math.sin(rot), hw = r.w / 2, hh = r.h / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].flatMap(([x, y]) => [cx + x! * c - y! * s, cy + x! * s + y! * c]);
    g.poly(pts).fill({ color, alpha }).stroke({ width: 2, color: HULL_EDGE, alpha });
  }

  function drawShip(view: EnemyWindowView, hitFlash: { room: number | 'hull'; alpha: number } | null): void {
    const g = shipG, sr = view.ship;
    // the hull: every room padded by 5 px, a pointed bow left of Weapons, two engine nacelles right of Engines
    const wr = view.rooms[EnemyRoom.Weapons]!.rect, er = view.rooms[EnemyRoom.Engines]!.rect;
    g.poly([wr.x + 8, wr.y - 5, sr.x - 14, wr.y + wr.h / 2, wr.x + 8, wr.y + wr.h + 5]).fill(HULL).stroke({ width: 2, color: HULL_EDGE });
    for (const y of [er.y + 12, er.y + er.h - 30]) { g.rect(er.x + er.w + 3, y, 9, 18).fill(HULL_EDGE); g.rect(er.x + er.w + 12, y + 3, 5 + Math.round(3 * Math.abs(Math.sin(clock * 9))), 12).fill({ color: FLAME, alpha: 0.85 }); }
    for (const r of view.rooms) g.rect(r.rect.x - 5, r.rect.y - 5, r.rect.w + 10, r.rect.h + 10).fill(HULL);
    const sh = view.rooms[EnemyRoom.Shields]!.rect, ho = view.rooms[EnemyRoom.Hold]!.rect;
    g.rect(ho.x - 5, ho.y + ho.h, ho.w + 10, sh.y - ho.y - ho.h).fill(HULL);   // the keel between the Hold and Shields: no see-through slot
    view.rooms.forEach((r, k) => {
      const rect = r.rect, flash = hitFlash && (hitFlash.room === k || hitFlash.room === 'hull') ? hitFlash.alpha : 0;
      g.rect(rect.x, rect.y, rect.w, rect.h).fill(r.tint === 'down' ? FLOOR_DOWN : r.tint === 'ion' ? FLOOR_ION : r.tint === 'damaged' ? FLOOR_DAMAGED : FLOOR).stroke({ width: 2, color: WALL });
      for (let tx = 1; tx < rect.w / ENEMY_TILE; tx++) g.moveTo(rect.x + tx * ENEMY_TILE, rect.y + 1).lineTo(rect.x + tx * ENEMY_TILE, rect.y + rect.h - 1).stroke({ width: 1, color: WALL, alpha: 0.18 });
      for (let ty = 1; ty < rect.h / ENEMY_TILE; ty++) g.moveTo(rect.x + 1, rect.y + ty * ENEMY_TILE).lineTo(rect.x + rect.w - 1, rect.y + ty * ENEMY_TILE).stroke({ width: 1, color: WALL, alpha: 0.18 });
      if (flash > 0) g.rect(rect.x, rect.y, rect.w, rect.h).fill({ color: WARN, alpha: 0.6 * flash });
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2 - (r.hp !== null ? 4 : 0), gc = r.tint === 'down' ? WARN : TEXT;
      if (r.glyph === 'weapons') drawIcon(g, 'weapons', cx, cy, 24, gc);
      else if (r.glyph === 'engines') drawIcon(g, 'engineering', cx, cy, 24, gc);
      else if (r.glyph === 'shields') shieldGlyph(g, cx, cy, 24, gc);
      else if (r.glyph === 'piloting') drawIcon(g, 'navigation', cx, cy, 24, gc);
      if (r.hp !== null) { const w = rect.w - 16; g.rect(rect.x + 8, rect.y + rect.h - 10, w, 5).fill(WALL); g.rect(rect.x + 8, rect.y + rect.h - 10, w * Math.max(0, Math.min(1, r.hp)), 5).fill(r.hp > 0.5 ? 0x7ad07a : r.hp > 0 ? 0xe0c040 : WARN); }
      if (r.breach) {   // a dark hole in the outer wall with specks blowing out
        const side = HOLE_SIDE[k]!, hx = side === 'left' ? rect.x : side === 'right' ? rect.x + rect.w : cx, hy = side === 'top' ? rect.y : side === 'bottom' ? rect.y + rect.h : rect.y + rect.h / 2;
        const horiz = side === 'top' || side === 'bottom';
        g.ellipse(hx, hy, horiz ? 10 : 6, horiz ? 6 : 10).fill(HOLE).stroke({ width: 1, color: 0x8a8f9a });
        for (let p = 0; p < 3; p++) { const a = ((clock * 1.7 + p / 3) % 1), d = 6 + a * 14; const ox = side === 'left' ? -d : side === 'right' ? d : (p - 1) * 4, oy = side === 'top' ? -d : side === 'bottom' ? d : (p - 1) * 4; g.rect(hx + ox - 1, hy + oy - 1, 2, 2).fill({ color: DIM, alpha: 1 - a }); }
      }
    });
    for (const d of ENEMY_LAYOUT.doors) { const x = sr.x + (d.x + 1) * ENEMY_TILE - 3, y = sr.y + d.y * ENEMY_TILE + 4, h = (ENEMY_TILE - 8) / 2; g.rect(x, y, 6, h).fill(ROLE.doorFill).stroke({ width: 1, color: ROLE.doorOutline }); g.rect(x, y + h, 6, h).fill(ROLE.doorFill).stroke({ width: 1, color: ROLE.doorOutline }); }   // FTL-style doors on the shared wall (spec Demo-x-c section 2)
    for (const c of ENEMY_LAYOUT.consoles) g.rect(sr.x + c.x * ENEMY_TILE + 8, sr.y + c.y * ENEMY_TILE + 4, ENEMY_TILE - 16, 7).fill(0x2b3240).stroke({ width: 1, color: 0x8fb4d0 });
  }

  function drawFires(view: EnemyWindowView): void {
    let n = 0;
    view.rooms.forEach((r, k) => {
      for (let j = 0; j < FIRE_PER_ROOM; j++) {
        const s = flames[k * FIRE_PER_ROOM + j] ?? null, on = r.fire;
        const x = r.rect.x + (j === 0 ? 2 : r.rect.w - ENEMY_TILE - 2), y = r.rect.y + (j === 0 ? 2 : r.rect.h - ENEMY_TILE - 2);
        if (s) { s.visible = on; if (on) s.position.set(x, y); }
        else if (on) { const f = 0.8 + 0.2 * Math.sin(clock * 12 + n); shipG.poly([x + 6, y + 29, x + 16, y + 29 - 26 * f, x + 26, y + 29]).fill({ color: FLAME, alpha: 0.9 }); shipG.poly([x + 11, y + 29, x + 16, y + 29 - 15 * f, x + 21, y + 29]).fill(FLAME_CORE); }
        n++;
      }
    });
  }

  function drawCrew(view: EnemyWindowView): void {
    crewG.clear();
    view.crew.forEach((c, k) => {
      const bob = c.working ? Math.round(Math.sin(clock * 14 + k * 2)) : 0;   // typing furiously
      crewG.circle(c.x, c.y + 2, 7).fill(CREW).stroke({ width: 1, color: 0x3a0f22 });
      crewG.circle(c.x, c.y - 6 + bob, 4).fill(CREW_HEAD);
    });
  }

  return {
    container,
    reset() { container.visible = false; clock = 0; },
    draw(view, shown, dt, hitFlash, x = WINDOW.x) {
      clock += dt;
      container.visible = shown && view.visible;
      if (!container.visible) { for (const f of flames) if (f) f.visible = false; return; }
      container.position.set(x + view.slideX, WINDOW.y);
      back.clear(); shipG.clear(); over.clear();
      const destroyed = view.phase === 'destroyed', t = view.t;
      ship.position.set(0, view.shipDY);
      ship.visible = !destroyed;
      for (const tx of repair) tx.visible = false;
      if (!destroyed) {
        drawShip(view, hitFlash); drawFires(view); drawCrew(view);
        view.rooms.forEach((r, k) => { const secs = r.repairIn ?? r.ionIn; if (k < repair.length && secs !== null) { const tx = repair[k]!; tx.text = `${secs}s`; tx.tint = r.repairIn !== null ? WARN : ION_TEXT; tx.position.set(r.rect.x + r.rect.w / 2, r.rect.y + 12); tx.visible = true; } });   // the repair countdown, or an ion disable's seconds in blue (spec Loop-iii section 4)
      } else {   // the break-up: five drifting pieces with bursts, fading over BREAK_SECONDS
        for (const f of flames) if (f) f.visible = false;
        const a = Math.max(0, 1 - t * t);
        view.rooms.forEach((r, k) => {
          const ang = (k / PIECE_COUNT) * Math.PI * 2 + 0.7, d = 70 * t;
          piece(back, { x: r.rect.x - 4, y: r.rect.y - 4, w: r.rect.w + 8, h: r.rect.h + 8 }, Math.cos(ang) * d, Math.sin(ang) * d, (k % 2 ? 1 : -1) * t * 1.4, r.tint === 'down' ? FLOOR_DOWN : HULL, a);
          const bx = r.rect.x + r.rect.w / 2 + Math.cos(ang) * d * 0.6, by = r.rect.y + r.rect.h / 2 + Math.sin(ang) * d * 0.6, br = 6 + 22 * t;
          back.circle(bx, by, br).fill({ color: FLAME, alpha: 0.5 * (1 - t) }); back.circle(bx, by, br * 0.5).fill({ color: FLAME_CORE, alpha: 0.7 * (1 - t) });
        });
      }
      // shield layers round the ship (none while the system is down; none after the kill)
      if (!destroyed && !view.shield.down) {
        const cx = view.ship.x + view.ship.w / 2, cy = view.ship.y + view.ship.h / 2 + view.shipDY;
        for (let k = 0; k < view.shield.max; k++) over.ellipse(cx, cy, view.ship.w / 2 + 8 + 6 * k, view.ship.h / 2 + 8 + 6 * k).stroke({ width: 2, color: k < view.shield.layers ? SHIELD : FAINT, alpha: k < view.shield.layers ? 0.85 : 0.35 });
        if (view.shield.flash) over.ellipse(cx, cy, view.ship.w / 2 + 8, view.ship.h / 2 + 8).fill({ color: SHIELD, alpha: 0.18 + 0.12 * Math.sin(clock * 40) });
      }
      // hull pips along the top, the frequency beside them
      for (let k = 0; k < view.hullPips.total; k++) over.rect(SHIP_MARGIN + k * 18, 8, 16, 10).fill(k < view.hullPips.lit ? (view.hullPips.lit <= 3 ? WARN : 0x7ad07a) : WALL).stroke({ width: 1, color: FAINT });
      freq.text = view.frequency ?? '';
      // the weapon charge along the bottom, red past 80%; hidden while the enemy weapons are down
      if (view.charge !== null && !destroyed) { const w = WINDOW.w - 2 * SHIP_MARGIN; over.rect(SHIP_MARGIN, CHARGE_Y, w, 4).fill(BAR_OFF); over.rect(SHIP_MARGIN, CHARGE_Y, w * Math.max(0, Math.min(1, view.charge)), 4).fill(view.charge >= 0.8 ? WARN : TEXT); }
      status.text = view.status; status.tint = view.status === 'ENEMY' ? TEXT : WARN;
      if (view.shot) { problem.text = view.shot.text; problem.tint = view.shot.tone === 'hit' ? GOOD : view.shot.tone === 'strip' ? AMBER : TEXT; }   // the last shot's result for three seconds in place of the problem line (spec Demo-xiv section 2)
      else { problem.text = view.problem ?? ''; problem.tint = WARN; }
      title.text = view.title ?? '';
      if (view.reticle) brackets(over, view.rooms[view.reticle.room]!.rect, 3, RETICLE);
    }
  };
}
