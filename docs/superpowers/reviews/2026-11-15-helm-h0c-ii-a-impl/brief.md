## Role
<!-- reuse -->

The subject is the implementation of H-0c-ii-a of FTLite's Helm demo: the headless gates in the deterministic duel sim. It is about to merge to master. It adds:
- per-tick repair events and a telemetry accumulator;
- a scripted Helm and gunner pair with BFS walking to repairs;
- the ten-seed parent §16 gate test and a telemetry tool;
- the only tuning change (`SHIP_HULL` 30 → 40);
- `SIM_VERSION` 35 → 36 with `flattenDuel` leading with it, the sector goldens and the determinism-v2 fixture re-blessed version-only behind a per-tick canonical trace, and a duel golden.

The standard:
- correct against the refined spec and plan;
- deterministic (the guard's rules);
- no change to repair behaviour or the duel hash from the events;
- gates that cannot pass for the wrong reason;
- a re-bless that cannot hide a gameplay change;
- no regression in the sector game, the H-1 screens or the solo duel.

## What to review

- THE SUBJECT (impl): the diff `master...HEAD` on branch `helm-h0c-ii-a`, worktree `C:/Users/djuar/FTLite/.worktrees/helm-h0c-ii-a` (4 commits). **Do not read the two re-blessed fixtures in full:** `tests/golden/basic.json` and `tests/fixtures/determinism-v2.json` are single-line JSON files of about 12 MB each. Spot-check them with `git diff master...HEAD -- <file> | head -c 2000` only. A code-only diff is at `.superpowers/sdd/review-code-only.diff` in the worktree.
- The spec: `docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md`. The plan: `docs/superpowers/plans/2026-11-15-helm-h0c-ii-a-headless-gates.md` (Decisions section, including the tuning table). Both were Codex-reviewed, and the code is byte-identical to the plan.
- The run dir `docs/superpowers/reviews/2026-11-15-helm-h0c-ii-a-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec and plan.** Does the diff do what the subject promises?
2. **Bugs:** off-by-one errors, unhandled error paths, races, lost or duplicated work, resource leaks.
3. **Consistency with existing patterns** in the surrounding code.
4. **Test coverage of the risky paths**, and tests that pass for the wrong reason.
5. (Claude) **Determinism:** `sim/duel/scripted.ts`, `sim/duel/telemetry.ts` and the `step.ts` change may use only `Math.abs/ceil/floor/round/min/max/sign/imul/sqrt`, no `Date`/`performance`, RNG only via `shared/rng`, and no imports from app/render/authority/headless.
6. (Claude) **The gates:**
   - the per-seed tests and the cross-seed test (median 180 to 300 s, both outcomes);
   - the terminal-cause planet check;
   - the 15-minute cap;
   - no seed can be skipped.
7. (Claude) **The re-bless:**
   - `scripts/golden/canonical-trace.ts` (baseline, check and golden modes), `scripts/determinism/rebless-version.ts` and the `scripts/bless-golden.ts` change;
   - can any of them accept a gameplay change, or fail to refuse when run in the wrong order?
   - the duel golden test.
8. (Claude) **Telemetry semantics:** baits from per-body `graceUntil`, repair start and finish credit, the idle predicate, terminal cause, and missile loss causes.
9. (Claude) **The scripted pair:** only commands the duel step admits, the priority rules, the repair assignment and BFS walking.

## Reading manifest

- `C:/Users/djuar/FTLite/.worktrees/helm-h0c-ii-a/.superpowers/sdd/review-code-only.diff` (the code diff, about 83 KB)
- `src/renderer/src/sim/duel/{step,state,hash,telemetry,scripted}.ts`
- `src/renderer/src/sim/tactical/{duel,contacts,weapons,missiles,predict,geometry,grid,tuning}.ts` (unchanged except tuning; the rules the code depends on)
- `scripts/golden/canonical-trace.ts`, `scripts/determinism/rebless-version.ts`, `scripts/bless-golden.ts`, `scripts/duel-telemetry.ts`
- tests: `tests/duelTelemetry.test.ts`, `duelScripted.test.ts`, `duelGates.test.ts`, `duelGolden.test.ts`, `duel.test.ts`, `duelReadout.test.ts`, `tests/helpers/scriptedDuel.ts`
- the spec (whole, about 145 lines)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined H-0c-ii-a spec, its parent's §16 gates, the scripted pair for tests only (Q15) and walking repair (Q27) bind. The (rec.) choices were taken under the owner's standing order and may be questioned only with evidence of a defect.
- No change to `authority/`, `net/contracts.ts`, `app/`, `render/` (beyond the readout test pinning the hull), or sector behaviour beyond the version number. The authority duel mode is H-0c-ii-b and waits for Net-3.
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared).
- Commits by explicit path only; the owner keeps unrelated uncommitted files in the checkout.

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

- **P0**: makes the sim nondeterministic, changes sector behaviour beyond the version number, lets the re-bless hide a gameplay change, or breaks the solo duel or the H-1 screens.
- **P1**: a real bug (a telemetry or gate value computed wrong, a scripted command the sim rejects, a guard that accepts what it should refuse), a spec or plan requirement missing or contradicted without saying so, or a test that passes for the wrong reason on a gated path.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
