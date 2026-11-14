import { describe, it, expect } from 'vitest';
import { step, fixtureRunner } from './helpers/rawInput';
import { botIntent, gunnerPid, BOT_RECOVER_HEALTH } from './helpers/bot';
import { igniteRoom } from '../src/renderer/src/sim/hazards/fire';
import { roomAt } from '../src/renderer/src/sim/grid';
import { Seated, Health, Position } from '../src/renderer/src/sim/components';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { EnemySystem } from '../src/renderer/src/sim/enemy';
import { ENEMY_SHIELDS_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { parseShip } from '../src/renderer/src/sim/ship/schema';
import { createSimState, type SimState } from '../src/renderer/src/sim/state';
import { NEUTRAL_INTENT } from '../src/shared/intent';
import skiff from '../src/renderer/src/sim/ship/skiff.json';
import { makeState, quiet, placeEnemy, disableSystem, seconds, wake, room } from './helpers/sim';

// Spec Demo-xiii section 3: the bot gunner. Each fixture: a quiet ship (no director spawns, no boarders, no enemy fire), the enemy placed.
function hush(s: SimState): SimState { wake(s); quiet(s); s.boarders.nextArrivalTick = 1e9; s.enemy.nextArrivalTick = 1e9; return s; }
function starterFight(): SimState {
  const s = hush(makeState(2, 1)); placeEnemy(s); s.enemy.nextShotTick = 1e9; s.enemy.departTick = 1e9;
  s.weapons.torpedoStock = 0; s.weapons.torpedoLoaded = 0;   // the beam alone unless a test loads the tube
  return s;
}
const wpnOf = (s: SimState): number => s.derived.stationOfKind[StationKind.Weapons]!;
const sciOf = (s: SimState): number => s.derived.stationOfKind[StationKind.Science]!;
/** Step with pid 0 standing still and pid 1 the bot, until `done` or the tick budget runs out; returns the ticks used. */
function runBot1(s: SimState, ticks: number, done: () => boolean = () => false): number {
  for (let t = 0; t < ticks; t++) { if (done()) return t; s.enemy.nextShotTick = 1e9; step(s, [NEUTRAL_INTENT, botIntent(s, 1)]); }
  return ticks;
}

describe('the bot gunner (spec Demo-xiii section 3)', () => {
  it('the gunner is pid 1 at a lone Weapons console with two or more crew, pid 0 alone, and the captain at a Helm group', () => {
    expect(gunnerPid(makeState(2, 1))).toBe(1);
    expect(gunnerPid(makeState(1, 1))).toBe(0);
    expect(gunnerPid(createSimState(parseShip(skiff), 2, 1))).toBe(0);
  });

  it('walks to Weapons and sits when an enemy is present, and stands when it has gone', () => {
    const s = starterFight(), w = wpnOf(s), eid = s.crew[1]!;
    const used = runBot1(s, seconds(20), () => Seated.station[eid] === w);
    expect(Seated.station[eid], `after ${used} ticks`).toBe(w);
    s.enemy.present = 0;
    runBot1(s, 10);
    expect(Seated.station[eid]).toBe(-1);
  });

  it('aims at the Shields room while it has layers or its system is up, then at the Weapons room', () => {
    const s = starterFight(), w = wpnOf(s); sitDown(s, 1, w); s.weapons.charge = 1;
    runBot1(s, 120, () => s.telemetry.shots > 0);
    expect([s.telemetry.shots, s.weapons.lastShotTarget]).toEqual([1, ENEMY_SHIELDS_SLOT]);
    disableSystem(s, EnemySystem.Shields); s.enemy.shieldLayers = 0; s.weapons.charge = 1;
    runBot1(s, 120, () => s.telemetry.shots > 1);
    expect([s.telemetry.shots, s.weapons.lastShotTarget]).toEqual([2, ENEMY_WEAPONS_SLOT]);
  });

  it('fires a loaded torpedo at the Shields room', () => {
    const s = starterFight(), w = wpnOf(s); sitDown(s, 1, w); s.weapons.torpedoLoaded = 1;
    runBot1(s, 120, () => s.telemetry.shots > 0);
    expect([s.telemetry.shots, s.weapons.lastShotTarget, s.weapons.lastShotKind, s.weapons.torpedoLoaded]).toEqual([1, ENEMY_SHIELDS_SLOT, 1, 0]);
  });

  it('tunes the Pulse to the frequency Science found, and keeps its selector while none is known', () => {
    const known = starterFight(); sitDown(known, 1, wpnOf(known)); known.enemy.shieldFreq = 3; known.enemy.scanned = 1; known.weapons.charge = 1;
    runBot1(known, 120, () => known.telemetry.shots > 0);
    expect([known.telemetry.shots, known.weapons.selector]).toEqual([1, Weapon.BeamF3]);
    const unknown = starterFight(); sitDown(unknown, 1, wpnOf(unknown)); unknown.enemy.shieldFreq = 3; unknown.weapons.selector = Weapon.BeamF2; unknown.weapons.charge = 1;
    runBot1(unknown, 120, () => unknown.telemetry.shots > 0);
    expect([unknown.telemetry.shots, unknown.weapons.selector]).toEqual([1, Weapon.BeamF2]);
  });

  it('holds fire while the enemy offers surrender', () => {
    const s = starterFight(); sitDown(s, 1, wpnOf(s)); s.weapons.charge = 1; s.weapons.torpedoLoaded = 1;
    s.enemy.fleeing = 1; s.enemy.surrenderIntact = 1;
    runBot1(s, seconds(5));
    expect([s.telemetry.shots, s.enemy.surrenderIntact]).toEqual([0, 1]);
  });

  it('never fires at debris or rocks: only the enemy rooms', () => {
    const s = hush(makeState(2, 1)); sitDown(s, 1, wpnOf(s)); s.weapons.charge = 1;
    runBot1(s, seconds(5));
    expect(s.telemetry.shots).toBe(0);
  });

  it('switches to the Weapons tab of the Skiff\'s Helm group and fires, the drive not ready', () => {
    const s = hush(createSimState(parseShip(skiff), 2, 1)); s.run.jumpCharge = 0;
    placeEnemy(s); s.enemy.nextShotTick = 1e9; s.enemy.departTick = 1e9; s.weapons.torpedoStock = 0; s.weapons.torpedoLoaded = 0;
    const nav = s.derived.stationOfKind[StationKind.Navigation]!, w = wpnOf(s), g = s.derived.stationGroup[w]!;
    sitDown(s, 0, nav); s.weapons.charge = 1;
    expect(Seated.station[s.crew[0]!]).toBe(nav);
    for (let t = 0; t < 240 && s.telemetry.shots === 0; t++) { s.run.jumpCharge = 0; s.enemy.nextShotTick = 1e9; step(s, [botIntent(s, 0), NEUTRAL_INTENT]); }
    expect([Seated.station[s.crew[0]!], s.groups.tab[g], Number(fixtureRunner(s).ui.groupBar[g]), s.telemetry.shots, s.weapons.lastShotTarget]).toEqual([w, 1, 0, 1, ENEMY_SHIELDS_SLOT]);
  });

  it('a seated Science bot scans the enemy ship', () => {
    const s = starterFight(), sci = sciOf(s); sitDown(s, 1, sci);
    runBot1(s, seconds(30), () => s.enemy.scanned === 1);
    expect([s.enemy.scanned, s.stations.cursor[sci]]).toEqual([1, ENEMY_SLOT]);
  });

  it('the gunner draws nothing: botIntent leaves every stream as it was', () => {
    const s = starterFight(); sitDown(s, 1, wpnOf(s)); s.weapons.charge = 1;
    const before = JSON.stringify(s.rng);
    for (let k = 0; k < 10; k++) { botIntent(s, 0); botIntent(s, 1); }
    expect(JSON.stringify(s.rng)).toBe(before);
  });
});

describe('the gunner leaves the guns (spec Demo-xiii amendment 2)', () => {
  it('stands for a fire anywhere aboard, a healthy teammate standing by', () => {
    const s = starterFight(); sitDown(s, 1, wpnOf(s));
    igniteRoom(s, room(s, 'F'));
    runBot1(s, 4);
    expect(Seated.station[s.crew[1]!]).toBe(-1);
  });
  it('a hurt gunner heals in the Medbay first, then takes the guns', () => {
    const s = starterFight(), eid = s.crew[1]!, med = s.derived.stationRoom[s.derived.stationOfKind[StationKind.Medbay]!]!;
    Health.cur[eid] = 40;
    let healed = -1;
    const used = runBot1(s, seconds(60), () => { if (healed < 0 && roomAt(s, Position.x[eid]!, Position.y[eid]!) === med) healed = s.tick; return Seated.station[eid] === wpnOf(s); });
    expect(healed, 'reached the Medbay').toBeGreaterThanOrEqual(0);
    expect(Seated.station[eid], `after ${used} ticks`).toBe(wpnOf(s));
    expect(Health.cur[eid]).toBeGreaterThanOrEqual(BOT_RECOVER_HEALTH);
  });
});
