import { describe, it, expect } from 'vitest';
import { sectorJump } from '../src/renderer/src/sim/run';
import { EnemySystem, enemySysUp } from '../src/renderer/src/sim/enemy';
import { ENEMY_SHIELDS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { EndReason } from '../src/renderer/src/sim/crew';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { LootWeapon } from '../src/renderer/src/sim/weaponDefs';
import { TICK_HZ, SECTORS, SECTOR_COLUMNS } from '../src/renderer/src/sim/tuning';
import { makeState, run, quiet, mapM, chargeJump, intents } from './helpers/sim';

// Spec Loop-iv section 3: bots never fire, so this scripted gunner proves the Warden can be destroyed and the run won.
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
  for (let t = 0; t < LIMIT && !s.ended; t++) {
    s.boarders.nextArrivalTick = 1e9;
    let fire = false;
    if (s.enemy.present) {
      if (arrived < 0) arrived = s.tick;
      s.enemy.nextShotTick = 1e9;
      s.stations.cursor[w] = ENEMY_SHIELDS_SLOT;
      const layerUp = enemySysUp(s, EnemySystem.Shields) && s.enemy.shieldLayers > 0;
      if (s.weapons.charge >= 1) { s.weapons.selector = s.enemy.shieldFreq - 1; fire = true; }
      else if (loot && s.weapons.charge2[0]! >= 1 && !layerUp) { s.weapons.selector = Weapon.Slot1; fire = true; }
    }
    run(s, 1, () => intents(fire ? { confirmPressed: true } : {}, {}));
  }
  return { shots: s.telemetry.shots, hits: s.telemetry.hits, seconds: Math.round((s.tick - arrived) / TICK_HZ), reason: s.endReason };
}

describe('Warden gate: a scripted gunner destroys the Warden and wins the run', () => {
  it('seed 1: the starting loadout (Pulse Laser only) wins', () => {
    const r = fight(LootWeapon.None);
    expect(r.reason).toBe(EndReason.Victory);
    expect([r.shots, r.hits, r.seconds]).toEqual(PULSE_ONLY);   // recorded on the first run (spec Loop-iv amendments)
  });
  it('seed 1: with one loot weapon (a Heavy Laser in slot 1) it wins in fewer shots and less time', () => {
    const r = fight(LootWeapon.Heavy);
    expect(r.reason).toBe(EndReason.Victory);
    expect([r.shots, r.hits, r.seconds]).toEqual(WITH_HEAVY); expect(r.shots).toBeLessThan(PULSE_ONLY[0]!);
  });
});
const PULSE_ONLY = [36, 25, 420], WITH_HEAVY = [31, 21, 255];   // shots, hits (strips included), seconds from the arrival to the kill: re-recorded at WARDEN_HULL_MULT 1.5 (Loop-iv amendment F8; 2.5 gave 56/41/653 and 47/34/383)
