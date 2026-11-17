## Role
<!-- reuse -->

The subject is the implementation of Art-iii on branch `art-iii` in FTLite (Electron + PixiJS 8.19 + TypeScript, vitest): set dressing. A pure prop model (`propModel.ts`) places seven Maru-98 prop sprites by room type against walls with exclusions, a fit rule and a take rule; the props are imported as one-frame outputs and bound in the manifest (feature `propArt`) without moving the palette; a prop layer draws them directly above the tiles in the sector view and the duel interior. It will be merged to master and shown to the owner as a look check. It must match its spec and plan, leave the deterministic sim and the ship layouts untouched, and keep a fresh clone (no paid files) drawing exactly as before.

## What to review

- THE SUBJECT (impl): the range `ca06a62...HEAD`, worktree `C:\Users\djuar\FTLite\.worktrees\art-iii`, branch `art-iii`. The full diff (excluding package-lock.json, review and plan docs) is prepared at `.superpowers/sdd/art-iii-branch.diff` (1048 lines); read it there instead of running git.
- The spec: `docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md` (converged).
- The plan: `docs/superpowers/plans/2026-11-17-art-iii-set-dressing.md`.
- Per-task reviews approved every task; their minor notes are in `C:/Users/djuar/FTLite/.superpowers/sdd/progress.md` (the section headed "Art-iii"). Triage them.
- The run dir `docs/superpowers/reviews/2026-11-16-art-iii-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (run it); lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **Fresh clone:** without paid files `propArt` is missing and the prop layer draws nothing; no code calls `assets.texture` on a prop name without the feature check; nothing else changes.
7. **Determinism and boundaries:** nothing under src/renderer/src/sim, authority, src/network or src/shared changed; ship layout JSON unchanged; palette.json unchanged; the prop model is deterministic (hash order, ties, cache key with room names and systems); no sim RNG.
8. **The exclusions and rules** against spec section 3 (stations and neighbours, door/opening edge tiles and neighbours, spawns, floor neighbours of breach sites and airlocks, magazine and neighbours, the lamp tile; fit rule depth 2 x art height - WALL_GAP against the same-room floor run; take rule with cross-room adjacency).
9. **The layer order** in both views (directly after tiles) and every test or source indexing world children; the duel scene from H-2a-iii (src/renderer/src/app/duel/scene.ts) still builds the interior correctly.
10. **Manifest and credits** for the seven props (paid rules, Maru-98 credit, no duplicates), notices regenerated.

## Reading manifest

- .superpowers/sdd/art-iii-branch.diff:L1-L1048 — the branch diff (read by range)
- docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md — the spec
- docs/superpowers/plans/2026-11-17-art-iii-set-dressing.md:L1-L94 — header, constraints, decisions
- C:/Users/djuar/FTLite/.superpowers/sdd/progress.md — the Art-iii section at the end
- src/renderer/src/render/propModel.ts, propLayer.ts, renderer.ts, duel/interiorView.ts, assetNames.ts, fallback.ts, consoleModel.ts — current files
- src/renderer/src/app/duel/scene.ts; src/renderer/src/sim/ship/derived.ts (read only)
- tests/propModel.test.ts, tests/propArt.test.ts, tests/propLayer.test.ts, tests/duelInterior.test.ts

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Props are presentation only and placed by rule (no sim props, no layout file changes, no hand-authored prop files).
- Maru-98 art already bought; 16 px art at 2x; quarter turns only; the palette does not change.
- Paid art never enters git; a fresh clone falls back to today's look.
- No sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- Crew walking across a prop's floor is accepted; some dressed rooms getting no props is accepted.

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

- **P0**: the change breaks the game (a crash, a blank interior, a throw on a fresh clone without paid files) or changes the deterministic sim.
- **P1**: a promised behaviour is missing or wrong, a visible regression in ordinary play (either mode, with or without paid art), a test that cannot catch the defect it claims to, or a silent deviation from the spec or plan.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
