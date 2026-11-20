// UI round spec §1.4: no torpedo range ring, no rock picked or hovered from the map, hints that name rooms only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIT_CARDS } from '../src/renderer/src/render/duel/sitModel';
import { WEAPONS_HINT } from '../src/renderer/src/ui/duel/WeaponsStation';

describe('no rock picking (spec §1.4)', () => {
  it('the hints name rooms only', () => {
    expect(WEAPONS_HINT).toBe('CLICK A WEAPON, THEN A ROOM');
    expect(SIT_CARDS.weapons.title).toBe('WEAPONS: CLICK A WEAPON, THEN A ROOM');
  });
  it('the scene neither picks nor hovers a rock, and the layer draws no torpedo range ring', () => {
    const scene = readFileSync('src/renderer/src/app/duel/scene.ts', 'utf8');
    expect(scene).not.toMatch(/pickRock\(/);
    expect(scene).not.toMatch(/rockHover/);
    const layer = readFileSync('src/renderer/src/render/tactical/tacticalLayer.ts', 'utf8');
    expect(layer).not.toMatch(/torpedoRange/);
    expect(readFileSync('src/renderer/src/render/tactical/weaponsModel.ts', 'utf8')).not.toMatch(/torpedoRange/);
  });
});
