import { Container, Graphics, BitmapText } from 'pixi.js';
import { mapTitle, type HudModel } from './hudModel';

const TEXT = 0xe8e8e8, DIM = 0x9aa0ad, FAINT = 0x5a606c, WARN = 0xff6b5a, FLEET = 0xd83a3a;
const nodeX = (c: number): number => 20 + 40 * c;   // six columns across the 240 px panel (spec Loop-i section 1)
const nodeY = (k: number, n: number): number => 124 + (k - (n - 1) / 2) * 44;   // up to four beacons: 58..190
/** Three small irregular rocks (original glyph, spec Demo-viii section 1), offsets from the node centre. */
const ROCKS: readonly (readonly number[])[] = [
  [-4.5, -1.5, -2.5, -3.5, -0.5, -2, -1, 0.5, -3.5, 1],
  [1, -4, 3, -4.5, 4.5, -2.5, 3.5, -0.5, 1.5, -1.5],
  [-0.5, 1.5, 2, 0.5, 4, 2.5, 2.5, 4.5, 0, 4],
];
function drawRocks(g: Graphics, x: number, y: number, color: number): void {
  for (const r of ROCKS) g.poly(r.map((v, i) => v + (i % 2 === 0 ? x : y))).fill(color);
}

/** The sector map panel (spec Ship-and-map section 5): 240 x 236, redrawn per update; the caller places `root` at (1032, 220). */
export function createMapPanel(fontFamily = 'm5x7'): { root: Container; update(map: HudModel['map']): void } {
  const root = new Container(); root.visible = false;
  const g = new Graphics(); root.addChild(g);
  const mk = (size: number, anchorCentre: boolean): BitmapText => { const t = new BitmapText({ text: '', style: { fontFamily, fontSize: size } }); t.tint = TEXT; t.roundPixels = true; if (anchorCentre) t.anchor.set(0.5, 0.5); root.addChild(t); return t; };
  const title = mk(16, false); title.position.set(8, 4);
  const marks: BitmapText[] = []; for (let i = 0; i < 24; i++) { const t = mk(16, true); t.visible = false; marks.push(t); }
  return {
    root,
    update(map) {
      if (!map) { root.visible = false; return; }
      root.visible = true; g.clear();
      g.rect(0, 0, 240, 236).fill({ color: 0x101420, alpha: 0.6 });
      if (map.fleet >= 0) {   // the Pursuit's front: a red band across the overrun columns (spec Loop-i section 3)
        const right = Math.min(240, nodeX(map.fleet) + 20);
        g.rect(0, 24, right, 204).fill({ color: FLEET, alpha: 0.28 }); g.rect(right - 2, 24, 2, 204).fill({ color: FLEET, alpha: 0.9 });
      }
      title.text = mapTitle(map);
      for (const e of map.edges) {
        const cur = map.columns[e.from[0]]!.nodes[e.from[1]]!.current, n = map.columns[e.from[0]]!.nodes.length, m = map.columns[e.to[0]]!.nodes.length;
        g.moveTo(nodeX(e.from[0]), nodeY(e.from[1], n)).lineTo(nodeX(e.to[0]), nodeY(e.to[1], m)).stroke({ width: 2, color: cur ? TEXT : DIM, alpha: cur ? 1 : 0.7 });
      }
      let mi = 0; marks.forEach((t) => { t.visible = false; });
      const last = map.columns.length - 1;
      map.columns.forEach((col, c) => col.nodes.forEach((nd, k) => {
        const x = nodeX(c), y = nodeY(k, col.nodes.length);
        if (nd.current) { g.circle(x, y, 6).fill(TEXT); g.circle(x, y, 10).stroke({ width: 2, color: TEXT }); }
        else if (nd.selected) { g.circle(x, y, 6).fill(WARN); g.circle(x, y, 10).stroke({ width: 2, color: WARN }); }
        else if (nd.past) g.circle(x, y, 6).fill(FAINT);
        else g.circle(x, y, 6).fill(0x101420).stroke({ width: 1, color: nd.reachable ? TEXT : DIM });
        if (nd.type === 'asteroid') drawRocks(g, x, y, nd.current || nd.selected ? 0x101420 : nd.past ? DIM : nd.reachable ? TEXT : DIM);
        const label = c === last ? 'EXIT' : nd.type === 'shop' ? '$' : nd.type === 'event' ? '?' : '';
        if (label && mi < marks.length) { const t = marks[mi++]!; t.text = label; t.position.set(x, y + 14); t.visible = true; }
      }));
    }
  };
}
