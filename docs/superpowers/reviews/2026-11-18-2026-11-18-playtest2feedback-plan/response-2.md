# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `2a892825`. Verdict ready with P2s. 2 accepted, 0 rejected, 0 deferred, plus R1-F4 reopened and fixed again. The reviewer confirmed R1-F1 to R1-F3 and R1-F5 to R1-F7 as resolved.

## R1-F4 [P2]: Task 5 Step 8's file list (reopened)

Confirmed: `tests/duelRuntime.test.ts` L48-L58 has a single shared `rig()`. Step 8 2c now gives `rig` a trailing `cls?: number`, passed through to `createDuelRuntime`. Only the L101 test and the L610 describe's tests call `rig(5, undefined, true, ShipClass.Valkyrn)`.

## R2-F1 [P2]: Knob 0's trigger tick can fall while the scripted Helm is standing

Confirmed: scripted.ts has no baseTick idiom. The sit is sent at L290-L311, and L315 is the only seated branch. Knob 0 now pushes `helmPower +1` inside `if (seat === d.nav)` whenever `d.compressor > 0`. It limits itself, and it re-fires after a re-sit or a new round.

## R2-F2 [P3]: The power line can pass the panel's right edge

Confirmed by the advance arithmetic. The line is now `ENGINE n COMP n +r%/S`. Decision 16 states that `COMPRESSOR_RATE` values are multiples of 10, so the rate is an integer of at most 15. The UI test's expected text is updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-playtest2feedback.md

<!-- end -->
