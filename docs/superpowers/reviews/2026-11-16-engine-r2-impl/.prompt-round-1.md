## Role
<!-- reuse -->

The subject is the implementation of R-2 of FTLite's engine refactor: N-ship space plus a per-ship systems record. It changes storage only; the duel's rules stay as they are. FTLite is a deterministic TypeScript/Electron co-op space game. The work is on branch `engine-r2`:
1. **The duel migration oracle and the bless-guard fix** (`scripts/golden/duelOracle.ts`, `duel-oracle.ts`). Every version bump must now pass the duel oracle as well as the sector proof.
2. **A golden-neutral seam.** It adds a `systems` view, `missileOf`, `placeMissile`, `removeMissile` and `targetOf`, and moves callers and tests onto them.
3. **The storage change.** It brings:
   - ship slots with `active`;
   - a `ship` module with one systems record per slot (`cls`, `target`);
   - a missile pool with `owner` and `active`, resolved in owner order;
   - `ShipClassDef`/`WeaponDef`;
   - duel slot identity in `validateDuelSnapshot`;
   - `SIM_VERSION` 38 with the `MIGRATIONS[37]` alias table.
4. **The re-bless through the guard.**
5. **A test-gap fix wave.**

The implementers and reviewers verified that:
- the duel oracle (20 runs, 205,178 ticks, 304 named fields, results, events and telemetry) is identical at every tick through the alias table;
- the sector canonical trace is identical apart from the version;
- the gate outcomes are unchanged (7 wins, 3 losses, median 251.2 s);
- the full suite passes, apart from a known worktree-only flake;
- cross-engine determinism passes.

It was built from the reviewed plan `docs/superpowers/plans/2026-11-16-engine-r2-n-ship-space.md`, with each task reviewed. Review it on its merits, as the final whole-branch review.

## What to review

- THE SUBJECT: the diff bc3d94e..HEAD on branch `engine-r2`, worktree `C:/Users/djuar/FTLite/.worktrees/engine-r2`. You have no git, so read the prepared diff `C:/Users/djuar/FTLite/.worktrees/engine-r2/.superpowers/sdd/r2-impl-review.diff`. It holds the commit list, the stat and the full diff with 10 lines of context. It excludes the generated `tests/golden/*.json` and `tests/fixtures/*.json`; their correctness is proved by the guard. The current files are in the worktree; read them directly.
- The plan: `docs/superpowers/plans/2026-11-16-engine-r2-n-ship-space.md`. Its Decisions (L46 on) are binding, including Decisions 15 and 16.
- The spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md`, §5 R-2 (about L95-L135) and §12 L358-L359.
- The run dir: `docs/superpowers/reviews/2026-11-16-engine-r2-impl/`.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Wrong logic, missed branches, crashes on inputs the code accepts.
3. **Tests.** Do the tests exercise the changed paths, and would they fail if the code were wrong?
4. **Boundaries.** Determinism rules for guarded roots (`tests/boundary.test.ts`).
5. (Claude) **Rules unchanged.**
   - Does any storage change alter iteration order (ships in slot order, missiles in owner order, contacts, collisions, hunter targeting, random draws), or the arithmetic order of flight?
   - Can an inactive slot or a free pool entry ever be stepped, collided, hashed or rendered?
6. (Claude) **Proof strength.**
   - Is the alias table complete and not circular?
   - Can any old field fall out of the oracle's comparison?
   - Can the bless guard be bypassed on a version bump? Consider a missing, foreign-root, stale or same-version baseline, and a partial set.
7. (Claude) **Restore safety on the new layout.** Can a duel snapshot or checkpoint that passes validation still diverge, hang the sim, or fail after allocation? Check `headingAcc`, `graceUntil` int32, `hull`, `skidBudget`, the pool's `active`/`owner` invariants, slot identity and interior identity.
8. (Claude) **The H-1 local duel.** Does `src/renderer/src/app/duel/` and `src/renderer/src/render/tactical/` still read the right ship and missile, and build commands correctly?

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/engine-r2/.superpowers/sdd/r2-impl-review.diff`: read it in ranges; the stat is at the top.
- `src/renderer/src/sim/tactical/{state,hash,missiles,physics,hunter,contacts,weapons,duel,defs}.ts`
- `src/renderer/src/sim/duel/{snapshot,step,modules}.ts`
- `scripts/golden/{duelOracle,blessGuard}.ts`, `scripts/bless-golden.ts`
- the plan's Decisions (L46 up to "## File structure")

Read by range, not whole files, except the files listed above. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the only tools; use the prepared diff instead of git. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined engine refactor spec and the reviewed R-2 plan are the authority. R-2 changes storage, not rules; R-2b is separate. PvP is out of scope.
- The sector and Net-3 behaviour must be unchanged. Generated files come only from `npm run bless`.
- Commits are made by explicit path only. Never checkout, restore, stash or clean in the main checkout.

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
  - a duel rule or sector behaviour changed;
  - determinism broken;
  - the duel golden can be re-blessed without proof;
  - a restore that can silently diverge or hang;
  - the H-1 duel broken.
- **P1**:
  - a bug in a changed path;
  - a plan Decision not met;
  - a proof too weak to catch a real regression;
  - a test passing for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
