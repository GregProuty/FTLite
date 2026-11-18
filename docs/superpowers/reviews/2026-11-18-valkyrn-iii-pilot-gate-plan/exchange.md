# Codex review exchange: valkyrn-iii-pilot-gate-plan

Subject: `docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 77064aa0, effort high, 408 s, 3779203 in / 3617277 cached / 38051 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The throttle sent on the stand tick is always rejected 'invalid-seat', so requireApplied throws and the repair test fails
Decision 7 and the pilot code send `throttle` then `stand` in the same tick, on the assumption that envelope order decides which applies first. It does not. `stepDuelTick` runs the whole seat phase (sits, then every `stand`) before it looks at any tactical command. It then works out `helm = attendant(d, d.nav)` from the seats as they are after the stand, so the pilot's throttle is checked against an empty Helm and rejected `invalid-seat`. Whenever the throttle is not already 0 when the pilot stands for a repair or to heal, `runValkyrnDuel`'s `requireApplied` throws. The same happens in the `fly` helper and in the repair test's own `expect(r.status).toBe('applied')`. The plan's fallback (swap the two commands) changes nothing. · plan L76 (Decision 7), L566-568 (pilot: throttle push then stand), L430-432 (repair test asserts every result applied), L592 (swap-order fallback), L660 (requireApplied in the gate). Code: .worktrees/sci-2/src/renderer/src/sim/duel/step.ts:176-180 (stands applied in the seat phase), :190 (`helm` taken after it), :205-209 (throttle → 'invalid-seat' when helm < 0); tests/helpers/scriptedDuel.ts:39-45 (throws on any non-applied result). Part i's own test sends the throttle and the stand on separate ticks (valkyrn-i plan L1208-1209). · In attack mode the throttle is usually 4 or −1, so the first repair or heal stand in nearly any seed crashes the gate and the Task 2 tests (repair, and determinism over 3000 ticks). Task 3 Step 4 tells the executor to 'fix the pilot', which leaves the design to be invented during execution. · Choose one now and update Decision 7, the pilot and the repair test to match. (a) Drop the throttle on standing and remove `PILOT_AWAY_THROTTLE`: spec §4.4 says the ship keeps 'the last bearing and throttle'. (b) Stand over two ticks: add a `standing` flag to `ScriptedPilot`. On tick 1, still seated, send `throttle` (with the aim held). On tick 2, send only `stand`. The repair test then steps one extra tick before asserting `seated(d) === false`. Delete the swap-order fallback at L592.

### [P1] R1-F2 Part i freezes GUN, the class and its slots, so the in-process sweep throws and Task 1 Step 3's expected 'frozen false false' is wrong
Part i builds `GUN` with `Object.freeze`, builds every class with `Object.freeze` (and freezes `slots` and `SHIP_CLASSES` too), and sets `VALKYRN_CLASS.slots.gun === GUN`. Task 1 Step 3 will print `frozen true true`. In strict-mode ES modules, `setKnobs`' writes (`g.hitsPerLayer = …`, `cls.hull = …`) throw a TypeError, so every `sweep` command in Task 4 Step 3 fails. The fallback, 'Use Task 4's manual loop instead: edit tuning.ts, run the gate tool, and revert', points at a procedure Task 4 never defines: Task 4 Steps 3–4 only run `sweep`. A frozen array also means an unfrozen copy cannot be swapped into `SHIP_CLASSES`. · plan L85 (Decision 10), L150-154 (Task 1 Step 3 expects false false), L724-731 (setKnobs mutates), L822-828 (the Stage A/B sweep commands). Part i plan L429 (`GUN = Object.freeze({…})`), L441-445 (`shipClass` returns `Object.freeze`, `slots: Object.freeze`), L452 (VALKYRN_CLASS uses GUN), L455 (`SHIP_CLASSES = Object.freeze([...])`). · Part i fixes this outcome, so the plan leaves it to be checked during execution. The tuning tool as written cannot run, and two executors would build two different manual loops (or one would unfreeze defs.ts). · Pick a mechanism that works with frozen defs and write it out. Recommended: `sweep` runs each combination as a child process (`npx tsx scripts/valkyrn-telemetry.ts --json`) after rewriting the four `export const GUN_HITS_PER_*/VALKYRN_HULL = n;` lines in `tuning.ts`. It restores the original text in a `finally` and checks `git diff --quiet -- src/renderer/src/sim/tactical/tuning.ts` at the end. Delete the frozen pre-flight and the in-process `setKnobs`, and rewrite Decision 10 to match.

### [P1] R1-F3 The lead agreement test calls Part ii's leadPip as (state, 0), but Part ii's signature is nine numbers
Part ii defines `leadPip(sx, sy, svx, svy, tx, ty, tvx, tvy, speed): Lead | null`. `viewOffset` calls `leadPip(st, 0)`. `tsconfig.web.json` includes `tests/**/*`, so `npx tsc -b` in Task 1 Step 6 fails with TS2554. At run time the call computes NaN and returns null, so the agreement test fails on every case. The plan defers this ('read render/duel/leadModel.ts', 'fix the adapter') even though the signature is fixed in the sibling plan. · plan L178-183 (viewOffset adapter), L274. Part ii plan L1484 (Produces: `leadPip(sx, sy, svx, svy, tx, ty, tvx, tvy, speed)`), L1607-1619 (body: returns the world point `tx + (tvx − svx)·t`). .worktrees/sci-2/tsconfig.web.json:10 (include has tests/** and scripts/**). · A sibling-part name mismatch that fails tsc and the test as written, left for execution. · Write the adapter against Part ii's real signature: `const s = st.ships[0]!, e = st.ships[st.systems[0]!.target]!, p = leadPip(s.x, s.y, s.vx, s.vy, e.x, e.y, e.vx, e.vy, GUN.speed); return p ? { x: p.x - s.x, y: p.y - s.y } : null;`. Import `GUN` from defs. Drop the 'if the signature differs' text at L178-179 and L274.

### [P1] R1-F4 Tuning the counters breaks Part i's tests/valkyrnRounds.test.ts, which Step 6's grep does not find and Task 4 never runs
Part i's hits tests hard-code the start counters as loop counts and expected arrays: 7 hits then the 8th strips, `gunWear` 7, hull 70→69 after 3 hits, Room level after 6. The file names none of `GUN_HITS_PER*`, `hitsPerLayer`, `hitsPerHull`, `hitsPerLevel` or `VALKYRN_HULL`. So Task 4 Step 6's `git grep -ln … -- tests` does not list it. Task 4 Step 8 runs only duelGates, scriptedPilot and valkyrnLead, so the tuning commit goes in with a red test, and Task 5's full suite fails with no step that fixes it. · plan L857-862 (Step 6 grep), L885-888 (Step 8 test list), L906 (commit). Part i plan L2005-2013 (valkyrnRounds.test.ts imports: no counter names), L2081-2090 (`k < 7`, `[2, 7, 7]`, 8th strips), L2129-2139 (hull 70/69/68, level at 6). · The gate's stated purpose is to move these counters. Once any of them moves, Task 5 fails, and the executor has to rewrite Part i tests with no instructions. · In Step 6, name `tests/valkyrnRounds.test.ts` (and `tests/valkyrnClasses.test.ts`) and say to rewrite their loops and expectations in terms of `GUN.hitsPerLayer`/`hitsPerHull`/`hitsPerLevel` (for example `for (k < GUN.hitsPerLayer - 1)`, `[2, GUN.hitsPerLayer - 1, …]`, hull `70 − 1` after `hitsPerHull` hits). Also run `npx vitest run tests/valkyrn*.test.ts` in Step 8 before the commit, and add those files to the Step 10 `git add`.

### [P2] R1-F5 Stage B's 'best Stage A pair' is undefined when Stage A has no PASS line
Stage B runs 'around the best Stage A pair H, V', but 'best' is defined only for PASS lines (Step 4). When Stage A fails everywhere, which is exactly the case where Stage B matters, two executors would pick different H and V. · plan L826-828 (Stage B), L836-840 (choice rule applies only to PASS lines). · The plan is meant to be executed verbatim. An ambiguous tuning path gives different recorded numbers. · Define the Stage A pick for the no-PASS case. For example: among lines with `hunter ≥ 1` and `cap 0`, the median closest to 240 s; ties go to the smallest normalised distance from the start values, then the earlier line. If no line has hunter ≥ 1, use the lowest `vhull` with the median closest to 240 s.

## Verified
- The pair helpers the pilot imports exist with the bodies the plan assumes. `goalTiles`, `SPEED_SLACK`, `EVADE_RANGE` and `HURT_HEALTH` are already exported (.worktrees/sci-2/src/renderer/src/sim/duel/scripted.ts:37,41,46,140). `hazardAway`, `walkTo`, `canSit`, `inRepairReach` and `roomTiles` are module-local at :85,:191,:208,:217,:252, so Task 1 Step 6's export list is complete.
- The `orbitSteer` extraction is verbatim. The block at scripted.ts:120-134 uses only module constants (TAN_30, COS_45, COS_10, COS_STEP, ORBIT_GAIN at :32,:51-55), `turnToward`, `len` and `circularSpeed`, and `d.tactical.ships[0]` has the same type as `t.ships[0]` in helmAxes (:104). `pair.axes` still gets `{turn, thrust}`, and nothing in the pair's state is hashed. So the refactor is pure, and `duel-oracle same` (all Cutter runs, scripts/golden/duelOracle.ts:50-54) proves it.
- `missileLaunch` is a duel command. It is admitted for the Weapons attendant when `canLaunch` holds (step.ts:30-32, :192-201; weapons.ts:49-52), and `canLaunch` includes the torpedo-range check, which matches the self-review's 'in range' claim. At crew 1 the Flight group makes the pilot both helm and gunner (Part i Decision 18).
- Part i exports `aimTurn` and `heldAim`. A valid held aim sets `holdHeading`, and the unattended Helm flies `headingTurn` toward it (valkyrn-i plan L1326-1329, L1369-1374). So once the throttle issue is fixed, the repair test's `d.holdHeading === p.aim` holds, because the last seated tick's aim was held.
- Test-helper exports exist: `GATE_SEEDS`, `CAP_TICKS`, `PLANET_END_MIN_TICKS`, `OUTCOME_NAMES` and `median` (tests/helpers/scriptedDuel.ts:18-21,63-68). `requireApplied(seed, d, input, results)` is module-local at :39, as Task 3 Step 1 says. tests/duelGates.test.ts:5-8 already imports `Outcome`, `endedFromPlanet`, `CAP_TICKS`, `GATE_SEEDS` and `PLANET_END_MIN_TICKS`, which the new block uses.
- Telemetry has one player row per crew member (telemetry.ts:76), so `createTelemetry(d).players` has length 1 at n = 1. `valkyrnLine` reads only `players[0]`.
- Hound unchanged under the tuning. In Part i, `GUN_HITS_*` reach the sim only through `GUN` (valkyrn-i L429-433), which gun.ts reads as `g.hitsPerLayer` and so on (L2243-2250). The validator's bounds are maxima over non-null gun slots (L1801-1803), so no literals need replacing. `VALKYRN_HULL` is read only by VALKYRN_CLASS and VALKYRN_LASER_CLASS (L452-453). The oracle runs fly only the Cutter (duelOracle.ts:50-54), and Part ii states that no golden carries Valkyrn data (valkyrn-ii L18). So no Hound hash, tick count or gate number can move.
- Pilot determinism: `scriptedPilot.ts` and `lead.ts` import no render/app/input module, use only Math.sqrt/abs/min/max, and draw no rng (tests/helpers/determinismGuard.ts:3,17,31). The orbit radius is fixed at 1850.
- `leadOffset`'s maths equals Part ii's `leadPip` minus the shooter's position. Both compute `r + (v_t − v_s)·t` with the same smallest-positive-root rule (valkyrn-ii L1607-1619 against plan L237-258), so the agreement test is sound once the call is fixed.
- Task ordering: no task uses anything a later task produces. Task 1 needs only Parts i and ii, Task 2 needs Task 1, Task 3 needs Task 2, and Task 4 needs Task 3.
- The gate bands are fixed in both the helper and the test (180–300 s, Hunter wins ≥ 1). The plan says to stop and report if no swept value passes and never to edit the bands (plan L27-31, L841-844).

## Not verified
- Whether the start pilot can reach the bands at any tuned value. That depends on sim behaviour I could not run (the test suite is off limits).
- Whether the hazard-avoid or torpedo-dodge branch fires at the moment the aim, burst or launch unit tests sample (seeds 2–4). If it does, `aim` or `gunHeld` would differ from what the test expects. This depends on each seed's map.
- Whether `medbayRoom(d)` finds the Valkyrn's Medbay (Part ii's valkyrn.json rooms were read only by grep), and whether the 3600-tick repair window in the repair test is enough with the Hunter attacking. Two solo levels take 480 ticks plus walking.
- Whether any Part ii test hard-codes the Valkyrn's hull or gun counters by literal. A grep of the Part ii plan for VALKYRN_HULL, hitsPer and 'hull 30' found nothing, but I did not read every Part ii test body.
- Wall-time estimates for the sweep (30–90 s per combination) and whether the 60 s per-seed timeout is enough for the pilot's 256-dot-product aim search plus the hazard prediction each tick.

---

# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `77064aa0`. 5 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: The throttle sent on the stand tick is always rejected 'invalid-seat', so requireApplied throws and the repair test fails

Confirmed. `.worktrees/sci-2/src/renderer/src/sim/duel/step.ts` applies every `stand` in the seat phase (the `for ... 'stand'` loop) before `const helm = attendant(d, d.nav)`, and the throttle loop rejects `invalid-seat` when `helm < 0`; envelope order cannot help. Chose option (b), made stateless: while seated with a task, if `d.throttle !== PILOT_AWAY_THROTTLE` the pilot sends only `throttle` 0 (holding its last aim, gun off); the next tick it sends only `stand`. Updated Decision 7 (with the reason), the pilot's stand branch, and the repair test (it now flies up to 3 ticks to stand, asserts 1–2 ticks, throttle 0 and `holdHeading === p.aim`; imports `PILOT_AWAY_THROTTLE`). Deleted the swap-order fallback in Task 2 Step 2.

## R1-F2 [P1]: Part i freezes GUN, the class and its slots, so the in-process sweep throws and Task 1 Step 3's expected 'frozen false false' is wrong

Confirmed at valkyrn-i plan L429 (`GUN = Object.freeze`), L441-445 (`shipClass` freezes the class and `slots`), L455 (`SHIP_CLASSES` frozen). Took the recommended mechanism: Decision 10 rewritten; `scripts/valkyrn-telemetry.ts` gains `--json` (gate over seeds 1–10 as one JSON line) and `sweep` now rewrites the four `export const NAME = <int>;` lines in `tuning.ts` (exactly-one-match check), runs the child via `process.execPath node_modules/tsx/dist/cli.mjs` (no shell needed on Windows; checked tsx's bin is `dist/cli.mjs`), restores in `finally` and on SIGINT and verifies the text. Removed the frozen pre-flight and the gun.ts-reads paragraph from Task 1 Steps 2–3 (Step 2 now checks the four declarations are single-line integers; Step 3 keeps the validator check, pointed at `sim/tactical/hash.ts`, where Part i L1804-1805 already derives the bounds). Task 4 Step 3 adds the `git diff --quiet` check. Architecture, file table and self-review updated.

## R1-F3 [P1]: The lead agreement test calls Part ii's leadPip as (state, 0), but Part ii's signature is nine numbers

Confirmed at valkyrn-ii plan L1484 and the body at L1607-1619 (returns `tx + (tvx − svx)·t`, a world point). `viewOffset` now calls `leadPip(s.x, s.y, s.vx, s.vy, e.x, e.y, e.vx, e.vy, GUN.speed)` with `e` the locked target and subtracts ship 0; `GUN` imported from defs. Removed the "if the signature differs" text in Task 1 Step 5 and the self-review.

## R1-F4 [P1]: Tuning the counters breaks Part i's tests/valkyrnRounds.test.ts, which Step 6's grep does not find and Task 4 never runs

Confirmed at valkyrn-i plan L2081-2090 and L2129-2139 (literal loop counts and arrays), and found two more literal pins: valkyrnClasses.test.ts L255 (`toEqual([30, 160, 200])`) and L256/L258 `hull: 30`, and valkyrnGun.test.ts L1585-1587 (`bad(... gunWear, 0, 8)`, `gunHull 3`, `gunRoomWear 6`). Task 4 Step 6 now runs `tests/valkyrn*.test.ts` plus the grep list and says how each named pin is rewritten in terms of `GUN.hitsPer*` / `VALKYRN_HULL`; Step 8 runs `tests/valkyrn*.test.ts`; Step 10 stages those files by name; the Files list names them.

## R1-F5 [P2]: Stage B's 'best Stage A pair' is undefined when Stage A has no PASS line

Confirmed: Step 4's rule covered only PASS lines. Task 4 Step 3 now defines the Stage A pick: the Step 4 PASS pick; else hunter ≥ 1 and cap 0 with median closest to 240 s; else lowest vhull then median closest to 240 s; ties by normalised distance from start (3/30), then the earlier line.

## Also changed

- Task 1 Step 7's conditional `git add` list now names `sim/tactical/hash.ts` instead of `gun.ts`.

## Files changed

- docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md

<!-- end -->

---

