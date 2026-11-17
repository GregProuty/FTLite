// The duel's end card model (H-1 spec §4 End): the outcome, the duel's length and how to start the next one. Pure.
import { Outcome } from '../../sim/tactical/state';
import { TICK_HZ } from '../../sim/tuning';
import { AMBER, GOOD, WARN } from '../theme';

export interface EndView { title: string; tint: number; length: string; prompt: string }

/** The end card for a decided round: `ticks` is the round's length, `prompt` the keys line (H-2 spec §7: ENTER: REMATCH). */
export function endModel(outcome: number, ticks: number, prompt: string): EndView | null {
  if (outcome === Outcome.Running) return null;
  const title = outcome === Outcome.CrewWins ? 'VICTORY' : outcome === Outcome.EnemyWins ? 'DEFEAT' : 'BOTH SHIPS LOST';
  const tint = outcome === Outcome.CrewWins ? GOOD : outcome === Outcome.EnemyWins ? WARN : AMBER;
  const s = Math.floor(ticks / TICK_HZ);
  return { title, tint, length: `DUEL LENGTH ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, prompt };
}
