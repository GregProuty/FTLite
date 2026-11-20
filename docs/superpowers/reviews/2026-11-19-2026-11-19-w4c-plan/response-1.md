# Round 1 response (plan revised to rev after a818e098)

Reviewed `round-1.json` against the subject at `a818e098`. 10 accepted, 0 rejected, 0 deferred. Round 1 has no prior IDs.

## R1-F1 [P1]: Task 5 redeclares the online `lastGunSel`

Confirmed: the W-4a plan's Task 11 Step 3.4 declares it, resets it and updates it. Decision 8 now says both runtimes already keep it. Step 5.2 adds only `flight` and `triggerLive` to W-4a's `let` line and its resets. Step 5.3 replaces both of W-4a's lines.

## R1-F2 [P1]: Task 6's controls test finds the Helm's row first

Confirmed: controlsList.ts L59, and settingsAndControls.test.ts L51 needs it first. The test now filters the `Hold left mouse` rows and expects the Weapons one among them. The Helm row stays where it is.

## R1-F3 [P1]: No canonical baseline before Task 7's `golden` check

Confirmed: canonical-trace.ts L16-L21 and L30-L31, and versionOnly.ts L30. The fix has three parts:
- Task 1 Step 3 now also runs `canonical-trace.ts baseline`.
- Task 7 Step 1 also runs `canonical-trace.ts same`.
- The lost-baseline fallback now covers both proofs and the `golden` check.

## R1-F4 [P1]: Task 5 anchors on W-4a text that W-4b rewrites

Confirmed against the W-4b plan (its L1038 and L1040). Task 5 now quotes W-4b's merge and makes it `triggerLive && gunModeBase()`, keeping the reticle. It also quotes W-4b's pew click with `&& gunsManual`, and it keeps W-4b's dead-trigger line, which reads `trig = triggerLive`.

## R1-F5 [P1]: Task 5's online cases name a rig with no session

Confirmed: W-4b's w4Online `rig` is unit-level, onlineDuelSession's replica is a snapshot (L38-L42), and the autocannon has 0 bars at the start. The online case is now written in full in onlineDuelSession's Hound block, as the reviewer gave it:
- it places and removes the torpedo, then republishes with `r.client().publish(r.d)`;
- it tests the prediction on pew pew, with a note on why.

The test files are in Task 5's Files and commit.

## R1-F6 [P2]: The remaining placeholders

Confirmed. These are now written in full:
- the pan case, on manualTorpedoScene's rig, with a settable `samplePointer` and `drag()`, asserting `follow` is `'free'` and the centre moved by −40/zoom (camera.ts L68-L72);
- the two Single player flight cases, in `w4Runtime.test.ts` on W-4a's rig rather than a new file;
- the w4Ui STEER LMB case.

## R1-F7 [P2]: `torpTurn` in manualTorpedoFlight's 'keeps the mode' case

Confirmed: manualTorpedoFlight.test.ts L105 and L113. Both literals become `torpHeading: 64` and the expectations stay. The headers of manualTorpedoFlight and manualTorpedoInput cite W-4 spec §7.

## R1-F8 [P2]: The no-output greps contradict the plan's own tests

Confirmed:
- Both greps now cover `-- src` only, with a note that the tests keep negative asserts.
- Task 2 now edits contracts.ts' `torpMode` doc (L112) and the `HeldInput` doc to drop `torpTurn`.

## R1-F9 [P3]: The import-cycle guard checks the wrong edge

Confirmed: hunter.ts L16 imports weapons.ts, and W-4b's weapons.ts imports turret.ts. The guard is now always inline, `missileOf(state, i)?.manual === true`, with the cycle explained. `missileOf` is added to turret.ts's `./state` import if it is missing.

## R1-F10 [P3]: The end-of-flight selection versus the spec's 'at launch'

Confirmed: spec L387-L390. Decision 8 now states it as a deviation with its reason: A/D and 1-3 select during a flight, so the selection at the end is the gunner's latest intent, and no launch-time state is needed.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md

<!-- end -->
