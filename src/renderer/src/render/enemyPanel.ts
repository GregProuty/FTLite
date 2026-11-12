import { Container, Graphics, BitmapText } from 'pixi.js';
import { enemyLabel, type HudModel } from './hudModel';

const TEXT = 0xe8e8e8, DIM = 0x9aa0ad, FAINT = 0x5a606c, WARN = 0xff6b5a;
const PANEL = 0x10131a;

/** The enemy panel (spec Demo-ii section 4): 240 x 100 in panel coordinates, redrawn per update; the caller places `root` and passes the font family. */
export function createEnemyPanel(fontFamily = 'm5x7'): { root: Container; update(e: HudModel['enemy']): void } {
  const root = new Container(); root.visible = false;
  const g = new Graphics(); root.addChild(g);
  const label = new BitmapText({ text: '', style: { fontFamily, fontSize: 16 } }); label.tint = TEXT; label.roundPixels = true; label.position.set(6, 2); root.addChild(label);
  return {
    root,
    update(e) {
      if (!e) { root.visible = false; return; }
      g.clear();
      g.rect(0, 0, 240, 100).fill({ color: PANEL, alpha: 0.85 }).stroke({ width: 1, color: FAINT });
      // a 7-point hull silhouette, 56 x 24, centred (120, 44)
      g.poly([92, 44, 102, 32, 130, 32, 148, 38, 148, 50, 130, 56, 102, 56]).fill(e.hitFlash ? WARN : DIM);
      if (!e.shieldsDown) for (let k = 0; k < e.layersMax; k++) g.ellipse(120, 44, 30 + 6 * k, 24 + 6 * k).stroke({ width: 2, color: k < e.layers ? TEXT : FAINT });
      g.rect(10, 80, 220, 6).fill(FAINT); if (!e.weaponsDown) g.rect(10, 80, 220 * Math.max(0, Math.min(1, e.weaponCharge)), 6).fill(e.weaponCharge >= 0.8 ? WARN : TEXT);
      g.rect(10, 90, 220, 4).fill(FAINT); g.rect(10, 90, 220 * Math.max(0, Math.min(1, e.hull)), 4).fill(DIM);
      label.text = enemyLabel(e);
    }
  };
}
