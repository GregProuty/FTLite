# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `a2e909a5`: 11 accepted, 0 rejected, 1 deferred (R1-F11). Several findings come from the W-4 merge (90cd5825, SIM 63), which landed on master after the plan was written. The plan now follows it throughout.

## R1-F1 [P0]: The trim drops every unacknowledged entry before an anchor exists

Confirmed. I traced Task 4's "runs ahead" test with the old code. After the reset `P` stands on `T`, the cut is the newest local tick, and every entry goes before its held watermark can come back. The spec's §3.4 step 1 has the same rule.

Fixed in Task 4's `confirm`:
- An entry leaves the log only at or before the anchor, or by `PREDICT_LOG_MAX`.
- An entry the mapping puts at or before `T` keeps its `heldSequence`, and its commands move to the first entry mapped after `T` (or to `waiting`).

I retraced the "runs ahead" test with the fix: at L=9 the anchor is entry 3, measured is T+6, `P` re-simulates to it, and the confirms after that verify. Recorded as plan deviation 2, next to the code, with the reason the spec's rule cannot build a lead.

## R1-F2 [P1]: Task 9 deletes `unackedFrames` but `turret()` reads it

Confirmed: `onlineSource.ts:L177-183` (W-4) calls `predictTurret(..., unackedFrames)`.
- Task 6 now switches only the drawing members to `P`. Every other member reads a new `replica()` until Task 9, so W-4's turret, `thrMille` and vent behave as today in Tasks 6 to 8.
- Task 9 removes `gunModeSent`, `lockSent`, `gunModeShown` and `gunModeBase`, and makes `turret()` read `P`'s `pewTurret` and `gunTurret`.
- Task 9 rewrites the W-4 turret and lock cases against `P` (acknowledged by `water.command`), and deletes the blur case. It drops `predictTurret` if it has no caller, and its grep check covers the new names.

## R1-F3 [P1]: Space test on the Cutter's Hound-style Weapons seat

Confirmed: `controls.ts:L38` and `onlineDuel.ts:L361`. The test now uses `ShipClass.ValkyrnLaser`.

## R1-F4 [P1]: Record test validates a partial summary

Confirmed: `roundEvent` gives `{ round, seed }` (`tests/onlineDuelSession.test.ts:L97`). The test now validates only `duelRecordSchema.shape.prediction`.

## R1-F5 [P1]: rng import path

Confirmed: the module is `src/shared/rng.ts` (`scripted.ts:L5`). The import is fixed and the check-at-execution note is gone.

## R1-F6 [P2]: Sector schema bump breaks hosted-mode literals

Confirmed: `encounterMode.test.ts:L39` and `sessionCapture.test.ts:L213-221` against `hostRuntime.ts:L10`. Task 1 Step 4 now changes them to read the definition, greps for others, and adds `sessionCapture` to the run.

## R1-F7 [P2]: `heldKey` omits W-4's fields

Confirmed: `contracts.ts:L43` now has `weaponSel` and `turretAim`, and no longer has `torpTurn`, which would also have failed `tsc`.
- `HELD_KEYS` lists all 12 fields, with a compile-time check that none is missing.
- `heldKey` is exported and unit-tested for single-field changes.

## R1-F8 [P2]: `decided` and the leave prompt read P

Confirmed against spec §3.6 (L131). In Task 9, `decided`, `leavePromptKeys` and the guard read the confirmed replica `c`; only console decisions read `P`.

## R1-F9 [P2]: Task 1 test waits too few ticks

Confirmed by the cadence filter (`streamBinding.ts:L91`). Both waits are now `w.tick(6)`.

## R1-F10 [P2]: Gate tests have no timeout

Confirmed: `vitest.config.ts` has no testTimeout, and `duelOnline.test.ts` uses 300 s plus a yield. The Task 5 describes take `{ timeout: 120_000 }` and Task 11's takes 300 s, each with a `setImmediate` yield in `beforeEach`.

## R1-F11 [P3]: A lasting 1-2 tick mapping error persists

Deferred. The effect is real but bounded: it only adds re-simulations while this seat's input changes. `stats()` already exposes `measured` and `standing`, so G1(c) and the playtest can see it. If G4 or the playtest shows recurring corrections, adopting the anchor's offset after a hash mismatch is the follow-up.

## R1-F12 [P3]: F3 RESIM figure; no dispose on link close

Confirmed. Task 7's close handler now disposes the predictor (spec L117), and F3 reads a `liveResim` list of re-simulation times only.

## Also changed

- The Global Constraints and Task 12 say `SIM_VERSION` stays 63, not 62. The W-4 merge moved it after the spec was written.

## Files changed

- docs/superpowers/plans/2026-11-20-net-4a-duel-prediction.md

<!-- end -->
