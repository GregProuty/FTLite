// W-4 spec §5.2: on the weak frequency a crew pew round on a shield layer strips min(2, shields) layers, and an autocannon
// layer goes at 4 hits instead of 8 (the threshold of the moment); hull and rooms unchanged; the Hunter's pew and the
// Valkyrn's gun keep 1 layer and 8 hits even with freq === weakFreq; laserFrequency is admitted on the Hound and refused
// on the Valkyrn.
import { describe, expect, it } from 'vitest';
import cutter from '../src/renderer/src/sim/ship/cutter.json';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { placeRound, stepRounds } from '../src/renderer/src/sim/tactical/gun';
import { stepPew } from '../src/renderer/src/sim/tactical/pew';
import { ShipClass } from '../src/renderer/src/sim/tactical/defs';
import { createTacticalState, type TacticalState } from '../src/renderer/src/sim/tactical/state';
import { stepDuelTick } from '../src/renderer/src/sim/duel/step';
import { disposeDuel, type DuelState } from '../src/renderer/src/sim/duel/state';
import type { DuelCommand } from '../src/renderer/src/sim/duel/commands';
import { createSeatedDuel } from './helpers/duelSeat';

const CUTTER = parseShip(cutter);
/** Slot `shooter` at (0, 1500) (clear of the planet at the origin) and its target slot 1 − shooter 100 to the east, still;
 *  no rocks. A round starts at x 70, so its first tick's segment enters the target's circle (its edge at x 80). */
function pair(cls: number, shooter: 0 | 1, shields: number): TacticalState {
  const st = createTacticalState(5, 2, cls);
  st.rocks.fill(0);
  Object.assign(st.ships[shooter]!, { x: 0, y: 1500, vx: 0, vy: 0 });
  Object.assign(st.ships[1 - shooter]!, { x: 100, y: 1500, vx: 0, vy: 0 });
  st.systems[1 - shooter]!.shields = shields;
  st.systems[shooter]!.freq = st.weakFreq;
  return st;
}
const pewRound = (st: TacticalState, owner: number) => { placeRound(st, { x: 70, y: 1500, vx: 900, vy: 0, age: 0, owner }, st.pew); stepPew(st); };
const gunRound = (st: TacticalState, owner: number) => { placeRound(st, { x: 70, y: 1500, vx: 700, vy: 0, age: 0, owner }); stepRounds(st); };

describe('the weak frequency boosts the guns (W-4 spec §5.2)', () => {
  it('a crew pew round strips 2 layers on the weak frequency (1 when one is up), else 1; hull hits are unchanged', () => {
    const st = pair(ShipClass.Cutter, 0, 2);
    pewRound(st, 0); expect(st.systems[1]!.shields).toBe(0);
    const one = pair(ShipClass.Cutter, 0, 1); pewRound(one, 0); expect(one.systems[1]!.shields).toBe(0);
    const off = pair(ShipClass.Cutter, 0, 2); off.systems[0]!.freq = (off.weakFreq + 1) % 3; pewRound(off, 0); expect(off.systems[1]!.shields).toBe(1);
    const bare = pair(ShipClass.Cutter, 0, 0), hull = bare.systems[1]!.hull; pewRound(bare, 0); expect(bare.systems[1]!.hull).toBe(hull - 1);
  });
  it('the autocannon strips a layer at the 4th hit on the weak frequency and the 8th off it; a retune mid-wear uses the new threshold', () => {
    const on = pair(ShipClass.Cutter, 0, 2);
    for (let n = 1; n <= 4; n++) { gunRound(on, 0); expect(on.systems[1]!.shields, `hit ${n}`).toBe(n < 4 ? 2 : 1); }
    const off = pair(ShipClass.Cutter, 0, 2); off.systems[0]!.freq = (off.weakFreq + 1) % 3;
    for (let n = 1; n <= 8; n++) { gunRound(off, 0); expect(off.systems[1]!.shields, `hit ${n}`).toBe(n < 8 ? 2 : 1); }
    const re = pair(ShipClass.Cutter, 0, 2); re.systems[0]!.freq = (re.weakFreq + 1) % 3;
    for (let n = 0; n < 5; n++) gunRound(re, 0);
    expect(re.systems[1]!.shields).toBe(2);
    re.systems[0]!.freq = re.weakFreq;
    gunRound(re, 0);   // wear 6 ≥ 4
    expect(re.systems[1]!.shields).toBe(1);
  });
  it('the Hunter\'s pew and the Valkyrn\'s gun keep 1 layer and 8 hits with freq === weakFreq', () => {
    const hunter = pair(ShipClass.Cutter, 1, 2); pewRound(hunter, 1); expect(hunter.systems[0]!.shields).toBe(1);
    const valk = pair(ShipClass.Valkyrn, 0, 2);
    for (let n = 1; n <= 8; n++) { gunRound(valk, 0); expect(valk.systems[1]!.shields, `hit ${n}`).toBe(n < 8 ? 2 : 1); }
  });
  it('laserFrequency: admitted at the Hound\'s Weapons seat (seat, malformed, noop as today), unavailable on the Valkyrn', () => {
    const cmd = (d: DuelState, player: number, command: DuelCommand) => ({ runId: 'duel', id: { player, sequence: d.interior.tick + 1 }, requestedTick: d.interior.tick, command });
    const d = createSeatedDuel(CUTTER, 5);
    try {
      const gunner = 1 - d.helmPlayer;
      expect(stepDuelTick(d, { held: [], commands: [cmd(d, gunner, { kind: 'laserFrequency', freq: 1 })] })[0]).toMatchObject({ status: 'applied' });
      expect(d.tactical.systems[0]!.freq).toBe(1);
      expect(stepDuelTick(d, { held: [], commands: [cmd(d, gunner, { kind: 'laserFrequency', freq: 1 })] })[0]).toMatchObject({ status: 'noop' });
      expect(stepDuelTick(d, { held: [], commands: [cmd(d, gunner, { kind: 'laserFrequency', freq: 3 })] })[0]).toMatchObject({ status: 'rejected', reason: 'malformed' });
      expect(stepDuelTick(d, { held: [], commands: [cmd(d, d.helmPlayer, { kind: 'laserFrequency', freq: 2 })] })[0]).toMatchObject({ status: 'rejected', reason: 'not-at-weapons' });
    } finally { disposeDuel(d); }
    const v = createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn);
    try {
      expect(stepDuelTick(v, { held: [], commands: [cmd(v, 1 - v.helmPlayer, { kind: 'laserFrequency', freq: 1 })] })[0]).toMatchObject({ status: 'rejected', reason: 'unavailable' });
    } finally { disposeDuel(v); }
  });
});
