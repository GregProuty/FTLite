## Role
<!-- reuse -->

The subject is the implementation plan for Art-i-b (spec sections 5-8): the light and colour-grade layer, a seeded code particle emitter and its sources, impact feel (flash, shake, hitstop, lingering smoke, a feel setting) and ambient life (console blink, room lamps, wall-vent steam, a parallax starfield), wired into both the sector ship view and the Helm duel interior of FTLite (Electron + PixiJS 8.19 + TypeScript, vitest). Fresh subagents will execute each task alone, verbatim, in a worktree on branch art-i-b, so anything left to "check at execution", code that would not compile or pass as written, and any interface the plan assumes but the branch lacks is a defect. Nothing may change the deterministic sim (SIM_VERSION, goldens, sim RNG, sim state); every effect is presentation only.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md` at commit `1395d2c`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` (sections 5-8; sections 1-4 were Art-i-a, merged as 0c194e7), refined in `docs/superpowers/reviews/2026-11-16-art-i-spec/`.
- The merged Art-i-a plan `docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md` (Decision 18 left the shake and the vent-puff rotation for Art-i-b) and what it produced: `src/renderer/src/render/palette.ts`, `effectsShapes.ts`, `worldFit.ts`, `tiles.ts`, `effects.ts`, `tests/artGuards.test.ts`, `tests/helpers/artGrid.ts`.
- The code this plan changes: `src/renderer/src/render/` (renderer.ts, effects.ts, crewSprites.ts, consoleLayer.ts, consoleModel.ts, projectiles.ts, projectileModel.ts, memory.ts, hazardTiles.ts, duel/interiorView.ts, duel/interiorModel.ts, tactical/fxModel.ts), `src/renderer/src/app/duel/duelMode.ts`, `src/renderer/src/main.ts`, the sim read-only (`sim/state.ts`, `sim/interact.ts`, `sim/tuning.ts`, `sim/tactical/state.ts`, `sim/tactical/defs.ts`, `sim/duel/state.ts`), `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-16-art-i-b-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Every caller of a changed signature or removed export.** `projectiles.draw` stops returning a shake; `SHAKE_*` is deleted from projectileModel; `CrewLayer.draw` gains a `bob` parameter; `InteriorView.draw` gains an events parameter; `Renderer` gains `feel()`/`setFeel()`; `o2Layer` and the red impact flash and the `vent.puff` sprite are removed from effects.ts. Grep for every importer, caller and test and confirm the plan updates each one. A missed caller is a P1.
6. **Determinism boundary.** The particle generator (`particles/random.ts`) is seeded from the layout hash and never the sim RNG; nothing writes sim state; the presentation clock and hitstop never touch the sim tick or interpolation; artGuards' rng/0x/pngjs guards cover the new files.
7. **Spec deviations the planner reported:** (a) the sector hit = a changed `rooms.impactTick` at most 10 ticks old (the spec said "equal to the current tick", which never holds at draw time) — check against sim/debris.ts and the step order; (b) blinking a 2x1 cursor instead of whole console screens; (c) two crew on one target both bob; (d) hitstop also freezes ambient life; (e) stars of 2 internal px; (f) consoleModel desk/screen geometry still off the art-pixel grid (an Art-i-a leftover). Judge whether each is stated, justified and acceptable, and whether (f) should be fixed here.
8. **Layer orders and blend modes:** the exact sector and duel addChild orders from spec section 5 against the real renderer.ts and duel/interiorView.ts; the claim that 'multiply' and 'add' need no advanced-blend import in Pixi 8.19 and that a child set to 'normal' escapes its parent's multiply; that crew, consoles and hazards stay untinted by the grade; that the duel's repair labels and markers stay above the lights.
9. **Duel impact signal and shake:** how the interior view receives the view events (the duelMode change), that the duel scene shake is zero while the interior is shown but the Helm and Weapons views keep theirs, and that hitstop and flash use the right clocks.
10. **The feel setting:** localStorage key `ftlite-feel`, values full/reduced/off, read at boot in try/catch, `feelScale` multipliers (1/1/1, 0.5/0.5/1, 0/0/0), F9 only in dev builds via `import.meta.env.DEV`, saved on change; the three `createRenderer` call sites in main.ts.
11. **Performance and lifetime:** 600 pre-created Sprites per interior, the starfield, per-frame allocations, cleanup on reset and layout change (no leaks across runs).
12. **Baseline and test counts** (3381 on master 0c194e7; +74 in the prototype) and the Task 9 screenshot harness (port 5299, stopping its processes afterwards).

## Reading manifest

- docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md:L1-L2723 — the subject (by task: L1-L114 header, constraints, decisions, file structure, Step 0; L115-L423 Task 1; L424-L626 Task 2; L627-L879 Task 3; L880-L1290 Task 4; L1291-L1478 Task 5; L1479-L1839 Task 6; L1840-L2325 Task 7; L2326-L2507 Task 8; L2508-L2723 Task 9, spec notes, self-review)
- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md — sections 5-8 and Testing
- src/renderer/src/render/renderer.ts, duel/interiorView.ts, app/duel/duelMode.ts, main.ts — wiring and call sites
- src/renderer/src/render/effects.ts, projectiles.ts, projectileModel.ts, crewSprites.ts, consoleLayer.ts, consoleModel.ts, memory.ts, hazardTiles.ts, tactical/fxModel.ts, palette.ts — changed modules
- src/renderer/src/sim/debris.ts, sim/interact.ts, sim/state.ts, sim/duel/state.ts, sim/tactical/defs.ts — signal sources (read only)
- tests/ files the plan edits (grep tests/ for SHAKE_, projectiles.draw, o2Layer, LOW_O2, impactTick, vent.puff, CrewLayer, createInteriorView, interiorView)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Scope is the ship interior only (sector ship view and the duel interior walk); not the tactical view, HUD or menus.
- 16 px art at 2x on the 32 px tile; one house palette; light from the top-left.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- The new shake replaces (does not stack on) the sector shake and the duel interior shake; the white flash replaces the red impact flash; the vacuum tint replaces the red low-O2 tint.
- Feel setting: no menu UI in Art-i; F9 in dev builds only.
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
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, a missed caller, a test that cannot pass as written), a step is ambiguous in a way two implementers would build differently, a visible regression in ordinary play, or the plan silently deviates from the spec.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
