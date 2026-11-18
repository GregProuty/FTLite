# Codex review exchange: valkyrn-i-sim-plan

Subject: `docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 77064aa0, effort high, 1003 s, 25081547 in / 24714248 cached / 88157 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 A same-version bless rewrites tests/golden/basic.json (its embedded content digest moves), so the git-status expectations in Task 5 Step 10 and Task 8 Step 2 cannot hold
Task 5 Step 10 expects `git status --short tests/golden tests/fixtures` to list exactly duel-1.json and duel-rematch.json, and it commits only those two. Task 8 Step 2 expects no output from the same command after another bless, and no output from `git diff --stat <t1> -- tests/golden/basic.json`. But `npm run bless` always restages basic.json from `scriptedSemanticReplay(..., contentDigest)`, and basic.json stores that digest in its init and headers. The content digest hashes every .ts and .json file under src/renderer/src/sim and src/renderer/src/authority, plus net/codec.ts and net/contracts.ts. Tasks 2 to 7 edit many of those files, so every bless after Task 1 writes a basic.json whose digest strings differ. Its canonical hashes do not change. · plan L1951-1952 ("exactly M duel-1.json and M duel-rematch.json (the sector golden and the determinism fixture do not move)"), L1965 (git add omits basic.json), L2504-2512 ("no output" twice). scripts/bless-golden.ts:L45-48 (basic.json staged with the current contentDigest); build/contentDigest.ts:L12-16 (walks src/renderer/src/sim, authority, net/codec.ts, net/contracts.ts); tests/golden/basic.json embeds "contentDigest":"fdebd3d7…" in init, initial.header and checkpoint; tests/golden.test.ts:L13-17 ("source changes alter the digest, never canonical values or expected hashes"). determinism-v2.json is safe: scripts/determinism/bless.ts:L41 restages only `fixture.expected`. · An executor told 'exactly' and 'no output' will hit a mismatch at Task 5 Step 10 and at Task 8 Step 2, and then has to stop or improvise. If they carry on, basic.json is left modified and uncommitted through Tasks 6 to 8. · Task 5 Step 10: expect `M tests/golden/basic.json` as well. Prove it moved only in the digest with `npx tsx scripts/golden/canonical-trace.ts golden` (expect `0 outside version, digest and hashes`), and add basic.json to the Task 5 commit. Task 8 Step 2: expect basic.json to move again (digest only, proved the same way) and commit it. Replace the `git diff --stat <t1> -- tests/golden/basic.json` check with `canonical-trace.ts golden`, or with a diff that ignores the contentDigest strings. Keep the determinism-v2.json no-diff check.

### [P1] R1-F2 Part ii replaces the whole of fleet.ts and drops Part i's HULL_IDS, which schema.ts imports
Part i appends `export const HULL_IDS = ['hound','scout','valkyrn'] as const` to sim/ship/fleet.ts. schema.ts then imports it for `hull: z.enum(HULL_IDS).optional()` (Decision 6). Part ii Task 3 Step 5 says '`src/renderer/src/sim/ship/fleet.ts` becomes:' and gives a full file with no HULL_IDS. After Part ii, `import { HULL_IDS } from './fleet'` fails tsc -b, and at runtime z.enum(undefined) throws when schema.ts loads, which breaks every test that parses a ship. · plan L870-889 (append HULL_IDS; schema imports it), L1-L50 Decision 6 (plan L50: 'HULL_IDS lives in sim/ship/fleet.ts'); docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md:L667-699 (the fleet.ts replacement, no HULL_IDS); current .worktrees/sci-2/src/renderer/src/sim/ship/fleet.ts:L1-7 (no schema import, so no cycle today). · A sibling part removes a name this part produces. That is a cross-part name mismatch, and the branch stops compiling in Part ii. · Add `export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;` (with its doc comment) to Part ii's fleet.ts block. Or change Part ii's instruction to edit the file instead of replacing it. Also list HULL_IDS in Part ii's Task 1 pre-flight greps. In Part i, Task 8 Step 5's report already names HULL_IDS for Part ii; add that fleet.ts must keep it.

### [P2] R1-F3 The `added` oracle mode never checks the declared-added fields, so it cannot show that the Hound's gun state stays zero
In mode `added`, recordRun builds every per-tick digest through aliasPlan in the baseline's schema. Only old fields are mixed in. Fields matching ADDITIONS[53] (the round pool and every systems.i.gun* field) are accepted but never read. Ticks, outcomes, results, events and telemetry are proved unchanged, which is sound for the fixed decision. But the plan's claim of 'every run identical at every tick (values, …)' does not cover the new fields. A bug that changes gun fields on the Cutter or Hunter would only move hashes, and the same-version bless in Task 5 Step 10 would accept it. · plan L45 (Decision 1: 'every run identical at every tick (values, results, events, telemetry)'), L1855-1861 (ADDITIONS[53]); scripts/golden/duelOracle.ts:L179-183 (added names are skipped, not digested), L243-258 (values = plan.build(...) in the baseline's order only). · The proof that 'the Hound only moves by hashes' depends on the new hashed fields holding their initial values in every Hound run, and nothing checks that. · In `added` mode, also require every field matching `additions[version].added` to hold its tick-0 value at every recorded tick. For 53 that value is 0 for every gun field and every round entry. This could be an extra chain per added field, or a check in recordRun when schema.migration comes from ADDITIONS. Add a judge test that fails when an added field changes.

### [P3] R1-F4 Decision 16 keeps DuelInit.playerCount at 2..4, where spec §4.4 asks for 1..4 in single player; the deviation is not justified
Spec §4.4 widens 'the single player DuelInit.playerCount 1..4'. The plan keeps duelInitSchema's 2|3|4 union and frames DuelInit as online-only. It never says why that is acceptable: no single-player path builds a DuelInit, because the local runtime calls createDuel directly. · spec L110-112; plan L60 (Decision 16); .worktrees/sci-2/src/renderer/src/authority/duelCheckpoint.ts:L22,L41 (playerCount 2|3|4); no DuelInit use under src/renderer/src/app; Part ii plan L1042-1045 (runtime calls createDuel directly). · Spec conformance: a reviewer or executor may later 'fix' the gap and widen the online init. · Add one sentence to Decision 16: the spec's single-player DuelInit widening is moot because no local path builds a DuelInit (app/duel/runtime.ts calls createDuel). The online init stays 2..4.

## Verified
- Pre-flight greps (plan L106-118) match the sci-2 tree: SIM_VERSION = 52 (sim/tuning.ts:7), the DUEL_CREW_MIN/MAX and DuelCrew lines and the createDuel signature (sim/duel/state.ts:13-14,75), `present: boolean[];` (:42), `playerCount: d.interior.playerCount,` (snapshot.ts:113), `const crewList = ` (duelCheckpoint.ts:38), and no DUEL_PLAYERS.
- Every `slots.laser` read in sci-2 src is covered by Task 2 or Decision 11: consoleModel.ts:90, contactModel.ts:180, situationModel.ts:41, hitModel.ts:29, telemetry.ts:105, hash.ts:195-196 (the validator maxima, replaced by a null-filtering `most`), hunter.ts:71, state.ts:155 and weapons.ts:35,70,92,100,114,150. Test reads: contactModel.test.ts:74, duelHitFeedback.test.ts:24, weaponsUpdate.test.ts:45,46,100. scripts/ has none.
- The quoted replacement texts exist as given: weapons.ts applyWeaponsInput lines 122-145, the stepBurst line 114 and the tickWeapons line 152; step.ts lines 191, 196, 229 and 253-260; snapshot.ts lines 130-132, 151-153 and 211-212; codec.ts:132 and :151; checkpoint.ts:40; duelCheckpoint.ts:72; replay.ts:17; core.ts:329 and :435; hunter.ts:67 and :90; science.ts:37-39; derived.ts:83 (the console-group code line; plan says L79, matched by text).
- Those are the only four zod held schemas (no other `interactHeld: z.` in src), and every ShipInput literal with `scanner: true` is in weapons.ts, hunter.ts or step.ts.
- Gun numbers in Task 5's tests check out by hand: HEADING_X[64]=1 and HEADING_Y[64]=0 exactly (headings.ts), so the muzzles are (-579,-288)/(-579,-312) and vx=730, vy=0. The lock comes on round 38 at tick 222 (50+26·37 ≥ 1000), with 125 locked ticks and the next round at tick 347. Level-1 halving gives 40, then 960; level 2 cools to 80.
- Room geometry in Task 6 checks out: hx(0)=0 and hy(0)=-1. The ±r/3 boundary resolves exactly to 20/3, giving Shields. TURN_STEPS_PER_TICK≈1.78 moves the Hunter's heading 0 to 1 in one flySlot. REPAIR_UNITS 960 / REPAIR_RATE_SOLO 4 = 240 ticks. HUNTER_HULL is 70, the planet r is 70 at the origin, and queryGrid takes a half-size square.
- stepDuel's order (duel.ts:29-43): applyWeaponsInput, then fly, missiles, contacts, resolveMissiles, tickWeapons, hostilityStep, outcome. So tickGun before the early return, stepRounds after resolveMissiles, the hostile cause gun at hostileAt 1, and a round kill deciding the tick are all consistent.
- aimTurn's formula gives the test's values (aimTurn(0,128)=-1, (250,4)=+1, (4,250)=-1). With 2.37 steps a tick and a band of three indices the sign never flips. headingTurn's AUTO_FACE_SIN band (±1.78 indices) keeps the unattended test within 2.
- The oracle: Migration shape, judgeDuelOracle's signature and messages (duelOracle.ts:336-357), verifyDuelUnchanged, readBaseline and recordRun all exist as the plan edits them. Field names in duelSchema are `<module>.<field>`, so `space.rounds.k.*` and `ship.systems.i.gun*` match the ADDITIONS[53] regexes. The duelOracle.test.ts helpers none, trace, rerun and okRun sit in describe('the judge') before the new test. A same-version `npm run bless` is allowed (bless-golden.ts header). The `added` mode does still prove tick counts, outcomes, results, events and telemetry unchanged per tick (runDifferences).
- Hash, snapshot and validator coverage of the new state: SYSTEMS_TAIL plus the gunRoomWear vector give 37 values per slot; the round pool adds 64 × 7 after the missiles; FLAGS gains gunLocked; clone gives fresh gunRoomWear and rounds; the validator has a rounds branch and gun bounds from `most`. tacticalDeterminism's length formula and key lists match, and duelModules' tacticalNames, allRoundsFlying (needed in the hash test) and the changedFirst regex fit. The clone test passes without the helper, since free entries flip active first.
- aim and gunHeld are carried by the codec, the sector and duel checkpoint schemas, the replay schema, core expiry and pause. aim reaches the hash and snapshot only through holdHeading, which the helm module already covers. crewClass: Decision 4 uses the already hashed systems.0.cls, validated against the header and listed in DUEL_NOT_SNAPSHOTTED. The DuelState-coverage test (duelModules.test.ts:93) accepts it.
- Test helpers and exports exist: makeHostile, holding, liveDuel (core.captureCheckpoint, core.replay), duelInit, resolveCutter, createSeatedDuel, standAtStation, parseEncounterReplay(rules, value, digest, resolve), cloneTactical, flySlot, DEFAULT_FLIGHT, hunterThink(state, i), DT re-exported from tactical/tuning, Health/Seated/Position, and DuelCommand re-exported from sim/duel/commands. sitDown at a console group seats the pilot at every member and sets Seated.station to the first member (nav) (stations.ts:31-39).
- Test helper with id 'hound' (item 9): DUEL_REPAIR_POINTS is the only lookup keyed by layout id. Snapshot validation also checks layoutHash, and the helper's hash differs, so a VALKYRN_TEST snapshot cannot load as the Hound. The real Valkyrn's repair points are Part ii's job. The helper hides no missing Part i lookup.
- Task order: every test imports only names produced in its own task or an earlier one (IDLE_INPUT has no gunHeld before Task 4; ShipSystems.gunRoomWear arrives in Task 5 before Task 6's repair and strip edits).
- Cross-part names: Part ii's pre-flight names (classIndexById, VALKYRN_LASER_CLASS, GUN_SPEED = 700, tickGun, crewClass, LOCAL_CREW_MIN, helmHoldsUnattended, gunHeld, SIM_VERSION = 53) and Part iii's (aimTurn exported, GunDef.speed, createTacticalState(seed, slots, crewClass), gun bounds derived from GunDef) are all produced by Part i. Part ii's Decision 6 condition (literals in schema.ts) does not trigger, because schema.ts holds no id literal.
- Determinism: gun.ts and step.ts use only + − × ÷, %, Math.sqrt, abs, max, min and sign. A missile never strips shields (missiles.ts:86-97), so the laser strip is the only one besides the gun's and no other gunWear reset is needed.

## Not verified
- Whether seed 5's asteroids leave the straight line from (300,0) to the planet clear, so that the planet test's `ticks === 20` (plan L2065) holds; I did not generate the map.
- Whether hunterThink(st, 1) alone, repeated 700 times with the crew at (-2600,0), enters Repair mode and repairs the Engines room (plan L2143-2146); I did not trace updateRepair's mode and timer logic.
- Whether 60 ticks of the Hound and Valkyrn empty-Helm tests (plan L1204-1231) stay free of hits, fires or other interior effects that would make d.tactical diverge from the bare stepDuel reference; this depends on the spawn distance for seed 5.
- Whether the bigger duel snapshot (64×7 round values plus 22 systems values) still fits MAX_MESSAGE_BYTES (65,536) for an online Hound publication at crew 4, and MAX_HOST_BYTES for checkpoints; I did not measure current sizes.
- Whether blessGuard's `blessRefusal` really returns no refusal when all four stored artifacts are at the current version; I relied on bless-golden.ts's header comment.
- The `.claude-round-1.jsonl` and ledger in the run directory were not read; prior is empty for round 1.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `77064aa0`. 4 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: A same-version bless rewrites tests/golden/basic.json (its embedded content digest moves), so the git-status expectations in Task 5 Step 10 and Task 8 Step 2 cannot hold

Confirmed. `.worktrees/sci-2/scripts/bless-golden.ts:45-48` always restages basic.json from `scriptedSemanticReplay(..., contentDigest)`, `build/contentDigest.ts:12-16` walks `src/renderer/src/sim` and `authority`, and basic.json embeds `contentDigest`. `canonical-trace.ts golden` (`scripts/golden/canonical-trace.ts:30-44`) compares against the basic.json copy that `baseline` records (Task 2 Step 1) and allows only version, digest and hash leaves. Changed: Task 5 Files and Step 10 now expect `M tests/golden/basic.json`, add a `canonical-trace.ts golden` check (`0 outside version, digest and hashes`), and add basic.json to the Task 5 commit. Task 8 Files, Interfaces, the Step 2 heading and Step 2 now expect basic.json alone to move, prove it with `canonical-trace.ts golden`, restrict the `<t1>` diff-stat to determinism-v2.json, and commit the digest-only re-bless. Step 5's report names that commit.

## R1-F2 [P1]: Part ii replaces the whole of fleet.ts and drops Part i's HULL_IDS, which schema.ts imports

Confirmed. Part ii's plan L667-699 replaces `fleet.ts` wholesale with no `HULL_IDS`, and this plan's Task 3 Step 4 has `schema.ts` import it for `z.enum(HULL_IDS)`. The real fix belongs in Part ii's fleet.ts block, which this run may not edit. It is reported to the coordinator as a cross-plan item. Changed in this plan: Task 3's Interfaces line and Step 4 state that `schema.ts` imports `HULL_IDS` at load and that any later whole-file rewrite of `fleet.ts` must keep the export. Task 8 Step 5's handover tells Part ii that its Task 3 Step 5 replacement must keep it.

## R1-F3 [P2]: The `added` oracle mode never checks the declared-added fields, so it cannot show that the Hound's gun state stays zero

Confirmed. `.worktrees/sci-2/scripts/golden/duelOracle.ts:179-183` only skips added names, and `recordRun` (L243-258) digests `plan.build` in the baseline's schema, so the new fields are never read. Changed in Task 5 Step 7: `Migration` gains an optional `frozen`. `ADDITIONS[53]` sets it. `recordRun` collects the offsets of every current field that matches `added` (the same offset walk as `aliasPlan`, L143-145) and flags any that differs from its first recorded value. Its returned `problems` carry one line per moved field, so `judgeDuelOracle` fails the run. A new test in `describe('the per-tick record')` freezes `space.ships.0.x`, which moves on tick 265 inside SHORT. With `frozen` it fails, and with `frozen: false` it passes. Decision 1 and the ADDITIONS doc comment describe the check, and the Task 5 Files line lists it.

## R1-F4 [P3]: Decision 16 keeps DuelInit.playerCount at 2..4, where spec §4.4 asks for 1..4 in single player; the deviation is not justified

Confirmed. `DuelInit` is used only in `.worktrees/sci-2/src/renderer/src/authority/duelCheckpoint.ts` and `duelRules.ts`; nothing under `src/renderer/src/app` builds one. Decision 16 now says the spec's single-player widening is moot, because the local runtime calls `createDuel` directly. The one `DuelInit` schema stays 2..4.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-valkyrn-i-sim.md

<!-- end -->

---

# Round 2 (delta, reviewing 6ea1a665, effort medium, 73 s, 312592 in / 266980 cached / 6077 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — Task 5 Files (plan L1413), Step 10 (L2003-2007) and the commit (L2020) now expect, prove and stage basic.json. Task 8 Files (L2540), Step 2 (L2559-2576) expect basic.json to move, prove it with `canonical-trace.ts golden` and commit it. The <t1> diff-stat check covers determinism-v2.json only. `canonical-trace.ts golden` (scripts/golden/canonical-trace.ts:L30-44) compares against the basicCopy that `baseline` writes (L20), which Task 2 Step 1 records (plan L206). Its filter (L42) allows contentDigest leaves, and its output matches the expected line `<k> leaves differ, 0 outside version, digest and hashes` (L43).
- R1-F2: resolved — Part i now states the constraint at Interfaces (L635) and Step 4 (L878), and hands it over in Task 8 Step 5 (L2600). Part ii's fleet.ts block now ends with `export const HULL_IDS = ['hound', 'scout', 'valkyrn'] as const;` (valkyrn-ii plan L669, L702), so the cross-part name holds.
- R1-F3: resolved — Migration.frozen (L1868-1874) and ADDITIONS[53].frozen (L1863) are in place. The recordRun additions compile against the real code: the insertion anchors exist verbatim at duelOracle.ts:L243, L252 and L270, and `now.names`/`now.counts` are the full flattened schema whose offsets match `all.subarray(1)` (L246, L250). `added` is a const narrowed before the forEach callback, and `firstValues ??=` narrows within record. The problems flow into the returned `problems`, which judgeDuelOracle fails on. The new test reuses SHORT and `none` (tests/duelOracle.test.ts:L10-13). It freezes space.ships.0.x, which L85 shows first moves at tick 265, inside the 300-tick cap, and it checks the frozen:false control.
- R1-F4: resolved — Decision 16 (plan L60) now explains that the spec's single-player DuelInit widening is moot: the local runtime calls createDuel, and DuelInit is used only on the online checkpoint path. So the schema stays 2..4.

## Verified
- The recordRun insertion anchors quoted in plan L1876, L1885 and L1895 match .worktrees/sci-2/scripts/golden/duelOracle.ts:L243, L252 and L270 verbatim.
- Frozen offsets are computed with the same offset walk as aliasPlan (duelOracle.ts:L144-145), over now.names, which includes the version fields. That is consistent with all.subarray(1) and flatCount (L246, L250).
- The new frozen test's schema (was.names/was.counts, with version fields dropped by `kept`, L244) is the same shape the existing per-tick test passes (tests/duelOracle.test.ts:L77). The swap test (L80) confirms that `none.rename` returning undefined maps a field to itself.
- canonical-trace.ts golden mode output string and leaf filter (scripts/golden/canonical-trace.ts:L42-43) match the plan's expected lines at L2007 and L2563.
- Task 8 Step 2's git-status expectation (only basic.json) holds: Tasks 6 and 7 edit sim sources, and the duel goldens and determinism-v2 are not rewritten in canonical content.
- Part ii plan L669/L702 now keeps HULL_IDS in its fleet.ts replacement.

## Not verified
- Whether the Part ii plan edit that adds HULL_IDS is committed: git status shows the Part ii plan as modified in the working tree. I read the working-tree text.
- Whether the oracle runs' gun and round fields stay constant through Task 6's stepRounds and hostility changes: Task 6 is outside the touched regions. Task 8 Step 1's `added` run (which now checks frozen) would catch a change during execution.

---

# Round 2 response (no subject change)

Reviewed `round-2.json` against the subject at the round 1 commit. 0 accepted / 0 rejected / 0 deferred; the reviewer confirmed R1-F1, R1-F2, R1-F3 and R1-F4 resolved. No new findings.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

