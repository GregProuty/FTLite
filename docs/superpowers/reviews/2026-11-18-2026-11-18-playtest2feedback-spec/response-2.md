# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `576c38de`. 3 accepted, 0 rejected, 0 deferred, plus R1-F9 reopened and fixed again. The reviewer confirmed R1-F1 to R1-F8 and R1-F10 to R1-F12 as resolved.

## R1-F9 [P2]: The stand-in budget of 4 doesn't match Engineering's start of 3 (reopened)

Confirmed: `min(compressor, HELM_BARS, 3)` takes lost bars from ENGINE first. §5 now reads `max(0, min(3, compressor − lost, HELM_BARS))`, so bars come off COMPRESSOR first, as round 1's fix intended.

## R2-F1 [P1]: The unattended crew Helm's rule assumes a flight branch the Hound layout doesn't have

Confirmed: step.ts L279-L287 sets `crew.helm` only for `helmHoldsUnattended`, and duel.ts L32 flies NO_AXES otherwise. §3 now states the rule for a `newtonianHelm` class with no attendant: `crew.helm = true`, the held-heading turn, `helmBoost(d, NO_HELD)`, `crewThrust(thrMille)` and no thrusters. It's mirrored in `situationModel.stateAxes` and `runtime.ts`'s `sentAxes`. §7's step order references it, and §8 tests the 30-tick return.

## R2-F2 [P2]: HELM_BARS, helmVent and helmPower aren't fitted to the module contract or the rematch

Confirmed: state.ts L84 has positional parameters only, and modules.ts L59-L65 has the commands and reasons. Changes:
- §5 adds `createDuel`'s sixth parameter, `opts: { helmBars }`, stored as `d.helmBars` and passed on by `startRound`;
- §7 adds the module contract: `DUEL_NOT_SNAPSHOTTED` entries for `helmBars` and `helmVent`, `helmPower` in `commands`, `unavailable` in `reasons`, and the `duelModules.test.ts` update.

## R2-F3 [P3]: The auto-face boost band isn't wider than the boosted step

Confirmed: sin 5° is about 3.56 indices, which isn't more than a 4-index step. `BOOST_FACE_SIN` is now sin 6° (about 4.27 indices), and the settle test names `helmTurn`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-playtest2feedback-design.md

<!-- end -->
