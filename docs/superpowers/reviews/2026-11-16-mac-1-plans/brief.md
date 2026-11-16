## Role
<!-- reuse -->

Review both linked Mac-1 implementation plans as an engineer who must execute them. Verify existing interfaces and task dependency contracts, platform constraints, evidence validity and coverage of the approved spec. New interfaces explicitly introduced by a task need not already exist. Find concrete execution blockers, not cosmetic preference.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-mac-1a-private-build.md and docs/superpowers/plans/2026-11-16-mac-1b-cross-platform-validation.md` at commit `a178355`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- Both plans implement docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md including all review amendments.
- Inspect Electron lifecycle/packaging and scripts/network candidate and recovery proof paths. Relevant exact files are below.
- The run dir `docs/superpowers/reviews/2026-11-16-mac-1-plans/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. Check ordering and compatibility across Mac-1a and Mac-1b; old commands must remain usable between tasks.
6. Check tests can fail/pass meaningfully, types and signatures match, identity source and artifact contracts are complete.
7. Check actual Mac signing/native cleanup, bounded instrumented captures versus manual sessions, recovery hooks, real sleep coverage and evidence leakage.
8. Do not infer tests passed: this review is read-only and implementation has not begun.

## Reading manifest

- `docs/superpowers/plans/2026-11-16-mac-1a-private-build.md:L1-L149`
- `docs/superpowers/plans/2026-11-16-mac-1b-cross-platform-validation.md:L1-L132`
- `docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md:L1-L176`
- `package.json:L1-L47`
- `electron-builder.yml:L1-L23`
- `electron.vite.config.ts:L1-L26`
- `build/contentDigest.ts:L1-L19`
- `src/shared/roomSession.ts:L1-L246`
- `src/main/index.ts:L1-L74`
- `src/main/network/onlineIpc.ts:L1-L64`
- `src/main/network/onlineExit.ts:L1-L21`
- `scripts/network/candidate-manifest.ts:L1-L31`
- `scripts/network/internet-app-manifest.ts:L1-L17`
- `scripts/network/internet-app-report.ts:L1-L102`
- `scripts/network/internet-app-smoke.ts:L1-L135`
- `scripts/network/lease-smoke-lifecycle.ts:L1-L63`
- `scripts/network/online-app-observer.ts:L1-L59`
- `scripts/network/online-recovery-instrument.cjs:L1-L21`
- `src/renderer/src/authority/checkpoint.ts:L1-L66`
- `src/renderer/src/authority/replay.ts:L1-L114`

Use bounded Read offsets/limits; do not read whole large files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Only Read/Grep/Glob tools are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the user and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Private locally built Apple Silicon app, no Apple Developer account.
- Existing Electron architecture and service, both host directions.
- Approved refined spec; only implementation plans are editable subjects.
- No implementation, deployment, secret reads or generated physical results.

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

- **P0**: Plan fundamentally cannot deliver native cross-platform testing or violates authority/security boundaries.
- **P1**: Concrete execution blocker, contradictory interface/dependency or missing contract leading to false evidence or ordinary-use failure.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
