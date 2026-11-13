import { describe, it, expect } from 'vitest';
import { shotResult, SHOT_RESULT_SECONDS } from '../src/renderer/src/render/shotResult';
import { Weapon } from '../src/renderer/src/sim/weapons';
import { LootWeapon } from '../src/renderer/src/sim/weaponDefs';
import { ENEMY_SLOT, ENEMY_SHIELDS_SLOT, ENEMY_PILOTING_SLOT, ENEMY_WEAPONS_SLOT } from '../src/renderer/src/sim/debrisTargets';
import { TICK_HZ, ION_SECONDS, ENEMY_BEAM_DAMAGE, ENEMY_TORP_DAMAGE } from '../src/renderer/src/sim/tuning';
import { textPx } from '../src/renderer/src/render/theme';
import { CARD_INNER_W } from '../src/renderer/src/render/hudLayout';
import { WINDOW, SHIP_MARGIN } from '../src/renderer/src/render/enemyWindowModel';
import { makeState, placeEnemy, quiet } from './helpers/sim';

/** A state whose last shot was fired at tick 600 with the given fields (spec Demo-xiv section 2). */
function shot(o: { target?: number; result: number; selector: number; damage?: number; kind?: number; freq?: number; scanned?: boolean }) {
  const s = makeState(2); quiet(s); placeEnemy(s, 100, o.freq ?? 2); s.enemy.scanned = o.scanned ? 1 : 0; s.tick = 600;
  const w = s.weapons; w.lastShotTick = 600; w.lastShotTarget = o.target ?? ENEMY_SHIELDS_SLOT; w.lastShotResult = o.result; w.lastShotSelector = o.selector; w.lastShotDamage = o.damage ?? 0; w.lastShotKind = o.kind ?? 0;
  return s;
}
const text = (s: ReturnType<typeof makeState>) => shotResult(s)?.text ?? null;

describe('the shot-result line (spec Demo-xiv section 2)', () => {
  it('a Pulse hit names the room and the damage; the Hold has no "room"', () => {
    expect(shotResult(shot({ result: 2, selector: Weapon.BeamF2, damage: ENEMY_BEAM_DAMAGE }))).toEqual({ text: 'Hit: Shields room -15', tone: 'hit' });
    expect(text(shot({ target: ENEMY_SLOT, result: 2, selector: Weapon.BeamF1, damage: ENEMY_BEAM_DAMAGE }))).toBe('Hit: Hold -15');
  });
  it('a strip says why: the frequency fired and the one needed once scanned, else unknown', () => {
    expect(shotResult(shot({ result: 1, selector: Weapon.BeamF1, scanned: true }))).toEqual({ text: 'Shield stripped (freq 1, needs 2)', tone: 'strip' });
    expect(text(shot({ result: 1, selector: Weapon.BeamF3, scanned: false }))).toBe('Shield stripped (freq unknown)');
  });
  it('a miss, a torpedo hit, a loot hit, a loot laser strip, the ion', () => {
    expect(shotResult(shot({ result: 0, selector: Weapon.BeamF2 }))).toEqual({ text: 'Missed', tone: 'miss' });
    expect(text(shot({ result: 2, selector: Weapon.Torpedo, damage: ENEMY_TORP_DAMAGE, kind: 1 }))).toBe('Torpedo: Shields room -35');
    const burst = shot({ target: ENEMY_PILOTING_SLOT, result: 0, selector: Weapon.Slot1, damage: 10 }); burst.weapons.slot[0] = LootWeapon.Burst;
    expect(shotResult(burst)).toEqual({ text: 'Burst: Piloting room -10', tone: 'hit' });   // the volley's first shot landed, the second missed
    const heavy = shot({ result: 1, selector: Weapon.Slot2 }); heavy.weapons.slot[1] = LootWeapon.Heavy;
    expect(text(heavy)).toBe('Shield stripped (Heavy needs a lock)');
    const ion = shot({ target: ENEMY_WEAPONS_SLOT, result: 2, selector: Weapon.Slot1 }); ion.weapons.slot[0] = LootWeapon.Ion;
    expect(text(ion)).toBe(`Ion: Weapons room off ${ION_SECONDS}s`);
    const ionUp = shot({ result: 1, selector: Weapon.Slot1 }); ionUp.weapons.slot[0] = LootWeapon.Ion; expect(text(ionUp)).toBe('Ion: shield stripped');
    const ionHold = shot({ target: ENEMY_SLOT, result: 2, selector: Weapon.Slot1 }); ionHold.weapons.slot[0] = LootWeapon.Ion; expect(text(ionHold)).toBe('Ion: Hold, no effect');
  });
  it('a debris hit says the target is gone', () => {
    expect(text(shot({ target: 0, result: 2, selector: Weapon.BeamF1 }))).toBe('Hit: target destroyed');
    expect(text(shot({ target: 0, result: 2, selector: Weapon.Torpedo, kind: 1 }))).toBe('Torpedo: target destroyed');
  });
  it(`shows for ${SHOT_RESULT_SECONDS} s from the shot, none before any shot`, () => {
    const s = shot({ result: 0, selector: 0 });
    s.tick = 600 + SHOT_RESULT_SECONDS * TICK_HZ - 1; expect(text(s)).toBe('Missed');
    s.tick += 1; expect(text(s)).toBeNull();
    expect(shotResult(makeState(1))).toBeNull();
  });
  it('every result fits the Weapons card and the enemy window at the HUD font', () => {
    const W = Math.min(CARD_INNER_W, WINDOW.w - 2 * SHIP_MARGIN), all: string[] = [];
    for (const target of [ENEMY_SLOT, ENEMY_WEAPONS_SLOT, ENEMY_SHIELDS_SLOT, ENEMY_PILOTING_SLOT, 0]) for (const result of [0, 1, 2]) for (const selector of [0, 1, 2, 3, 4, 5]) for (const id of [LootWeapon.Burst, LootWeapon.Heavy, LootWeapon.Ion, LootWeapon.Missile]) for (const scanned of [true, false]) {
      const s = shot({ target, result, selector, damage: 99, scanned, freq: 3 }); s.weapons.slot.fill(id); all.push(text(s)!);
    }
    for (const t of all) expect(textPx(t), t).toBeLessThanOrEqual(W);
  });
});
