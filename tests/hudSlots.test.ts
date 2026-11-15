import { expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { createHud } from '../src/renderer/src/render/hud';
import { buildHudModel } from '../src/renderer/src/render/hudModel';
import { createCardUi } from '../src/renderer/src/clientControl/cardController';
import { makeState } from './helpers/sim';
import type { GameAssets } from '../src/renderer/src/render/assets';
import { textPx } from '../src/renderer/src/render/theme';
import { BLOCK_HP_X } from '../src/renderer/src/render/hudLayout';

// Node has no font atlas/canvas. Retain the actual Pixi scene graph and HUD,
// replacing only bitmap glyph measurement with a font-independent text node.
vi.mock('pixi.js', async original => {
  const pixi = await original<typeof import('pixi.js')>();
  return { ...pixi, BitmapText: class extends pixi.Container {
    text = ''; anchor = { set() {} }; constructor(_options: unknown) { super(); }
  } };
});
function visibleText(root: Container): string[] {
  if (!root.visible) return [];
  return [...('text' in root ? [String(root.text)] : []), ...root.children.flatMap(c => visibleText(c as Container))];
}
it('clears unavailable player cards when a four-slot couch HUD is reused for two online seats', () => {
  const parent = new Container(), hud = createHud(parent, { missing: [], has: () => false } as unknown as GameAssets);
  const ui = createCardUi();
  hud.update(buildHudModel(null, { mode: 'couch', ui }, { phase: 'lobby', message: '', slots: Array.from({ length: 4 }, () => ({ status: 'empty', key: null })) }));
  expect(visibleText(parent)).toContain('P3: press Interact to join');
  const state = makeState(2);
  const model = buildHudModel(state, { mode: 'player', player: 0, ui }, { phase: 'running', message: '', slots: [{ status: 'active', key: 'kb:0' }, { status: 'bot', key: null }] });
  model.players[1]!.character.name = 'Lindqvist'; hud.update(model);
  expect(visibleText(parent).some(t => /P[34]/.test(t))).toBe(false);
  expect(visibleText(parent).some(t => /P2.*BOT/.test(t))).toBe(true);
  expect(textPx(visibleText(parent).find(t => /P2.*BOT/.test(t))!)).toBeLessThan(BLOCK_HP_X);
  expect(visibleText(parent).some(t => /RECONNECT|press Interact/.test(t))).toBe(false);
  // Reusing the same HUD for couch must restore its ordinary empty join slots.
  hud.update(buildHudModel(null, { mode: 'couch', ui }, { phase: 'lobby', message: '', slots: Array.from({ length: 4 }, () => ({ status: 'empty', key: null })) }));
  expect(visibleText(parent)).toContain('P4: press Interact to join');
  parent.destroy({ children: true });
});
