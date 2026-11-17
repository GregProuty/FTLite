// Artemis spec §6.1: no console on the end card, under a banner or dimmed layer, or when the duel is not running.
import { expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { Outcome } from '../src/renderer/src/sim/tactical/state';
import { consoleHidden, type SceneOverlay } from '../src/renderer/src/app/duel/scene';

const ov = (p: Partial<SceneOverlay> = {}): SceneOverlay => ({ banner: null, layerPaused: false, end: null, ...p });
it('hides on a banner, a dimmed layer, a stopped duel or a decided round', () => {
  const d = createDuel(parseShip(cutter), 5);
  expect(consoleHidden(d, ov(), true)).toBe(false);
  expect(consoleHidden(d, ov({ banner: 'PAUSED' }), true)).toBe(true);
  expect(consoleHidden(d, ov({ layerPaused: true }), true)).toBe(true);
  expect(consoleHidden(d, ov(), false)).toBe(true);
  d.tactical.outcome = Outcome.CrewWins;
  expect(consoleHidden(d, ov(), true)).toBe(true);
  disposeDuel(d);
});
