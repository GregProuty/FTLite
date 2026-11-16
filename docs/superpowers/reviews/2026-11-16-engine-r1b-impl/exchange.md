# Codex review exchange: engine-r1b-impl

Subject: `src/network/modes/duel.ts src/network/modes/duelStream.ts src/network/modes/sectorStream.ts src/network/modes/streamBinding.ts src/renderer/src/app/session.ts src/renderer/src/authority/duelCheckpoint.ts src/renderer/src/authority/duelRules.ts src/renderer/src/authority/replay.ts src/renderer/src/net/codec.ts src/renderer/src/net/contracts.ts src/renderer/src/sim/duel/hash.ts src/renderer/src/sim/duel/modules.ts src/renderer/src/sim/duel/snapshot.ts src/renderer/src/sim/duel/summary.ts src/renderer/src/sim/module.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/state.ts src/utility/authorityHost.ts src/utility/authorityModes.ts tests/codecModeWire.test.ts tests/duelCheckpoint.test.ts tests/duelMode.test.ts tests/duelModules.test.ts tests/duelSnapshot.test.ts tests/helpers/duelAuthority.ts tests/networkBoundary.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 3a0e1ab, effort high, 602 s, 6288573 in / 6117989 cached / 44792 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 Missile members are outside the completeness guard, so a new Missile field would be silently dropped by clone and restore
The missile slot field hard-codes its members (MISSILE_KEYS) and builds the restored missile with `{} as Missile`. The completeness test never walks a Missile: it walks `createTacticalState(seed)`, where both slots are null, and it skips `missiles.0` and `missiles.1` because those are field names. A member added to `Missile` would compile, would not fail any test, and would be lost by `cloneTactical`, by the snapshot and by restore. The old `cloneTactical` used `{ ...missile }` and copied such a member. · src/renderer/src/sim/tactical/hash.ts:L19 (MISSILE_KEYS), L31 (read hard-codes the members), L36-37 (`const m = {} as Missile`); src/renderer/src/sim/tactical/state.ts:L35 (Missile interface); tests/duelModules.test.ts:L18 (isGroup), L43-47 (walks createTacticalState, so missiles are null), L53-62 (the 'member added' check covers tactical, ship, hunter and duel only); old clone at diff L1435 (`{ ...s.missiles[0] }`); plan L58 (Decision 10: 'a field the module declares is copied without anything listed here') and plan L50 (completeness test). · The module contract exists so that state cannot escape the hash, snapshot and clone without a failing test. Missiles are the one nested record where that guarantee does not hold. A future Missile field would make restored duels diverge with no test failing. · Type MISSILE_KEYS as `satisfies readonly (keyof Missile)[]` and add a compile-time exhaustiveness check (e.g. `type _ = Exclude<keyof Missile, typeof MISSILE_KEYS[number]> extends never ? true : never`). Also extend the completeness test to walk a played duel with a missile in flight (seed 7 at tick 5,156 already has one), recursing into missile objects against MISSILE_KEYS.

### [P2] R1-F2 Nothing checks duelEndSummary's field mapping; the continuation proof uses expect.any for every pair
The continuation proof only checks that the resumed and the reference summaries are equal. Its shape assertion uses `expect.any(Array)` for terminal and every pair. No test computes `duelEndSummary` from a known accumulator, or pins the summary the plan records for seed 7. The codec test uses those numbers only as a literal it round-trips. So a wrong mapping would pass every test, because both runs share the bug: `missileHits` summing the wrong ship, `repairsFinished` swapped, or `laserHits` read from the tactical counter. · tests/duelCheckpoint.test.ts:L54-56 (expect.any(Array) for terminal, laserReleases, laserHits, missilesLaunched, missileHits, repairsFinished; only the top level is checked as frozen); src/renderer/src/sim/duel/summary.ts:L19-27 (the mapping); tests/codecModeWire.test.ts:L15-16 (literal only); plan L62 (Decision 14 states the expected summary `{"outcome":2,"ticks":8832,...,"repairsFinished":[7,9]}`); plan L55 (Decision 7: per-ship pairs, missileHits sums hits by room, repairsFinished per player, deeply frozen). · The end summary is the duel's only end record on the wire. Its correctness under Decision 7 has no test that would catch a regression, and 'deeply frozen' is only checked at the top level. · In the continuation proof, replace the expect.any matcher with the plan's exact summary for seed 7 (it is already logged). Add a unit test that builds a telemetry accumulator with distinct per-ship and per-room numbers and asserts each `duelEndSummary` field and `Object.isFrozen` on the nested arrays.

### [P3] R1-F3 The duel EndRecord is narrowed to never-null against the spec and plan, and the cause enum is duplicated
Spec §6 and the plan's codec and contracts steps define `{ mode: 'duel'; record: DuelEndSummary | null }`. The fix wave made the record non-null in `contracts.ts`, and the duel codec now rejects null (a test asserts this). Neither the plan's Decisions nor the spec record this refinement. Separately, `codec.ts` re-declares TERMINAL_CAUSES rather than sharing summary.ts's list, so the two copies can drift. · spec L169-172; plan L1035 and L1337 (`DuelEndSummary | null`); src/renderer/src/net/contracts.ts:L100; src/renderer/src/net/codec.ts:L33 (duplicate TERMINAL_CAUSES), L115-121; src/renderer/src/sim/duel/summary.ts:L8; tests/codecModeWire.test.ts:L39 (null rejected). · H-2's client codec will be written against the spec. A wire contract that is silently stricter than the spec says, plus two copies of the cause enum, invite a mismatch later. · Record the never-null refinement in the plan's Decisions and the spec's change log, or restore `.nullable()`. Import TERMINAL_CAUSES from sim/duel/summary.ts in codec.ts, which already imports a type from sim/duel/snapshot.ts.

### [P3] R1-F4 Stale test reference in the ModeWire doc comment
The ModeWire comment says the type pairing is proven by `tests/codecModeTypes.test.ts`. No such file exists; the proof is in `tests/codecModeWire.test.ts`. · src/renderer/src/net/codec.ts:L38; Glob tests/codecMode*.test.ts finds only tests/codecModeWire.test.ts. · Readers looking for the compile-time proof will not find it. · Change the reference to tests/codecModeWire.test.ts.

### [P3] R1-F5 Each duel publication rebuilds the map and grid, and the interior field list is rebuilt on every flatten
Every streamed publication runs `validateDuelSnapshot`, which calls `createTacticalState(seed)`: generateMap and buildGrid. `validateMap` then runs, and `mapHash` misses its WeakMap cache because the map is new. This happens per publication per streamed peer. Separately, `interiorModule.fields` builds a new field array and closures on every call, and `hashDuel` calls it every tick. Plan Decision 1 says field lists are cached per shape. · src/network/modes/duelStream.ts:L23-27 (checkedPublication → validateDuelSnapshot on every toImage); src/renderer/src/sim/duel/snapshot.ts:L60-62 (createTacticalState, validateMap, mapHash per call); src/renderer/src/sim/duel/hash.ts:L23-32 (cache keyed by the map object); src/renderer/src/sim/duel/modules.ts:L33-46 (interior fields() not cached); plan L49 (Decision 1: 'cached per shape'). · Correctness is fine, but this adds host CPU per publication, and the interior module departs from Decision 1's caching rule. The cost was not measured. · Cache the regenerated tactical shape, its validateMap result and its mapHash per seed (a small bounded map), so validation does not regenerate them. Cache the interior field list per (layout, playerCount), as tacticalFields does per asteroid count.

## Verified
- Plan Decision 2 and flattenDuel order: modules.ts:L52-57 puts space, presence, repair and interior after SIM_VERSION (hash.ts:L12-16). The final pass turns −0 into 0 as the old code did (diff L896-901 vs L902-904). tests/duelModules.test.ts compares the result with the hash-completeness expression. The golden and fixtures are not in the diff stat (diff L8-34).
- Space module field order matches the old flattenTactical exactly: tick, seed, rng.s, asteroid count, outcome; per ship x..hull, rooms, planetHits..missilesLost, graceUntil; missiles; hunter head and trail (tactical/hash.ts:L14-18, L41-61 vs diff L1272-1301). Flag fields are written as 1/0, matching the old `? 1 : 0`.
- Restore safety, hangs: the only value-driven loops in tactical/duel are the headingAcc drains (physics.ts:L31-32, missiles.ts:L38-39). headingAcc is bounded to (−1, 1) for ships and missiles (tactical/hash.ts acc rule; SHIP_RULES and the missile branch).
- Restore safety, index values: ship and missile heading 0..255, lock and hunter.room 0..2, trailHead within the ring, rooms 0..2, shields, magazine, laserCharge, outcome and hunter.mode enums, and skidSign −1..1 are all bounded. graceUntil is checked as int32 before the Int32Array write, and presence/repair are checked as 0/1 and 0..959 (snapshot.ts:L73-76; REPAIR_UNITS=960, tuning.ts:L7). rng.s is bounded to uint32, consistent with shared/rng.ts:L5,L9.
- Restore safety, failure after allocation: the interior identity values (sim version, idHash, layoutHash, playerCount at [5], crew at [9]) are checked before createDuel (snapshot.ts:L79-82) and match unflatten's own checks (flatten.ts:L71-74). Tactical writers can only throw on presence and the asteroid count, both pre-validated. flatten's canonicalNumber only turns −0 into 0 (flatten.ts:L19), so a validated snapshot reproduces its header hash after restore.
- Non-snapshotted members: tactical.events and d.events are cleared at the start of each step (tactical/duel.ts:L17, duel/step.ts:L79). points, nav and weapons come from the layout. map and grid are regenerated from the seed and checked by mapHash.
- Telemetry memory: the zod schema covers every DuelTelemetry member (telemetry.ts:L21-56 vs duelCheckpoint.ts:L32-49). ticks must equal the snapshot tick, outcome must equal values[5], grace lengths must equal the body count, and a running duel must have no terminal causes. recordTick has no value-driven loops (telemetry.ts:L89-165). The seat/lastConsole alias created in createTelemetry (L74) is lost through JSON, but only on tick 0, and has no effect, because prev.seat[pid] is read before lastConsole[pid] is written and prev is replaced at L164.
- Sector bytes: the codec diff changes only the ModeWire generic, the per-mode endRecord (sector is still `{mode:'sector', record: telemetry}` strict, the same parse output as the old one-option discriminated union) and the cast in the publication refine. commandSchema and publicationSchema are still built from sectorWire (codec.ts vs .superpowers/sdd/codec-before.ts).
- Stream binding move: streamBinding.ts matches the old createSectorStreamBinding line for line (sectorStream-before.ts:L76-126). Labels reproduce every close reason and error ('sector-control-channel', '-input-direction', '-input-channel', '-stream-invalid', '-stream-missing-sink', '-notification-floor'). The sector codec is createMessageCodec(), the same codec as the module-level encode/decode. sectorStream's exports are unchanged.
- Registry: authorityModes is createModeRegistry([sectorMode, duelMode]) (src/utility/authorityModes.ts). The utility's identity and init handshake are per modeId (utilityHost.ts:L77-93), so the sector's identity is unchanged. authorityHost.ts passes authorityModes.
- Duel mode: ownership is checked against init.playerCount=2 (encounterMode.ts:L62-63,L102,L111). The init schema pins playerCount to the literal 2. The publication schema is built with playerLimit 2. The image path bounds metadata, image size and epoch length and re-runs validateDuelSnapshot both ways (duelStream.ts). Notifications go on 'duel-notification'. The duel wire's command kinds match the DuelCommand union (contracts.ts:L70-77).
- Core integration: setPaused is routed to the control queue before the step (core.ts:L370). The ended event requires an endRecord (core.ts:L451-453). duelRules sets the summary on the ending step and on restore (duelRules.ts session()/step).
- runModeReplay looks rules up with Object.hasOwn. replayMode defaults to 'sector', and parseEncounterReplay rejects a mode mismatch (replay.ts:L36-43).
- H-1 local duel: app/duel/runtime.ts imports only createTacticalState, NO_AXES and Outcome from tactical/state. cloneTactical has no non-test caller in src, and predict.ts still uses the unchanged cloneShip. The state.ts↔hash.ts import cycle is safe: hash.ts reads HunterMode and Outcome only inside topRules(), and state.ts calls cloneTacticalFromModule only inside a function.
- Boundaries: the new sim files import nothing from authority, clientControl or headless. determinismGuard does not ban structuredClone, which the sector checkpoint already uses. networkBoundary.test.ts exempts exactly streamBinding.ts, duel.ts and duelStream.ts.

## Not verified
- Suite, typecheck, goldens, cross-engine determinism and the Net-3 host-runtime gate: the constraints forbid running them, so I relied on the implementers' report.
- Whether the sector's validateCanonicalValues rejects every interior value that unflatten would store lossily (for example a non-integer in integer-typed ECS storage). That is the sector's validator, outside this diff. A gap there would surface as a post-allocation hash failure in loadDuelSnapshot (disposed and thrown), not as silent divergence.
- How much the per-publication map regeneration in duelStream actually costs: not measured.
- The spec §12 R-1 row: I read only spec §6 L164-218.
- Whether the existing cloneTactical tests (tests/tacticalDeterminism.test.ts and others) pass unedited, as Decision 10 requires: they are not in the diff stat, which suggests they are unedited, but I did not read them.

---

# Round 1 response (implementation revised, f6db019)

Reviewed `round-1.json` against the code. 4 accepted (2 P2, 2 P3), 0 rejected, 1 deferred (P3).

## R1-F1 [P2]: Missile members are outside the completeness guard

Confirmed. `MISSILE_KEYS` was hand-listed, and the completeness walk only saw null missile slots. The fix:
- `MISSILE_KEYS` is exported and declared `satisfies readonly (keyof Missile)[]`. A compile-time `Exclude<keyof Missile, …>` must-be-`never` const fails typecheck if a key is missing.
- `tests/duelModules.test.ts` now walks seed 7 at tick 5,156, which has a missile in flight, against `MISSILE_KEYS`. It also asserts permanently that a planted extra member is reported (`0.newMissileThing`).

## R1-F2 [P2]: Nothing checks duelEndSummary's field mapping

Confirmed. The fix:
- The continuation proof asserts the plan's exact seed-7 summary (Decision 14) instead of `expect.any`.
- The new `tests/duelSummary.test.ts` runs distinct per-ship and per-player numbers through every `duelEndSummary` field and checks `Object.isFrozen` on the nested arrays.
- Bite check: swapping the ship index in `laserReleases` fails the test.

## R1-F3 [P3]: The duel EndRecord is narrowed to never-null; cause enum duplicated

Accepted, keeping never-null. The earlier fix wave verified that an ended duel always carries a summary: `session()` on create and restore, and `step`. The refinement is now recorded in the plan's Decision 7 and the spec's change log, including that the codec rejects null. `codec.ts` imports `TERMINAL_CAUSES` from `sim/duel/summary.ts`, now `as const satisfies readonly TerminalCause[]`, instead of re-declaring it.

## R1-F4 [P3]: Stale test reference in the ModeWire doc comment

Fixed: the comment now names `tests/codecModeWire.test.ts`.

## R1-F5 [P3]: Each duel publication rebuilds the map and grid

Deferred. This is performance only and changes no behaviour. Before H-2 streams duels, cache the regenerated tactical shape and its `mapHash` per seed, and the interior field list per layout and player count.

## Also changed

- (nothing)

Verified:
- `npm run typecheck`;
- 218 tests in the 8 touched test files;
- canonical-trace and authority-trace `same`, both unchanged;
- the full verify (typecheck, build, `npm test`): 3,143 of 3,144 pass. The one failure is the known worktree-only `tests/onlineAppRuntime.test.ts` flake.

## Files changed

- src/renderer/src/sim/tactical/hash.ts
- src/renderer/src/sim/duel/summary.ts
- src/renderer/src/authority/duelCheckpoint.ts
- src/renderer/src/net/codec.ts
- tests/duelModules.test.ts
- tests/duelCheckpoint.test.ts
- tests/duelSummary.test.ts
- docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md
- docs/superpowers/specs/2026-11-15-engine-refactor-design.md

<!-- end -->

---

