## Role
<!-- reuse -->

You are an independent reviewer of the Mac-1 private Apple Silicon multiplayer spec. It will become an implementation plan. Find consequential gaps that would prevent native Mac operation, trustworthy Windows-Mac evidence, or safe resource ownership. Distinguish a design requirement to add an interface from a false claim it already exists.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md` at commit `9237d6a`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- Conform to existing Net-3 and Net-3e authority/lease/compatibility rules; no protocol redesign.
- Relevant areas: Electron packaging, main lifecycle, network test runners, candidate-manifest and internet-app-report.
- The run dir `docs/superpowers/reviews/2026-11-16-mac-1-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. User wants their Windows PC and private Apple Silicon MacBooks to test existing netcode, with either platform hosting.
8. Check ad-hoc signing/runtime constraints, keyboard/menu lifecycle, ARM64 helpers and POSIX cleanup.
9. Check differing binary hashes versus shared wire identity and actual two-machine evidence.
10. Check historical hard-coded version/report assumptions, same-revision build requirements, and realistic human-operated physical test gates.

## Reading manifest

- `docs/superpowers/specs/2026-11-16-mac-1-apple-silicon-design.md:L1-L110`
- `package.json:L1-L47`
- `electron-builder.yml:L1-L23`
- `electron.vite.config.ts:L1-L26`
- `build/contentDigest.ts:L1-L19`
- `src/main/index.ts:L1-L74`
- `src/main/network/onlineExit.ts:L1-L21`
- `src/main/network/onlineConfig.ts:L1-L16`
- `scripts/network/candidate-manifest.ts:L1-L31`
- `scripts/network/internet-app-manifest.ts:L1-L17`
- `scripts/network/internet-app-report.ts:L1-L102`
- `scripts/network/internet-app-smoke.ts:L1-L135`
- `scripts/network/online-app-smoke.ts:L1-L241`
- `scripts/network/lease-smoke-lifecycle.ts:L1-L63`

Read with bounded Read offsets/limits, not whole large files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Only Read/Grep/Glob tools are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the user and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Private locally built MacBook application first, no Apple Developer account requirement.
- Native Apple Silicon and Windows interoperability; keep the existing game/network architecture.
- This is spec refinement only; no product implementation.

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

- **P0**: Fundamental design prevents any useful private cross-platform test or violates authority/security boundaries.
- **P1**: A consequential ambiguity, missing contract or ordinary failure case prevents a correct implementation or makes required evidence impossible/false.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
