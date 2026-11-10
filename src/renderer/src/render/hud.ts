import { Container, Text } from 'pixi.js';
import type { HudModel } from './hudModel';
import { INTERNAL_W } from '../../../shared/resolution';
import type { GameAssets } from './assets';

export function createHud(parent: Container, _assets: GameAssets) {
  const style = { fill: 0xe8e8e8, fontFamily: 'monospace', fontSize: 14 };
  const top = new Text({ text: '', style }); top.position.set(8, 6);
  const threats = new Text({ text: '', style }); threats.position.set(INTERNAL_W - 220, 6);
  const banner = new Text({ text: '', style: { ...style, fontSize: 22 } }); banner.anchor.set(0.5); banner.position.set(INTERNAL_W / 2, 40);
  const players = [0, 1, 2, 3].map((i) => { const t = new Text({ text: '', style }); t.position.set(8 + i * 236, 500); return t; });
  parent.addChild(top, threats, banner, ...players);
  return {
    update(m: HudModel): void {
      top.text = `HULL ${Math.round(m.hull)}   TIME ${m.simSeconds}s`;
      threats.text = m.threats.join('\n');
      banner.text = m.message;
      m.players.forEach((p, i) => {
        const t = players[i]!;
        if (p.status === 'empty') { t.text = `P${i + 1}: press Interact to join`; return; }
        if (p.status === 'reconnect') { t.text = `P${i + 1}: RECONNECT`; return; }
        const bar = p.progress > 0 ? ` [${'#'.repeat(Math.round(p.progress * 10)).padEnd(10, '.')}]` : '';
        t.text = `P${i + 1} HP ${Math.ceil(p.health)}\n${p.prompt}${bar}`;
      });
    }
  };
}
