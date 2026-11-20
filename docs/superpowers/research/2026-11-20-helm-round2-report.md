# Helm round 2: build report

Spec `docs/superpowers/specs/2026-11-19-helm-round2-design.md`; plan `docs/superpowers/plans/2026-11-20-helm-round2.md`.

## Base

- `HR2_BASE` = e65d84fe, SIM_VERSION 63, branch `helm-round2`.
- Full suite at the base: 516 files, 6194 tests passed, 2 skipped (typecheck clean, electron-vite build ok).
- Canonical trace baseline: baseline at sim version 63: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs; written to C:\Users\djuar\AppData\Local\Temp\ftlite-canonical-trace-84f46ab3\trace.json
- Scripted gates at the base (the ten scripted seeds already fail the median gate at the base; recorded as-is):

```
median length 147.0 s (gate 180 to 300)
crew wins 0, crew losses 10, draws 0, at the cap 0 (gate: a win and a loss, none at the cap)
every duel with a crew pew or gun round and a missile launch: true
planet-contact ends under 30 s: 0 (gate 0)

passive crew (nobody at either console), not gated: seed 1 153.3 s crew loss; seed 2 152.8 s crew loss; seed 3 98.3 s crew loss; seed 4 153.5 s crew loss; seed 5 154.8 s crew loss; seed 6 120.2 s crew loss; seed 7 93.7 s crew loss; seed 8 112.1 s crew loss; seed 9 133.6 s crew loss; seed 10 152.3 s crew loss
passive median 143.0 s, shortest 93.7 s
```

- Valkyrn gate at the base (Tasks 6 and 14 must print these exactly):

```
seed 1: 148.5 s, crew loss, hull crew 0/53 enemy 69/123, terminal crew [planet] enemy [], PLANET END
  gun 366 shots, 319 hits (87.2%); missiles 4 launched, hits W/S/E 0/3/0; enemy laser 6 released, 6 hit, missiles 4; repairs 1/2, away walking/repairing 5.9/10.8 s; contacts planet 8, asteroid 1
seed 2: 121.2 s, crew loss, hull crew 13/53 enemy 101/123, terminal crew [downed] enemy []
  gun 199 shots, 176 hits (88.4%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 12 released, 12 hit, missiles 3; repairs 2/7, away walking/repairing 8.9/30.2 s; contacts planet 0, asteroid 0
seed 3: 159.6 s, crew loss, hull crew 15/53 enemy 86/123, terminal crew [downed] enemy []
  gun 239 shots, 201 hits (84.1%); missiles 3 launched, hits W/S/E 0/2/0; enemy laser 10 released, 10 hit, missiles 4; repairs 5/8, away walking/repairing 19.2/33.1 s; contacts planet 0, asteroid 0
seed 4: 128.1 s, crew loss, hull crew 0/53 enemy 56/123, terminal crew [planet] enemy [], PLANET END
  gun 211 shots, 168 hits (79.6%); missiles 3 launched, hits W/S/E 0/1/0; enemy laser 6 released, 6 hit, missiles 3; repairs 2/6, away walking/repairing 9.1/24.0 s; contacts planet 8, asteroid 1
seed 5: 156.3 s, crew loss, hull crew 13/53 enemy 99/123, terminal crew [downed] enemy []
  gun 327 shots, 269 hits (82.3%); missiles 3 launched, hits W/S/E 0/1/0; enemy laser 13 released, 13 hit, missiles 4; repairs 3/7, away walking/repairing 8.9/29.0 s; contacts planet 0, asteroid 0
seed 6: 99.1 s, crew loss, hull crew 34/53 enemy 107/123, terminal crew [downed] enemy []
  gun 139 shots, 119 hits (85.6%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 7 released, 7 hit, missiles 2; repairs 4/3, away walking/repairing 14.9/13.9 s; contacts planet 0, asteroid 0
seed 7: 245.8 s, crew loss, hull crew 9/53 enemy 70/123, terminal crew [downed] enemy []
  gun 615 shots, 530 hits (86.2%); missiles 7 launched, hits W/S/E 0/3/0; enemy laser 15 released, 15 hit, missiles 6; repairs 6/9, away walking/repairing 23.5/37.5 s; contacts planet 0, asteroid 1
seed 8: 262.5 s, crew loss, hull crew 24/53 enemy 65/123, terminal crew [downed] enemy []
  gun 664 shots, 564 hits (84.9%); missiles 8 launched, hits W/S/E 0/5/0; enemy laser 14 released, 14 hit, missiles 7; repairs 3/6, away walking/repairing 9.6/25.8 s; contacts planet 0, asteroid 1
seed 9: 127.3 s, crew loss, hull crew 29/53 enemy 97/123, terminal crew [downed] enemy []
  gun 177 shots, 156 hits (88.1%); missiles 2 launched, hits W/S/E 0/1/0; enemy laser 9 released, 9 hit, missiles 3; repairs 2/7, away walking/repairing 8.9/28.9 s; contacts planet 0, asteroid 2
seed 10: 131.7 s, crew win, hull crew 34/53 enemy 0/123, terminal crew [] enemy [planet], PLANET END
  gun 313 shots, 256 hits (81.8%); missiles 4 launched, hits W/S/E 0/2/0; enemy laser 3 released, 3 hit, missiles 3; repairs 0/0, away walking/repairing 0.5/0.0 s; contacts planet 4, asteroid 1

valkyrn median length 140.1 s (gate 180 to 300)
crew wins 1, hunter wins 9 (gate ≥ 1), draws 0, at the cap 0 (gate 0)
gun 3250 shots, 2758 hits (84.9%) over 10 duels; cap 900 s
FAIL: median 140.1 s < 180
```

## Task 14 re-picks (kind b)

- Task 2: `tests/duelGolden.test.ts` and `tests/duelRematchGolden.test.ts` (the duel hash holds three more values); the known-red window opens. Re-bless in Task 14.
- Task 3: `tests/tacticalSlots.test.ts:162` (seed 1's whole scripted duel length, `expected 10125 to be 7796`; the property `wrong === 0` still passes).
- Task 3: `tests/duelSnapshot.test.ts` fixture tick (seed 1, tick 6465, picked by "the crew pew turret is slewed there"): its `systems.0.cls = 1` case now reaches `duel slot identity` instead of `pewTurret: out of range`. Re-pick the tick in Task 14 (log `systems.0.pewTurret` to confirm).
- Task 4: `tests/duelScripted.test.ts:86` ('plays a whole duel with every command admitted'; seed 1 stops sending `sit` once the Hound flies with drag): `expected [ 'shipPower', 'stand', 'torpLock', 'weaponPower' ] to deeply equal [ 'shipPower', 'sit', 'stand', 'torpLock', 'weaponPower' ]`. Re-pick the seed in Task 14 (the lowest seed whose duel uses every kind).
- Task 6: that `tests/duelScripted.test.ts` 'plays a whole duel' is green again at seed 1 with the new kinds list (`throttleCut` added, kind a): seed 1 sits again once the Helm cuts. No re-pick needed unless a later task turns it red.
- Task 6 (first seen in Task 6's full suite; already red before Task 6, so from Task 3 to 5, not run in their targeted runs): `tests/duelCheckpoint.test.ts:51` ('continuation proof'; the split tick is picked by "a missile in flight at the split": `expected false to be true`). Re-pick the split in Task 14.
- Task 6 (same, already red before Task 6): `tests/duelOracle.test.ts:85` (the first-difference line of scripted-3 under a swapped alias: now `first difference at tick 265` where the test pins `tick 1`; with drag the Hound no longer drifts from tick 1, so the first difference is the Helm's first thrust again, as at SIM 54). Re-pick the line in Task 14.
- Task 6 (new with the scripted Helm's cut): `tests/duelModules.test.ts:90` ('a missile pool entry is walked against its fields'; the tick is picked by "seed 6 tick 2746 has a missile in flight": `expected false to be true`). Re-pick the tick in Task 14.
- Task 6: `tests/tacticalSlots.test.ts:162` now reads `expected 7303 to be 7796`; `tests/duelSnapshot.test.ts`'s fixture now fails its precondition "one missile in flight at seed 1 tick 6465" (`expected -1 to be greater than or equal to 0`). Both already listed above.

## Kind (a) rewrites

- Task 4 (the turn boost, the free-flight CREW_FLIGHT and the boosted vent fields are replaced rules): `tests/crewFlight.test.ts` (NO_GRAVITY is the drag-0 branch, DRAG0, CREW_FLIGHT literal, boost-band test deleted because no class keeps a boost, the boost describe is now the fixed turn), `tests/crewSteering.test.ts` (helmBoost reads removed, the gas boost describe is the fixed turn, crewAxes expectations without turnBoost), `tests/crewHelmFx.test.ts` (no boosted-turn puffs), `tests/crewThrusters.test.ts` (the push is flown before drag: × KEEP; helmVent without boosted/turn), `tests/duelAudio.test.ts` (no boosted-turn hiss), `tests/crewHelmOnline.test.ts`, `tests/onlineDuelSession.test.ts`, `tests/helmModule.test.ts` (helmVent literals), `tests/duelScripted.test.ts` (the hazard prediction describe), `tests/crewTelemetry.test.ts` (a comment).

- Task 5 (the free cold gas is replaced by the charge): `tests/crewThrusters.test.ts` (the describe renamed, the 3000-tick free-gas test deleted because no class keeps free gas, the header line), covered instead by `tests/helmGas.test.ts`. No kind (b) failures in the Task 5 targeted run.

- Task 8 (the free cold gas's "never refused" at the crew Helm is replaced by NO GAS): `tests/crewHelmClient.test.ts` (the test 'a thruster press is never refused …' is retitled 'a thruster press on a charge is not refused (helm round 2 §3.3: only an empty one says NO GAS) …'; its body, at a full charge, is unchanged). The Step 7 grep's other hits (`crewSteering`, `crewTelemetry`, `crewThrottle`, `duelThrottle`, `duelCheckpoint`) pin the sim's `heading` command and `face` input, which the sim keeps (§4), so none is kind (a). No test deleted. No kind (b) failures in the Task 8 targeted run.

- Task 9 (Space, the right-button heading and its pan exemption leave the crew Helm online, §4): `tests/onlineDuelSession.test.ts` 'Feel-i: Space held at the Helm rides the held frame as face …' and 'a clear asked for while a heading is in flight is sent …' move to the Valkyrn class's Helm (bodies unchanged); 'A is a thruster here: it does not clear the held heading, so the same heading asked again is deduped' is replaced by 'helm round 2 §4: the map's heading request sends nothing at the crew Helm, whatever the replica holds' (no class sends a heading from the crew Helm; the Valkyrn's dedupe stays in 'A held at the Helm clears the base …'). `tests/crewHelmOnline.test.ts` 'at the crew Helm: the A/D moveX, the three fields and the steer …': the crew Helm's frame drops `face: true` (the Valkyrn's line keeps it). No kind (b) failures in the Task 9 targeted run.

- Task 10 (the console shows the new rules): `src/renderer/src/app/uiProbe.ts` (the probe's crew literal gains the four gas fields, floor -500; a source fix for the typecheck, not a test). `tests/crewHelmUi.test.tsx` (the `crew` literal and the model's `toEqual` gain the gas fields; the AUTO-FACE and old-hint rules are replaced). No test deleted. No kind (b) failures in the Task 10 run.

- Task 12 (the Settings record gains a field, helm round 2 §6.3): `tests/settingsAndControls.test.ts` (the full `Settings` literals gain `throttleTapMs: 200`), `tests/uiMenuState.test.ts` (the two `settings` slice expectations gain `throttleTapMs: 200`). No test deleted. No kind (b) failures in the Task 12 targeted run.

- Task 13 (the hints, helm round 2 §6.4 and §4): `tests/feelPresentation.test.ts` and `tests/feelUi.test.tsx` (the old three-key sit card; the latter's title says "its keys"), `tests/settingsAndControls.test.ts` (the right-click heading row is gone, the right drag pans, the new crew Helm rows), `tests/manualTorpedoInput.test.ts` (the right button's row is 'Right drag', 'Pan the map'). New case in `tests/crewSeats.test.ts` pins the card's 572 px keys and 600 px width. No test deleted. No kind (b) failures in the Task 13 targeted run.

## Scripted Helm tuning (spec §5's gate rule)

- Task 6: none. Every per-seed gate in `tests/duelGates.test.ts` passed with no constant moved (21 passed, the 2 aggregate bands skipped); no crew twin added.

## Gates after Task 6

`npx tsx scripts/duel-telemetry.ts` (the aggregate was already red at the base; the per-seed gates pass):

```
median length 136.7 s (gate 180 to 300)
crew wins 0, crew losses 10, draws 0, at the cap 0 (gate: a win and a loss, none at the cap)
every duel with a crew pew or gun round and a missile launch: true
planet-contact ends under 30 s: 0 (gate 0)

passive crew (nobody at either console), not gated: seed 1 127.2 s crew loss; seed 2 146.5 s crew loss; seed 3 85.1 s crew loss; seed 4 132.5 s crew loss; seed 5 139.6 s crew loss; seed 6 103.2 s crew loss; seed 7 114.5 s crew loss; seed 8 138.1 s crew loss; seed 9 113.7 s crew loss; seed 10 170.8 s crew loss
passive median 129.9 s, shortest 85.1 s
```

`npx tsx scripts/valkyrn-telemetry.ts`: all 25 lines identical, character for character, to the Base section (checked with `diff`), ending `FAIL: median 140.1 s < 180` as at the base.

Full suite after Task 6 (typecheck clean, electron-vite build ok): 519 files, 6217 passed, 7 failed, 2 skipped. All 7 failures are kind (b) in the known-red window and listed above: `duelGolden`, `duelRematchGolden`, `tacticalSlots:162`, `duelSnapshot` fixture, `duelCheckpoint:51`, `duelOracle:85`, `duelModules:90`. No timeouts.


## Task 14

- Step 2: `per-tick canonical trace unchanged at sim version 63: golden 7200 ticks, determinism-v2 108000 ticks in 13 runs (baseline HEAD e65d84fe1a35bfba79294e93a0373bee14411982)`, exit 0.
- The same-version bless at 63 (`npm run bless`, exit 0):

```
blessed tests/golden/basic.json: 120 checkpoints, final f616991e
blessed tests/golden/duel-1.json: 14 checkpoints, 8621 ticks, outcome 2, final 83c0a17f
blessed tests/fixtures/determinism-v2.json: sim version 63, 1800 samples and 330 boundaries re-executed
blessed tests/golden/duel-rematch.json: 27 checkpoints, rematch on tick 8621, rounds 8621 ticks outcome 2 then 7891 ticks outcome 2, final 7423c3b6
```

  `determinism-v2.json` unchanged; `basic.json` one line, its content digest. `canonical-trace.ts golden`: `tests/golden/basic.json: 4 leaves differ, 0 outside version, digest and hashes`, exit 0. blessGuard, golden, duelGolden, duelRematchGolden: 4 files, 20 tests pass.
- Kind (b) re-picks, each by the property its comment states:
  - `tests/tacticalSlots.test.ts`: seed 1's scripted duel length 7796 -> 7303.
  - `tests/duelSnapshot.test.ts`: the fixture seed 1 tick 6465 -> seed 2 tick 6134 (the first tick from 5000 on with exactly one missile in flight, a damaged crew room and a repair in progress, on the lowest seed whose crew pew turret is slewed there; turret -3476). Seed 1's first such tick, 5975 (turret -5632), was passed over: the Hunter's pew charge there is 438, under the Cutter's full 1080, so the test's `systems.1.cls = 0` case reached `duel slot identity` instead of `pewCharge: out of range`. Seed 2's charge is 1728. Seeds 3 to 9 first qualify at 6039, 6475, 6119, 6398, 5975, 5119 (turret 0), 5352; seed 10 none.
  - `tests/duelCheckpoint.test.ts`: seed 10 SPLIT 6048 -> 6583 (the first tick from 5000 on with a missile in flight, a damaged crew room and a repair in progress); seed 10 is now a crew loss at tick 7673; its end summary was `[['downed'], []]`, `[0, 15]`, `[0, 15]`, `[1, 3]`, `[0, 3]`, `[3, 8]` and is now `[['laser'], []]`, `[0, 18]`, `[0, 18]`, `[1, 3]`, `[0, 2]`, `[2, 7]`.
  - `tests/duelOracle.test.ts`: scripted-3's first difference, tick 1 -> tick 265 (from the run; with drag the Hound no longer drifts from tick 1, as at SIM 54).
  - `tests/duelModules.test.ts`: seed 6's first tick with a missile in flight, 2746 -> 2798.
  - `tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts`: by the bless.
  - `tests/duelScripted.test.ts` was already green (Task 6) and needed no re-pick.
- The ten targeted files: 10 passed, 96 tests passed, 2 skipped.
- Gates unchanged since Task 6 (the duel telemetry's summary and passive median, `diff` empty; median 136.7 s, still outside 180 to 300 as at the base); Valkyrn gate unchanged since `HR2_BASE` (all 25 lines, `diff` empty). The fences: no diff since e65d84fe; 5 files, 21 tests pass.
- Full verification: typecheck clean; electron-vite build ok; full suite 522 files passed, 6258 tests passed, 2 skipped, no timeouts; `npm run test:determinism`: Node, Electron and Firefox 1800 samples PASS (logs checked out after); the removed-names grep prints nothing.
- `DUEL_TEST_SEED` moved, 423 -> 1921 (both smoke scripts). The smoke's step 3 timed out on 423. The brief's search (no input, the crew standing) found seed 84 at tick 4946, but the smoke seats both players, and seated seed 84 decides on tick 7609 (423 on 9286), past the 90 s step; the smoke with 84 failed step 3 too. A search with both crew seated from tick 0 over seeds 1 to 4000 before tick 5000 found only seed 1921, decided on tick 4276, a crew win. With 1921 the smoke passes and prints the `ACTUAL DUEL APP` line.


## Task 15 and Task 16

- Task 15: SIM_VERSION 63 -> 64 alone, commit 42c5e5a9, blessed. The canonical trace and the duel oracle prove every run unchanged per tick: 21 runs, 175320 ticks, 740 fields, identical. Bless lines: basic 89001cdd; duel-1 ef2ed5ff; rematch 19deaf2a.
- Task 16, final checks: `npm run typecheck` clean; `npx electron-vite build` ok; `npx vitest run --maxWorkers=4`: 522 files passed, 6258 tests passed, 2 skipped, no timeouts; `npm run build` ok; `npm run test:determinism`: Node 1800 canonical samples and 330 result/event boundaries PASS, Electron 1800 samples PASS, Firefox 1800 samples PASS (the durability logs restored with `git checkout`).
- `SIM_VERSION = 64` at `src/renderer/src/sim/tuning.ts:7`.
- The fence: `git diff --stat 2c4f7c5d` over `valkyrnIdentity`, `w4HunterIdentity`, `valkyrnRoundsRocks`, `pewHunter` and `torpedoGuidance` tests: no output. (There is no `HR2_BASE` ref in this worktree; 2c4f7c5d is the base the plan names.) The removed-names grep over `src` (`helmBoost`, `turnBoost`, `RCS_TURN_BOOST`, `BOOST_FAR`, `BOOST_FACE_SIN`, `THR_RETURN`, `boosted`, `RMB HDG`, `A/D  THRUSTERS`): no output.
- Gates: the per-seed gates pass with no scripted knob moved. The aggregate duel median is 136.7 s (147.0 s at the base), outside 180 to 300 at the base already; owner tuning. The Valkyrn lines are identical to the base.
- Owner note for the playtest (Task 9's review, plan-mandated by spec §7): online, when a cut's result lands while the replica still shows the latch and W is held again, the predicted throttle can stall for a publication or two.
- The gate entry is appended to `docs/gates.md`.

Helm round 2 complete on `helm-round2` at SIM_VERSION 64; the merge to master is the controller's.
