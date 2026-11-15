# Codex review exchange: helm-h1b-impl

Subject: `package.json src/main/index.ts src/renderer/src/app/duel/controls.ts src/renderer/src/app/duel/duelMode.ts src/renderer/src/app/duel/mode.ts src/renderer/src/app/duel/runtime.ts src/renderer/src/main.ts src/renderer/src/render/duel/endScreen.ts src/renderer/src/render/duel/interiorModel.ts src/renderer/src/render/duel/interiorView.ts src/renderer/src/render/duel/readoutModel.ts src/renderer/src/render/duel/readoutPanel.ts src/renderer/src/render/tactical/fxModel.ts src/renderer/src/render/tactical/missilePath.ts src/renderer/src/render/tactical/tacticalLayer.ts src/renderer/src/render/tactical/tacticalModel.ts src/renderer/src/render/tactical/weaponsModel.ts tests/duelControls.test.ts tests/duelInput.test.ts tests/duelInterior.test.ts tests/duelReadout.test.ts tests/duelRuntime.test.ts tests/duelWeaponsView.test.ts tests/flightRuntime.test.ts tests/tacticalCamera.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing f624a31, effort high, 293 s, 1535811 in / 1416704 cached / 14718 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Weapons queues commands the sim rejects
Space and F queue commands even when a missile is flying; F also queues with an empty magazine or level-2 Weapons damage. · src/renderer/src/app/duel/runtime.ts:L282, L288; src/renderer/src/sim/duel/step.ts:L110-L111; src/renderer/src/sim/tactical/weapons.ts:L33-L38 · Ordinary solo input produces rejected commands, contrary to the client admission requirement. · Check canCharge and canLaunch when building the tick’s commands, accounting for commands already queued that tick; test unavailable states.

### [P1] R1-F2 Tab can invalidate commands queued before the switch
A Weapons command queued in one frame, followed by Tab before the next tick, is sent after that tick’s presence change and rejected as not-at-weapons. · src/renderer/src/app/duel/runtime.ts:L217, L257-L263; src/renderer/src/sim/duel/step.ts:L93-L108 · This is possible when render frames outnumber sim ticks, and turns an ordinary press into a rejected command. · On Tab, remove or reconcile pending tactical commands from the character being left; add a two-frame, one-tick test.

### [P1] R1-F3 Sampled pointer input survives Tab and restart
The frame samples pointer movement before Tab or Enter clears the pointer, then applies that saved sample to the newly active or reset camera. · plan L75, L80; src/renderer/src/app/duel/runtime.ts:L250-L252, L265-L266, L316-L326 · A drag or wheel event on the switch or restart frame moves a camera that should start from its retained or reset state. · Discard the frame’s sampled pointer delta after Tab or restart, and test both transitions with pending drag and wheel input.

### [P1] R1-F4 Three crowded arrows can overlap after spreading
The spread loop can alternate between two occupied positions and finish on an earlier arrow. For left-edge arrows at y=370, 371, and 372, it produces y=370, 350, and 370. · src/renderer/src/render/tactical/tacticalModel.ts:L197-L208; tests/duelWeaponsView.test.ts:L69-L75 · The duel can show overlapping arrows and labels when three targets cluster on one edge; the test covers only two. · Choose an unoccupied edge position monotonically, with edge bounds, and test three and four clustered arrows.

### [P2] R1-F5 Missile prediction starts from a different position than its glyph
The path is predicted from the current sim missile while its visible origin is interpolated from the previous tick. · plan L62; src/renderer/src/render/tactical/weaponsModel.ts:L82, L89-L90; src/renderer/src/render/tactical/missilePath.ts:L17-L23 · At alpha below 1, the first path segment spans extra movement and the predicted line shifts relative to the drawn missile. · Seed the displayed prediction from the interpolated missile state and add a test with alpha below 1.

## Verified
- Static inspection found duel tick stamping, tick-0 player-1 absence, and per-player sequences in src/renderer/src/app/duel/runtime.ts:L211-L222.
- The pause driver is disposed on pause and recreated on resume; the outcome stops stepping in src/renderer/src/app/duel/runtime.ts:L60-L76, L236.
- Restart resets runtime state, cameras, events, and input; the boot rebuilds view caches in src/renderer/src/app/duel/runtime.ts:L244-L252 and src/renderer/src/app/duel/duelMode.ts:L70-L75.
- The mode switch retains the sector path and adds duel boot separately in src/renderer/src/main.ts:L31-L64, L75-L90.
- The interior fit and pooled display objects were inspected in src/renderer/src/render/duel/interiorModel.ts:L9-L16 and src/renderer/src/render/duel/interiorView.ts:L32-L70.

## Not verified
- Jest/Vitest and the full suite were not run, as requested; test outcomes and browser rendering remain unverified.
- Screenshot checks could not be inspected in this read-only review.
- The stated review ledger was absent at docs/superpowers/reviews/2026-11-15-helm-h1b-impl/ledger.md in this worktree.

---

# Round 1 response (code fixed)

Reviewed `round-1.json` against the branch. 5 accepted (4 P1, 1 P2), 0 rejected, 0 deferred. All five were confirmed against the code and the sim's rules.

## R1-F1 [P1]: Weapons queues commands the sim rejects

Confirmed (`step.ts:L110-L111`, `weapons.ts:L33-L38`). The runtime now gates the tick's commands at tick time:
- `laserCharge` goes out only when `canCharge`, and `missileLaunch` only when `canLaunch`.
- A release goes out only after a press that was actually sent.

The sim applies a tick's weapon commands in the order lock, charge, launch, whatever order they arrive in. So a launch in the same tick never voids a charge command (commit `515ef7a`). `chargeSent` is cleared after the loop when a launch went out. Tests cover:
- Space while a missile flies;
- F with an empty magazine, and F with Weapons damage 2;
- F then a Space release before one tick, which fires the full charge and then launches (this test fails on the previous code with 0 shots).

## R1-F2 [P1]: Tab can invalidate commands queued before the switch

Confirmed. Tab drops the left character's pending lock, charge and launch commands. A stand does the same, since it also empties the seat before the weapon check. A charge already sent needs no release: the sim lets go of Fire without firing when Weapons is unattended (`weapons.ts:L75`). New test: F, then Tab, in two frames before one tick gives no `not-at-weapons` result and no stuck charge.

## R1-F3 [P1]: Sampled pointer input survives Tab and restart

Confirmed. After a Tab or a restart in a frame, that frame's sampled drag and wheel are discarded, and Tab also resets the wheel accumulator. Tests for both transitions show the new active camera, and the reset camera, unmoved and unzoomed.

## R1-F4 [P1]: Three crowded arrows can overlap after spreading

Confirmed with the given case. `spreadArrows` now places arrows monotonically along each edge with a minimum gap, clamped to the edge bounds. Tests with 3 and 4 clustered arrows check pairwise gaps and bounds. Spreading stays opt-in, so the flight view is unchanged.

## R1-F5 [P2]: Missile prediction starts from a different position than its glyph

Confirmed. The drawn path's first point is now the interpolated glyph position, and the layer strokes from it. Live state is not mutated. Test at alpha < 1.

## Also changed

- Each new test was confirmed to fail without its fix. `npm run typecheck` is clean and `npm test` passes 1,939 tests.

## Files changed

- src/renderer/src/app/duel/runtime.ts
- src/renderer/src/render/tactical/tacticalModel.ts
- src/renderer/src/render/tactical/weaponsModel.ts
- src/renderer/src/render/tactical/tacticalLayer.ts
- tests/duelRuntime.test.ts
- tests/duelWeaponsView.test.ts

<!-- end -->

---

# Round 2 (delta, reviewing aa1c15b, effort medium, 72 s, 285399 in / 238208 cached / 3349 out)

Verdict: ready with P2s

## Prior findings
- R1-F1: resolved — The runtime gates charge and launch at tick time and suppresses a release unless a press was sent (runtime.ts:L221-L236). The checks match the sim's admission rules (weapons.ts:L33-L38; step.ts:L104-L112).
- R1-F2: resolved — Tab and stand remove pending Weapons commands before the seat changes (runtime.ts:L276-L296); the sim clears Fire when Weapons is unattended (weapons.ts:L75).
- R1-F3: resolved — Tab resets the wheel accumulator, and Tab or restart discards that frame's sampled drag and wheel before camera input is applied (runtime.ts:L280, L338-L352).
- R1-F4: resolved — Arrows on each edge are ordered, spaced by the minimum gap, and shifted within the edge bounds (tacticalModel.ts:L202-L229). The added cases cover two to four clustered arrows (duelWeaponsView.test.ts:L77-L87).
- R1-F5: still open — The first path point now matches the interpolated glyph, but subsequent points are still predicted from the current tick's missile (weaponsModel.ts:L82, L89-L91; missilePath.ts:L17-L23). At alpha below 1, the first segment includes the remaining fraction of the current tick plus the predictor's stride, so the path is not seeded from the drawn position as requested by plan L62. The new test checks only point zero (duelWeaponsView.test.ts:L127-L138).

## Verified
- The touched runtime command handling follows the sim's charge-before-launch order (runtime.ts:L221-L236; step.ts:L99-L112; weapons.ts:L72-L88).
- The arrow spreading change remains opt-in for duel views (tacticalModel.ts:L289-L291; duelWeaponsView.test.ts:L89-L97).
- The layer strokes the missile path from its first point (tacticalLayer.ts:L186-L191).

## Not verified
- Jest was not run, as requested; test outcomes were assessed from code and test text only.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. No new findings. Codex confirmed R1-F1 to R1-F4 resolved. Verdict: ready with P2s.

## R1-F5 [P2]: Missile prediction starts from a different position than its glyph (still open, deferred)

The re-raise is accurate: only the first point is the interpolated glyph, and the later points are predicted from the current tick's missile. I'm deferring it rather than fixing it:
- **Same rule as the Helm path:** joining from the drawn position is the rule the Helm path already uses. The H-1a final review accepted it, since the path leads the glyph rather than lagging it.
- **Small gap:** the gap is at most one tick of missile travel, inside the first segment.
- **Wrong trajectory:** seeding the predictor from a mid-tick interpolated state would predict a path off the sim's 60 Hz tick grid, which the missile will not actually follow.

It stays recorded for the manual visual gate.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

