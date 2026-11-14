import { tracedStep as step, beginGateTrace, assertGateTrace } from './helpers/gateTrace';
import { describe, it, expect } from 'vitest';
import { sectorJump } from '../src/renderer/src/sim/run';
import { EnemySystem, enemySysUp } from '../src/renderer/src/sim/enemy';
import { ENEMY_SHIELDS_SLOT, targetRef } from '../src/renderer/src/sim/debrisTargets';
import { EndReason } from '../src/renderer/src/sim/crew';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Weapon, weaponRef } from '../src/renderer/src/sim/weapons';
import type { ScriptedCommand } from '../src/renderer/src/headless/runner';
import { LootWeapon } from '../src/renderer/src/sim/weaponDefs';
import { TICK_HZ, SECTORS, SECTOR_COLUMNS } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, mapM, chargeJump, intents } from './helpers/sim';
import { decisionView } from './helpers/rawInput';

// Spec Loop-iv section 3: this scripted gunner (no return fire, unlike the bot gunner of Demo-xiii) proves the Warden can be destroyed and the run won.
// The gunner sits at Weapons (the starting level 2) and aims at the shields room, the Pulse Laser tuned to the current
// frequency (read from the state: the Science scan is left out, as in the combat gate); a hit there also damages the hull,
// two take the shields down. A loot weapon in slot 1 fires only while no layer is up. No return fire: this is the kill path.
const LIMIT = 30 * 60 * TICK_HZ;
function fight(loot: number): { shots: number; hits: number; seconds: number; reason: number } {
  const s = makeState(2, 1); quiet(s); mapM(s); s.run.sector = SECTORS - 1; s.run.column = SECTOR_COLUMNS - 1; s.run.node = 0; chargeJump(s);
  sectorJump(s);
  const w = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, w);
  if (loot) s.weapons.slot[0] = loot;
  let arrived = -1;
  beginGateTrace(s, `warden:${loot}`);
  for (let t = 0; t < LIMIT && !s.ended; t++) {
    s.boarders.nextArrivalTick = 1e9;
    const view = decisionView(s);
    let fire = false;
    const commands: ScriptedCommand[] = [];
    if (view.enemy.present) {
      if (arrived < 0) arrived = view.tick;
      s.enemy.nextShotTick = 1e9;
      const target = targetRef(view, ENEMY_SHIELDS_SLOT)!;
      commands.push({ player: 0, command: { kind: 'selectTarget', station: w, target } });
      const layerUp = enemySysUp(view, EnemySystem.Shields) && view.enemy.shieldLayers > 0;
      let selector = view.weapons.selector;
      if (view.weapons.charge >= 1) { selector = view.enemy.shieldFreq - 1; fire = true; }
      else if (loot && view.weapons.charge2[0]! >= 1 && !layerUp) { selector = Weapon.Slot1; fire = true; }
      if (fire) {
        const weapon = weaponRef(view, selector);
        commands.push({ player: 0, command: { kind: 'selectWeapon', station: w, weapon } }, { player: 0, command: { kind: 'fire', station: w, weapon, target } });
      }
    }
    step(s, intents(fire ? { confirmPressed: true } : {}, {}), commands);
  }
  assertGateTrace(s);
  return { shots: s.telemetry.shots, hits: s.telemetry.hits, seconds: Math.round((s.tick - arrived) / TICK_HZ), reason: s.endReason };
}

describe('Warden gate: a scripted gunner destroys the Warden and wins the run', () => {
  it('seed 1: the starting loadout (Pulse Laser only) wins', { timeout: 60_000 }, () => {
    const r = fight(LootWeapon.None);
    expect(r.reason).toBe(EndReason.Victory);
    expect([r.shots, r.hits, r.seconds]).toEqual(PULSE_ONLY);   // recorded on the first run (spec Loop-iv amendments)
  });
  it('seed 1: with one loot weapon (a Heavy Laser in slot 1) it wins in fewer shots and less time', { timeout: 60_000 }, () => {
    const r = fight(LootWeapon.Heavy);
    expect(r.reason).toBe(EndReason.Victory);
    expect([r.shots, r.hits, r.seconds]).toEqual(WITH_HEAVY); expect(r.shots).toBeLessThan(PULSE_ONLY[0]!);
  });
});
const PULSE_ONLY = [35, 25, 270], WITH_HEAVY = [31, 21, 183];   // Demo-xiii: BEAM_CHARGE_TIME 6 -> 4 (Pulse 8 s at level 2): 36/25/420 -> 35/25/270 and 31/21/255 -> 31/21/183; shots, hits (strips included), seconds from the arrival to the kill: re-recorded at WARDEN_HULL_MULT 1.5 (Loop-iv amendment F8; 2.5 gave 56/41/653 and 47/34/383)
