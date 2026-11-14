import { fixtureCouchViewer } from './helpers/cardUi';
import { buildFixtureHud as buildHudModel } from './helpers/cardUi';
import { cardSelection } from './helpers/cardUi';
import { describe, it, expect } from 'vitest';
import { type NavigationPanel } from '../src/renderer/src/render/hudModel';
import { navRows, NodeType } from '../src/renderer/src/sim/run';
import { Encounter } from '../src/renderer/src/sim/enemy';
import type { SimState } from '../src/renderer/src/sim/state';
import { makeState, quiet, seatNavigator, placeEnemy, setEvent, setNodeTypes, mapM } from './helpers/sim';

/** The evade row only when it means something (spec Demo-xii section 4): hidden in the card model only, the sim rows unchanged. */
const slots = [{ status: 'active' as const, key: 'kb:0' }];
function seated(): { s: SimState; nav: number } { const s = makeState(1); quiet(s); s.enemy.nextArrivalTick = 1e9; s.boarders.nextArrivalTick = 1e9; mapM(s); const nav = seatNavigator(s, 0); return { s, nav }; }
const card = (s: SimState) => buildHudModel(s, fixtureCouchViewer(s), { slots: slots, phase: 'running', message: '' }).players[0]!.console as NavigationPanel;
const texts = (s: SimState) => card(s).rows.map((r) => r.text);
const here = (s: SimState) => `${s.run.column}:${s.run.node}`;

describe('R4: the evade row only with an enemy or a field', () => {
  it('hidden at a calm beacon, a shop and an event; the sim rows still end with it', () => {
    const calm = seated().s;
    expect(texts(calm)).not.toContain('EVADE: Confirm'); expect(navRows(calm).at(-1)!.text).toBe('EVADE: Confirm');
    const shop = seated().s; setNodeTypes(shop, { [here(shop)]: NodeType.Shop });
    expect(texts(shop).some((t) => t.startsWith('Shop'))).toBe(true); expect(texts(shop)).not.toContain('EVADE: Confirm');
    const ev = seated().s; setEvent(ev, 0);
    expect(texts(ev)).not.toContain('EVADE: Confirm'); expect(navRows(ev).at(-1)!.select).toBe('evade');
  });
  it('shown with an enemy present or an asteroid field active', () => {
    const a = seated().s; placeEnemy(a); expect(texts(a).at(-1)).toBe('EVADE: Confirm');
    const f = seated().s; setNodeTypes(f, { [here(f)]: NodeType.Asteroid }); f.run.encounter = Encounter.Fighting; expect(texts(f).at(-1)).toBe('EVADE: Confirm');
    const ev = seated().s; setEvent(ev, 0); placeEnemy(ev); expect(texts(ev).at(-1)).toBe('EVADE: Confirm');
  });
  it('EVADING and the cooldown show whenever they are active', () => {
    const { s } = seated(); s.run.evadeUntilTick = s.tick + 60; s.run.evadeReadyTick = s.tick + 600;
    expect(texts(s).at(-1)).toBe('EVADING');
    s.run.evadeUntilTick = s.tick; expect(texts(s).at(-1)).toMatch(/^EVADE \d+s$/);
  });
  it('the highlight follows the sim cursor: the same row text, and the hidden row shows while the cursor sits on it', () => {
    const { s, nav } = seated(), rows = navRows(s);
    cardSelection(s, nav).cursor = rows.findIndex((r) => r.select === 'jump');
    const c = card(s), lit = c.rows.find((r) => r.cursor)!;
    expect(lit.text).toBe(rows[cardSelection(s, nav).cursor!]!.text);
    cardSelection(s, nav).cursor = rows.length - 1;
    expect(card(s).rows.at(-1)).toMatchObject({ text: 'EVADE: Confirm', cursor: true });
  });
});
