## Role
<!-- reuse -->

The subject is the implementation plan for R-0 of FTLite's engine refactor ("Guards"). It does three things in order:
1. Merge the parked branch `hash-completeness`: a `SimState` completeness test, and a duel hash that covers the whole interior.
2. Make `npm run bless` regenerate every pinned artifact (`tests/golden/basic.json`, `tests/golden/duel-1.json`, the determinism-v2 expectations) and retire `tests/fixtures/net1a-baseline.json` to an opt-in `--baseline` check.
3. Bump `SIM_VERSION` 36 → 37 through the guarded version-only re-bless: a per-tick canonical trace taken before the bump, `check` after, then bless.

Fresh subagents will execute it task by task, verbatim, with no other context, so anything left to "check at execution" is a defect:
- every interface it consumes must exist on master with the assumed shape;
- every code block must compile;
- every test must pass against the code given;
- every bless step must produce what the plan states;
- no gameplay may change: the sector canonical state must be identical apart from the version.

The plan was prototyped and re-extracted task by task; review it on its merits.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-engine-r0-guards.md` at commit `e446e0d`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` (§7, and the R-0 row of §12).
- The code it touches:
  - the branch `hash-completeness` (`git log master..hash-completeness`, `git diff master...hash-completeness`);
  - `scripts/bless-golden.ts`, `scripts/golden/{blessGuard,versionOnly,canonical-trace}.ts`, `scripts/determinism/*`;
  - `tests/golden.test.ts`, `tests/netParity.test.ts`, `tests/duelGolden.test.ts`, `tests/blessGuard.test.ts`;
  - `src/renderer/src/sim/tuning.ts`, `sim/canonicalFields.ts`, `sim/duel/hash.ts`, `package.json`.
- **Note:** another session is concurrently editing netcode files in the main checkout (`src/main/network/*`, `src/renderer/src/main.ts`, `tests/online*.test.ts`, uncommitted). They are out of scope. Flag any R-0 step that would touch them.
- The run dir `docs/superpowers/reviews/2026-11-15-engine-r0-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Bless safety.**
   - Can the new unified bless overwrite a pinned artifact when it shouldn't?
   - Does the version-bump path still refuse without a passing per-tick comparison?
   - Is `--baseline` really check-only?
   - Is `net1a-gates.json` handled consistently, given the plan says it is not blessed?
6. (Claude) **Retiring the net1a baseline.** Does anything else still depend on `net1a-baseline.json` (`tests/netParity.test.ts`, the gate helpers)? Does it lose coverage that no other check replaces?
7. (Claude) **The SIM 37 bump.**
   - Is the trace taken before the bump, as the plan's order requires?
   - Does the plan bless the duel golden at 37?
   - Does any Net-3 file pin a `SIM_VERSION` or `simVersion` that the bump breaks (room compatibility, `ModeDefinition.simVersion`, the host smoke tests)?
8. (Claude) **Determinism tooling.** The plan restores tracked logs under `.superpowers/sdd/.../task-5-logs` with `git checkout` after `npm run test:determinism`. Is that safe, or does it risk discarding someone else's changes?

## Reading manifest

- `docs/superpowers/plans/2026-11-16-engine-r0-guards.md:L1-L896` the subject (Scope L20, Global Constraints L27, Decisions L37, File structure L46, Task 1 L62, Task 2 L92, Task 3 L585, After L892)
- `docs/superpowers/specs/2026-11-15-engine-refactor-design.md` §7 (`grep -n "## 7"`) and the R-0 row
- `git diff master...hash-completeness --stat` and the branch's test file
- `scripts/bless-golden.ts`; `scripts/golden/*.ts`; `scripts/determinism/rebless-version.ts`
- `tests/golden.test.ts:L1-L40`; `tests/netParity.test.ts:L1-L30`; `grep -rn "net1a-baseline\|net1a-gates" tests scripts src`
- `grep -rn "SIM_VERSION\|simVersion" src/network src/utility src/main/network src/shared | head -30`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined engine refactor spec is the authority. R-0 merges `hash-completeness`, bumps SIM to 37 through the guarded re-bless, unifies bless, and retires the net1a baseline to `--baseline`.
- PvP is out of scope for now (grill Q28 amendment).
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared).
- Commits by explicit path only. The owner, and now a concurrent session, keep unrelated uncommitted files in the checkout.

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
  - it can bless a gameplay change as version-only;
  - it destroys someone else's uncommitted work;
  - it breaks Net-3.
- **P1**:
  - a task will fail at execution (a tsc error, a missing interface, a test that cannot pass, a bless step that produces something else);
  - a spec requirement is missing or contradicted without saying so;
  - a test passes for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
