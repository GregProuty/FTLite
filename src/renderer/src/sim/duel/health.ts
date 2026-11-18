// Duel health (duel-health spec §1): crew health, the downed state, pick-up by standing near and the Medbay, kept in the
// interior's own Health.cur, Life.state and Life.reviveProgress (so the duel hash and snapshot carry them with no new
// field). The sector's crewSystem never runs here: no bleed-out, no death, no power shed. If both characters are down at
// once the round is lost, as when the crew ship's hull reaches 0 (owner 2026-11-17).
import { Health, Life, LifeState, Position, Seated } from '../components';
import { roomAt } from '../grid';
import { StationKind } from '../stationKinds';
import { stationOnline, standUp } from '../stations';
import type { DuelEvent } from '../tactical/state';
import { Outcome } from '../tactical/state';
import { DEBRIS_CREW_DAMAGE, DT, ENEMY_SHOT_CREW_DAMAGE, FIRE_DAMAGE, HEALTH_MAX, MEDBAY_HEAL, REACH } from '../tuning';
import type { DuelState, HealthEvent } from './state';
import { DUEL_REVIVE_TICKS } from './tuning';

const PLAYERS = 2;
const eidOf = (d: DuelState, pid: number): number => d.interior.crew[pid]!;
export const isDowned = (d: DuelState, pid: number): boolean => Life.state[eidOf(d, pid)] === LifeState.Downed;
const isConscious = (d: DuelState, pid: number): boolean => Life.state[eidOf(d, pid)] === LifeState.Conscious;
const standing = (d: DuelState, pid: number): boolean => Seated.station[eidOf(d, pid)]! < 0;
const roomOf = (d: DuelState, pid: number): number => { const e = eidOf(d, pid); return roomAt(d.interior, Position.x[e]!, Position.y[e]!); };

/** Take up to `amount` health from pid; returns what was taken. */
function hurt(d: DuelState, pid: number, amount: number): number {
  const e = eidOf(d, pid), before = Health.cur[e]!;
  Health.cur[e] = Math.max(0, before - amount);
  return before - Health.cur[e]!;
}

/** The crew damage of a tactical event that is an enemy hit on the crew ship's Room (the hits duel fire counts, duel-fire
 *  spec §1.1): a laser that hit, fired by ship 1, costs ENEMY_SHOT_CREW_DAMAGE; a missile that ended on ship 0
 *  DEBRIS_CREW_DAMAGE; anything else 0. */
export function hitDamage(e: DuelEvent): number {
  if (e.kind !== 'laser' && e.kind !== 'missileEnd') return 0;   // Sci-1's hostile, scanDone and salvage are no hits
  if (e.room < 0) return 0;
  if (e.kind === 'laser') return e.ship === 1 && e.hit ? ENEMY_SHOT_CREW_DAMAGE : 0;
  return e.cause === 'ship' && e.target === 0 ? DEBRIS_CREW_DAMAGE : 0;
}

/** Spec §1.2 hits, applied in tactical event order after stepDuel and before the fire rolls: each hit costs its damage to
 *  every conscious, standing character in the interior room of the hit Room's repair point. Returns the crewHurt events
 *  (pushed later by healthPhase, after the repair and fire events of the tick). */
export function applyHitDamage(d: DuelState, events: readonly DuelEvent[]): HealthEvent[] {
  const out: HealthEvent[] = [];
  for (const e of events) {
    if (e.kind !== 'laser' && e.kind !== 'missileEnd') continue;
    const amount = hitDamage(e);
    if (amount === 0) continue;
    const point = d.points.find((q) => q.tacticalRoom === e.room);
    if (!point) continue;
    for (let pid = 0; pid < PLAYERS; pid++) {
      if (!isConscious(d, pid) || !standing(d, pid) || roomOf(d, pid) !== point.room) continue;
      const took = hurt(d, pid, amount);
      if (took > 0) out.push({ kind: 'crewHurt', player: pid, amount: took, cause: 'hit' });
    }
  }
  return out;
}

/** The characters within REACH (centre to centre) of downed pid who can pick it up: conscious, present and standing. */
export function revivers(d: DuelState, pid: number): number[] {
  const e = eidOf(d, pid), x = Position.x[e]!, y = Position.y[e]!, out: number[] = [];
  for (let o = 0; o < PLAYERS; o++) {
    if (o === pid || !isConscious(d, o) || !d.present[o as 0 | 1] || !standing(d, o)) continue;
    const oe = eidOf(d, o), dx = Position.x[oe]! - x, dy = Position.y[oe]! - y;
    if (Math.sqrt(dx * dx + dy * dy) <= REACH) out.push(o);
  }
  return out;
}

/** The interior room of the layout's Medbay station, or −1. */
export function medbayRoom(d: DuelState): number {
  const mb = d.interior.derived.stationOfKind[StationKind.Medbay]!;
  return mb >= 0 ? d.interior.derived.stationRoom[mb]! : -1;
}

/** Whether the Medbay heals now (it exists and is online). */
export function medbayOnline(d: DuelState): boolean {
  const mb = d.interior.derived.stationOfKind[StationKind.Medbay]!;
  return mb >= 0 && stationOnline(d.interior, mb);
}

/** Whether pid heals this tick: conscious, standing in the online Medbay's room, below HEALTH_MAX. */
export function healing(d: DuelState, pid: number): boolean {
  return isConscious(d, pid) && medbayOnline(d) && roomOf(d, pid) === medbayRoom(d) && Health.cur[eidOf(d, pid)]! < HEALTH_MAX;
}

/**
 * The rest of spec §1 after the fire phase: fire damage (FIRE_DAMAGE per second, per tick, to every conscious character
 * in a burning room); the downed transition at 0 (stood up, progress reset, no bleed-out); pick-up (a whole tick per tick
 * with any reviver in reach, stored as ticks / DUEL_REVIVE_TICKS; none in reach resets it; at DUEL_REVIVE_TICKS the
 * character is Conscious at 1); the Medbay (MEDBAY_HEAL per second while online, to HEALTH_MAX); and the both-down loss.
 * Pushes `hits` then the fire crewHurt events, then downed, then revived, each in player order.
 */
export function healthPhase(d: DuelState, hits: readonly HealthEvent[]): void {
  const st = d.interior, fire = st.rooms.fire, events: HealthEvent[] = [...hits];
  for (let pid = 0; pid < PLAYERS; pid++) {
    if (!isConscious(d, pid)) continue;
    const r = roomOf(d, pid);
    if (r < 0 || fire[r]! <= 0) continue;
    const took = hurt(d, pid, FIRE_DAMAGE * DT);
    if (took > 0) events.push({ kind: 'crewHurt', player: pid, amount: took, cause: 'fire' });
  }
  for (let pid = 0; pid < PLAYERS; pid++) {
    const e = eidOf(d, pid);
    if (!isConscious(d, pid) || Health.cur[e]! > 0) continue;
    Life.state[e] = LifeState.Downed; standUp(st, pid);
    Life.reviveProgress[e] = 0; Life.reviverPid[e] = -1; Life.bleed[e] = 0;
    events.push({ kind: 'downed', player: pid });
  }
  for (let pid = 0; pid < PLAYERS; pid++) {
    if (!isDowned(d, pid)) continue;
    const e = eidOf(d, pid), by = revivers(d, pid);
    if (by.length === 0) { Life.reviveProgress[e] = 0; Life.reviverPid[e] = -1; continue; }
    const ticks = Math.round(Life.reviveProgress[e]! * DUEL_REVIVE_TICKS) + 1;
    if (ticks >= DUEL_REVIVE_TICKS) {
      Life.state[e] = LifeState.Conscious; Health.cur[e] = 1; Life.reviveProgress[e] = 0; Life.reviverPid[e] = -1;
      events.push({ kind: 'revived', player: pid, by });
    } else { Life.reviveProgress[e] = ticks / DUEL_REVIVE_TICKS; Life.reviverPid[e] = by[0]!; }
  }
  for (let pid = 0; pid < PLAYERS; pid++) if (healing(d, pid)) { const e = eidOf(d, pid); Health.cur[e] = Math.min(HEALTH_MAX, Health.cur[e]! + MEDBAY_HEAL * DT); }
  let down = 0;
  for (let pid = 0; pid < PLAYERS; pid++) if (isDowned(d, pid)) down++;
  if (down === PLAYERS && d.tactical.outcome === Outcome.Running) d.tactical.outcome = Outcome.EnemyWins;   // a round already decided this tick stands
  d.events.push(...events);
}
