// Artemis spec §6.1, UI round §1.5: no console on the end card; a pause keeps it.
import { expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { consoleHidden, type SceneOverlay } from '../src/renderer/src/app/duel/scene';

const ov = (p: Partial<SceneOverlay> = {}): SceneOverlay => ({ banner: null, layerPaused: false, end: null, ...p });
it('UI round §1.5: only a decided round hides the console; a pause, a banner or a stopped duel does not', () => {
  const d = createDuel(parseShip(cutter), 5);
  expect(consoleHidden(d, ov(), true)).toBe(false);
  expect(consoleHidden(d, ov({ banner: 'PAUSED' }), true)).toBe(false);
  expect(consoleHidden(d, ov({ layerPaused: true }), true)).toBe(false);
  expect(consoleHidden(d, ov(), false)).toBe(false);
  d.tactical.outcome = Outcome.CrewWins;
  expect(consoleHidden(d, ov(), true)).toBe(true);
  disposeDuel(d);
});
