import { Container, Graphics, Sprite } from 'pixi.js';
import type { SimState } from '../sim/state';
import type { GameAssets } from './assets';
import { featureReady } from './fallback';
import { consoleArtName, consolePlacement, consoles, CONSOLE_TINT, DESK_OUTLINE_W } from './consoleModel';

/** The station desks (spec Demo-xii section 1), under the crew; redrawn only when a console's state or the layout changes.
 *  With the consoleArt feature (Art-ii spec section 2) each console is its bought Maru sprite, turned to its wall and tinted
 *  by its look, in a child container at index 0 (under the fixtures the interior feel adds later); no desk or screen strip. */
export function createConsoleLayer(assets: GameAssets): { container: Container; draw(state: SimState): void } {
  const container = new Container(), art = new Container(), g = new Graphics();
  container.addChild(art, g);
  const useArt = featureReady(new Set(assets.missing), 'consoleArt');
  let drawnFor = '';
  return {
    container,
    draw(state) {
      const list = consoles(state), key = `${state.derived.layoutHash}:${list.map((c) => c.look).join()}`;
      if (key === drawnFor) return;
      drawnFor = key; g.clear();
      if (useArt) {
        for (const s of art.removeChildren()) s.destroy();
        for (const c of list) {
          const tex = assets.texture(consoleArtName(state, c.members)), p = consolePlacement(c.side, c.flush, tex.width, tex.height);
          const s = new Sprite(tex); s.anchor.set(0.5); s.scale.set(2); s.rotation = p.rotation; s.tint = CONSOLE_TINT[c.look];
          s.position.set(c.x + p.cx, c.y + p.cy); art.addChild(s);
        }
        return;
      }
      for (const c of list) {
        const p = c.picture;
        g.rect(c.x + p.desk.x, c.y + p.desk.y, p.desk.w, p.desk.h).fill(p.fill).stroke({ width: DESK_OUTLINE_W, color: p.outline, alignment: 1 });   // one art pixel, inside the desk (Art-i spec section 4)
        g.rect(c.x + p.screen.x, c.y + p.screen.y, p.screen.w, p.screen.h).fill(p.screenFill);
      }
    }
  };
}
