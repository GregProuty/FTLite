# Codex review exchange: helm-h0c-i-impl

Subject: `src/renderer/src/sim/duel/commands.ts src/renderer/src/sim/duel/hash.ts src/renderer/src/sim/duel/state.ts src/renderer/src/sim/duel/step.ts src/renderer/src/sim/duel/tuning.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/weapons.ts tests/duel.test.ts tests/tacticalDeterminism.test.ts tests/tacticalHunter.test.ts tests/tacticalMissiles.test.ts tests/tacticalWeapons.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing b745979, effort high, 270 s, 1132297 in / 1048320 cached / 8024 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Reject weapon commands when the gunner is the empty-seat sentinel
With Weapons unattended, a command from player -1 is reported as applied even though no present player occupies Weapons and the tactical step ignores it. · src/renderer/src/sim/duel/step.ts:L39 returns -1 for an unattended station; L105 checks only player !== gunner. A direct probe after player 1 stands reproduced applied results for player -1's lock, charge and launch, with no corresponding weapon action. This violates spec L273 and plan L45. · The local DuelEnvelope accepts a numeric player ID, and admission currently confuses an invalid actor with the absence of an actor. Command results therefore disagree with execution. · Reject when gunner < 0 as well as when the player differs from gunner. Add a regression using player -1 with Weapons vacant and with its occupant away.

### [P1] R1-F2 Exercise populated missiles and events in the clone regression
The clone test does not verify independent copying of missile objects or event records. · tests/tacticalDeterminism.test.ts:L80 creates seed 13 and advances 900 ticks before cloning at L82. A direct probe confirmed missiles=[null,null] and events=[] at that point. The mutations at L87 cover only rooms, graceUntil, trail and RNG. Replaying all its assertions with shallow missile/event copies still passed, leaving src/renderer/src/sim/tactical/state.ts:L107 and L109 unprotected. · The test claims comprehensive independence but misses mutable objects needed by the upcoming snapshot and rollback integration. A shallow-copy regression would pass this test. · Populate both missile slots and representative laser/missileEnd events before cloning. Assert equal contents and distinct references, mutate the copied objects, and verify the originals remain unchanged. Retain the identical-future check.

## Verified
- Reviewed master...2a49539. Current HEAD b745979 differs only in review bookkeeping; implementation and test files match the requested commit. No files were modified.
- npx tsc --noEmit passed. Because tsconfig.json:L2 contains no files, also checked both referenced projects with --noEmit --incremental false --composite false --emitDeclarationOnly false; both passed. package.json:L6 defines no lint script.
- The existing AST determinism guard passed for all ten changed simulation files; enforcement comes from tests/helpers/determinismGuard.ts:L20 and tests/boundary.test.ts:L27.
- Seat batching, stands, presence, fixed lock→charge→launch folding, last-wins assignments, thrust=-moveY, repair-before-movement and tick advancement match the accepted ordering: duel/step.ts:L79, L89, L101, L112 and L115; plan L42–L59.
- Repair checks presence, consciousness, standing, held Interact, same room and REACH; progress survives release and hits and clears on completion or level zero: duel/step.ts:L46–L60. A direct probe confirmed zero-walk Weapons repair completes on exactly tick 240.
- Scratch reset matches the sector reset; skipped systems are not invoked. Movement reads initialized life, character and carrying fields. Cutter power usage is 9 of 10, so the stand handler's shedPower call is a no-op: duel/step.ts:L23, sim/step.ts:L36, commands.ts:L94, movement.ts:L61, power.ts:L64.
- Map validation precedes interior allocation, and subsequent initialization failures dispose the interior: duel/state.ts:L33–L52. Shared entity allocation prevents live interiors from sharing component IDs: sim/state.ts:L72–L84.
- The duel hash covers the mutable future-affecting fields on the supported Cutter paths: duel/hash.ts:L9–L12. Two simultaneously live duels produced equal hashes after every tick of a 900-tick probe. Populated missile/event cloning also passed direct independence checks against tactical/state.ts:L102.
- Standoff distance, relative closing speed, reverse thrust and avoidance precedence match spec L202: tactical/hunter.ts:L66–L77. Event additions and self-hit accounting match the plan: tactical/weapons.ts:L56–L68, tactical/missiles.ts:L25 and L56.

## Not verified
- Vitest execution was blocked before tests loaded: npx vitest run tests/duel.test.ts failed with spawn EPERM while esbuild loaded the configuration. Direct probes are not a substitute for the five targeted test files.
- Cross-engine bit identity, sector golden traces and initialization-failure cleanup were not runtime-tested. No sector implementation, net/contracts.ts or authority files changed.
- The requested review directory and ledger were absent. No prior IDs were supplied; no exchange file was written.
- Beyond the reading manifest, inspected power.ts to resolve shedPower coupling; tactical/duel.ts and tactical/hash.ts to trace execution and hashing; package.json, tsconfig files and vitest.config.ts to establish verification coverage; and the boundary test/helper to run the existing AST guard. Also checked applicable AGENTS.md locations and read the required skill instructions.

---

# Round 1 response (one source fix, tests strengthened)

Reviewed `round-1.json` against the subject at the brief commit. 2 accepted, 0 rejected, 0 deferred. No prior IDs (round 1). Both fixes were checked by re-running the failure modes as mutations against the new tests; each mutation fails them. Verify: `npm run typecheck` exit 0; `npm test` passes in full (see the run in this round's commit).

## R1-F1 [P1]: Reject weapon commands when the gunner is the empty-seat sentinel

Confirmed. `attendant` returns −1 for an empty or away-occupied console (`duel/step.ts:L39`), and the weapon admission compared only `e.id.player !== gunner` (L105). A command claiming player −1 therefore matched an empty Weapons console and was reported applied, while `crew.weapons` was false and the tactical step ignored it. Admission now rejects with `not-at-weapons` when `gunner < 0`, as well as when the player differs. New duel test `a command claiming player −1 is refused when Weapons is empty or its occupant is away`: for Weapons vacated by `stand` and by `presence false`, lock, charge and launch from player −1 are all rejected `not-at-weapons`, the lock stays Shields, `fireHeld` stays false and no missile launches. Mutation check: removing the `gunner < 0` guard makes the test fail.

## R1-F2 [P1]: Exercise populated missiles and events in the clone regression

Confirmed. At the clone point the existing test had no missiles and no events, so shallow copies of either passed. New test `copies missiles and events by value, not by reference`: it launches both missile slots and pushes a laser event and a missileEnd event, then clones. It asserts equal contents, distinct missile objects, a distinct events array and distinct event objects. It then mutates the copy's missiles, changes one copied event and pushes a new one, and asserts the originals are unchanged. The existing identical-future test stays. Mutation check: shallow missile copies, or sharing the events array, now fail it.

## Also changed

- (nothing)

## Files changed

- src/renderer/src/sim/duel/step.ts
- tests/duel.test.ts
- tests/tacticalDeterminism.test.ts

<!-- end -->

---

# Round 2 (delta, reviewing 600fcf0, effort medium, 35 s, 118061 in / 79104 cached / 1071 out)

Verdict: ready

## Prior findings
- R1-F1: resolved — duel/step.ts:L108 rejects an absent gunner before admitting weapon commands. tests/duel.test.ts:L155-L160 covers player -1 issuing all three commands after stand and presence=false, checking rejection and unchanged weapon state.
- R1-F2: resolved — tests/tacticalDeterminism.test.ts:L90-L106 populates both missiles and both event variants, checks equal contents and distinct object references, and verifies copy mutations leave originals unchanged. The identical-future check remains at L79-L88.

## Verified
- HEAD is 600fcf0162b3b50170cc2416711310eff02ba23d; the three-file delta matches the supplied diff.
- The admission guard matches spec L273 and plan L45, preserving stale-tick precedence at src/renderer/src/sim/duel/step.ts:L107.
- The strengthened clone assertions cover the independent copies implemented at src/renderer/src/sim/tactical/state.ts:L107-L109. No new defect found in the reviewed delta.

## Not verified
- Both focused Vitest commands failed before tests ran: esbuild startup returned spawn EPERM. Runtime results and reported mutation checks were not independently verified.
- The on-disk review ledger could not be read because access was denied; the supplied ledger and response were used.

---

# Round 2 response (no subject change)

Reviewed `round-2.json` against the subject at `600fcf0`. No new findings. Codex confirmed R1-F1 and R1-F2 resolved. Verdict: ready.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

