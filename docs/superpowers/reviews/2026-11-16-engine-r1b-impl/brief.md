## Role
<!-- reuse -->

The subject is the implementation of R-1b of FTLite's engine refactor: the gravity-well duel as a second mode on the generic authority that R-1a built. It is on branch `engine-r1b` and has four tasks plus a fix wave:
1. **The sim module contract** (`SimModule`), and the duel's space, presence, repair and interior modules. `flattenDuel` and `cloneTactical` are derived from them.
2. **The duel snapshot codec.** `validateDuelSnapshot` checks every value before anything is allocated:
   - tactical bounds and slot invariants;
   - `headingAcc` in (−1, 1);
   - `graceUntil` int32;
   - the interior's identity values;
   - presence and repair.
3. **The duel rules and checkpoint.** These include the duel's `EncounterRules`, telemetry as versioned mode memory, the `DuelEndSummary` end record and `runModeReplay`. Three proofs cover them: a continuation proof (split at tick 5,156), a replay re-run, and a size test (8,548 bytes).
4. **The duel as a registered Net-3 mode.** The stream binding moves out of `sectorStream.ts` into `streamBinding.ts`. `duelStream` is new, and so is the registry `src/utility/authorityModes.ts`, which `authorityHost.ts` builds from.
5. **The fix wave.** It adds:
   - a generic `ModeWire<S>`;
   - per-mode `endRecord` schemas, so each codec admits only its own `ended` payload;
   - a check of duel telemetry against the snapshot outcome;
   - a `hasOwn` replay lookup;
   - more tests.

The sector game and Net-3 must behave exactly as before. The H-1 local duel (`src/renderer/src/app/duel/`) must keep working. The implementers verified that:
- the full suite passes, apart from a known worktree-only flake;
- the canonical trace and the authority-boundary trace are unchanged;
- the Net-3 host-runtime gate passes;
- cross-engine determinism passes;
- sector codec output is byte-identical to before.

It was built from the reviewed plan `docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md` and reviewed task by task. Review it on its merits.

## What to review

- THE SUBJECT: the diff 1a0df0a..HEAD on branch `engine-r1b`, worktree `C:/Users/djuar/FTLite/.worktrees/engine-r1b`. You have no git, so read the prepared diff: `C:/Users/djuar/FTLite/.worktrees/engine-r1b/.superpowers/sdd/r1b-impl-review.diff`. It holds the commit list, the stat and the full diff with 10 lines of context.
- Pre-change copies of two rewritten files, for comparison: `.superpowers/sdd/codec-before.ts` (`src/renderer/src/net/codec.ts` at 1a0df0a) and `.superpowers/sdd/sectorStream-before.ts` (`src/network/modes/sectorStream.ts` at 1a0df0a).
- The current files are in the worktree; read them directly.
- The plan: `docs/superpowers/plans/2026-11-16-engine-r1b-duel-mode.md`. Its Decisions near the top are binding.
- The spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §6, covering the module contract, the duel snapshot, `EndRecord` and `DuelEndSummary`, and the R-1 row of §12.
- The run dir: `docs/superpowers/reviews/2026-11-16-engine-r1b-impl/`.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Wrong logic, missed branches, crashes on inputs the code accepts.
3. **Tests.** Do the tests exercise the changed paths, and would they fail if the code were wrong?
4. **Boundaries.** Determinism rules for guarded roots (`tests/boundary.test.ts`) and the network boundary (`tests/networkBoundary.test.ts`).
5. (Claude) **Restore safety.** Can a duel checkpoint, snapshot or mode memory that passes validation still diverge after restore, hang the sim, or fail only after allocation? Check bounds against how each value is used in `src/renderer/src/sim/tactical/` and `sim/duel/`.
6. (Claude) **Sector and Net-3 unchanged.**
   - The `ModeWire` and `endRecord` changes in `net/codec.ts` (compare with `codec-before.ts`).
   - The stream binding move (compare `sectorStream.ts` and `streamBinding.ts` with `sectorStream-before.ts`).
   - The registry, which must leave the sector's utility identity unchanged.
7. (Claude) **`duelStream` and the duel mode.** Check payload limits, publication validation, the codecs on each side and the player count.
8. (Claude) **The H-1 local duel.** Does any change break `app/duel/runtime.ts`, `input.ts` or `predict.ts`?

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/engine-r1b/.superpowers/sdd/r1b-impl-review.diff` (read it in ranges; the stat is at the top)
- `src/renderer/src/net/codec.ts` and `.superpowers/sdd/codec-before.ts`
- `src/network/modes/{sectorStream,streamBinding,duelStream,duel}.ts` and `.superpowers/sdd/sectorStream-before.ts`
- `src/renderer/src/sim/duel/{snapshot,duelCheckpoint,duelRules,modules,hash}.ts`, `src/renderer/src/sim/tactical/hash.ts`
- `src/renderer/src/authority/replay.ts`, `src/utility/{authorityModes,authorityHost}.ts`
- the plan's Decisions (the start of the plan, up to "## File structure")

Read by range, not whole files, except the files listed above. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the only tools; use the prepared diff instead of git. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined engine refactor spec and the reviewed R-1b plan are the authority. The refactor plugs into Net-3's mode layer. PvP is out of scope. The online duel UI and the client-side mode codec are H-2.
- The sector and Net-3 behaviour must be unchanged. Generated goldens and fixtures are not written.
- Never checkout, restore, stash or clean in the main checkout. Commits are made by explicit path only.

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
  - sector or Net-3 behaviour or bytes changed;
  - determinism broken;
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
