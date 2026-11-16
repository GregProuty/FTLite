# Round 3 response (spec revised; review cap reached)

Reviewed `round-3.json`. Codex confirmed R1-F4 and R1-F7 resolved. R1-F3 was re-raised with a precise gap, which I confirmed and fixed. This is the run's last round.

## R1-F3 [P1]: Duel completion has no specified wire record (fixed again)

Confirmed: the accumulator stores `terminal` as per-ship cause arrays, because one tick can kill a ship several ways (`duel/telemetry.ts:L50-L55, L152-L161`). `DuelEndSummary.terminal` is now `[TerminalCause[], TerminalCause[]]`. Each array is in accumulator order with no duplicates, is empty for a ship that survived, and is codec-validated. The continuation proof now compares the end summary as well as per-tick hashes, with M chosen so the duel ends within the run.

## Also changed

- Change log entry for round 3.

## Files changed

- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->
