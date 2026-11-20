// UI round spec §2.2, §2.4a: on the ship view only: TORPEDO INBOUND as a banner, AWAY under an away player, an empty Helm
// or Weapons badge marked for its blink.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createDuel, disposeDuel } from '../src/renderer/src/sim/duel/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { placeMissile } from '../src/renderer/src/sim/tactical/state';
import { INCOMING_RANGE, torpedoInbound } from '../src/renderer/src/render/duel/situationModel';
import { crewHealthMarks, stationBadges } from '../src/renderer/src/render/duel/interiorModel';
import { sceneUi, type SceneOverlay } from '../src/renderer/src/app/duel/scene';

const ov = (p: Partial<SceneOverlay> = {}): SceneOverlay => ({ banner: null, layerPaused: false, end: null, ...p });

describe('ship view rows (spec §2.4a)', () => {
  it('no torpedo: no alert; the rule is 600 u', () => {
    const d = createDuel(parseShip(cutter), 5);
    expect(INCOMING_RANGE).toBe(600);
    expect(torpedoInbound(d.tactical)).toBe(false);
    disposeDuel(d);
  });
  it('an enemy torpedo within 600 u is inbound; beyond it is not', () => {
    const d = createDuel(parseShip(cutter), 5);
    const crew = d.tactical.ships[0]!;
    placeMissile(d.tactical, 1, { x: crew.x + 500, y: crew.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    expect(torpedoInbound(d.tactical)).toBe(true);
    disposeDuel(d);
    const e = createDuel(parseShip(cutter), 5), c2 = e.tactical.ships[0]!;
    placeMissile(e.tactical, 1, { x: c2.x + 700, y: c2.y, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 0 });
    expect(torpedoInbound(e.tactical)).toBe(false);
    disposeDuel(e);
  });
  it('the banner shows only on the ship view', () => {
    expect(sceneUi('interior', ov(), 'P', null, true).banners.alert).toBe('TORPEDO INBOUND');
    expect(sceneUi('helm', ov(), 'P', null, true).banners.alert).toBeNull();
    expect(sceneUi('interior', ov(), 'P', null, false).banners.alert).toBeNull();
  });
  it('empty consoles and away players', () => {
    const d = createDuel(parseShip(cutter), 5);
    const b = stationBadges(d);
    expect(b.find((x) => x.label === 'HELM')!.empty).toBe(true);   // nobody seated at the start
    expect(b.find((x) => x.label === 'SCIENCE')?.empty ?? false).toBe(false);
    stepDuelTick(d, { held: [], commands: [{ runId: 'duel', id: { player: 1, sequence: 0 }, requestedTick: 0, command: { kind: 'presence', present: false } }] });
    expect(crewHealthMarks(d)[1]!.label).toBe('AWAY');
    disposeDuel(d);
  });
});
