import type { TelemetryRecord } from './telemetry';
import { SCORE_NODE, SCORE_VICTORY, SCORE_ENEMY, SCORE_BOARDER } from './tuning';
/** The run's score from its record (spec Run-iii section 3). Reads only existing fields. */
export function runScore(r: Omit<TelemetryRecord, 'score'>): number {
  return SCORE_NODE * r.run.nodesReached + (r.endReason === 'victory' ? SCORE_VICTORY : 0) + r.run.scrap.earned + SCORE_ENEMY * r.enemy.destroyed + SCORE_BOARDER * r.boarders.killed;
}
