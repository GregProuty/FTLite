// Single player's playtest record counter (H-2 spec §8, Helm §11a): the user pauses taken this round (an Escape pause's
// rising edge, read once per frame; blur, hidden and suspend pauses are not the user's) and the round's start time. Each
// record resets both, so the next round starts at 0 from the time of its predecessor's record.
import { soloDuelRecord, type DuelPlaytestRecord } from '../../net/duelRecord';
import type { DuelRoundRecord } from '../../sim/duel/summary';

export interface SoloRecorderDeps {
  /** The wall clock as an ISO string. */
  now(): string;
  /** The character the keyboard drives now. */
  active(): number;
  /** The duel's Helm player. */
  helmPlayer(): number;
}
export function soloRecorder(deps: SoloRecorderDeps) {
  let startedAtIso = deps.now(), pauses = 0, wasPaused = false;
  return {
    /** Once per frame, after the runtime's frame: whether the user's own pause is on. */
    framePaused(userPaused: boolean): void {
      if (userPaused && !wasPaused) pauses++;
      wasPaused = userPaused;
    },
    /** The decided round's solo record; `seat` is the character driven when it was decided. */
    record(summary: DuelRoundRecord): DuelPlaytestRecord {
      const r = soloDuelRecord(summary, { seat: deps.active(), helmPlayer: deps.helmPlayer(), startedAtIso, pauses });
      pauses = 0; startedAtIso = deps.now();
      return r;
    }
  };
}
