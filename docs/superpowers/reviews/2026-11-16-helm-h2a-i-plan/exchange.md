# Codex review exchange: helm-h2a-i-plan

Subject: `docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 1fd401d, effort high, 1023 s, 17979679 in / 17680172 cached / 78872 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 An out-of-range round index makes validateDuelCheckpoint loop without bound (roundSeed has no cap)
The round module check only requires `round` to be a non-negative safe integer, and `baseTick` only has to be at most the tick. The checkpoint validator then calls roundSeed(init.seed, round). roundSeed extends a memoised chain one followingSeed at a time up to `round`. Each followingSeed calls nextValidSeed, which calls duelSeedFacts, which builds a fresh TacticalState (map plus grid) on every cache miss. A checkpoint whose round is, say, 2^40 passes every earlier check and then hangs the process, growing the chain array until memory runs out. · plan L2295 (`!Number.isSafeInteger(round) || round < 0` is the only bound on round); plan L2297 (base only ≤ h.tick); plan L2593 (`roundSeed(cp.init.seed, r.round)` runs before the telemetry checks); plan L337-345 (`while (chain.length <= round) chain.push(followingSeed(...))`); plan L423-430 (a seed-cache miss runs createTacticalState). How such input arrives: validateDuelCheckpoint is rules.validateCheckpoint (src/renderer/src/authority/duelRules.ts:64). It is reached from encounterMode decodeCheckpoint (src/network/modes/encounterMode.ts:53) and runModeReplay (src/renderer/src/authority/replay.ts:46). Spec L36 adds a duel validateMirror; its sector counterpart validates peer-uploaded mirror bytes (src/main/network/onlineSector.ts:21). Spec L232 asks only for 'a non-negative safe integer'. · The checkpoint path is the Net-3 boundary that 'validates everything before any allocation' (duelCheckpoint.ts:4), and its bounds are resource limits (codec.ts:9). One malformed or hostile mirror or replay would freeze the guest's main process or the utility. This is the forged-round case item 7 asks about: the round does not pass validation, but it is never refused either. · Bound the round before any seed work. In validateDuelSnapshot's round-module block (plan L2295), also require `round <= MAX_DUEL_ROUNDS` (export it, e.g. 1024, far beyond any session) and `2 * round <= base`: round n begins no earlier than tick 2n, because each round needs its deciding step and the rematch step. Make roundSeed throw above MAX_DUEL_ROUNDS too. Add `[0, MAX_DUEL_ROUNDS + 1, /round/]` and `[0, 1, /round/]` to the round-module cases in tests/duelSnapshot.test.ts (plan L1809; the good snapshot has baseTick 0).

### [P2] R1-F2 Later SIM bumps re-bless duel-rematch.json on proofs that never run a rematch
The rematch golden joins the pinned set, so every future bump re-blesses it. The only per-tick duel proof the guard runs is the migration oracle, and its runs stop at the first decision. No proof covers stepDecided, startRound's tick stamps or round 2. The plan says so itself ('the oracle's runs never rematch, so a bump re-blesses it on the same proofs as duel-1.json'). A bump that also changed rematch behaviour would rewrite the rematch golden with no per-tick evidence. · plan L2879-2881 (bless-golden comment), plan L2915-2918 (the rematch golden in storedVersions and names), plan L2936-2940 (staged on every bless); scripts/golden/duelOracle.ts:193 (the recordRun loop runs only while `d.tactical.outcome === Outcome.Running`); duelOracle.ts:43-46 (ORACLE_RUNS: fresh seeds only); scripts/golden/blessGuard.ts:26-35 (a bump runs only verify and duel). · The rematch golden exists to pin the round transition, but from the next bump on, nothing proves that transition before it is re-blessed. The suite's round-start equivalence test is the only remaining guard, and it is a 600-tick unit test, not a bless gate. · In Task 4, after the --fresh bless, add one rematch oracle run (e.g. `rematch-1`: the scripted pair at seed 1, a rematch on the first end-card tick, round 2 to its outcome) to ORACLE_RUNS and recordRun. The next bump's SIM 39 baseline then records it per tick. Alternatively, state in bless-golden.ts and the plan that the next bump must add such a run before re-blessing duel-rematch.json.

### [P3] R1-F3 The restore-equality test passes vacuously if the rematch does not start a round
The test steps only while the outcome is Running and never asserts that the rematch applied or that the loop ran. With a rematch that silently fails, the duel stays decided, the loop body never runs, and the test passes. That is why Step 1 expects 9 of the 10 new tests to fail, not 10. · plan L1441-1452 (`for (let k = 0; k < 600 && d.tactical.outcome === Outcome.Running; k++)`, with no assertion on d.round or the iteration count); plan L1816 ('FAIL, 9 tests'). At HEAD a decided duel's step returns [] without ticking (src/renderer/src/sim/duel/step.ts:73), so the loop never runs. · This is the spec §7 test that guards ECS reuse between the stepped and restored duel. It should fail if no new round was built. · Assert the rematch result is applied and that `d.round === 1` after the rematch step. Count the iterations and expect 600, or expect `d.interior.tick - d.baseTick` ≥ 600, or that the round was decided after at least one step.

### [P3] R1-F4 No test validates a paused checkpoint on a decided round, or a bad decidedTick on a decided snapshot
The test titled 'paused on the end card' pauses during round 2 while it is still Running. The only decided-round capture it validates is in the running phase. No case feeds a decided snapshot with decidedTick −1, below baseTick or above the tick. The decided branch of the round check (plan L2298) is only ever exercised with valid values. · plan L1518-1541 (pause at L1525, when round 2 has just begun, then a running capture at L1540); plan L1809 (the round-module negative cases use the running seed-7 snapshot, so only `[3, 7]` reaches the running branch); spec L264 ('a decided round may be running or paused'). · Paused on the end card is ordinary play (Escape on the end card, then a re-host). Spec §7 names this case explicitly, and the decided branch of the validator has no negative coverage. · In the re-host test, decide round 2, pause, capture, and expect it through throughBytes (phase 'paused', outcome decided). Restore it with liveDuel. Add a decided snapshot (e.g. from decided()) to the duelSnapshot round cases with decidedTick −1, baseTick − 1 and tick + 1, each rehashed and expected to throw /decided tick/.

### [P3] R1-F5 restoreDuelSnapshot keeps the target's per-tick events, so it is not exactly a fresh load
writeBack unflattens the modules and checks the hash, but d.events and d.tactical.events are not snapshotted and are left as they were. loadDuelSnapshot returns them empty. Restoring into a duel that has stepped (as Task 1's own test does, played(4, 200)) leaves tick 200's events in place. · plan L551-555 (writeBack), plan L584-589 (restoreDuelSnapshot); src/renderer/src/sim/duel/snapshot.ts:5 ('Not stored: the per-tick events'); tests/duelSnapshot.test.ts:45 expects `r.events` and `r.tactical.events` to be [] after a load. · Item 7 asks for equivalence with a fresh load at every tick. A view or cue reader of a restored replica could replay stale events. Today's client replicas never step, so the effect is latent. · In restoreDuelSnapshot, after writeBack, set `d.events = []; d.tactical.events = [];`. In the Task 1 restore test, assert both are [] after the restore.

### [P3] R1-F6 The round-start equivalence test uses a highly composite offset (T = 252)
decided(4) plus 250 end-card steps puts the rematch round's baseTick at 252 = 2²·3²·7. Any future tick-periodic duel rule whose period divides 252 (2, 3, 4, 6, 7, 9, 12, 14, 18, 21, 28, 36, 42, ...) would behave the same at T and at 0, and the test would miss the stamp. I verified that no such rule exists today: the tactical code uses the tick only as a stamp. · plan L1419-1422 (decided(4), 250 steps, the rematch, `T = d.baseTick`); src/renderer/src/sim/tactical/contacts.ts:17-19, hunter.ts:91-96 and duel.ts:29 (tick used only as a stamp); the only `tick %` in sim is the sector's step.ts:35. · The test is the audit's standing guard (spec §7). A prime offset makes it catch periodic logic as well. · Use 255 end-card steps (T = 257, prime), or any count that makes T prime, and say why in a comment.

## Verified
- Executability: every Task 1-4 `replace:` block occurs exactly once in its file at its point in the plan. Checked against snapshot.ts:7-17,38-39,55-57,61-65,68-79,92-94,96-98,104-111; duelCheckpoint.ts:3-5,9-15,19-20,35-37,79-81,90-102; codec.ts:6-7,43-44,90-95,103-104,112-122,160-162; contracts.ts:2-4,76-77,80-86,106-108; summary.ts:1-9,14-18,25-28; step.ts:2-3,13-15,21-22,65-74,114-116,126-127 (the stepDecided line `else { st.tick++; ...}` does not match '  st.tick++;\n'); state.ts:34-35,38-46,50-53,57-59; modules.ts:1-4,7-9,30-31,65-66; telemetry.ts:3-5,36-37,87-93; duelRules.ts:1-5,10-12,16-19,26-28,34-36,39-49,53-56; core.ts:445-446; rules.ts:2-4,49-50; replay.ts files; tuning.ts:6-8; network/modes/duel.ts:2-4,17-19; duelOracle.ts:89-91; bless-golden.ts:1-3,24-26,35-39,53-55; and the test files (codecModeWire, duelSummary, commandUnion, duelCheckpoint, duel, duelModules, duelSnapshot, duelMode, blessGuard, helpers/duelAuthority, helpers/scriptedDuel).
- Every interface the plan consumes exists with the assumed shape: scalar (sim/module.ts:28); hashTactical, tacticalLength, validateTacticalValues and TACTICAL_MODULES (tactical/hash.ts:122-190); Derived and CanonicalField; createEncounterCore(rules, deps, state, restored) (core.ts:41); AttachOptions.admissionPolicy (authority.ts:10-11); CaptureCause including 'safe-point' (shared/sessionCheckpoint.ts:3); throughBytes, resolveCutter, ownTestCleanup, LOCAL_DUEL_RUN, and DuelCommand re-exported from sim/duel/commands.ts:5.
- validateTacticalValues reads only the shape's map and slot count (tactical/hash.ts:188-198), so sharing the cached shape is safe. The cached `fieldOffsets` and `spaceLength` equal what the old code recomputed per call.
- No other DuelInit literal, ModeWire implementation, exhaustive Command or reason switch, or duel 'ended' consumer exists in src/tests/scripts that the widened types or rules would break (grepped). Single player steps the duel directly and stops at the decision (app/duel/runtime.ts:212-217,258), so H-1 is unaffected in plan i.
- Round 0 of a fresh duel steps as today. The running path changes only in the rematch reason (duel-running instead of not-in-duel), and no golden or oracle run sends rematch. recordTick's new guard is equivalent while Running with baseTick 0. The deciding step's only new write is decidedTick, which is covered by MIGRATIONS[38].added. The oracle loop stops at the first decision (duelOracle.ts:193), so it never reaches the end card.
- Tick-stamp audit: tactical code uses the tick only as graceUntil (contacts.ts:17-19), hunter fireAt and lastLaunch (hunter.ts:91-96; duel.ts:29) and tactical.tick. The scripted pair's lastLaunch (scripted.ts:65,224) compares relatively. Interior stamp fields exist (canonicalFields.ts:52-78) but are never run by the duel. snapshotValidation bounds them only by range, with no relation to the tick (snapshotValidation.ts:46-47,74-75).
- The in-place next round creates the new duel (fresh SimState) before disposing the old one, so round n+1 never shares entities with round n. present is copied, not aliased. duelRules swaps in a fresh accumulator and nulls the summary on a round change.
- End card (Decision 6) matches spec §7 L244-256. The first rematch from a player present at the tick's start is applied and any later one that tick is noop. Away is unavailable, a wrong-tick stamp is stale-tick, presence applies, other duel kinds get duel-decided, and setPaused stays the core's (core.ts:370). Tactical events are cleared, so cues never repeat. No physics runs; both ticks advance by one. The accumulator ignores end-card ticks (t.outcome check).
- The checkpoint validator implements spec L262-268: the seed is roundSeed(init, round); phase 'ended' requires a decided round, but not the reverse; helmPlayer equals init.helmPlayer; grace lengths come from the round seed; ticks are tick − baseTick while running and decidedTick − baseTick once decided; the outcome agreement is kept.
- Safe-point key `duel:${round}:${decided}` changes at the decision and at the rematch. That drives core.ts:138-139, and the snapshot tick at the decision is decidedTick (set after st.tick++).
- Bless sequence: both baselines are recorded at 38 in Task 1 Step 1, before any change. Tasks 1-2 are proved neutral with `same`. MIGRATIONS[38] uses the spec's exact pattern (spec L288). Check, bless and golden run in that order. The rematch golden is added alone with --fresh. blessRefusal treats a missing artifact under --fresh as no bump (blessGuard.ts:24-27). It is read through duelVersionFromText (storedVersion.ts:19-24), and its names and storedVersions orders match.
- The widened summary and round record match spec §8 L298-303 (the six-cause missileLosses per ship, in the accumulator's order). The codec builds endRecord and round from one shape, and the round record is strict (round uint, seed u32, baseTick uint). sectorWire.events returns [], so the sector payload union is unchanged apart from the accepted reason-enum widening (spec L147-149).
- The determinism guard (tests/helpers/determinismGuard.ts) bans `**`, unapproved Math and the platform globals. The new guarded code uses none of them; parseInt is already used in guarded snapshot.ts:91.

## Not verified
- The prototype's test counts, the bless output lines and hashes (final 0e111f7a, 5dab688c, 55 checkpoints) and the profile figures: I did not run anything, by instruction.
- How many ticks liveDuel advances per pump (the driver's catch-up on the first pump at 16.68 ms), which the authority tests' tick arithmetic depends on.
- Entity recycling across non-adjacent rounds: SHARED_ENTITY_INDEX (sim/state.ts:108) lets round n+2 reuse eids freed by round n. Decision 5's 'no ECS entity is reused across rounds' holds only between adjacent rounds, and the restore-equality test covers one rematch. Hash equality under per-tick load and dispose in tests suggests creation re-initialises every component, but I did not read createSimState to confirm it.
- That plans ii and iii route peer-uploaded duel mirrors through validateDuelCheckpoint. I inferred it from spec L36 and the sector analogue onlineSector.ts:21; I did not read the H-2a-iii plan.
- Whether tsx on the Step 2 profile script, run before restoreDuelSnapshot exists, does more than warn on the missing namespace member, and whether scripts/ is under `npm run typecheck`.
- I read outside the manifest to confirm or rule out findings: tactical/state.ts, tactical/hash.ts:160-220, contacts and hunter via grep, scripted.ts via grep, canonicalFields.ts:30-83, snapshotValidation.ts via grep, determinismGuard.ts, app/duel/runtime.ts:200-275, app/session.ts:88-107, tests/helpers/{duelAuthority,scriptedDuel}.ts, tests/{duelCheckpoint,duelSnapshot,duelSummary,codecModeWire,commandUnion,duelOracle}.test.ts (ranges), scripts/golden/{blessGuard,storedVersion}.ts and authority/authority.ts:8-35.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `22dfe97`. 5 accepted, 0 rejected, 1 deferred.

## R1-F1 [P1]: An out-of-range round index makes validateDuelCheckpoint loop without bound (roundSeed has no cap)

Confirmed: the round module's only bound on `round` was non-negative safe integer, and `roundSeed` extends its chain one `followingSeed` at a time. `MAX_DUEL_ROUNDS = 1024` is exported from `sim/duel/snapshot.ts` (not `seeds.ts`, which already imports `snapshot.ts`, so the other placement would make a cycle). The round check now rejects `round > MAX_DUEL_ROUNDS` and `2 * round > baseTick` (checked after the base-tick check so the existing `/base tick/` case keeps its message; the 2n bound was checked against the step: each round needs a deciding step and a rematch step), and `roundSeed` throws above the cap. New cases: MAX+1, round 1 at base 0 and 1, and MAX at base 2·MAX−1.

## R1-F2 [P2]: Later SIM bumps re-bless duel-rematch.json on proofs that never run a rematch

Deferred. No further SIM bump is planned in H-2a after 39, and this bump's rematch behaviour is new (proved by the golden's own tests, not a migration). The next bump must add a rematch run to the duel oracle before it re-blesses `duel-rematch.json`; that is recorded in the project's status memory for the next bump.

## R1-F3 [P3]: The restore-equality test passes vacuously if the rematch does not start a round

Confirmed. The test now asserts the rematch result is applied, `d.round === 1`, and that the loop ran 600 iterations; Task 3 Step 1 expects 10 failing tests.

## R1-F4 [P3]: No test validates a paused checkpoint on a decided round, or a bad decidedTick on a decided snapshot

Confirmed. The re-host test pauses on round 2's decided end card, validates through bytes and restores it. Decided-snapshot cases (decidedTick −1, baseTick − 1, tick + 1, each rehashed, `/decided tick/`) are a separate block after `created.mockRestore()`, since the surrounding test asserts `createDuel` is never called; the baseTick − 1 case raises the base to 1 so it is not the −1 case again.

## R1-F5 [P3]: restoreDuelSnapshot keeps the target's per-tick events, so it is not exactly a fresh load

Confirmed against `snapshot.ts` (events are not stored). `restoreDuelSnapshot` clears `d.events` and `d.tactical.events` after `writeBack`; the Task 1 restore test asserts both are empty.

## R1-F6 [P3]: The round-start equivalence test uses a highly composite offset (T = 252)

Confirmed. 255 end-card steps give T = 257, a prime, with a comment why.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-16-helm-h2a-i-rounds-and-contracts.md

<!-- end -->

---

# Round 2 (delta, reviewing d2855da, effort medium, 78 s, 236205 in / 195060 cached / 5572 out)

Verdict: ready with P2s

## Prior findings
- R1-F1: resolved — MAX_DUEL_ROUNDS=1024 is exported from snapshot.ts (plan L411), and seeds.ts imports it from there with no new cycle (L318). roundSeed throws above the cap (L341). The validator refuses round > MAX (L360) and 2*round > base (L363). Both checks come before validateDuelCheckpoint calls roundSeed (L2657 validates the snapshot, then roundSeed runs at L2659). The test messages match the thrown strings. The good snapshot has tick 5156, so base 2047 passes the base-tick check and reaches the 2n check (L1844-1846). Task 1 tests the roundSeed throw (L297).
- R1-F3: resolved — The test now asserts the rematch was applied, d.round === 1, and ticks === 600 (L1452-1461). Step 1 now expects 10 failing tests (L1880).
- R1-F4: resolved — The re-host test pauses on round 2's decided end card, checks phase, round and outcome through bytes, and restores it with liveDuel (L1552-1557). The decided-snapshot block comes after created.mockRestore() (L1850-1876). It uses ra = 1 + the tactical field counts + 5, the same layout as at + 5 (L2332). Its three cases are: decided −1; decided 0 with base 1, which passes the base and 2n checks; and decided 7 > tick 6. Each is rehashed and expects /decided tick/. The file already imports createDuel, stepDuelTick, Outcome, TACTICAL_MODULES and hashF64, and { held: [], commands: [] } matches the input shape used at L1346.
- R1-F5: resolved — restoreDuelSnapshot clears d.events and d.tactical.events after writeBack. Both fields are mutable arrays (state.ts:34, tactical/state.ts:92). The Task 1 restore test asserts both are [].
- R1-F6: resolved — The test now takes 255 end-card steps after decided(4), which ends on tick 1; the rematch step then puts the base at 257, a prime, as the comment says.

## Verified
- Validator order (plan L2360-2364): the base-tick check runs before the 2n check, so the existing [2, 5157] and [2, -1] cases still give /base tick/. The [0, 1] case on the good snapshot (base 0) gives 'round 1 is invalid at base tick 0'.
- Every replace block the delta added in tests/duelSnapshot.test.ts matches the file exactly once: the import line (tests/duelSnapshot.test.ts:7) and 'expect(created).toHaveBeenCalledTimes(1); created.mockRestore();' (L117-118). No earlier task edits these lines.
- The 2n lower bound fits the T = 257 arithmetic: a round's base is the tick after its rematch step, and the earliest decision is tick 1.
- validateDuelCheckpoint (plan L2657-2659) validates the snapshot, which bounds the round, before roundSeed, so a forged round never reaches the seed chain.

## Not verified
- Ran nothing (the tests are read-only for this review). I did not confirm at run time that a duel with systems[1].hull = 0 decides as CrewWins with decidedTick 1, or that the paused end-card re-host hashes equal. Existing tests use the same pattern (hunterDown, plan L1510).
- R1-F2 is deferred and was not awaited, so it is not re-checked here.

---

# Round 2 response (no subject change)

Reviewed `round-2.json`. No new findings; R1-F1, R1-F3, R1-F4, R1-F5 and R1-F6 confirmed resolved. R1-F2 stays deferred.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

