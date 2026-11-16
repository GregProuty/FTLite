# Codex review exchange: engine-r2-plan

Subject: `docs/superpowers/plans/2026-11-16-engine-r2-n-ship-space.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing c7d2495, effort high, 748 s, 12984314 in / 12709471 cached / 67965 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The duel continuation proof's 'missile in flight at the split' precondition becomes always true after Task 3
`tests/duelCheckpoint.test.ts` asserts `at.tactical.missiles.some((m) => m !== null)` as the precondition that the checkpoint continuation proof crosses an in-flight missile. After Task 3, `missiles` is a pool of `Missile` objects that are never null: a free entry is `emptyMissile()`. The assertion therefore passes whatever the state. The Task 2 codemod's missile regexes only rewrite `.missiles[<digit>]`, so they do not touch this line. Task 3 does not list or edit this file. · tests/duelCheckpoint.test.ts:L39. Plan L2425 (`missiles: Slots<Missile>`). Plan L2480 (every entry is `emptyMissile()`). Plan L2461 (`emptyMissile` is an object with `active: false`). Plan L1534-1536 (the codemod regexes need a digit index). Task 3's files list, plan L1682, and its commit, plan L3591, omit tests/duelCheckpoint.test.ts. Contrast the replaced duelModules test at plan L1888, which correctly uses `m.active`. · A test that passes for the wrong reason, on the riskiest R-2 path: checkpointing and restoring an in-flight pool entry with its owner. Today the split still has a missile because the rules are unchanged. The guard is still lost: a later change to SPLIT, the seed or the pool would silently drop the in-flight case from the continuation proof. · In Task 3 Step 1, add an exact replacement in tests/duelCheckpoint.test.ts: `expect(at.tactical.missiles.some((m) => m !== null), 'a missile in flight at the split').toBe(true);` becomes `expect(at.tactical.missiles.some((m) => m.active), 'a missile in flight at the split').toBe(true);`. Add the file to Task 3's Modify list and to its `git add` line.

### [P2] R1-F2 No targeted test pins owner-order missile resolution when pool entries are out of owner order
Task 3 resolves missiles in owner order through `missileOf`, which is correct. But the only proof that order is preserved is the oracle's per-tick events digest. That catches a reordering only when two missiles end on the same tick, through expiry, a missile-missile meeting, or both landing. The plan never shows that the 20 runs contain such a tick with the entries swapped. The new pool tests check entry assignment, not resolution order. · Plan L2963-2985 (resolveMissiles by owner, events pushed in that order). Plan L1785-1802 (the pool test covers placement and freeing only). Plan L54 (Decision 5 cites 7,331 ticks with the enemy's missile in entry 0, not simultaneous endings). Plan L452 (order is observable only through `JSON.stringify([results, d.tactical.events, d.events])`). Old order: missiles.ts:L63-80. · Per the review brief, a reordering that the 20 runs happen not to exercise must still be caught. A later refactor that iterates `state.missiles` in entry order instead of using `missileOf` per slot would pass the oracle unless such a tick exists. · Add a case to tests/tacticalSlots.test.ts. Call `launchMissile(st, 1)` then `launchMissile(st, 0)`, so the enemy is in entry 0 and the crew in entry 1. Place both well clear of every body with `age = MISSILE_LIFE_TICKS - 1`, call `resolveMissiles(st)`, and expect the `missileEnd` events' `ship` values to be `[0, 1]`. Add a second case that places the two missiles touching: expect causes `['missile', 'missile']` in the order ship 0, ship 1, and both entries freed.

### [P2] R1-F3 The duel snapshot validator does not pin the duel's slot identity (active, cls, target)
`validateTacticalValues` accepts any slot layout that is internally consistent. Slot 1 can be marked inactive and zeroed. `systems.i.cls` can swap classes within 0..1, and `systems.i.target` can point at the slot itself. `validateDuelSnapshot` adds no duel-specific check, so a forged or corrupted checkpoint restores into a state the duel never creates. With slot 1 inactive, `others` is empty, so `enemyDown` is false and the duel cannot end by the hunter's death. With slot 1 given the Cutter class, `hunterSlot` returns -1 and the enemy is never flown. · Plan L2714-2738 (the validator: inactive slots need only zeros) and L2692-2697 (`cls: within(0, SHIP_CLASSES.length - 1)`, `target: within(0, slots - 1)`). Plan L3134-3135 (`others` is filtered by active; `enemyDown = others.length > 0 && …`). Plan L3112 (hunterSlot by AI profile). Plan L3484 (snapshot.ts only checks the returned length). snapshot.ts:L60-72. · R-1b's validator refuses values the duel cannot produce, such as an empty missile slot holding values or out-of-range headingAcc. R-2 adds identity fields that are constants for the duel but leaves them loosely bounded, so the 'slot invariants' brief item is only partly carried over. · In Task 3 Step 4, add a check to `validateDuelSnapshot` after `validateTacticalValues`, with offsets taken from `TACTICAL_MODULES` field names. Require `ships.length === 2`, `ships.0.active === ships.1.active === 1`, `systems.i.cls === DUEL_CLASSES[i]` and `systems.i.target === 1 - i`. Add the matching cases to the duelSnapshot test list, for example `['systems.1.cls', 0, 0, /duel slot/]`.

### [P2] R1-F4 Spec §5's 'present: [b, b]' and two-ship telemetry stay pairs without a stated deviation
Spec §5 lists `present: [b, b]` and the two-ship render models among the pair assumptions that become arrays. The plan leaves duel presence a fixed pair. Telemetry also stays two-ship: `[crew, enemy] = tac.ships`, `for (let i = 0; i < 2; i++)`, `laserOn = [false, false]`, and `DuelTelemetry.ships` and `terminal` as pairs. No Decision says so or gives the reason. · Spec L105-108. Plan Decisions L46-63 never mention presence or telemetry pairs. sim/duel/telemetry.ts:L93, L96, L107, L111, L153 are untouched apart from the replacements at plan L883-949. sim/duel/modules.ts:L19 (presence is per player). · The plan must state where it deviates from the spec. Presence is per player, not per ship, so keeping it a pair is probably right, but a later reader cannot tell a deliberate scope cut from an omission. · Add a Decision, for example number 15: duel presence is per player (two players), not per ship, so it stays `[b, b]`. `DuelTelemetry` and its `i < 2` loops stay a crew-and-enemy record of the duel until R-5 gives encounters N ships. List the remaining sites.

### [P3] R1-F5 Body-only comparisons in tacticalSoloFlight silently stop covering the systems record
`plain(st.ships[i])` compared every field of a ship before R-2. After Task 3 it compares only the body. 'ship 1 never moves', 'flies straight through ship 1' and 'matches stepFlight for ship 0' no longer cover hull, rooms or shields. The Task 3 edits to this file change only the `hitStatics` call. · tests/tacticalSoloFlight.test.ts:L7, L16, L28, L37; plan L2195-2209. · A small loss of coverage. For example, stepSoloFlight could charge ship 0's hull differently from stepFlight and L37 would no longer notice. · In Task 3, extend these assertions to compare the systems record too: `expect(st.systems[1]).toEqual(beforeSystems)` and `expect(a.systems[0]).toEqual(b.systems[0])`.

### [P3] R1-F6 The oracle never checks the values of the declared-added fields
`ships.length`, `ships.<i>.active`, `systems.<i>.cls` and `systems.<i>.target` are declared added. `aliasPlan` only checks that they exist, and `recordRun` keeps only the baseline's names, so their values are never compared at any tick. Most mistakes would show up in other fields, but not all: a run whose target or cls flips with no effect within the cap would go unnoticed. · Plan L3567 (`added`). Plan L404-407 (new fields only need to be declared). Plan L435 (only the target schema's names are kept). · The proof holds the moved fields to the old values, but nothing pins the new constants to the duel's values. · In tests/tacticalSlots.test.ts, or in recordRun when `schema.migration` is set, assert every tick that `ships.length === 2`, `active` is `[1, 1]`, `cls` is `[0, 1]` and `target` is `[1, 0]` across a full scripted run.

### [P3] R1-F7 The codemod's import sort depends on the locale
The codemod sorts merged import names with `localeCompare` and no locale, so the result depends on Node's default ICU locale. Later exact replacements depend on that order, for example `import { missileOf, Outcome }` at plan L1976. · Plan L1542 (`a.replace(/^type /, '').localeCompare(b.replace(/^type /, ''))`). Plan L1976 (Task 3's old text relies on that order). · A fresh executor whose locale orders mixed case differently would get an import line that Task 3's exact old text does not match. · Use `localeCompare(…, 'en')` in the codemod. Otherwise state that the expected output assumes the en locale.

## Verified
- The bless-golden.ts edits match the current file: the old texts at plan L588-592, L609-610 and L624-626 match scripts/bless-golden.ts:L4-8, L14-15 and L33-35 exactly. blessRefusal's only callers are scripts/bless-golden.ts:L34 and tests/blessGuard.test.ts, and the plan replaces both, so typecheck enforces the required `duel` option.
- The bless guard (plan L563-573) runs the sector proof, then the duel proof only if the sector one passes, and refuses on either failure. A same-version bless runs neither (R-0's path). A mixed set such as [38, 37, 38] counts as a bump. A corrupt duel-1.json throws rather than counting as absent (storedVersion.ts:L22-25). The only bless without the oracle is a missing duel-1.json while the other artifacts are current, which is R-0's 'absent is not a bump' rule.
- judgeDuelOracle (plan L487-490) refuses with no baseline, with a baseline from another root, and on a version that is not the baseline's plus 1. The baseline folder is keyed by repo root (versionOnly.ts:L27-29). A stale 37 baseline refuses any later bump to 39 or beyond. The run-id set is checked (L493), and verifyDuelOracle re-runs every run with nothing from an earlier run trusted.
- The version is excluded correctly: `all.subarray(1)` drops the duel hash's leading SIM_VERSION, VERSION_FIELDS drops `interior.$simVersion` on both sides, and both are asserted equal to SIM_VERSION each tick (plan L443). canonicalFields offsets are contiguous (canonicalFields.ts:L36-42), so duelSchema's counts line up with the interior flatten.
- The alias table is complete. MOVED_TO_SYSTEMS (plan L3549) names exactly the 16 systems fields: hull, rooms and the 14 non-body SHIP_TAIL entries (hash.ts:L14-17). The body fields keep identity names (plan L2539), and graceUntil keeps asteroids + 2 values. The derived rule rebuilds old `missiles.<i>` from the pool entry with active 1 and owner i, and consumes every pool field. Nothing is dropped.
- The rules are unchanged for the two slots. Contacts run ship 0's statics, the pair, then ship 1's statics (contacts.ts:L51-55 vs plan L2889-2896). shipBody(map,0,1) and shipBody(map,1,0) both equal otherShipBody (asteroids + 1). The ship-ship radius R+R equals 2R exactly. Missile resolution and expiry run in owner order, with the same touch radii and the same end-event order (missiles.ts:L62-80 vs plan L2963-2985). flyShip's multiplication order is unchanged. The hunter is called once, after the crew's input, so its rng draw is unchanged. fireLaser and the scripted pair use target, which is 1 − i in the duel.
- The hunter split covers every read: body fields (x, vx, heading) stay on `state.ships[i]` and systems fields (rooms, fireHeld, magazine, the crew's rooms) move to `state.systems` (hunter.ts:L38-94 vs plan L3215-3318).
- Every non-test reader of a moved field or a missile slot under src/renderer/src is covered by Task 2 or Task 3, checked by grep: controls, runtime (L301, L314, L354, L204), interiorModel, readoutModel (L44, L60, L79), fxModel, tacticalModel (L116, L260, L289), weaponsModel (L71, L82), scripted (L91, L202, L219-230), step L49, and telemetry (L65, L150, L154). feelModel, flightMode and tacticalLayer read only body or draw-model fields.
- The snapshot validator keeps headingAcc in (−1, 1), graceUntil within int32, and the missile heading, headingAcc and age checks (plan L2683-2737). It adds the slot count, inactive-slot zeros, a valid owner and a single missile per owner. The interior identity checks (snapshot.ts:L77-84) are untouched, and the tactical length check gets stronger (plan L3484). duelCheckpoint's `values[1 + 4]` is still the outcome in the new layout.
- tests/duelMode.test.ts:L104 finds its offset from `spaceModule.fields`, so it survives the new layout without an edit.
- Codemod inputs: tests/ and scripts/ are in tsconfig.web.json:L9. Every `ships[i]` binding in the duel and tactical tests is a `const` that is never reassigned, so inlining `<base>.systems[<i>]` cannot point at a different object. The only `Object.assign` that sets a systems field is duel.test.ts:L111, which Step 5 edits by hand. The hand edits' old texts match duelCheckpoint.test.ts:L9 and L103-105.
- All 26 tuning constants that defs.ts and tacticalSlots.test.ts import exist in sim/tactical/tuning.ts. module.ts's `scalar`, `flag`, `vector`, `flattenModule`, `unflattenModule` and `moduleLength` match the shapes the new hash.ts assumes.
- Task order has no forward dependencies: Task 1 records both baselines, Task 2 checks them field for field at 37, Task 3 adds MIGRATIONS[37] and checks through it, and Task 4 blesses through the guard.

## Not verified
- No commands were run: no tests, tsx scripts or typecheck. The claimed counts are unchecked: 304 named fields, 205,178 ticks, 38, 305 and 447 test totals, and 3,160 in the full suite. So are the codemod's printed output and unresolved list, the duel golden's final hash, and the gate telemetry lines.
- Whether the 20 oracle runs contain a tick on which two missiles end together with the pool entries in swapped order. That depends on running the duels. This is why the owner-order test is suggested.
- I believe TypeScript 5.8 accepts `m !== null` on a non-nullable `Missile` without error TS2367, since comparisons with null are always permitted, so the duelCheckpoint assertion compiles and is vacuous rather than failing. I did not compile it.
- The cross-engine determinism check (Electron and Firefox) and the H-1 local duel's visible behaviour; I traced only the code paths.
- I read beyond the manifest to check specific findings: tests/duelCheckpoint, duelWeaponsView, tacticalDeterminism, tacticalSoloFlight and duelMode test files, tests/helpers/scriptedDuel.ts, sim/duel/telemetry.ts, sim/duel/hash.ts, sim/module.ts, sim/canonicalFields.ts, sim/tactical/geometry.ts and predict.ts, render/tactical/feelModel.ts, app/duel/flightMode.ts, scripts/golden/storedVersion.ts and tsconfig.web.json.
- I did not read the run directory's ledger.md or earlier round outputs. No prior IDs were given, so `prior` is empty.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan and the code. 7 accepted (1 P1, 3 P2, 3 P3), 0 rejected, 0 deferred.

## R1-F1 [P1]: The continuation proof's precondition becomes always true after Task 3

Confirmed. The pool never holds null, so `missiles.some((m) => m !== null)` always passes. Task 3 now replaces it with `m.active`, and `tests/duelCheckpoint.test.ts` is in Task 3's Modify list and `git add` line. A grep of `src/` and `tests/` found no other null or `?.` checks on the pool that the codemod misses.

## R1-F2 [P2]: No test pins owner-order resolution when pool entries are out of order

Confirmed. Two new `tests/tacticalSlots.test.ts` cases launch ship 1 first, so the entries are out of owner order:
- Two missiles expire on the same tick; the events must be `[[0,'expired'],[1,'expired']]`.
- Two touching missiles must end `[[0,'missile'],[1,'missile']]`, with both entries freed.

Bite check: with `resolveMissiles` temporarily switched to entry order, both tests fail.

## R1-F3 [P2]: The duel snapshot validator does not pin slot identity

Confirmed. `validateDuelSnapshot` now checks, by field name, that `ships.length` is 2, both slots are active, `cls` equals `DUEL_CLASSES[i]` and `target` equals `1 − i`. Five rehashed cases are rejected with `duel slot identity`, including slot 1 inactive and zeroed with the pool emptied. The generic validator accepts that state, so only the new check rejects it. This is Decision 16.

## R1-F4 [P2]: Presence and two-ship telemetry stay pairs without a stated deviation

Accepted. The new Decision 15 keeps presence per player (`[b, b]`) and keeps `DuelTelemetry` as a crew-and-enemy record until R-5 gives encounters N ships. It lists the sites (`telemetry.ts` L93/96/107/111/153, `summary.ts`, the checkpoint's `two()` schemas, `fxModel` L74, `weaponsModel` L63) and notes the deviation from spec §5 L105-108.

## R1-F5 [P3]: Body-only comparisons in tacticalSoloFlight

Fixed: the three comparisons now also compare the systems record.

## R1-F6 [P3]: The oracle never checks the declared-added fields' values

Fixed: a new test asserts that `ships.length`, `active`, `cls` and `target` hold `2,1,1,0,1,1,0` at every one of the duel golden's 15,772 ticks.

## R1-F7 [P3]: The codemod's import sort depends on the locale

Fixed: the sort uses `localeCompare(…, 'en')`. The output is unchanged, so the later exact texts still match.

## Also changed

- Re-verified by re-extracting the plan into a fresh worktree at master c7d2495 and running every step as written:
  - the oracle (20 runs, 205,178 ticks, 304 fields) is identical per tick through the 37 → 38 alias table, and the sector trace differs only in its version;
  - all 62 gate telemetry lines are identical;
  - the full suite passes 3,163 tests, with only the known worktree flake failing;
  - determinism passes on Node, Electron and Firefox;
  - the blessed duel golden is unchanged from the prototype (`2ac35cfa`).

## Files changed

- docs/superpowers/plans/2026-11-16-engine-r2-n-ship-space.md

<!-- end -->

---

