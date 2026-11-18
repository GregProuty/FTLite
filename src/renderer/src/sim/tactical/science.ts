// The duel's science rules (Sci-1 spec 2026-11-17-science-scans §4, §5): what an admitted scan command does to the
// ship's one scanner. Tasks 3 to 5 of the plan add hostility (here), scan progress, the derelict's orbit and salvage. Sim
// code: the heading tables for trig, never Math.sin, Math.cos or Math.PI (the determinism guard).
import { CREW_SLOT, HunterMode, type TacticalState } from './state';
import { HOSTILE_AFTER_TICKS } from './tuning';

/** A contactScan the duel step admitted (spec §5): scan the next level of `contact` at `rate` from station `by`. On the
 *  same contact and level the progress is kept: a faster station takes the scan over (applied), a slower or equal one
 *  is a noop (Artemis ignores a repeat click). Idle, or on the other contact, it starts afresh (that progress is lost). */
export function scanCommand(t: TacticalState, contact: number, rate: number, by: number): 'applied' | 'noop' {
  const level = t.known[contact]! + 1, s = t.scan;
  if (s.contact === contact && s.level === level) {
    if (rate <= s.rate) return 'noop';
    s.rate = rate; s.by = by;
    return 'applied';
  }
  s.contact = contact; s.level = level; s.progress = 0; s.rate = rate; s.by = by;
  return 'applied';
}

/** The round-relative tick (spec §4.1): ticks since the round began, read before the step's tick++. */
export function roundTick(t: TacticalState): number { return t.tick - t.startTick; }

/** Spec §4.1's hostility step, after the weapon clocks: while the enemy patrols, the first of the clock (the step of rt
 *  HOSTILE_AFTER_TICKS − 1), a crew laser release that hit, or a crew missile landing on the hunter slot turns it
 *  hostile for the round (Hunt) and pushes a hostile event, cause laser, then missile, then clock. */
export function hostilityStep(t: TacticalState, hunter: number): void {
  if (t.hostileAt >= 0 || hunter < 0) return;
  const rt = roundTick(t);
  const laser = t.events.some((e) => e.kind === 'laser' && e.ship === CREW_SLOT && e.hit);
  const missile = t.events.some((e) => e.kind === 'missileEnd' && e.ship === CREW_SLOT && e.cause === 'ship' && e.target === hunter);
  if (!laser && !missile && rt < HOSTILE_AFTER_TICKS - 1) return;
  t.hostileAt = rt; t.hunter.mode = HunterMode.Hunt;
  t.events.push({ kind: 'hostile', cause: laser ? 'laser' : missile ? 'missile' : 'clock' });
}
