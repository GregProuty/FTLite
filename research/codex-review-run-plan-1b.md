# Codex review: Run-i plan half 1b, tests (2026-11-11)

1. **Medium — Task 1 Step 1, `tests/run.test.ts`, lines 140–143:** The ready-tick fixture executes `1 + 3598 + 1 = 3599` ticks. Charge is `0.9997222222222845`; the Confirm does not jump. Change the middle run from `JUMP_CHARGE_TIME * T - 2` to `JUMP_CHARGE_TIME * T - 1` (**3599**). The final Confirm then executes tick **3600**, yielding `nodesReached = 1`, `jumpCharge = 0`.

The other checked assertions are consistent: apply the plan’s neutral-intent fallback for the nonexistent `confirmHeld`; cursor cycling and Down + Confirm reach destination 2; jump cursors, draw counts and arrival clocks match; the boarder downs the seated navigator; hull 0 is assigned after the preceding step, so that step has not ended the run; the 960-tick continuation jumps once. The gate route reaches the Navigation seat at tick **92** and its repeated Confirm intents permit ready-tick jumps.

Read-only verification used source tracing and in-memory probes; the proposed tests were not run.