import { describe, it, expect } from 'vitest';
import { buildHudModel } from '../src/renderer/src/render/hud';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { activateBreach } from '../src/renderer/src/sim/hazards/breach';
import { Life, LifeState } from '../src/renderer/src/sim/components';
import { makeState, room, run, teleport } from './helpers/sim';

const slots = (n: number) => Array.from({ length: n }, (_, i) => ({ status: 'active' as const, key: `k${i}` }));

describe('buildHudModel', () => {
  it('lists threats by room name and shows the sim clock', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'A')); activateBreach(s, 6);
    run(s, 120);
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.simSeconds).toBe(2);
    expect(m.threats).toEqual(['Fire: Bridge', 'Breach: Crew Quarters']);
    expect(m.hull).toBe(100);
  });
  it('prompts for the current Interact and Confirm targets', () => {
    const s = makeState(2);
    igniteRoom(s, room(s, 'G'));
    teleport(s, 0, 2.5, 8.6);
    const m = buildHudModel(s, slots(2), 'running', '');
    expect(m.players[0]!.prompt).toBe('Repair fire | Seal door');
    Life.state[s.crew[1]!] = LifeState.Downed; Life.bleed[s.crew[1]!] = 12.4;
    const m2 = buildHudModel(s, slots(2), 'running', '');
    expect(m2.players[0]!.prompt).toBe('Revive P2 | Seal door');
    expect(m2.players[1]!.prompt).toBe('DOWNED 13s');   // Math.ceil: never shows 0s while still alive
  });
  it('lobby model without state shows slot status', () => {
    const m = buildHudModel(null, [{ status: 'active', key: 'a' }, { status: 'empty', key: null }], 'lobby', 'Press Interact to join');
    expect(m.players).toHaveLength(2);
    expect(m.players[1]!.status).toBe('empty');
  });
});
