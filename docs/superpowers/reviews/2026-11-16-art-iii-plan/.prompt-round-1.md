## Role
<!-- reuse -->

The subject is the implementation plan for Art-iii in FTLite (Electron + PixiJS 8.19 + TypeScript, vitest): set dressing. A pure prop model places Maru-98 prop sprites by room type against walls (propCandidates, propSlots with a fit rule), seven one-frame prop outputs are imported and bound in the manifest (feature propArt) without moving the palette, and a new prop layer draws them directly above the tiles in both the sector view and the duel interior. Fresh subagents will execute each task alone, verbatim, in the worktree `.worktrees/art-iii`, so code that would not compile or pass as written, a missed caller, or an interface the plan assumes but the branch lacks is a defect. Nothing may change the deterministic sim or the ship layouts.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-17-art-iii-set-dressing.md` at commit `6d1294a`, worktree `C:\Users\djuar\FTLite\.worktrees\art-iii`, branch `art-iii`.
- The spec it implements: `docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md` (refined in `docs/superpowers/reviews/2026-11-16-art-iii-spec/`, converged).
- The code it touches: `src/renderer/src/render/` (assetNames.ts, fallback.ts, consoleModel.ts consolePlacement, renderer.ts, duel/interiorView.ts, gradeModel.ts lampPoints, particles/random.ts, tiles.ts), `src/renderer/src/sim/ship/derived.ts` and the ship JSON files (read only), `art/import.json`, `public/assets/manifest.json`, `scripts/art/buildPalette.ts`, `tests/duelInterior.test.ts` and any test indexing the world containers.
- The run dir `docs/superpowers/reviews/2026-11-16-art-iii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Container order changes:** adding props.container after tiles shifts world child indices in both views. Grep every test and source that indexes world or interior children (kids[1], children[9], getChildIndex) and confirm the plan updates each.
6. **The pinned slots** (Cutter Upper Hold (7,3) n crate; Crew Quarters (13,3) n bunk.a, (13,5) e bunk.b; Galley (11,8) w seats, (13,9) e couch, (13,7) n locker.a; Medbay (15,5) s bunk.a; Skiff Hold (9,7) e crate; Starter Medbay (18,1) n bunk.a, Crew Quarters (4,8) n bunk.a, (5,10) s bunk.b, (1,10) s bunk.a): spot-check two by hand against the exclusions and the fit rule; check the fit rule implementation (depth = 2 x art height - WALL_GAP against the floor run away from the wall).
7. **The palette:** the always-run test that each prop rectangle is already listed by a non-prop output, the packs-only countColours comparison, and the CRLF handling of palette.json (git diff --exit-code, restore, never staged).
8. **Determinism boundary.** No task touches src/renderer/src/sim, authority, src/network or src/shared; no sim RNG in the renderer; artGuards counts for the new render files.
9. **Manifest scripts** in the gitignored .art/ folder: given in full, guarded against running twice, entries satisfy the paid rules, `npm run credits` after.
10. **Fallback:** without propArt the layer is empty and nothing else changes.

## Reading manifest

- docs/superpowers/plans/2026-11-17-art-iii-set-dressing.md:L1-L1130 — the subject (L1-L94 header, constraints, decisions, files, Step 0; L95-L420 Task 1; L421-L593 Task 2; L594-L865 Task 3; L866-L913 Task 4; L914-L1130 Task 5 and notes)
- docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md — the spec
- src/renderer/src/render/consoleModel.ts, renderer.ts, duel/interiorView.ts, assetNames.ts, fallback.ts, gradeModel.ts, particles/random.ts
- src/renderer/src/sim/ship/derived.ts; sim/ship/cutter.json, skiff.json, starter.json
- tests/ (grep for kids[, children[, getChildIndex, world.children, container.children)

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
- The spec as refined (converged) is the contract; the plan may state justified deviations.

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

- **P0**: the plan is unexecutable as a whole, or following it would change the deterministic sim.
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a missed caller or index, a test that cannot pass as written), a step is ambiguous in a way two implementers would build differently, a visible regression, or the plan silently deviates from the spec.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
