import { fixtureCouchViewer } from './helpers/cardUi';
import { weaponSelection, fireFixtureWeapon, weaponsDirection } from './helpers/weaponFixture';
import { describe, it, expect } from 'vitest';
import { ENEMY_SLOT, ENEMY_SLOTS, ENEMY_PILOTING_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT, enemyRoomOfSlot, slotOfEnemyRoom, warnedTargets } from '../src/renderer/src/sim/debrisTargets';
import { EnemyRoom, EnemySystem, ENEMY_ROOM_NAMES, damageEnemy, enemyBeamThreshold, enemySystem } from '../src/renderer/src/sim/enemy';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { windowOrder } from '../src/renderer/src/render/enemyShipLayout';
import { enemyWindowModel, stepWindowAnim, freshWindowAnim } from '../src/renderer/src/render/enemyWindowModel';
import { buildHudModel, targetRowText, type WeaponsPanel } from '../src/renderer/src/render/hudModel';
import { textPx } from '../src/renderer/src/render/theme';
import { CARD_INNER_W } from '../src/renderer/src/render/hudLayout';
import { StationKind } from '../src/renderer/src/sim/stationKinds';
import { sitDown } from '../src/renderer/src/sim/stations';
import { Dir } from '../src/renderer/src/sim/dir';
import { createRng, nextFloat } from '../src/shared/rng';
import { ENEMY_SYS_HP, ENEMY_SYS_REPAIR, ENEMY_BEAM_DAMAGE, ENEMY_EVADE, ENEMY_HULL, ENEMY_FLEE_FRAC, TICK_HZ, ENEMY_HIT_FIRE } from '../src/renderer/src/sim/tuning';
import { makeState, quiet, placeEnemy, disableSystem } from './helpers/sim';

/** Targeting the enemy ship's rooms (spec Demo-x-c section 4). */
const seated = () => { const s = makeState(1); quiet(s); placeEnemy(s); s.enemy.nextShotTick = 1e9; const w = s.derived.stationOfKind[StationKind.Weapons]!; sitDown(s, 0, w); return { s, w }; };
const slots = [{ status: 'active' as const, key: 'kb:0' }];

describe('the five rooms as targets', () => {
  it('the Weapons card walks all five rooms in the window order, top to bottom: Hold, Weapons, Piloting, Engines, Shields, with wrap', () => {
    expect(ENEMY_SLOTS.map(enemyRoomOfSlot)).toEqual(windowOrder());
    expect(ENEMY_SLOTS.map((k) => ENEMY_ROOM_NAMES[enemyRoomOfSlot(k)])).toEqual(['Hold', 'Weapons', 'Piloting', 'Engines', 'Shields']);
    for (let r = 0; r < 5; r++) expect(enemyRoomOfSlot(slotOfEnemyRoom(r))).toBe(r);
    const { s, w } = seated(); expect(weaponSelection(s).cursor).toBe(ENEMY_SLOT);
    const seen = [weaponSelection(s).cursor];
    for (let k = 0; k < 5; k++) { weaponsDirection(s, w, Dir.Down, false); seen.push(weaponSelection(s).cursor); }
    expect(seen).toEqual([ENEMY_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_PILOTING_SLOT, ENEMY_ENGINES_SLOT, ENEMY_SHIELDS_SLOT, ENEMY_SLOT]);
    weaponsDirection(s, w, Dir.Up, false); expect(weaponSelection(s).cursor).toBe(ENEMY_SHIELDS_SLOT);
    expect(warnedTargets(s, false)).toEqual([ENEMY_SLOT]);   // Science keeps one row for the ship
  });
  it('the reticle marks the targeted room in the window as the cursor walks', () => {
    const { s, w } = seated(); let a = stepWindowAnim(freshWindowAnim(), s); s.tick += 600; a = stepWindowAnim(a, s);
    for (const slot of ENEMY_SLOTS) { weaponSelection(s).cursor = slot; expect(enemyWindowModel(s, s.tick, a).reticle).toEqual({ room: enemyRoomOfSlot(slot) }); }
  });
  it('the card rows read `Shields room  100%` for a system room and `Hold  hull 64%` for the plain room, and fit the card', () => {
    const { s } = seated(); s.enemy.hull = 0.64 * s.enemy.maxHull;
    const rows = () => (buildHudModel(s, fixtureCouchViewer(s), { slots: slots, phase: 'running', message: '' }).players[0]!.console as WeaponsPanel).targets.map((t) => targetRowText(t));
    expect(rows()).toEqual(['Hold  hull 64%', 'Weapons room  100%', 'Piloting room  100%', 'Engines room  100%', 'Shields room  100%']);
    s.enemy.sysHp[EnemySystem.Piloting] = 15; expect(rows()[2]).toBe('Piloting room  50%');
    for (const name of ENEMY_ROOM_NAMES) for (const t of [`${name} room  DOWN 45s`, `${name} room  100%  ION 10s`, `${name}  hull 100%`]) expect(textPx(t), t).toBeLessThanOrEqual(CARD_INNER_W);
  });
});

describe('Piloting and the Hold (spec Demo-x-c section 4)', () => {
  it('Piloting gates the evasion: up, the threshold is lowered by ENEMY_EVADE; down or ionised, it is not; the engines play no part', () => {
    const { s } = seated(), up = enemyBeamThreshold(s, 0.5);
    disableSystem(s, EnemySystem.Engines); expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(up, 12);
    disableSystem(s, EnemySystem.Piloting); expect(enemyBeamThreshold(s, 0.5)).toBeCloseTo(up + ENEMY_EVADE, 12);
    const t = seated().s; t.enemy.ionUntil[EnemySystem.Piloting] = t.tick + 600; expect(enemyBeamThreshold(t, 0.5)).toBeCloseTo(up + ENEMY_EVADE, 12);
  });
  it('the engines still drive the flight: with Piloting down a hurt enemy still flees; with the engines down it does not', () => {
    const p = seated().s; disableSystem(p, EnemySystem.Piloting); p.enemy.hull = ENEMY_FLEE_FRAC * p.enemy.maxHull; enemySystem(p); expect(p.enemy.fleeing).toBe(1);
    const e = seated().s; disableSystem(e, EnemySystem.Engines); e.enemy.hull = ENEMY_FLEE_FRAC * e.enemy.maxHull; enemySystem(e); expect(e.enemy.fleeing).toBe(0);
  });
  it('a Piloting hit damages the system and the hull; at 0 it goes down and self-repairs after ENEMY_SYS_REPAIR', () => {
    const { s } = seated();
    damageEnemy(s, ENEMY_PILOTING_SLOT, ENEMY_BEAM_DAMAGE); expect([s.enemy.sysHp[EnemySystem.Piloting], s.enemy.hull]).toEqual([ENEMY_SYS_HP - ENEMY_BEAM_DAMAGE, ENEMY_HULL - ENEMY_BEAM_DAMAGE]);
    damageEnemy(s, ENEMY_PILOTING_SLOT, ENEMY_BEAM_DAMAGE); expect(s.enemy.sysHp[EnemySystem.Piloting]).toBe(0); expect(s.enemy.sysRepairTick[EnemySystem.Piloting]).toBe(s.tick + ENEMY_SYS_REPAIR * TICK_HZ);
    s.tick = s.enemy.sysRepairTick[EnemySystem.Piloting]!; s.enemy.departTick = s.tick + 1e6; enemySystem(s); expect(s.enemy.sysHp[EnemySystem.Piloting]).toBe(ENEMY_SYS_HP);
  });
  it('a Hold hit is hull damage only, its fire or breach in the Hold, with no room draw', () => {
    const { s, w } = seated(); s.enemy.shieldLayers = 0; s.weapons.charge = 1; s.weapons.selector = Weapon.BeamF1; weaponSelection(s).cursor = ENEMY_SLOT;
    let seed = 1; for (; seed < 5000; seed++) { const r = createRng(seed); if (nextFloat(r) < 0.3 && nextFloat(r) < ENEMY_HIT_FIRE) break; }
    s.rng.combat.s = seed; expect(fireFixtureWeapon(s)).toBe(true);
    const ref = createRng(seed); nextFloat(ref); nextFloat(ref); expect(s.rng.combat.s).toBe(ref.s);
    expect(s.enemy.hull).toBe(ENEMY_HULL - ENEMY_BEAM_DAMAGE); expect(Array.from(s.enemy.sysHp)).toEqual([ENEMY_SYS_HP, ENEMY_SYS_HP, ENEMY_SYS_HP, ENEMY_SYS_HP]);
    expect(Array.from(s.enemy.roomFire).map((v) => v > 0)).toEqual([false, false, false, false, true]); expect(EnemyRoom.Hold).toBe(4);
  });
});
