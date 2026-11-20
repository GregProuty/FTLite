import { describe, expect, it } from 'vitest';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { createCamera, type Camera } from '../src/renderer/src/render/tactical/camera';
import { createFx } from '../src/renderer/src/render/tactical/fxModel';
import type { PrevBody } from '../src/renderer/src/render/tactical/tacticalModel';
import { combatModel, helmInfoText, INFO_Y, type CombatModelInput } from '../src/renderer/src/render/tactical/weaponsModel';
import { INFO_BAND } from '../src/renderer/src/render/duel/consoleLayout';

const vp = { w: 1280, h: 720 };
const prevOf = (st: TacticalState): PrevBody[] => st.ships.map((s) => ({ x: s.x, y: s.y, h: s.heading + s.headingAcc }));
function input(st: TacticalState, cam: Camera, console: 'helm' | 'weapons' | 'science', ships = [0, 1]): CombatModelInput {
  return { state: st, prev: prevOf(st), alpha: 1, camera: cam, viewport: vp, console, axes: { turn: 0, thrust: 0 }, ships, paused: false, reserveRight: 236, missilePrev: [null, null], fx: createFx(), infoBand: INFO_BAND };
}

describe('the Helm range and bearing line (UI round §2.4a)', () => {
  const st = createTacticalState(11), cam = createCamera(st.ships[0].x, st.ships[0].y);
  it('the Helm map carries BRG and RNG in the top band; Weapons keeps its own line; Science neither', () => {
    expect(helmInfoText(74, 728)).toBe('BRG 074  RNG 728');
    const helm = combatModel(input(st, cam, 'helm'));
    expect(helm.helmInfo!.text).toMatch(/^BRG \d{3}  RNG \d+$/);
    expect(helm.helmInfo!.y).toBe(INFO_Y);
    expect(combatModel(input(st, cam, 'weapons')).helmInfo).toBeNull();
    expect(combatModel(input(st, cam, 'science')).helmInfo).toBeNull();
  });
  it('with the enemy not drawn the line says NO CONTACT IN SENSOR RANGE', () => {
    expect(combatModel(input(st, cam, 'helm', [0])).helmInfo!.text).toBe('NO CONTACT IN SENSOR RANGE');
  });
});
