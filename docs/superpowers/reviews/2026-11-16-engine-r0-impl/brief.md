## Role
<!-- reuse -->

The subject is the implementation of R-0 of FTLite's engine refactor, the guard step. It is on branch `engine-r0`, and it does five things:
1. It merges `hash-completeness`, which adds a SimState completeness test and a duel hash covering the whole interior.
2. One `npm run bless` regenerates `tests/golden/basic.json`, `tests/golden/duel-1.json` and `tests/fixtures/determinism-v2.json`. The write is all or nothing, behind a version guard: any artifact stored at a version other than `SIM_VERSION` requires a per-tick canonical proof that only the version changed.
3. `net1a-baseline.json` is retired from the default suite to `npm run bless -- --baseline`.
4. It adds `scripts/golden/canonical-trace.ts same`, the same-version per-tick check that the R-1 refactors use as their proof.
5. It bumps `SIM_VERSION` 36 → 37, re-blessed version-only.

It was built from the reviewed plan `docs/superpowers/plans/2026-11-16-engine-r0-guards.md`. The suite passes, apart from one known worktree-only flake, and the cross-engine determinism check passes on Node, Electron and Firefox. Review it on its merits.

## What to review

- THE SUBJECT: the diff `8b141b9...HEAD` on branch `engine-r0`, worktree `C:/Users/djuar/FTLite/.worktrees/engine-r0`. **Skip the generated JSON** (`tests/golden/*.json`, `tests/fixtures/*.json`): they are large and are only ever written by `npm run bless`. Their correctness is proved by the guard and the tests, so review those instead.
- The plan, `docs/superpowers/plans/2026-11-16-engine-r0-guards.md`. Its Decisions at L38-L45 are binding.
- The spec, `docs/superpowers/specs/2026-11-15-engine-refactor-design.md`: §7 (the bless and its guards) and the R-0 row of §12.
- The run dir, `docs/superpowers/reviews/2026-11-16-engine-r0-impl/`.

## What to check, in priority order

1. **Correctness against the plan.** Does the code do what the plan's Decisions say? Cite both.
2. **Bugs.** Wrong logic, missed branches, crashes on inputs the code accepts.
3. **Tests.** Do the tests exercise the changed paths, and would they fail if the code were wrong?
4. **Boundaries.** Determinism rules for guarded roots, and no writes outside the intended files.
5. (Claude) **Guard bypasses.** Is there any path where a `SIM_VERSION` change or a gameplay change re-blesses the goldens without the per-tick proof? Check two cases:
   - `basicVersion` reads only the first 4,096 bytes of `basic.json`;
   - a missing artifact counts as "absent, not a bump".
6. (Claude) **The `same` mode.** R-1a's equivalence proof depends on `canonical-trace.ts same` (`verifyUnchanged`). Does it compare everything the `check` mode compares? Does it exit 1 on any difference, on a missing baseline, and on a moved version? It has no automated test: is that acceptable, and what is the smallest test that bites?
7. (Claude) **Stale references.** Look for leftovers of the deleted `scripts/determinism/rebless-version.ts`, and of `net1a-baseline.json` in the default suite. Check whether `docs/gates.md` and `package.json` are updated.

## Reading manifest

- `git diff --stat 8b141b9...HEAD`
- `git diff 8b141b9...HEAD -- scripts tests/blessGuard.test.ts tests/netParity.test.ts tests/golden.test.ts tests/simStateCompleteness.test.ts tests/duelGolden.test.ts src package.json docs/gates.md`
- `scripts/bless-golden.ts`, `scripts/golden/{blessGuard,versionOnly,baselineCheck,canonical-trace}.ts`, `scripts/determinism/bless.ts` (whole files; they are short)
- `src/renderer/src/sim/duel/hash.ts`; `src/renderer/src/sim/canonicalFields.ts`
- plan L38-L45 (Decisions)

Read by range (`sed -n`), not whole files, except the scripts listed above. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined engine refactor spec and the reviewed R-0 plan are the authority.
- Generated artifacts come only from `npm run bless`. `net1a-baseline.json` and `net1a-gates.json` are never written.
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
  - a guard can be bypassed so that goldens are re-blessed without proof;
  - sector or duel behaviour changed beyond the version;
  - determinism broken;
  - someone else's work destroyed.
- **P1**:
  - a bug in a changed path;
  - a plan Decision is not met;
  - a proof R-1 relies on is too weak to catch a real regression;
  - a test passes for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
