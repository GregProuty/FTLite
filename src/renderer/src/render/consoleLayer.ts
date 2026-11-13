import { Container, Graphics } from 'pixi.js';
import type { SimState } from '../sim/state';
import { consoles } from './consoleModel';

/** The station desks (spec Demo-xii section 1), under the crew; redrawn only when a console's state or the layout changes. */
export function createConsoleLayer(): { container: Container; draw(state: SimState): void } {
  const container = new Container(), g = new Graphics();
  container.addChild(g);
  let drawnFor = '';
  return {
    container,
    draw(state) {
      const list = consoles(state), key = `${state.derived.layoutHash}:${list.map((c) => c.look).join()}`;
      if (key === drawnFor) return;
      drawnFor = key; g.clear();
      for (const c of list) {
        const p = c.picture;
        g.rect(c.x + p.desk.x, c.y + p.desk.y, p.desk.w, p.desk.h).fill(p.fill).stroke({ width: 1, color: p.outline, alignment: 1 });
        g.rect(c.x + p.screen.x, c.y + p.screen.y, p.screen.w, p.screen.h).fill(p.screenFill);
      }
    }
  };
}
