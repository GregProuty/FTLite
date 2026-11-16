## Role
<!-- reuse -->

The subject is the implementation plan for R-2 of FTLite's engine refactor: N-ship space plus a per-ship systems record. It changes storage only; the duel's rules stay as they are. FTLite is the owner's deterministic TypeScript/Electron/Pixi co-op space game. The plan has four tasks:
1. **The duel migration oracle and the bless-guard fix** (`scripts/golden/duelOracle.ts`, `duel-oracle.ts`). Every version bump must now pass the duel oracle as well as the sector proof.
2. **A golden-neutral seam.** It adds a `systems` view and the accessors `missileOf`, `placeMissile`, `removeMissile` and `targetOf`. The duel step, telemetry, scripted pair and H-1 views move onto it, and the tests move by a type-aware codemod plus hand edits.
3. **The storage change.** It brings:
   - ship slots with `active` flags;
   - a `ship` module with one systems record per slot (including `cls` and `target`);
   - a missile pool with `owner`/`active`;
   - `ShipClassDef`/`WeaponDef` holding today's numbers;
   - `SIM_VERSION` 38 with an alias table.
4. **The re-bless through the guard**, then the gates and the cross-engine determinism check.

This is a schema migration, and the plan proves it. A pre-R-2 oracle over 20 duel runs records, per tick, the named fields, command results, events and telemetry. The post-R-2 run is checked against it through an alias table, leaving out the version. The gate outcomes must stay identical, and the sector's canonical trace must be identical apart from the version.

Fresh subagents will execute the plan task by task, verbatim. It was prototyped and re-extracted into fresh worktrees, which reproduced the prototype byte for byte. Review it on its merits.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-engine-r2-n-ship-space.md` at commit `899f4dc`, worktree `C:/Users/djuar/FTLite`, branch `master`. It executes against master as it stands (R-0, R-1a and R-1b are merged).
- The spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md`. Read §5 (R-2, about L95-L135: storage, not rules, and the migration proof), §9 (the proof pattern), and the R-2 and R-2b rows of §12 (L358-L359). R-2b, the full interior link, is out of scope.
- The code it changes:
  - `src/renderer/src/sim/tactical/` (state, hash, physics, missiles, hunter, weapons, contacts, predict, duel, map, tuning);
  - `src/renderer/src/sim/duel/` (state, step, modules, snapshot, telemetry, summary, scripted, hash);
  - `src/renderer/src/sim/module.ts`;
  - `src/renderer/src/authority/{duelRules,duelCheckpoint}.ts`;
  - `src/renderer/src/app/duel/` and `src/renderer/src/render/tactical/`: the H-1 local duel, which must keep working;
  - `scripts/golden/{versionOnly,blessGuard,canonical-trace}.ts` and `scripts/bless-golden.ts`.
- The run dir: `docs/superpowers/reviews/2026-11-16-engine-r2-plan/`. It holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Proof strength.**
   - Does the oracle compare everything that could change: all named tactical and duel fields, command results, events and telemetry, every tick, over all 20 runs?
   - Is the alias table complete and correct? Could a field silently drop out of the comparison, such as a field removed or renamed without an alias, or one compared against itself?
   - Is the version excluded only where it should be, with old+1 checked?
   - Would the oracle catch a missile resolved in the wrong owner order, or a systems record that diverged from the ship it aliases?
6. (Claude) **The bless guard.** Is there any path where `npm run bless` re-blesses `tests/golden/duel-1.json` on a version bump without the duel oracle passing? Consider a missing baseline, a baseline from another root, a same-version bless, a partial set, and a stale baseline left from an earlier bump.
7. (Claude) **Rules unchanged.** Do the storage changes alter any rule? Check iteration order (ships in slot order, missiles in owner order), collision and contact order, the hunter's targeting, and random number draws. A reordering that the 20 runs happen not to exercise is still a P1. Can an inactive slot ever be stepped or hashed differently from today?
8. (Claude) **The codemod.** Task 2 changes tests with a type-aware codemod that is run but never committed. Is it deterministic and fully specified, so a fresh executor gets the same result? Could it silently change a test's meaning?
9. (Claude) **The H-1 duel and the snapshot.** Are the duel snapshot validator's bounds (headingAcc, graceUntil int32, slot invariants, interior identity) carried over to the new layout? Does the local duel still build its commands, views and predictor correctly?

## Reading manifest

- `docs/superpowers/plans/2026-11-16-engine-r2-n-ship-space.md`. Sections: Scope L23, Global Constraints L32, Decisions L46, File structure L65, Task 1 L90, Task 2 L666, Task 3 L1677, Task 4 L3599, After L3719. Read the Decisions and each task's Interfaces first, then the code blocks for the oracle, the alias table, the guard, `state.ts`/`hash.ts`/`missiles.ts`, and the codemod.
- The spec: §5 R-2 (L95-L135) and §12 L358-L359.
- `src/renderer/src/sim/tactical/{state,hash,missiles,physics,hunter,contacts}.ts`, `src/renderer/src/sim/duel/{step,modules,snapshot}.ts`
- `scripts/golden/{versionOnly,blessGuard}.ts`, `scripts/bless-golden.ts`

Read by range, not whole files, except the files listed above. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the only tools. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined engine refactor spec is the authority. R-2 changes storage, not rules; R-2b is separate. PvP is out of scope.
- The sector and Net-3 behaviour must be unchanged. Generated files come only from `npm run bless`.
- Determinism rules apply to the guarded roots.
- Commits are made by explicit path only. Never checkout, restore, stash or clean in the main checkout: other sessions work there.

## Output format (strict)
<!-- reuse -->

Your final message is validated against a JSON Schema; it must be a single JSON object and nothing else:

```
{ "verdict":      "changes requested" | "ready with P2s" | "ready",
  "findings":     [ { "severity": "P0"|"P1"|"P2"|"P3", "title": "<one line>",
                      "claim": "<what is wrong>", "evidence": "<subject L<n>, file:L<n>>",
                      "why": "<why it matters>", "fix": "<concrete fix>" } ],
  "prior":        [ { "id": "R<N>-F<k>", "result": "resolved" | "withdrawn" | "still open",
                      "note": "<for still open: what is still wrong, with new evidence>" } ],
  "verified":     [ "<what you checked and found correct, with citations>" ],
  "not_verified": [ "<what you could not verify and why>" ] }
```

Findings ordered by severity then importance. Do not invent IDs; new findings have no ID (the responder assigns `R<N>-F<k>` in array order). `prior` lists exactly the awaited IDs given to you, once each, and nothing else. In round 1 `prior` is empty.

## Severities
<!-- reuse -->

- **P0**:
  - the plan is unexecutable as a whole;
  - it changes a duel rule or sector behaviour;
  - it breaks determinism;
  - it lets the duel golden be re-blessed without proof;
  - it would destroy someone else's work.
- **P1**:
  - a task will fail at execution;
  - a spec requirement is missing or contradicted without saying so;
  - the migration proof is too weak to catch a real regression;
  - a test passes for the wrong reason;
  - the H-1 duel breaks.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
