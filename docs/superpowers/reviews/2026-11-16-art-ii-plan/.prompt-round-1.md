## Role
<!-- reuse -->

The subject is the implementation plan for Art-ii in FTLite (Electron + PixiJS 8.19 + TypeScript, vitest): a palette builder in the repo with overrides and a regenerated palette, one LimeZu character per player in the crew layer, Maru machine sprites at the stations, Pimen blasts on hits inside the interior feel, docs, and a final verification with screenshots. Fresh subagents will execute each task alone, verbatim, in the worktree `.worktrees/art-ii`, so anything left to "check at execution", any code that would not compile or pass as written, and any interface the plan assumes but the branch lacks is a defect. Nothing may change the deterministic sim.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-art-ii-bought-art.md` at commit `2e33537`, worktree `C:\Users\djuar\FTLite\.worktrees\art-ii`, branch `art-ii`.
- The spec it implements: `docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md` (refined in `docs/superpowers/reviews/2026-11-16-art-ii-spec/`, converged).
- Branch state: `art/import.json`, `src/renderer/src/render/palette.json`, `public/assets/manifest.json`, `scripts/art/importCore.ts`, `scripts/art-import.ts`, `docs/art/bible.md`, `docs/gates.md`, `package.json`.
- The code it changes: `src/renderer/src/render/` (crewSprites.ts, facing.ts, assetNames.ts, fallback.ts, consoleModel.ts, consoleLayer.ts, interiorFeel.ts, lightsModel.ts, calloutModel.ts, callouts.ts, renderer.ts, duel/interiorView.ts, palette.ts), `src/renderer/src/sim/stationKinds.ts` and `sim/ship/derived.ts` (read only), `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-16-art-ii-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Every caller of a changed signature.** createConsoleLayer(assets), createInteriorFeel options (consoleArt, blasts), CrewLayer behaviour, bubbleAnchor's new lift parameter, the interiorFeel `above` children order (only changed when blasts are given). Grep for every caller and test and confirm the plan updates each.
6. **Determinism boundary.** No task touches src/renderer/src/sim, authority, src/network or src/shared, or imports the sim RNG into the renderer; the palette builder and import stay scripts-only (pngjs never reaches the renderer); artGuards still pass for the new files.
7. **The palette builder.** Does Task 1's code implement spec section 4 (k-means over non-kept colours, kept seeding the init, empty clusters, the 48-kept failure, ramp mapping and padding, overrides) and the plan's stated deviation (each distinct frame counted once, keyed by pack and rectangle)? Is "re-running art:palette and art:import leaves git status empty" a real check in Task 6? Do tests avoid the owner's asset folder?
8. **The baseline.** Step 0 expects one failing test (artImport's "lists no outputs yet", which Task 1 replaces) and load-related sim timeouts. Is the expectation precise enough that an implementer can tell a real regression from these?
9. **Crew details:** the LimeZu frame indices (e 0, n 1, w 2, s 3; idle 4+6i; walk 28+6i), crewPose, the fallback ladder (circles / Puny / LimeZu), the downed rotation and reset, stationSides caching, the carry offset, and the callout lift.
10. **Console details:** consolePlacement per side (back edge on the turned desk's outer edge, centring, rotation, box size), the tints, the sprite container at index 0, the redraw-on-change rule, the seven one-frame outputs and their manifest entries.
11. **Blast details:** the pool of 4, framing from clock.t, centroid rounding, the duel smoke tile, breach sparks, clearing on reset and build, the `above` order.
12. **Manifest edits by scripts in the gitignored .art/ folder:** are those scripts given in full in the plan, and do the resulting entries satisfy the paid rules (source URL, retrieved, credit, required false, no duplicate names)?

## Reading manifest

- docs/superpowers/plans/2026-11-16-art-ii-bought-art.md:L1-L2306 — the subject (by task: L1-L101 header, constraints, decisions, files, Step 0; L102-L496 Task 1; L497-L1018 Task 2; L1019-L1489 Task 3; L1490-L1960 Task 4; L1961-L2061 Task 5; L2062-L2306 Task 6, spec notes, self-review)
- docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md — the spec
- src/renderer/src/render/crewSprites.ts, facing.ts, assetNames.ts, fallback.ts, consoleModel.ts, consoleLayer.ts, interiorFeel.ts, lightsModel.ts, calloutModel.ts, callouts.ts, renderer.ts, duel/interiorView.ts, manifest.ts, assets.ts
- scripts/art/importCore.ts, scripts/art-import.ts, package.json, art/import.json
- tests/ files the plan edits or that call the changed APIs (grep tests/ for createConsoleLayer, createInteriorFeel, bubbleAnchor, createCrewLayer, artImport)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Scope: the ship interior; packs Maru-98 Mars sets, LimeZu Modern Interiors (premade crew 04, 07, 13, 19), Pimen Explosion VFX; no grate floors; set dressing out of scope.
- 16 px art at 2x on the 32 px tile; one house palette built from the packs; quarter turns are the only rotation.
- Paid art never enters git; a fresh clone falls back to today's art.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
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

- **P0**: the plan is unexecutable as a whole, or following it would change the deterministic sim (SIM_VERSION, goldens, sim RNG or sim state).
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a missed caller, a test that cannot pass as written), a step is ambiguous in a way two implementers would build differently, a visible regression in ordinary play, or the plan silently deviates from the spec.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
