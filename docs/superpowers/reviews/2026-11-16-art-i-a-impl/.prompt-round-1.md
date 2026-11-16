## Role
<!-- reuse -->

The subject is the implementation of Art-i-a on branch `art-i-a`: a presentation-only art pass on FTLite's ship interior renderer (Electron + PixiJS 8.19 + TypeScript, vitest). It adds a house palette and art bible, a world fit snapped to whole screen pixels per art pixel, door and wall geometry on the art-pixel grid, a `paid` licence class in the asset manifest, palette-driven tiles and effects with a floor-art hook, guard tests, and an `npm run art:import` palette-remap script. It will be merged to master and shown to the owner as a look-check. It must match its spec and plan, keep the deterministic sim untouched, and introduce no rendering regressions in the sector view or the duel interior.

## What to review

- THE SUBJECT (impl): the range `a68b13a...HEAD` (head `c9f8b5d`), worktree `C:\Users\djuar\FTLite\.worktrees\art-i-a`, branch `art-i-a`. The full diff (excluding package-lock.json) is prepared at `.superpowers/sdd/art-i-a-branch.diff` (1868 lines); read it there instead of running git.
- The spec: `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` (sections 1-4 only; 5-8 are Art-i-b).
- The plan: `docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md` (Decisions 1-19 and Tasks 1-7).
- Per-task reviews already ran and approved every task; their minor notes are in `C:/Users/djuar/FTLite/.superpowers/sdd/progress.md` (the section headed "Art-i-a"). Triage them: say which, if any, must be fixed before merge.
- The run dir `docs/superpowers/reviews/2026-11-16-art-i-a-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (run it); lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **Determinism boundary:** nothing under src/renderer/src/sim/, authority/, network/ or src/shared/ changed; SIM_VERSION and goldens unchanged; the renderer never reads the sim RNG; pngjs and scripts/ never reach the renderer bundle.
7. **Snapped fit integration:** the renderer's stage scale reaches worldFit on every resize and draw; callouts and projectiles get the same fit object; the projectile reset on a stage change; the duel's createInteriorView stage getter; the letterbox below stage 1.
8. **Rendering regressions:** door slide visuals (quantised panel width, airlock stripes, the seam at x = HALF), wall light/shadow edges at joins (no edge drawn over a neighbouring band or door), the floor seams under doors, the enemy window's door colours, the effects shapes (airlock outline now 2 wide inside), and the floor-art hook skipping the door floor.
9. **Paid manifest:** superRefine rules, notices and credits output byte-identical for the free entries, gitignore entries.
10. **Import script:** validate-first (nothing written on any problem), deterministic bytes, palette-or-transparent output, the CLI's exit codes, and the minor gaps the task review noted (a corrupt pack PNG throws; duplicate output paths).
11. **Commit trailers:** Tasks 1-4 say `Claude Opus 5.5`, Tasks 5-6 say `Claude Sonnet 5.5` (honest per-agent attribution) against a plan constraint naming the Opus line. Say whether this matters.

## Reading manifest

- .superpowers/sdd/art-i-a-branch.diff:L1-L1868 — the whole branch diff (read by range)
- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md:L1-L70 — spec header and sections 1-4
- docs/superpowers/plans/2026-11-16-art-i-a-pipeline.md:L1-L125 — header, constraints, decisions, file structure
- C:/Users/djuar/FTLite/.superpowers/sdd/progress.md — the Art-i-a section at the end (task minors)
- src/renderer/src/render/renderer.ts, worldFit.ts, letterbox.ts, duel/interiorView.ts, app/duel/duelMode.ts — fit integration (current files)
- src/renderer/src/render/tiles.ts, doorModel.ts, wallModel.ts, effects.ts, effectsShapes.ts, enemyWindow.ts, consoleModel.ts — geometry and colours
- src/renderer/src/render/manifest.ts, licenses.ts, creditsText.ts — paid manifest
- scripts/art/importCore.ts, scripts/art-import.ts — import script
- tests/ files named in the diff

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Scope is the ship interior only; Art-i-a is spec sections 1-4; light, particles, feel and ambient life are Art-i-b.
- 16 px art shown at 2x on the 32 px tile; one house palette (placeholder Apollo until Art-ii); outlines on crew and usable objects only; light from the top-left.
- Paid art never enters git; the build-time import pipeline is the chosen approach.
- Walls stay thin FTL-style bands.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- The plan's stated deviations (Decisions 14, 18, 19: the import exits 1 without the source folder; the existing shake and the vent-puff quarter-turn rotation stay until Art-i-b; the light placeholder floor) are accepted.

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

- **P0**: the change breaks the game (a crash, an unloadable asset manifest, a blank interior) or changes the deterministic sim (SIM_VERSION, goldens, sim RNG or sim state).
- **P1**: a promised behaviour is missing or wrong, a visible rendering regression in ordinary play (either mode, any supported window size), a test that cannot catch the defect it claims to, or a silent deviation from the spec or plan.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
