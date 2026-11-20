# Codex review exchange: helm-round2-plan

Subject: `docs/superpowers/plans/2026-11-20-helm-round2.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 187fc4fe, effort high, 1167 s, 38393898 in / 37925634 cached / 98285 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 1's pre-flight cannot pass: the branch head is the plan commit, not 02b1ef81, and the tree has untracked review files
Task 1 Step 1 expects `git rev-parse --short=8 HEAD` to print `02b1ef81` and `git status --short` to print nothing, and tells the executor to stop otherwise. The plan lives on the branch it builds on, so HEAD is at least ad9a1447 (now 187fc4fe, after the refine-brief commit). The worktree also holds untracked files under docs/superpowers/reviews/2026-11-20-helm-round2-plan/. Step 5 then records HR2_BASE as HEAD while labelling it '(02b1ef81)'. · plan L117-118 (expects `helm-round2`, `02b1ef81`, no status output; 'stop and report'), plan L149 ('This is HR2_BASE (02b1ef81)'); git log at session start: 187fc4fe refine(helm-round2-plan): brief → ad9a1447 plan(helm) → 02b1ef81; gitStatus: `?? docs/superpowers/reviews/2026-11-20-helm-round2-plan/.claude-round-1.stderr`, `?? …/.prompt-round-1.md`. · The first step of the first task halts every executor, so the plan cannot start as written. HR2_BASE also comes out ambiguous: two implementers would pick different base commits. · Rewrite Step 1: check `git merge-base --is-ancestor 02b1ef81 HEAD` and `git diff --quiet 02b1ef81 HEAD -- src tests scripts package.json` (only docs commits on top), and `git status --short -- src tests scripts` empty. Define HR2_BASE as `git rev-parse --short=8 HEAD` at that point, and drop the '(02b1ef81)' gloss at L149 and L160.

### [P1] R1-F2 Task 2's hash test loop does not typecheck: `d[key] = value` over keys of mixed type
The rewritten loop iterates `[['thrMille', 7], ['thrCut', true], ['gas', 700], ['gasIdle', 3]] as const` and does `const was = d[key]; d[key] = value; … d[key] = was;`. With `key` typed 'thrMille' | 'thrCut' | 'gas' | 'gasIdle', TypeScript checks a write through a union-keyed index against the intersection of the property types (number & boolean = never). Both assignments fail with TS2322. tests/** is in tsconfig.web.json's include, so `tsc -b` checks it. · plan L237 (the new loop line); existing body tests/helmModule.test.ts:L107-111 (`const was = d[key]; d[key] = value; … d[key] = was;`); tsconfig.web.json:L10 includes `tests/**/*`; plan L419 expects `npm run typecheck: clean`. · Task 2 Step 7's typecheck fails. Vitest strips types, so the executor sees passing tests and a red tsc, and has to improvise a fix the plan does not give. · Keep the numeric loop for thrMille, gas and gasIdle, and test thrCut on its own: `d.thrCut = true; expect(hashDuel(d)).not.toBe(base); d.thrCut = false;`. Or write through a cast: `(d as unknown as Record<string, unknown>)[key] = value`.

### [P2] R1-F3 The kind (a) lists miss two tests the helm changes break or silently shift
(1) tests/duelThrottle.test.ts:57 pins `helmModule.commands` to `['throttle', 'heading']`. Task 3 lists that file but only edits its reverse `push` line, then expects 'all PASS' from it in Step 9. (2) tests/crewOfFourWire.test.ts:64 hard-codes the helm module as 3 values (`… + 4 + 3 + POWER_VALUES`, with a comment saying three). After Task 2 its `interiorAt` points 3 values early, so its `interior[5]` and `interior[9]` corruption checks hit other values. They probably still throw, so the test stays green while testing something else. Task 2 does not name it. · tests/duelThrottle.test.ts:L57; plan L940 (the only duelThrottle edit) and L952-953 (Step 9 runs duelThrottle, 'all PASS'); tests/crewOfFourWire.test.ts:L64; plan L200, L303 (Task 2 fixes only duelSnapshot's `+ 3` → `+ 6`). · The fallout rule catches (1), but only after a red run that the plan says will not happen. (2) never goes red, so the rule never catches it, and the test keeps a wrong offset and a wrong comment. · Task 3 Step 8: in duelThrottle.test.ts:57, insert `'throttleCut'` into the commands list (helm round 2 §2.3). Task 2: in crewOfFourWire.test.ts:64, change the helm term `+ 3` to `+ 6` and update its comment to 'the helm module holds six values (helm round 2 §8)'.

### [P2] R1-F4 Task 14 Step 7's DUEL_TEST_SEED search repeats a range the smoke's own history says was empty
The fallback searches seeds 1..300 for a passive duel decided before tick 4500, and reports BLOCKED if none qualifies. The smoke's doc comment records that this exact search found nothing at SIM 60/61, and that 423 came from a wider search (301-4000, before tick 5000). With drag the passive Hound changes again, so BLOCKED is a likely result. That would stop the close on a smoke-test seed. · plan L3632-3648 (`seed <= 300`, `LIMIT = 4500`, the BLOCKED line); scripts/network/duel-app-smoke.ts:L22-24 ('found by search over seeds 1-300 before tick 4500, none, then 301-4000 before tick 5000, 423 the earliest'). · A known-empty search range turns a routine re-pick into a blocked plan. · Search the way the last re-pick did: seeds 1..4000, LIMIT 5000 (inside the step's 90 s), reporting the earliest decided seed. Keep BLOCKED only if that whole range is empty.

### [P3] R1-F5 The refill test follows §3.3's rule, while §8's '240 ticks later' wording is one tick off; record which wins
From empty, §3.3's rule gives the first refill on released tick 30 (index 29) and the 240th refill on index 268, the 269th tick: 239 ticks after the first refill. §8's test line says 'the charge is full 240 ticks later'. The plan's test (gas[29] = 3, indexOf(720) = 268, gas[267] = 717) is correct for the rule, but no Decision says the spec's wording was read as '240 refill ticks'. · spec L162-167 (the rule; 'full 240 ticks after that'), spec L341-342; plan L1593-1600; plan L56-75 (no Decision covers it). · This was the author's open question. A later reviewer or executor reading §8 literally might 'fix' the test to 269. · Add a Decision 19: '§3.3/§8: "full 240 ticks after" counts the 240 refill ticks, the first being the 30th idle tick, so full is on the 269th tick after the last held tick (index 268).'

### [P3] R1-F6 helmThrottle's clamp test cannot fail on 'the bar coming back does not raise it'
After `rooms[Room.Engines] = 1`, clampToCapacity lowers the Engines bars from 4 to 2 on that step. Clearing the room damage then gives 2 effective bars (cap 500), not 4 as the comment says. The cap never rises above the throttle, so this half of the test cannot fail. · plan L518-522 ('repaired: 4 effective bars again'); src/renderer/src/sim/duel/power.ts:L72-75 (clampToCapacity lowers each system's bars to its capacity); src/renderer/src/sim/tactical/bars.ts:L36-44 (effective = min(bars, capacity)). · Spec §2.1's rule 'getting the bar back does not raise it' goes unpinned. · After clearing the room, also call `engines(d, 4)` (cap back to 1000) before `hold(d, NONE, 60)`, and fix the comment.

## Verified
- Gas arithmetic (Task 5) against spec §3.3: gasTick's six pure cases; one axis for 90 ticks and two for 45 from 720; fore/aft served first at gas 8; no refill while held; from empty the first refill at index 29 and full at index 268 (gas[267] = 717); RCS 70 over 90 ticks gives 105 u/s (plan L1557-1627, spec L158-170).
- Latch order in crewHelm (Task 3): clear when the lever is 0, ramp on `thrCut ? 0 : lever`, then clamp. This matches spec §2.3 steps 1-3, and crewAxes' `cut ? 0 : held` (Decision 6) gives the same result. The throttleCut loop sits after heading's loop (step.ts:L405-412) with stale-tick, invalid-seat (`helm` from attendant(d, d.nav), step.ts:L316), unavailable and noop. The test expectations hold given results sorted by player then sequence (step.ts:L272).
- helmThrottle ramp numbers: 59 ticks to 1000 (up[57] = 986), S from 1000 giving down[57] = 14, down[58] = -3, down[87] = -496, down[88] = -500; 30 W then 40 S gives 510 then -170.
- Low-power climb: gravity at 300 u is GM·300/(300²+20²)^1.5 ≈ 27.6 u/s², below 30 u/s² at 1 bar (ENGINE_FACTOR_BY_BARS[1] = 1); planet at the origin (map.ts:L138, tuning.ts:L13-15).
- Bit-identity: flyShip's `turn * boost * tsp * f` becomes `turn * tsp * f`, exact for boost 1. idle gains only the `stabiliseUnderThrust === true ||` short-circuit. RCS_THRUST is read only in flyShip's rcs branch, which only the newtonian crewHelm sets. w4HunterIdentity runs stepDuel on the Valkyrn class; valkyrnIdentity hashes the tactical state, throttle, holdHeading and power only (valkyrnIdentity.test.ts:L42). crewFlight's flyShipToday loop reads cls.reverseFraction on both sides. telemetry's `v.boosted` term is fenced to newtonianHelm (telemetry.ts:L137-138).
- Every boost reader in src is covered by Task 4's edits (grep: duelAudio.ts:29/57, tacticalModel.ts:525-533, helmFlight.ts, scripted.ts:28/83/137-142/427-428, step.ts, telemetry.ts:138, tuning.ts, defs.ts:13/174-176, physics.ts:8/37, state.ts:213-216). No script under scripts/ reads them.
- Task 6 anchors: the three `if (seat >= 0) { cmds[pid]!.push({ kind: 'stand' }); continue; }` lines (scripted.ts:L388, 393, 404); the quoted Helm branch (L416-422); twin anchors `predictFlight(t, 0, axes, AVOID_TICKS, every)` (L114), the EVADE_RANGE test (L163), `orbitSteer(d, pair.orbitR)` (L177), `crewClass` in scope. assignRepairs gives task [Engines, Weapons] for the repair test (L295-309); `place` and `movedPair` exist (duelScripted.test.ts:L100, L156).
- Task 7: insertion points in input.ts exist (L162, L169, L184, L187-188, L221-222, L227). The fake-clock test expectations follow from `now() - at < tapMs()`; Shift+W is timed before the L174 branch.
- Task 8: anchors in runtime.ts (L266, L287, L412, L443, L483-496, L647, L679, L687) and scene.ts (L308-310, L402-403; crewSeat at L259; holdPreview at L429). With fakeTime's 1000/120 scheduler, a tick runs during advance before rt.frame (tickDriver.ts:L28-45), so tap()'s three ticks deliver the cut on the third. frameOnly runs no tick.
- Task 9: anchors in onlineSource.ts (L113, L123, L147, L164, L169-174, L215, L224) and onlineDuel.ts (L35, L58, L74, L111, L158, L242, L260/263/504 for the three-site replace_all, L265-281, L443, L447, L454, L481). Pump order is observe (results clear cutSent), cutBase, play (sends the cut), cutBase, sent. The three source tests' numbers match the latched()/cutReleased rules. Session rig helpers (rig's 5th cls arg, key, advance, ask, headings, h.sources, c.results/ids) exist (onlineDuelSession.test.ts:L110-137, L773-774). cutSent resets on result, new round, sit, stand and attach.
- Decisions 1-4 measurements by textPx/ADVANCE (theme.ts:L31-43): 'W/S THR  TAP S CUT  A/D TURN' = 158, 'Q/E GAS  LMB STEER' = 104; sit keys 89 + 134 + 98 + 167 + 84 = 572, title 140×2 = 280, card 600. THR at y0+78 clears CAP's rows and the y0+90 buttons by the glyph-metric comment (theme.ts:L25).
- Task 10/11/12/13 anchors: HelmStation.tsx L79, L82-86, L114-118 (PixelText sets data-y, PixelText.tsx:L37); consoleModel.ts L19-21, L35-37, L107, L142, L165; scene.ts L374, L447; readoutModel.ts L155; tacticalModel.ts L65 (CircleDraw), L93, L568; tacticalLayer.ts L332-333; settingsStore.ts L15, L21-22, L36; menuState.ts L32; store.ts L14, L20-21; actions.ts L29, L173 (UiActions inferred, L193); Settings.tsx L3, L31; duelMode.ts L57; main.ts L125, L136, L145, L167; SitCard.tsx L16 (SIT_CARD_PAD) and L23-24; controlsList.ts L22, L50, L70-82; INTERNAL_W and CONSOLE_RESERVE exported.
- Bless and close commands exist: package.json bless, typecheck, test:determinism, test:duel-app-runtime; scripts/bless-golden.ts, scripts/golden/canonical-trace.ts and duel-oracle.ts, scripts/duel-telemetry.ts, valkyrn-telemetry.ts; DUEL_TEST_SEED in both smoke scripts; DUEL_LAYOUT export. No sector sim file imports tactical physics or tuning (only ship/schema.ts touches tactical), so Task 14 Step 2's assumption holds.
- Task ordering: every consumed symbol (thrCut/gas/gasIdle in Task 2, HOUND_REVERSE_FRACTION and throttleCut in Task 3, CREW_* in Task 4, gasTick in Task 5, the tap fields and settings constants in Task 7, NO_GAS in Task 8, cutBase and throttleTapMs in Task 9) is produced by the same or an earlier task.

## Not verified
- Task 1 Step 2's expected '512 files, 6162 tests passed, 2 skipped' and Step 3's exact baseline line: they come from running the suite and scripts, which this review may not do.
- Whether tests/fixtures/determinism-v2.json comes out byte-identical on Task 14's same-version bless (plan L3583, L3589). That depends on whether executeFixture's hashes fold in the content digest; I did not trace scripts/determinism beyond bless.ts:L33-57.
- Whether basic.json's final hash stays 6aad809e on the same-version bless. runSemanticReplay takes the content digest (bless-golden.ts:L46-47) and I did not trace whether it reaches the checkpoint hashes.
- Whether the per-seed gates pass after Task 6 with no tuning, and whether seed 1's whole duel still sends every listed kind: both need whole scripted runs.
- The rewritten crewThrottle 'unattended Helm' test: about 290 ticks at throttle 1000 from seed 5's spawn might meet the belt or rail rocks. I assumed contacts do not move the heading past the ±4 band.
- Task 6's line-up test: that hazardAway finds nothing on seed 2's predicted path at thrust 0.4 (rocks cleared by place), so the face branch still runs.
- That crewSeats.test.ts (a .ts test) can import SIT_CARD_PAD from the .tsx SitCard module in its test environment without a DOM at import.
- Glyph-row claims in Decision 1 rest on theme.ts's 'caps at +8' comment and m5x7's 7-row caps, not a render.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `ad9a1447`. 6 accepted, 0 rejected, 0 deferred. No prior IDs (round 1).

## R1-F1 [P1]: Task 1's pre-flight cannot pass: the branch head is the plan commit, not 02b1ef81, and the tree has untracked review files

Confirmed. `git log` shows 187fc4fe and ad9a1447 on top of 02b1ef81, and the run dir has untracked round files. Task 1 Step 1 now checks that 02b1ef81 is an ancestor of HEAD, that `src`, `tests`, `scripts` and `package.json` do not differ from 02b1ef81, and that those paths are clean. It says the docs commits and untracked review files are expected. Step 5 defines `HR2_BASE` as the head at the start, whose code is 02b1ef81's.

## R1-F2 [P1]: Task 2's hash test loop does not typecheck: `d[key] = value` over keys of mixed type

Confirmed. A write through a key union of a `number` field and a `boolean` field is checked against their intersection, so it fails TS2322. `tests/` is in the typecheck. Task 2 keeps the numeric loop for `thrMille`, `gas` and `gasIdle`, and gives `thrCut` its own set, check and reset line after the loop.

## R1-F3 [P2]: The kind (a) lists miss two tests the helm changes break or silently shift

Confirmed both. `tests/duelThrottle.test.ts:57` pins `helmModule.commands` to `['throttle', 'heading']`. `tests/crewOfFourWire.test.ts:64` hard-codes the helm module's `+ 3`. Task 3's duelThrottle edit now also adds `'throttleCut'` to line 57. Task 2 now edits crewOfFourWire line 64 to `+ 6` with a new comment, lists it under Files, runs it in Step 7, and stages it.

## R1-F4 [P2]: Task 14 Step 7's DUEL_TEST_SEED search repeats a range the smoke's own history says was empty

Confirmed against `scripts/network/duel-app-smoke.ts:L22-24`. The search now covers seeds 1..4000 with LIMIT 5000, the range and limit of the last re-pick that found 423. BLOCKED is reported only if that whole range is empty.

## R1-F5 [P3]: The refill test follows §3.3's rule, while §8's '240 ticks later' wording is one tick off; record which wins

Confirmed. The test follows §3.3's rule. Decision 19 is new: it records that "full 240 ticks after that" counts the 240 refill ticks, the first on index 29 and the last on index 268.

## R1-F6 [P3]: helmThrottle's clamp test cannot fail on 'the bar coming back does not raise it'

Confirmed against `sim/duel/power.ts:L72-75`: `clampToCapacity` lowers the bars to 2, so clearing the room damage leaves cap 500. The test now calls `engines(d, 4)` after the repair, so the cap is back at 1000 while the test checks the throttle stays at 500. The comment is corrected.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-20-helm-round2.md

<!-- end -->

---

# Round 2 (delta, reviewing f30cb257, effort medium, 35 s, 149994 in / 122775 cached / 2975 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — Task 1 Step 1 (plan L118-119) now checks that 02b1ef81 is an ancestor of HEAD, that src/tests/scripts/package.json are the same as at 02b1ef81, and that those paths are clean. It says the docs commits and the untracked review files are expected. Step 5 (plan L150) defines HR2_BASE as the head at the start and no longer carries the '(02b1ef81)' gloss.
- R1-F2: resolved — The loop at plan L238 now holds only number fields (thrMille, gas, gasIdle; DuelState types at plan L350-353). The `as const` literal values can be assigned to number, so `d[key] = value` / `d[key] = was` typecheck. thrCut gets its own set, check and reset line after the loop and before `expect(hashDuel(d)).toBe(base)`, which matches the existing body at tests/helmModule.test.ts:L107-112.
- R1-F3: resolved — (1) Task 3 (plan L950) edits tests/duelThrottle.test.ts:57's `['throttle', 'heading']` to add 'throttleCut'. The current line matches the quoted anchor. (2) Task 2 (plan L312) quotes tests/crewOfFourWire.test.ts:64 verbatim up to the first ';' of its comment, changes `+ 3` to `+ 6`, and keeps the comment's tail ('Engineering spike spec §7 …'). The file is also added to Files (L201), to Step 7's run (L427) and to Step 8's git add (L436).
- R1-F4: resolved — The search now covers seeds 1..4000 with LIMIT 5000 (plan L3639-3658). That is the range of the last re-pick recorded at scripts/network/duel-app-smoke.ts:L22-24. BLOCKED is reported only if the whole range is empty.
- R1-F5: resolved — Decision 19 (plan L76) records that 'full 240 ticks after' counts the 240 refill ticks: the first on index 29, full on index 268. This matches Task 5's test.
- R1-F6: resolved — Plan L530-532 now clears the room, then calls engines(d, 4), which brings the cap back to 1000, and then checks that 60 released ticks stay at 500. The test can now fail if the bar coming back raises the throttle. clampToCapacity (power.ts:L72-77) returns the excess to an implicit pool count, so setting 4 bars again restores the pre-hit total of 10 and over-commits nothing. The comment is corrected.

## Verified
- tests/crewOfFourWire.test.ts:L64: the current text matches the plan's quoted anchor at L312. The `[5, 9]` corruption loop at L65 uses interiorAt, so the +6 fix moves both checks.
- tests/duelThrottle.test.ts:L57: the current commands list is ['throttle', 'heading'], as Task 3's edit at plan L950 assumes.
- tests/helmModule.test.ts:L103-118: the test's title, loop and `expect(hashDuel(d)).toBe(base)` line match the edits Task 2 describes at plan L234-247.
- Plan L493: the engines() helper sets Engines bars directly; L522-534 is the corrected clamp test.
- src/renderer/src/sim/duel/power.ts:L70-77: clampToCapacity lowers bars to capacity, with the excess going to the pool count, and then calls clampThrottle.

## Not verified
- I did not check whether a seed in 1..4000 decides before tick 5000 under the new drag. That needs a sim run, and running the suite or the sim is out of scope.
- Task 1 Step 1 chains with `&&`. That works under Bash or PowerShell 7 but not Windows PowerShell 5.1; I did not check which shell the executor uses.

---

# Round 2 response (no subject change)

Reviewed `round-2.json` against the subject at `f30cb257`. 0 accepted, 0 rejected, 0 deferred; no new findings. The reviewer confirmed R1-F1 to R1-F6 as resolved; the verdict is "ready".

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

