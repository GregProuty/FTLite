import { describe, it, expect } from 'vitest';
import { step } from './helpers/rawInput';
import { botIntent } from './helpers/bot';
import { jumpShip } from '../src/renderer/src/sim/run';
import { Life, LifeState, Health } from '../src/renderer/src/sim/components';
import { DEFAULT_CHARACTERS } from '../src/renderer/src/sim/characters';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState, type SimState } from './helpers/simLifetime';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import { TICK_HZ, HEALTH_MAX } from '../src/renderer/src/sim/tuning';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { quiet, seconds } from './helpers/sim';

// Spec Demo-xiii section 4: the tempo, on gate-skiff's seeds and crew.
const SKIFF = parseShip(skiff);
const SEEDS = [1, 2, 3];

/** A passive crew (nobody seated, nobody moving): the calm start's minute, the jump to column 1 (all Hazard), the director and boarders hushed so only the enemy's fire lands. Hull lost in the 60 s from its arrival. */
function passiveHullLost(seed: number): number {
  const s = createSimState(SKIFF, 2, seed, DEFAULT_CHARACTERS); quiet(s); s.boarders.nextArrivalTick = 1e9;
  const idle = (): void => step(s, [NEUTRAL_INTENT, NEUTRAL_INTENT]);
  for (let t = 0; t < seconds(60); t++) idle();
  jumpShip(s, { column: 1, node: 0 }); quiet(s);
  while (!s.enemy.present) idle();
  const hull = s.hull, arrived = s.tick;
  while (s.tick < arrived + seconds(60)) idle();
  return hull - s.hull;
}

/** gate-skiff's loop (two bots, the captain the gunner) until the first enemy has gone, the drive pinned once the ship has jumped so the fight ends by the enemy (spec section 4: it dies or flees). */
function firstFight(s: SimState, limit = seconds(600)): { seconds: number; outcome: string; minHealth: number; hullLost: number } {
  let arrived = -1, hull = 0, minHealth = HEALTH_MAX;
  const before = { k: 0, su: 0, fl: 0 };
  for (let t = 0; t < limit && !s.ended; t++) {
    if (s.telemetry.jumps >= 1) s.run.jumpCharge = 0;
    step(s, [botIntent(s, 0), botIntent(s, 1)]);
    for (const eid of s.crew) if (Life.state[eid] === LifeState.Conscious) minHealth = Math.min(minHealth, Health.cur[eid]!);
    if (arrived < 0 && s.enemy.present) { arrived = s.tick; hull = s.hull; before.k = s.telemetry.enemiesDestroyed; before.su = s.telemetry.surrenders; before.fl = s.telemetry.enemyFled; }
    if (arrived >= 0 && !s.enemy.present) {
      const outcome = s.telemetry.enemiesDestroyed > before.k ? 'kill' : s.telemetry.surrenders > before.su ? 'surrender' : s.telemetry.enemyFled > before.fl ? 'flight' : 'withdrawn';
      return { seconds: (s.tick - arrived) / TICK_HZ, outcome, minHealth, hullLost: hull - s.hull };
    }
  }
  return { seconds: -1, outcome: s.ended ? 'lost' : 'unfinished', minHealth, hullLost: hull - s.hull };
}

describe('combat tempo (spec Demo-xiii section 4)', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: an ignored first enemy costs 15 to 30 hull in its first 60 s`, { timeout: 60_000 }, () => {
      const lost = passiveHullLost(seed);
      expect(lost).toBeGreaterThanOrEqual(15); expect(lost).toBeLessThanOrEqual(30);
      expect(lost).toBe(PASSIVE_HULL_LOST[seed - 1]);   // recorded (amendment 6)
    });
    it(`seed ${seed}: with the starting loadout and the bot gunner the first enemy dies or flees in 40 to 80 s`, { timeout: 60_000 }, () => {
      const f = firstFight(createSimState(SKIFF, 2, seed, DEFAULT_CHARACTERS));
      expect(['kill', 'surrender', 'flight'], JSON.stringify(f)).toContain(f.outcome);
      expect(f.seconds, JSON.stringify(f)).toBeGreaterThanOrEqual(40); expect(f.seconds, JSON.stringify(f)).toBeLessThanOrEqual(80);
      expect([f.outcome, Math.round(f.seconds)]).toEqual(FIRST_FIGHT[seed - 1]);   // recorded (amendment 6)
    });
    it(`seed ${seed}: a sector-3 enemy against the gunner and no upgrades is survived`, { timeout: 60_000 }, () => {
      const s = createSimState(SKIFF, 2, seed, DEFAULT_CHARACTERS); s.run.sector = 2;   // the third sector, column 1: depth 13
      const f = firstFight(s);
      expect(s.ended, JSON.stringify(f)).toBe(0);
      expect(['kill', 'surrender', 'flight', 'withdrawn'], JSON.stringify(f)).toContain(f.outcome);
      expect(s.crew.filter((eid) => Life.state[eid] === LifeState.Conscious).length, JSON.stringify(f)).toBe(2);
      expect([f.outcome, Math.round(f.seconds), f.hullLost]).toEqual(SECTOR_3[seed - 1]);   // recorded (amendment 7)
    });
  }
});
const PASSIVE_HULL_LOST = [20, 20, 20];   // two shots land in the minute on every seed, ENEMY_SHOT_HULL_DAMAGE 10 each (was 8: 4 each)
const FIRST_FIGHT: [string, number][] = [['kill', 45], ['surrender', 66], ['surrender', 56]];   // seconds from the arrival to its departure (a surrender's 8 s flee included)
const SECTOR_3: [string, number, number][] = [['surrender', 68, 2], ['withdrawn', 120, 50], ['surrender', 88, 0]];   // outcome, seconds, hull lost: seed 2 is the hard one (the enemy outlasts ENCOUNTER_MAX)
