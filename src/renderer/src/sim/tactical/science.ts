// The duel's science rules (Sci-1 spec 2026-11-17-science-scans §4, §5): what an admitted scan command does to the
// ship's one scanner. Tasks 3 to 5 of the plan add hostility, scan progress, the derelict's orbit and salvage. Sim
// code: the heading tables for trig, never Math.sin, Math.cos or Math.PI (the determinism guard).
import type { TacticalState } from './state';

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
