import { Container, Graphics, BitmapText } from 'pixi.js';
import { mapTitle, type HudModel } from './hudModel';
import { drawPanel } from './panel';
import { TEXT, DIM, AMBER, FONT_SIZE, PANEL_FILL, CELL_EDGE, PAD } from './theme';

/** The map panel's size: the right column's window slot, 400 x 340 (spec Demo-x-c section 3). */
export const MAP_W = 400, MAP_H = 340;
const FLEET = 0xd83a3a, FAINT = CELL_EDGE, HOLE = PANEL_FILL;
/** Node centres: six columns across, up to four beacons stacked under the title. */
export const nodeX = (c: number): number => 36 + 65 * c;
export const nodeY = (k: number, n: number): number => 184 + (k - (n - 1) / 2) * 64;
const R = 11;
/** Three small irregular rocks (original glyph, spec Demo-viii section 1), offsets from the node centre. */
const ROCKS: readonly (readonly number[])[] = [
  [-4.5, -1.5, -2.5, -3.5, -0.5, -2, -1, 0.5, -3.5, 1],
  [1, -4, 3, -4.5, 4.5, -2.5, 3.5, -0.5, 1.5, -1.5],
  [-0.5, 1.5, 2, 0.5, 4, 2.5, 2.5, 4.5, 0, 4],
];
function drawRocks(g: Graphics, x: number, y: number, color: number): void {
  for (const r of ROCKS) g.poly(r.map((v, i) => 1.4 * v + (i % 2 === 0 ? x : y))).fill(color);
}

/** The sector map panel (spec Ship-and-map section 5), redrawn per update in the theme; the caller places `root` at the window slot. */
export function createMapPanel(fontFamily = 'm5x7'): { root: Container; update(map: HudModel['map']): void } {
  const root = new Container(); root.visible = false;
  const g = new Graphics(); root.addChild(g);
  const mk = (anchorCentre: boolean): BitmapText => { const t = new BitmapText({ text: '', style: { fontFamily, fontSize: FONT_SIZE } }); t.tint = TEXT; t.roundPixels = true; if (anchorCentre) t.anchor.set(0.5, 0.5); root.addChild(t); return t; };
  const title = mk(false); title.position.set(PAD, 0); title.tint = AMBER;
  const marks: BitmapText[] = []; for (let i = 0; i < 24; i++) { const t = mk(true); t.visible = false; marks.push(t); }
  return {
    root,
    update(map) {
      if (!map) { root.visible = false; return; }
      root.visible = true; g.clear();
      drawPanel(g, 0, 0, MAP_W, MAP_H);
      if (map.fleet >= 0) {   // the Pursuit's front: a red band across the overrun columns (spec Loop-i section 3)
        const right = Math.min(MAP_W - 2, nodeX(map.fleet) + 30);
        g.rect(2, 28, right - 2, MAP_H - 30).fill({ color: FLEET, alpha: 0.28 }); g.rect(right - 2, 28, 2, MAP_H - 30).fill({ color: FLEET, alpha: 0.9 });
      }
      title.text = mapTitle(map);
      for (const e of map.edges) {
        const cur = map.columns[e.from[0]]!.nodes[e.from[1]]!.current, n = map.columns[e.from[0]]!.nodes.length, m = map.columns[e.to[0]]!.nodes.length;
        g.moveTo(nodeX(e.from[0]), nodeY(e.from[1], n)).lineTo(nodeX(e.to[0]), nodeY(e.to[1], m)).stroke({ width: 2, color: cur ? AMBER : DIM, alpha: cur ? 1 : 0.7 });
      }
      let mi = 0; marks.forEach((t) => { t.visible = false; });
      const last = map.columns.length - 1;
      map.columns.forEach((col, c) => col.nodes.forEach((nd, k) => {
        const x = nodeX(c), y = nodeY(k, col.nodes.length);
        const filled = nd.current || nd.selected || nd.past;   // the beacon's mark sits inside the node, clear of the sideways edges (spec Loop-i section 4b)
        if (nd.current) { g.circle(x, y, R).fill(TEXT); g.circle(x, y, R + 5).stroke({ width: 2, color: TEXT }); }
        else if (nd.selected) { g.circle(x, y, R).fill(AMBER); g.circle(x, y, R + 5).stroke({ width: 2, color: AMBER }); }   // the highlighted jump in the accent (spec Demo-x-c section 1)
        else if (nd.past) g.circle(x, y, R).fill(FAINT);
        else g.circle(x, y, R).fill(HOLE).stroke({ width: 2, color: nd.reachable ? TEXT : DIM });
        if (nd.type === 'asteroid') drawRocks(g, x, y, filled ? HOLE : nd.reachable ? TEXT : DIM);
        const inside = nd.type === 'shop' ? '$' : nd.type === 'event' ? '!' : nd.type === 'unknown' ? '?' : '';   // ? is a beacon not yet visited
        if (inside && mi < marks.length) { const t = marks[mi++]!; t.text = inside; t.tint = filled ? HOLE : nd.reachable ? TEXT : DIM; t.position.set(x + 1, y - 1); t.visible = true; }
        if (c === last && mi < marks.length) { const t = marks[mi++]!; t.text = 'EXIT'; t.tint = AMBER; t.position.set(x - 8, y + 30); t.visible = true; }
      }));
    }
  };
}
