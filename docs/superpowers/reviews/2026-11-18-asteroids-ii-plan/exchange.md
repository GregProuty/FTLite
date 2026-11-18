# Codex review exchange: asteroids-ii-plan

Subject: `docs/superpowers/plans/2026-11-18-asteroids-ii.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing e58b73bf, effort high, 955 s, 19355566 in / 18964086 cached / 88450 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 10's SPLIT finder crashes under tsx: duelInit reads the vitest-only __GAMEPLAY_CONTENT_DIGEST__ global
scripts/spike-asteroids-find-split.ts imports duelInit/duelCore from tests/helpers/duelAuthority and is run with `npx tsx`. duelInit and the core's deps read the bare identifier __GAMEPLAY_CONTENT_DIGEST__, which only exists when a bundler or vitest defines it. Under tsx the first duelInit(seed) throws ReferenceError, so Step 8's duelCheckpoint re-pin (SEED, SPLIT, summary) cannot be done by the stated procedure. · plan L3343-3349 (`Usage: npx tsx scripts/spike-asteroids-find-split.ts`, `import { createDriver, duelCore, duelInit, stepScripted } from '../tests/helpers/duelAuthority'`, `duelCore(duelInit(seed))`), plan L3366 (Step 8 depends on its output); tests/helpers/duelAuthority.ts:L20 (`contentDigest: __GAMEPLAY_CONTENT_DIGEST__`) and :L22 (deps); the global is supplied only by vitest.config.ts / electron.vite.config.ts / a vite `define` (scripts/determinism/run.ts:L40); no script in scripts/golden or scripts/bless-golden.ts uses the helper; src/renderer/src/sim/snapshot.ts:L17-19 shows unbundled callers must guard or supply the digest. · A task step that cannot run as written leaves the executing subagent to improvise how to re-find a pinned continuation fixture, and that fixture is a §9.1 determinism acceptance item. · At the top of the finder add `import { computeContentDigest } from '../build/contentDigest';` and `(globalThis as Record<string, unknown>).__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd());` before the loop (the identifier is resolved at call time). Or make the finder a describe.skip/env-gated vitest file run with `npx vitest run`. Say which in Step 7.

### [P2] R1-F2 lineOfSight (laserEligible) still sees born pieces while firstBlocker skips them
Task 4 makes firstBlocker skip born slots but leaves geometry.lineOfSight untouched. In one tick's weapon phase the crew (slot 0) can break a rock first. The Hunter's shot (slot 1) then has laserEligible false because a fresh piece is on the line, and its miss path (laserRockTarget → firstBlocker) skips that same piece. The shot is spent (shots++), hits nothing, and the beam is drawn to the target ship with hit:false. So a piece blocks a shot without being the body that takes it. · plan L1588 (born skip added only to firstBlocker), L1657-1665 (enemy-shot miss path via laserRockTarget); spec L239 ('firstBlocker skips born slots (the line passes through a piece made earlier this tick)'); src/renderer/src/sim/tactical/weapons.ts:L76 (laserEligible → lineOfSight), :L90-96 (laserRockTarget → firstBlocker); src/renderer/src/sim/tactical/geometry.ts:L22-31 (lineOfSight iterates rocksNear with no born check); duel.ts:L30 (weapons applied in slot order, so slot 1 sees slot 0's pieces). · The spec's rationale ('the line passes through a piece made earlier this tick') applies equally to line of sight. Without it the same piece is solid for 'can I hit the enemy' but absent for 'what did I hit', which gives a visible phantom miss. · In Task 4 also add `if (state.rockBorn[k] === 1) continue;` as the first statement of lineOfSight's rock loop (geometry.ts:L26). Add a rockLaser case: a born piece between an eligible Hunter and the crew does not make laserEligible false. List it as a clarification of §6.2.

### [P2] R1-F3 Eviction dust is indistinguishable from break dust, which inflates §9.4 breaks, break shakes and the sound budget
allocate() emits eviction dust with the requesting break's `by`, a real slot and no `ship` (deviation 2). Every consumer treats `dust` with rock ≥ 0 and by ∉ {planet, edge} as a break. feelShot counts breaks++ when an evicted rock was in the blast family. pushRockShakes starts a break shake at the evicted rock's location, which can be on screen when the real break is not. rockSounds plays a crunch, using the 6/s limiter during chain reactions. · plan L34 (deviation 2), L890-903 (allocate → dustRock(s, best, by)), L3523 (feelShot: family dust → breaks++), L3147 (pushRockShakes dust branch), L3252 (rockSounds crunch for dust); spec L325-327 ('Overflow-piece dust, eviction, the planet and the edge are not breaks'), L349-352 (report logs breaks). · The report's §9.4 'breaks' column and the feel cues would count evictions as breaks, contradicting §8's definition. A one-field marker costs nothing (events are not hashed, and the bless happens after Task 9). · Add an optional `evicted?: true` to the rock event (state.ts DuelEvent) and set it in allocate's dustRock call (for example a `dustRock(s, k, by, ship?, evicted?)` parameter). Skip `evicted` dust in feelShot's breaks++, pushRockShakes and rockSounds. Give it a puff only in pushRockFx. Assert it in the rockBreak eviction test (L707). Record it under deviation 2.

### [P2] R1-F4 Tasks 10-11 leave two loop exits open: p99 still failing after the grid, and a sim fix found after the bless
(a) Task 11 Step 3 says that if p99 fails, do Steps 4-7 'then re-run this step', and Step 7 says 'Then re-run Step 3'. Nothing says what to do if p99 still fails with the moving-rock grid, so the subagent either loops or decides alone. (b) Task 10 Step 8 says a real rule break found in the whole suite must be fixed in Tasks 1-9. That runs after Steps 3-6 have blessed the goldens at 53, but there is no instruction to re-bless (a same-version bless at 53) and re-commit the goldens. · plan L3605-3607, L3717 (re-run loop with no exit); spec L354-356 ('the spike is not accepted until it passes'); plan L3311-3335 (bless before Step 8), L3368 ('fix it there with a failing test first') with no follow-up bless; scripts/golden/blessGuard.ts:L19-27 (a same-version bless is allowed and is the right tool). · Fresh subagents only see their task. Both cases are likely on a chaotic physics change, and both need a fixed rule rather than a judgement call. · (a) Add: 'If p99 still fails with the grid, do not tune; record stepDuelMs and report BLOCKED (acceptance item §9.5 failed).' (b) Add to Step 8: 'After any sim fix, re-run `npm run bless` (same-version at 53), re-run Step 1's duelGates, and commit the goldens with the fix.'

### [P3] R1-F5 Stale line references for duel.ts and missiles.ts
Task 1 cites duel.ts:351 (the file is 46 lines; the events reset is L26). Task 2 cites missiles.ts:205 and 307-309, and Task 5 cites 203-258, 225-229 and 299-311 (the file is 128 lines; the rock import is L8, the torpedo-rock block L109-113, launchMissile L15-26, homingTurn L46-61). The quoted code is correct, so a subagent can find it by content, but the numbers mislead. · plan L102, L547, L1099, L1758, L1991; src/renderer/src/sim/tactical/duel.ts:L26; src/renderer/src/sim/tactical/missiles.ts:L8, L109-113. · A subagent told to edit 'line 309' of a 128-line file may stall or edit the wrong place. · Replace with duel.ts:9, 26 and missiles.ts:8, 15-26, 28-33, 46-61, 109-113 (or cite by function name).

## Verified
- Task 1 hash wiring (item 7) is complete. SYSTEMS_TAIL, the space rock block, notSnapshotted, the clone, systemsRules(slots, rocks) and topRules match hash.ts:L22-23, L85-89, L112-116, L171-182, L199-217 and L226-228. The duel snapshot validates and measures only through the module field lists (sim/duel/snapshot.ts:L67-71, L133), so no other length or schema needs touching. The new flatten-length formula (+6 counters, 2x30 ship scalars, 17 science) matches the field lists.
- The rockPool test's validation cases throw with the `duel snapshot tactical <name>: out of range` message that the regex matches (hash.ts:L231, L240, L253). Inactive slots are checked for zeros before the per-field rules (hash.ts:L238-240), so emptySystems' zeros pass.
- Every ShipInput literal that Task 7's required `rockLock` touches is covered: step.ts:L189, hunter.ts:L90, IDLE_INPUT and UNCREWED_INPUT (weapons.ts:L32-34). The test helpers spread IDLE_INPUT (ftlTargeting:L31, tacticalWeapons:L16, etc.).
- Task 7 step.ts edits match the real loop (step.ts:L188-200): `result(e, undefined, 'noop')` is a valid signature (L159-161). WEAPON_ORDER puts rockLock before missileLaunch, so the effective torpRock is known at launch admission. duelCodec is a CommandCodec factory, so `duelCodec(2)` is valid (codec.ts:L211, L237). The new zod line fits duelWire.commands (codec.ts:L117-120).
- No hidden command whitelists: runtime.ts:L228 (isWeaponsCommand, edited in Task 8) and onlineDuel.ts:L234-235 are the only kind-specific senders.
- §3.3 orders (item 8) are encoded as specced (plan L1371-1398): a live outer loop, born and processed skips, rocksNear taken once, a's turn ending on a break; and in the pair, wake, separate, bounce, both wears, then breaks a then b with exclude [a, b]. Tests cover momentum, no damage at vc 30, the lighter rock taking more (3.2/0.8 are exact doubles), bump-before-splits order, a static rock not moving at vc <= 40, a pair once per tick, and a rock woken at a higher slot taking its turn.
- §4.2 order (item 8): detonateTorpedo builds the in-radius list before breakRock writes the burst, then the blast event, the burst, the listed rocks (born or gone skipped), then ships (plan L1922-1947). The fall-off test numbers are arithmetically right; the eviction case gives rockEvictions 5 with the reused slot 120 not hit.
- The Task 5 homing test discriminates homing: torpedo spawn 25 u ahead, launch 60 u/s, thrust 160 (tuning.ts:L94-96), so about 1.2 s to the rock. The rock drifts about 48 u east against a contact half-width of 34, so a straight torpedo would miss.
- Task 6's ram hull examples are right: ramHull(40)=1, (100)=2, (173.08)=4, (138.46)=3. The ram damage formula equals the test's 99 - 6.8. stepFlight and stepSoloFlight keep hitStatics (physics.ts:L67-79) via resolveContacts(state, rocks=false).
- Task 8 interfaces exist with the assumed shapes: contactController's st/weapon/takeRequests (contactController.ts:L70, L134-138); tacticalModel's toS, onScreen, z, CREW_SLOT and pickContact (tacticalModel.ts:L7, L301-305, L454); scene.ts's contact, click, onMap, aimed, options.pointer (scene.ts:L170-179, L228, L261); runtime's pending/launched block (runtime.ts:L280-292) and weapons-only queue section (L389-405); WeaponsStation Card and targetText (L30, L37-43, L70-85); ui/actions consoleActions (actions.ts:L47-54).
- Task 9 imports exist: fxModel exports BURST, BURST_S, FLARE_S, SPARK_S, startShake, ViewEvent (fxModel.ts:L14-27, L62); the shake test matches startShake's strongest-wins rule; audio keys and SoundRequest fields and Pan exist (soundBank.ts:L12-14, L58-62; duelSounds.ts:L15); duelAudio's lock/clock/list/reset exist (duelAudio.ts:L31, L51-52, L63); tacticalLayer's marks/bodies/combat/segments/dashCircle/DASH/GAP/seg and effect chain exist (tacticalLayer.ts:L12, L67, L93, L120, L253, L379-398).
- Task 10 commands are real: npm run bless = tsx scripts/bless-golden.ts (package.json:L26); canonical-trace.ts supports baseline|check|golden and duel-oracle.ts baseline|check; a same-version bless is allowed and a one-step bump runs both proofs (blessGuard.ts:L22-36); npm run test:duel-app-runtime exists (package.json:L19); tests/duelGates.test.ts and duelCheckpoint.test.ts exist.
- Task 11's script imports all exist; profile-duel-publication.ts has WARM, d and result where the patch expects them (L27, L39-42, L57). The stress twins copy IDLE_INPUT before mutating rockLock.
- Typecheck scope: tsconfig.web.json includes tests/** and scripts/**, so per-task npm run typecheck covers edited scripts; spike-asteroids-measure.ts's cast-event comparisons (L47-51) stay compilable after the RockCause change.
- Fixed decisions are respected: weapons unchanged, billiards pushes and mass bounces, torpedo area blast with a burst, rock-rock damage to both, rock targets on purpose and by accident, pieces hurt ships and torpedoes with blast push only on ships, spike-only SIM bump, no online fx.

## Not verified
- Seed-specific geometry the tests assume, not computable without running the map generator: seed 5 asteroid 0 has r > 20 (hp >= 3) so a 2-damage shot does not break it (rockLaser 'wakes a static rock', plan L1462-1472; tacticalWeapons L104 update, plan L1737); seed 5 asteroid 5 has r about 44.6 (rockShips hull-3 case, plan L2131-2140); the seed-5 crew spawn is out of laser and torpedo reach of rock 0 (rockLock and duelRuntime cases, plan L2334-2353, L2659-2667).
- That 21b41758 is master's tip at the merge and that .worktrees/spike-asteroids exists at 577bb00c (Task 11 Step 8); git was not run.
- That DuelSession.summary is the shape the finder prints and duelCheckpoint pins (authority/duelRules.ts:L21 suggests yes).
- Whether the contactScene rig's weapons camera puts the staged rock at me.x+150 under the click with no nearer rock centre (very likely; the click is at the exact centre).
- Run-time behaviour of the Electron screenshot script and the measured p99 and feel-floor outcomes (need execution).

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `07d22040`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 10's SPLIT finder crashes under tsx

Confirmed: build/contentDigest.ts:L7 exports computeContentDigest, and the global is otherwise defined only by bundler and vitest config. The finder now sets `globalThis.__GAMEPLAY_CONTENT_DIGEST__ = computeContentDigest(process.cwd())` before the loop.

## R1-F2 [P2]: lineOfSight still sees born pieces

Confirmed (geometry.ts:L22-L31). Task 4 now also edits lineOfSight to skip born slots, adds a test (born piece: clear; not born: blocked), lists geometry.ts in Files, and records it as clarification 5a.

## R1-F3 [P2]: Eviction dust indistinguishable from break dust

Confirmed. dustRock gains an `evicted` parameter, the rock event gains `evicted?: true`, and allocate passes it. pushRockShakes, rockSounds and feelShot skip evicted dust (the puff stays). The eviction test asserts the flag, and deviation 2 is updated.

## R1-F4 [P2]: Two loop exits open in Tasks 10-11

Confirmed. Task 11 now re-runs p99 once with the grid, and if it still fails it records stepDuelMs and stops BLOCKED. Task 10 Step 8 re-blesses at the same version, re-runs duelGates and commits the goldens after any sim fix.

## R1-F5 [P3]: Stale line references

Confirmed. The duel.ts and missiles.ts citations are corrected.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-asteroids-ii.md

<!-- end -->

---

