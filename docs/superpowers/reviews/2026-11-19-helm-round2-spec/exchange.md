# Codex review exchange: helm-round2-spec

Subject: `docs/superpowers/specs/2026-11-19-helm-round2-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 5db5a6d0, effort high, 418 s, 3905412 in / 3734943 cached / 36063 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 throttleCut's seat refusal 'not-at-helm' is not a reason the codebase has
§2.3 has throttleCut refused with `not-at-helm`. No such reason exists. The Helm's commands (`throttle`, `heading`) refuse a non-attendant with `invalid-seat`, and every module reason must be in COMMAND_REASONS. · spec L66-L71; src/renderer/src/sim/duel/step.ts:L365, L377 (`invalid-seat`); src/renderer/src/net/contracts.ts:L136 (the reasons list has `not-at-weapons`, no `not-at-helm`); src/renderer/src/sim/duel/modules.ts:L65 (helm reasons: invalid-seat, malformed, stale-tick, unavailable); tests/duelModules.test.ts:L154 (every module reason must be in COMMAND_REASONS) · One implementer adds a new wire reason, which changes contracts, the codec and the pinned test. Another reuses `invalid-seat`. The results differ on the wire and in the hashed step results. · Write the admission as: stale-tick, then `invalid-seat` (helm < 0 or not the attendant, as `throttle` and `heading` do it), then `unavailable` on a class without newtonianHelm, then noop at 0. State that helmModule.reasons is unchanged.

### [P1] R1-F2 The latch's clear rule and the cut's place in the tick are ambiguous; one reading jams the scripted Helm's throttle
§2.3 says the latch 'clears on the first tick whose Helm held frame has throttleHeld 0'. It does not say three things: whether the tick that admits the cut counts; whether the clear test runs before or after the ramp; and where in the step throttleCut is admitted (beside `throttle` and `heading`, and before or after `clampThrottle`). The scripted Helm sends the cut on a tick when it holds nothing. If that tick does not count, the latch stays set into the next tick. If the bot then wants thrust and holds W, the throttle stays at 0 until the bot next wants 0 thrust. · spec L72-L77, L171-L173; src/renderer/src/sim/duel/step.ts:L360-L381 (the Helm command loops, after the seat phase), L443 (clampThrottle), L453 and L199-L211 (crewHelm ramps after admission); src/renderer/src/sim/duel/scripted.ts:L410-L413 (the bot holds W while it wants thrust) · Two implementers would produce different hashed thrMille and thrCut traces. One reading also makes the bot's thrust lag behind its orbit law, which moves the per-seed gates. · Spell out the order: throttleCut is admitted in the Helm block right after `heading`. Then in crewHelm: if thrCut and the attendant's throttleHeld is 0 (or nobody attends), clear thrCut; then ramp with held = thrCut ? 0 : throttleHeld; then clamp. Say outright that the cut's own tick counts, so a cut sent with a released key clears that same tick.

### [P1] R1-F3 The scripted Helm stands up with its throttle set, and it cannot cut on the tick it stands
§2.1 makes an unattended Helm keep its throttle. The scripted Helm stands to repair, revive or heal, and its stand tick skips the Helm branch. A cut sent on that tick would also be refused: the Helm commands are judged after the seat phase, when the bot is no longer at the Helm. So the bot walks off at whatever throttle it had, up to 1000 (about 800 u/s with no avoidance). §5 only covers 'when its axes want thrust 0' while seated. · spec L38-L40, L169-L180, L274-L275; src/renderer/src/sim/duel/scripted.ts:L375, L380, L391 (stand then `continue`, before the `seat === d.nav` branch at L400); src/renderer/src/sim/duel/step.ts:L360-L365 (Helm commands judged 'against the seats as they now stand') · Before, an unattended throttle fell back to 0, so a bot that stood was safe. Now the per-seed gates can fail in ways the five scripted constants cannot fix. 'Every command it sends is admitted' breaks if the cut is sent on the stand tick. · Add to §5: before the scripted Helm stands (any reason), it first sends throttleCut while still seated if thrMille ≠ 0, and stands on a later tick. Or say the bot accepts the set throttle as a lever and record that as a judgement call. Add a gate-side test that the bot never stands with thrMille ≠ 0.

### [P2] R1-F4 Placing the new command and fields is incomplete: the helm module's command list, isConsoleCommand, field order
§8 names contracts, the codec and DUEL_KINDS, but not: helmModule.commands (the modules must own every duel kind, and the sorted list is pinned); runtime's isConsoleCommand (a Tab or stand drops queued console commands, and a cut queued before a stand would otherwise be refused); or the order of thrCut, gas and gasIdle in HELM, which fixes the hash layout and the snapshot offsets after helmAt + 2. · spec L234-L237, L276-L277; src/renderer/src/sim/duel/modules.ts:L64, L67-L72; tests/duelModules.test.ts:L143, L153; src/renderer/src/app/duel/runtime.ts:L258, L412, L431; src/renderer/src/sim/duel/snapshot.ts:L183-L185 · Missing entries fail pinned tests or let a stale cut through. An unstated field order lets two builds hash differently. · List them: add 'throttleCut' to helmModule.commands and to isConsoleCommand. Fix the HELM order as throttle, holdHeading, thrMille, thrCut (a flag), gas, gasIdle. Snapshot validation reads helmAt + 3..5 with the stated bounds.

### [P2] R1-F5 The app's throttle predictions ignore the latch
crewAxes promises to fly exactly what crewHelm flies, but it ramps from thrMille with the held W/S and never reads thrCut. onlineSource.thrMille does the same through rampTicks. While the authority is latched and the seat still holds S or W, the console and the predicted path show a ramp the sim does not fly. §7 covers only the gap between sending the cut and its result. · spec L72-L77, L145, L223-L228; src/renderer/src/sim/duel/step.ts:L175-L186 (the M3 contract), L184; src/renderer/src/app/duel/onlineSource.ts:L165-L170 · The prediction breaks the 'exactly what the tick flies' contract that its tests pin, and the throttle bar jumps when the replica catches up. · State that crewAxes and onlineSource.thrMille use held 0 while the state's (or the replica's) thrCut is set, and that a released key clears it in the prediction as in the sim.

### [P2] R1-F6 The tap needs a clock and a settings path that input.ts does not have; the down-time record's lifetime is unstated
createDuelKeyboard(target, opts) has no clock, no timeStamp on KeyEventLike, and no settings input. The spec says to time presses and test them 'with a fake clock', but does not say which clock (event.timeStamp or an injected now()) or how throttleTapMs reaches the keyboard. It also says only that throttleTap is cleared by clear and clearUi. The recorded keydown time must also be dropped by clear (blur, Tab, restart) and by staleHeld; otherwise a key held across a clear produces a tap when it comes up. Shift+W adds no press edge (it sets throttleTo), so a Shift+W tap gives the runtime no keydown frame to sample the throttle from. · spec L78-L86, L207, L255-L256; src/renderer/src/app/duel/input.ts:L122, L132, L137, L144-L164 (down/up, clear on blur), L151 (Shift+W), L201 (staleHeld) · Two implementers would pick different clocks and interfaces, so the tests differ. A missed clear causes a spurious cut after alt-tab or a Tab. · Specify DuelKeyboardOptions { now?: () => number; tapMs?: () => number }, read live, defaulting to performance.now and 200. Down times are kept per code and cleared by clear, staleHeld and blur. A tap needs a non-repeat, non-stale keydown and a keyup within tapMs. The runtime takes 'the throttle at keydown' on the sample whose presses.throttleUp/Down edge is nonzero, and Shift+W counts as W.

### [P2] R1-F7 Several readers of Space and the right button at the crew Helm are unlisted, and the goal-glow rule drops A/D
§4 lists the effects but not the code that must change. The runtime sends face whenever seat === 'helm' (crew Helm included). onlineDuel clears headingSent locally on Space; if left in, the HDG TO readout and the dedupe are wrong once face is gone. The auto-face refusals fire on Space. The camera's right-button pan exemption is `shown === 'helm'` in both modes. scene.ts sends heading on a right press for any Helm. Separately, 'the goal glow clears on the first left-button steer only' also stops A/D from clearing it, which today it does and which call 1 keeps as the turn. · spec L158-L162; src/renderer/src/app/duel/runtime.ts:L467, L472, L610, L617; src/renderer/src/app/duel/onlineDuel.ts:L71, L244, L252; src/renderer/src/app/duel/onlineSource.ts:L199; src/renderer/src/app/duel/scene.ts:L298-L302, L387 · Missing one of these leaves Space or the right button half-working at the crew Helm. 'Only' changes the A/D behaviour by accident. · List each site with its new condition (exclude crewHelmSeat): face in runtime L610 and sessionHeld L71; drop onlineDuel L244 and the crew-Helm auto-face refusals; pan exemption only for the non-crew Helm; scene L298 only when !crewHelmMap. Reword the glow rule to 'A/D or the left-button steer; Space no longer clears it'.

### [P2] R1-F8 The NO GAS refusal has no control type, no hint line, and no press edge for the up and down arrow thrusters
RefusedControl has no gas member (its comment says the gas is never refused). CrewHelmStation picks its hint line by control. HeldFlags carries port and starboard but nothing for ↑ and ↓, so 'once per press' has no edge for the fore and aft keys unless it is taken from rcsY, which cancels when both keys are down. The spec does not say which. · spec L143-L144; src/renderer/src/render/duel/situationModel.ts:L209; src/renderer/src/ui/duel/HelmStation.tsx:L92-L94, L117-L118; src/renderer/src/app/duel/input.ts:L35-L37, L188-L189 · Implementers would put the reason on different lines and detect presses differently, so the console test cannot be written from the spec. · Add RefusedControl 'gas' with reason 'NO GAS', shown on the first hint line (beside Q/E GAS) and flashing the GAS bar. Define the press edge as a 0→nonzero change of the sample's rcsX or rcsY (or new fore/aft HeldFlags), judged against the state's gas (online, the replica's).

### [P2] R1-F9 Unlisted readers of the removed boost constants and of FlightTuning
defs.ts imports RCS_TURN_BOOST and BOOST_FAR and throws at module load unless RCS_TURN_BOOST × turnStepsPerTick < BOOST_FAR. §3.2's removal list does not name it. FlightTuning gains a required stabiliseUnderThrust, but test configurations build FlightTuning literals without it in seven test files (tests/crewFlight.test.ts L50 also pins CREW_FLIGHT's literal and L51 MAX_SPEED). The spec also does not say whether the drag-0 MAX_SPEED branch stays for test configurations, now that no game ship flies it. · spec L102-L104, L117-L120, L237; src/renderer/src/sim/tactical/defs.ts:L13, L144-L146; src/renderer/src/sim/tactical/tuning.ts:L81, L203, L212; tests/disabledSystems.test.ts:L93, L107; tests/duelThrottle.test.ts:L201; tests/tacticalFlight.test.ts:L7-L8; tests/rockPredict.test.ts:L23; tests/tacticalContacts.test.ts:L6; tests/leadModel.test.ts:L70 · Typecheck catches these, but the plan will under-scope the task, and whether stabiliseUnderThrust is optional changes every literal. · Add defs.ts's boost guard to the removal list. Make stabiliseUnderThrust optional (absent = false) or list the test literals to update. State that the drag-0 cap branch and MAX_SPEED stay for test configurations.

### [P2] R1-F10 The crew console's layout changes cannot be built from the spec as written
§6.1's throttle bar has 'its number' reading −50..100, but CrewHelmStation draws no throttle number today, only a fill and a data attribute. The GAS bar goes 'beside the readouts' with no position or size. The bar's labels are hard-coded in THR_LABELS with REV at −250. · spec L186-L191; src/renderer/src/ui/duel/HelmStation.tsx:L79 (THR_LABELS, REV −250), L95-L108 (no numeric readout), L109-L118 (the right column's rows; the AUTO-FACE row at y0+118 frees up) · Two implementers would put a new number and the GAS bar in different places, so the console test's selectors and the hint measurements differ. · Name the number (for example a `THR nn%` PixelText at y0 + 72) and put the GAS bar in AUTO-FACE's freed row (rx, y0 + 118, 148 × 10, with a data attribute). Set THR_LABELS to 100/75/50/25/0/REV at −500.

### [P3] R1-F11 The gas rules are written in key terms the sim cannot see; gasIdle's start value and the refill tick are unstated
The sim sees only the held rcsX and rcsY axes. Opposite keys cancel in the app, so 'any thruster key held' (Q and E together) reads as none held, and the charge refills while both are down. The spec does not give gasIdle's value at a round's start, or whether gas first refills on the tick gasIdle reaches 30 or on the tick after. The test says 'after 30 ticks'. · spec L128-L137, L262-L264; src/renderer/src/app/duel/input.ts:L193; src/renderer/src/sim/duel/step.ts:L207 · Off-by-one differences change the hashed gas traces between builds. · Rewrite in axis terms: 'a tick whose attendant's rcsX or rcsY is nonzero'. Start gasIdle at GAS_REFILL_DELAY. Fix the order: if no axis is held, gasIdle = min(gasIdle + 1, 30), then refill when gasIdle === 30 in the same tick.

### [P3] R1-F12 Two stated numbers hold only at the defaults
'a tap … nudges the throttle by at most about 20 %' holds only at 200 ms: at 300 ms a tap ramps 18 × 17 = 306. The 'fixed' 150°/s turn is multiplied by the Engines factor, which is 1.25 at 5 bars and 0 at 0 bars. · spec L61-L62, L115-L116, L261; src/renderer/src/sim/tactical/bars.ts:L50; src/renderer/src/sim/tactical/physics.ts:L39, L93 · The wording will mislead the plan's tests. · Say 'about THR_RAMP × the tap time' and 'at 1 to 4 Engines bars'.

## Verified
- The heading step headingAcc += turn * boost * tps * f evaluates left to right, so dropping a ×1 factor is exact for every ship but a boosted Hound (physics.ts:L37-L39)
- REVERSE_FRACTION has one reader, shipClass in defs.ts:L114. CUTTER_CLASS is a spread of shipClass (defs.ts:L122), so a per-class override is a one-line change and the Hunter keeps 0.4
- RCS_THRUST, rcsX and rcsY are read only by the crew Helm path (step.ts:L183-L210, physics.ts:L63-L64). Doubling RCS_THRUST cannot move the Hunter or the Valkyrn
- valkyrnIdentity.test.ts:L30-L31 hashes the tactical state, throttle, holdHeading, power and the step results, not the duel's helm module crew fields. The scripted Valkyrn pair never sends throttleCut because thrMille stays 0 off newtonianHelm. The spec's 'hashes the tactical state' understates what the test hashes, but its conclusion holds
- crewHelm reads rcsY before rcsX (step.ts:L207), matching §3.3's 'fore/aft first'
- The drag branch in flyShip (physics.ts:L73-L79) has no MAX_SPEED cap. Top speeds 120/0.15 = 800 and 78/0.15 = 520 are right to within the per-tick discretisation
- §3.4: GM/r² = 30 at r ≈ 288.7 (GM 2.5e6, tuning.ts:L14), and ENGINE_FACTOR_BY_BARS[1] = 1 (bars.ts:L50), so 1 bar gives 30 u/s²
- The 1 s velocity line exists (tacticalModel.ts:L568)
- Single player: a Helm character left seated stays present (runtime.ts:L415-L417), so it is attended under crewHelm. That matches §2.1's 'attended or not' wording
- Online held frames are latest-wins by sequence (authority/core.ts:L314-L317) and a pause deletes throttleHeld (core.ts:L436), so a pause clears the latch under the 'throttleHeld 0' rule
- Shift+W is listed only under the Valkyrn (controlsList.ts:L82)
- The weapons sit card already has four key lines (sitModel.ts:L19), so the helm card's four lines have a precedent
- Settings stays version 2 with field fallbacks, in the pattern of mapGrid (settingsStore.ts:L21-L36)

## Not verified
- Whether refusal(d, 'turn') is exactly 'no Engines bars' (item 17). I did not trace situationModel.ts past L237. Note that today's crew-Helm W/S still go out on the held frame (runtime.ts:L469-L475), so 'sends nothing' is loose but harmless: with 0 bars the floor and cap are 0, so no cut is sent
- The pixel widths of §6.1's hint lines and the sit card's line width (item 19): FONT_NATIVE glyph widths and the card renderer were not read
- The online command stamping, beyond acceptHeld: whether a cut and a late held frame can in practice land on different authority ticks
- tests/w4HunterIdentity.test.ts and W-4's changes to the same files (they are not on master)
- Ryan's notes L20-L76 read; the replay.ts and duelCheckpoint.ts long lines were not expanded (the command schemas come from codec.ts's duelWire)

---

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

---

