# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `262d934f`. 12 accepted, 0 rejected, 0 deferred. Each was checked against master's code before the spec changed.

## R1-F1 [P1]: throttleCut's seat refusal 'not-at-helm' is not a reason the codebase has

Confirmed. `step.ts` L365 and L377 refuse a non-attendant with `invalid-seat`, and the helm module's reasons (`modules.ts` L65) are `invalid-seat`, `malformed`, `stale-tick`, `unavailable`. §2.3's admission now reads `stale-tick`, `invalid-seat`, `unavailable`, `noop`, and says the module's reasons list is unchanged.

## R1-F2 [P1]: The latch's clear rule and the cut's place in the tick are ambiguous; one reading jams the scripted Helm's throttle

Confirmed: the Helm commands are judged in `step.ts` L360-L381 before `crewHelm` ramps, and the spec did not say whether the cut's tick counts. §2.3 now places `throttleCut` in its own loop right after `heading`'s, and gives `crewHelm`'s order: clear the latch if nobody attends or the attendant's `throttleHeld` is 0; ramp with `thrCut ? 0 : throttleHeld`; clamp. It says the cut's own tick counts, so a cut with the key up clears in the same tick. §8's test covers both cases.

## R1-F3 [P1]: The scripted Helm stands up with its throttle set, and it cannot cut on the tick it stands

Confirmed. `scripted.ts` L375 and L380 push `stand` and `continue` before the Helm branch, and the Helm's commands are judged against the seats after the seat phase. §5 now has the scripted Helm send `throttleCut` and stay seated while `thrMille` is not 0 whenever it wants to stand, standing on a later tick. §8 tests that it never stands with the throttle set. For the player's case, §6.1 changes the OUTSIDE readout's `COASTING` row to `THRUST <n>%` when the Helm is empty with a set throttle.

## R1-F4 [P2]: Placing the new command and fields is incomplete: the helm module's command list, isConsoleCommand, field order

Confirmed (`modules.ts` L64, L67-L72; `runtime.ts` L258). §8 now fixes the `HELM` order (`throttle`, `holdHeading`, `thrMille`, `thrCut`, `gas`, `gasIdle`), the snapshot offsets `helmAt + 3..5`, and adds `throttleCut` to the helm module's `commands` and to `isConsoleCommand` (also stated in §2.3).

## R1-F5 [P2]: The app's throttle predictions ignore the latch

Confirmed: `crewAxes` (`step.ts` L175-L186) and `onlineSource.thrMille` ramp from `thrMille` with the held value and never read a latch. §7 now says both use a held value of 0 while the latch is set (the state's, the replica's, or a cut in flight) until the seat's `throttleHeld` has been 0, and that a refused cut clears `cutSent`. §8 adds the `crewAxes` test.

## R1-F6 [P2]: The tap needs a clock and a settings path that input.ts does not have; the down-time record's lifetime is unstated

Confirmed (`input.ts` L131 `KeyEventLike`, L137 `createDuelKeyboard(target, opts)`, L151 Shift+W, L201 `staleHeld`). §2.3 now specifies `DuelKeyboardOptions.now` and `tapMs` (read live), a down time per code set on a non-repeat keydown, a one-shot `throttleDown` on that keydown (set before the Shift+W branch, so Shift makes no difference), `throttleTap` on a keyup within `tapMs`, the down times dropped by `clear` and `staleHeld`, and the runtime recording the throttle on the sample that carries `throttleDown`. §8's tap test follows.

## R1-F7 [P2]: Several readers of Space and the right button at the crew Helm are unlisted, and the goal-glow rule drops A/D

Confirmed at each site: `runtime.ts` L610 and `onlineDuel.ts` L71 send `face` for `seat === 'helm'`; `onlineDuel.ts` L244 clears `headingSent` on Space; both runtimes send `heading` and raise the `auto-face` and `heading` refusals in the crew Helm branch; `runtime.ts` L617 switches the pan off for `shown === 'helm'`; `scene.ts` L298-L302 requests a heading for any Helm; `scene.ts` L387 clears the glow on A / D, Space or the steer. §4 now lists each site with its change for the crew Helm seat only, and the glow rule reads "A / D or the left-button steer; Space no longer clears it".

## R1-F8 [P2]: The NO GAS refusal has no control type, no hint line, and no press edge for the up and down arrow thrusters

Confirmed (`situationModel.ts` L209 has no gas member; `HeldFlags` carries only port and starboard). §3.3 now adds `RefusedControl` `'gas'` with `NO GAS`, raised once per press on a sample whose `rcsX` or `rcsY` goes from 0 to nonzero while `gas` is below `GAS_SPEND`, shown in place of the first hint line with the GAS bar flashing.

## R1-F9 [P2]: Unlisted readers of the removed boost constants and of FlightTuning

Confirmed (`defs.ts` L144-L146 throws at load on the boost guard). §3.2's removal list now names that guard. §3.1 makes `stabiliseUnderThrust` optional (absent is false), so the test literals need no edit, and says the drag-0 branch and `MAX_SPEED` stay for test configurations while `tests/crewFlight.test.ts`'s Hound pins are rewritten.

## R1-F10 [P2]: The crew console's layout changes cannot be built from the spec as written

Confirmed against `HelmStation.tsx` L79 and L95-L121. §6.1 now sets `THR_LABELS`'s last entry to `['REV', -500]`, adds a `THR <n>%` readout at `rx`, `y0 + 72`, and puts the GAS bar in the AUTO-FACE row (`y0 + 118`: the label at `rx`, the bar from `rx + 32`, 116 by 10, `data-ui-gas`).

## R1-F11 [P3]: The gas rules are written in key terms the sim cannot see; gasIdle's start value and the refill tick are unstated

Confirmed (`input.ts` L193 cancels opposite keys; `step.ts` L207 reads the axes). §3.3 is rewritten in axis terms with a three-step tick order (spend, idle count, refill), `gasIdle` starting at 30, and the first refill on the 30th tick after the last held tick. It says outright that Q and E together read as no axis held.

## R1-F12 [P3]: Two stated numbers hold only at the defaults

Confirmed. §2.3 now gives the nudge as `THR_RAMP` times the tap time (about 20 % at 200 ms, 30 % at 300 ms), and §3.2 says the turn is still scaled by the Engines factor (1 at 1 to 4 bars, 1.25 on the overdrive bar, 0 with none).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-helm-round2-design.md

<!-- end -->
