## Role
<!-- reuse -->

The subject is the implementation plan for Art-i-a (spec sections 1-4): the house palette and art bible, a snapped world fit for crisp pixels, the doors and walls on the art-pixel grid, paid assets in the asset manifest, palette-driven tiles and effects with a floor-art hook, and the `npm run art:import` palette-remap script, in FTLite (Electron + PixiJS 8.19 + TypeScript, vitest). Fresh subagents will execute each task alone, verbatim, in a worktree on branch art-i-a, so anything left to "check at execution", any code that would not compile or pass as written, and any interface the plan assumes but the branch lacks is a defect. Nothing may change the deterministic sim (SIM_VERSION, goldens, sim RNG, sim state).

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md` at commit `7de81fe`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` (sections 1-4 only; sections 5-8 are Art-i-b and out of scope), refined in `docs/superpowers/reviews/2026-11-16-art-i-spec/`.
- The code it changes: `src/renderer/src/render/` (worldFit.ts, renderer.ts, letterbox.ts, tiles.ts, doorModel.ts, wallModel.ts, effects.ts, consoleModel.ts, enemyWindow.ts, manifest.ts, licenses.ts, creditsText.ts, assetNames.ts, fallback.ts, assets.ts, duel/interiorView.ts, duel/interiorModel.ts, projectiles.ts, callouts.ts), `src/renderer/src/app/duel/duelMode.ts`, `scripts/gen-credits.ts`, `public/assets/manifest.json`, `package.json`, `.gitignore`, `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-16-art-i-a-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Every caller of a changed signature.** worldFit and duelFit gain a required stage argument; the door and wall geometry changes (PANEL_THICK 12, BAND 10, quantised slide); effects shapes move into effectsShapes.ts; door colour constants move to the palette. Grep for every importer and caller (including tests, consoleModel.WALL_GAP, enemyWindow.ts, and any snapshot or pixel test that pins today's geometry or colours) and confirm the plan updates each one. A missed caller is a P1.
6. **Determinism boundary.** No task may touch src/renderer/src/sim/, SIM_VERSION or goldens, or import the sim RNG into the renderer; check tests/boundary.test.ts against the new files (palette.json import, effectsShapes.ts, scripts/art-import.ts, pngjs being dev only and never reaching the renderer bundle).
7. **The spec deviations the planner reported:** (a) `npm run art:import` exits 1 when the source folder is missing even if art/import.json is empty — should an empty list exit 0 without the folder? (b) the owner's folder path is hard-coded as the default (the spec requires it); (c) the floor seam reading (one floorSeam line on each tile's top and left edge); (d) floor art on the floor parts of wall tiles (cut from the matching part of the sprite); (e) enemyWindow.ts door colours change slightly; (f) the existing shake stays on whole internal pixels until Art-i-b; (g) vent-puff sprites stay rotated. Judge whether each is stated and acceptable.
8. **Task 7 screenshots harness** (a throwaway Vite page plus an Electron script under the gitignored `.art/shots/`, with fallbacks for a missing electron binary): is it executable as written, and does it actually show the sector Skiff at stage 1.5, the Cutter at stages 1 and 2, and the duel interior?
9. **Baseline and test counts.** The plan's baseline (3183 tests; one known environmental failure in onlineAppRuntime.test.ts, and onlineRecoveryInstrumentation.test.ts needing `out/`, so Step 0 builds first) and its expected final count: are they consistent with the tasks' added tests?
10. **The palette (Apollo, 46 colours)**: are all roles and ramp colours members of `colours`, are the roles the spec lists (including lowO2, impact, doorSealed, heldTick, spaceGap, fireFallback, breach, airlockOutline, ventSpeck, failed) all present, and is the no-0x-literal grep test scoped exactly to tiles.ts, doorModel.ts, wallModel.ts and effects.ts?

## Reading manifest

- docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md:L1-L2134 — the subject (read by task: L1-L124 header, decisions, file structure, Step 0; L125-L371 Task 1; L372-L641 Task 2; L642-L982 Task 3; L983-L1270 Task 4; L1271-L1586 Task 5; L1587-L1932 Task 6; L1933-L2134 Task 7 and self-review)
- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md:L1-L70 — spec header and sections 1-4
- src/renderer/src/render/worldFit.ts, renderer.ts, letterbox.ts, duel/interiorModel.ts, duel/interiorView.ts — fit and its callers
- src/renderer/src/render/doorModel.ts, wallModel.ts, tiles.ts, consoleModel.ts, enemyWindow.ts — geometry and colours
- src/renderer/src/render/effects.ts, hazardTiles.ts — effects shapes
- src/renderer/src/render/manifest.ts, licenses.ts, creditsText.ts, assetNames.ts, fallback.ts, assets.ts, scripts/gen-credits.ts — manifest and credits
- src/renderer/src/app/duel/duelMode.ts — createInteriorView caller
- tests/boundary.test.ts and the existing tests the plan edits (grep tests/ for worldFit, duelFit, doorPicture, wallPicture, PANEL_THICK, BAND, DOOR_FILL, FLOOR, WALL, LICENSES)
- package.json, .gitignore

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Scope is the ship interior only; Art-i-a is spec sections 1-4; Art-i-b (light, particles, feel, ambient) is a separate plan.
- 16 px art shown at 2x on the 32 px tile; one house palette; outlines on crew and usable objects only; light from the top-left.
- Paid art never enters git; the build-time import pipeline is the chosen approach.
- Walls stay thin FTL-style bands.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- The spec as refined (docs/superpowers/reviews/2026-11-16-art-i-spec, converged) is the contract; the plan may state justified deviations.

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

- **P0**: the plan is unexecutable as a whole, or following it would change the deterministic sim (SIM_VERSION, goldens, sim RNG or sim state).
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a missed caller, a test that cannot pass as written), a step is ambiguous in a way two implementers would build differently, or the plan silently deviates from the spec.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
