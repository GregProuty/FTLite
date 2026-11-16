# Round 2 response (plan revised)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1, R1-F3, R1-F4 and R1-F5 resolved. R1-F2 is still open on one field.

## R1-F2 [P1]: Snapshot validation misses tactical writer constraints (still open)

Confirmed. `Ship.graceUntil` is an `Int32Array` (plan L508; `src/renderer/src/sim/tactical/state.ts:19`), but its rule accepted any integer. A rehashed 2147483648 would pass validation, wrap to −2147483648 on restore, and fail the hash only after allocation. It is the only typed-array field in the tactical state (`grep Int32Array src/renderer/src/sim/tactical/state.ts`).

Fixes:
- A new `int32` rule (−2³¹..2³¹−1) is used for `graceUntil` in `SHIP_RULES`.
- The same hole existed in the telemetry mode memory: `prev.grace` is restored with `Int32Array.from` but its zod schema allowed any safe integer. It now uses a 32-bit `int32` schema.
- The invalid-value test gains a rehashed `ships.0.graceUntil = 2147483648` case, which brings it to 20 cases; the Decisions text is updated to match.

The validator's message, `duel snapshot tactical ships.0.graceUntil: out of range`, matches the case's regex. Values the scripted duels reach (tick + grace) are far below 2³¹, so the accepted-states test is unaffected. I checked this by reading the code; the build runs both tests.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md

<!-- end -->
