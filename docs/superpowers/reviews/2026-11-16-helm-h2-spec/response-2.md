# Round 2 response (spec revised)

Reviewed `round-2.json` against the spec and the code. 2 accepted (both P1), 0 rejected, 0 deferred.

## R1-F7 [P2]: peer-lost pause ordering (still open)

Confirmed. A lifecycle pause applied before the steward's presence command executes would leave that command pending for the whole outage, and capture refuses while anything is pending (`core.ts:127`). The manager now calls `pause('peer-lost')` only once the presence command has an applied result, at least one tick later. The test asserts that the applied tick comes before the pause boundary and that a pause capture is delivered.

## R2-F1 [P1]: end-card ticks and the telemetry accumulator

Confirmed. `recordTick` skips only ticks that did not advance (`telemetry.ts:87-92`), so advancing end-card ticks would inflate the counters and reset the terminal causes, and a restore through `session()` (`duelRules.ts:21`) would rebuild that wrong summary. The fix:
- The accumulator freezes once a round is decided: later decided ticks are ignored, and the causes are not recomputed.
- The round module gains `decidedTick`, and it is added to `MIGRATIONS[38]`, which now adds four fields.
- The checkpoint rule becomes: telemetry ticks = tick − `baseTick` while the round is running, and `decidedTick` − `baseTick` once it is decided.
- The snapshot validator checks `decidedTick`.
- A test captures on the end card at least 60 ticks after the decision, restores, and compares the summary with the round record.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-16-helm-h2-networked-duel-design.md

<!-- end -->
