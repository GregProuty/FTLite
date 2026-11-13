import type { SimState } from '../sim/state';
import { Weapon, slotOfSelector } from '../sim/weapons';
import { weaponDef } from '../sim/weaponDefs';
import { isEnemySlot, enemyRoomOfSlot, enemySystemOf } from '../sim/debrisTargets';
import { ENEMY_ROOM_NAMES, EnemyRoom } from '../sim/enemy';
import { TICK_HZ, ION_SECONDS } from '../sim/tuning';

/** How long the last shot's result shows on the Weapons card and in the enemy window (spec Demo-xiv section 2). */
export const SHOT_RESULT_SECONDS = 3;
export type ShotTone = 'hit' | 'strip' | 'miss';
export interface ShotResult { text: string; tone: ShotTone }

/** An enemy room as the result line names it: `Shields room`, the `Hold`. */
const roomLabel = (slot: number): string => { const r = enemyRoomOfSlot(slot); return r === EnemyRoom.Hold ? 'Hold' : `${ENEMY_ROOM_NAMES[r]} room`; };

/** The last shot's result for SHOT_RESULT_SECONDS, else null (spec Demo-xiv section 2): `Hit: Shields room -15`, `Shield stripped (freq 1, needs 2)`, `Shield stripped (freq unknown)`, `Missed`, `Torpedo: Shields room -35`. Pure; reads the sim's last-shot fields. */
export function shotResult(state: SimState, nowTick: number = state.tick): ShotResult | null {
  const w = state.weapons, age = nowTick - w.lastShotTick;
  if (w.lastShotTick < 0 || age < 0 || age >= SHOT_RESULT_SECONDS * TICK_HZ) return null;
  const sel = w.lastShotSelector, k = slotOfSelector(sel), def = k >= 0 ? weaponDef(w.slot[k]!) : null, slot = w.lastShotTarget, enemy = isEnemySlot(slot);
  const label = sel === Weapon.Torpedo ? 'Torpedo' : def && def.shots > 0 ? def.short : 'Hit';   // a slot swapped out since the shot reads as a plain hit
  if (def?.kind === 'ion') {   // the ion cannon: a layer stripped, a system switched off, nothing on the Hold
    if (w.lastShotResult === 0) return { text: 'Missed', tone: 'miss' };
    if (w.lastShotResult === 1) return { text: 'Ion: shield stripped', tone: 'strip' };
    return { text: enemySystemOf(slot) >= 0 ? `Ion: ${roomLabel(slot)} off ${ION_SECONDS}s` : 'Ion: Hold, no effect', tone: 'hit' };
  }
  if (w.lastShotDamage > 0 || w.lastShotResult === 2) return { text: `${label}: ${enemy ? `${roomLabel(slot)} -${w.lastShotDamage}` : 'target destroyed'}`, tone: 'hit' };   // a volley with any damage counts as a hit
  if (w.lastShotResult === 0) return { text: 'Missed', tone: 'miss' };
  const e = state.enemy;   // a strip: why the shield took it
  if (def) return { text: `Shield stripped (${def.short} needs a lock)`, tone: 'strip' };
  const fired = sel + 1;
  return { text: e.scanned ? (fired === e.shieldFreq ? `Shield stripped (freq ${fired})` : `Shield stripped (freq ${fired}, needs ${e.shieldFreq})`) : 'Shield stripped (freq unknown)', tone: 'strip' };
}
