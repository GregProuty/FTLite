## Role
<!-- reuse -->

The subject is the implementation of Art-ii on branch `art-ii` in FTLite (Electron + PixiJS 8.19 + TypeScript, vitest): bought pixel art in the ship interior. It imports Maru-98, LimeZu and Pimen frames, builds a 48-colour house palette with a repo script (`npm run art:palette`), draws one LimeZu character per player (with the Puny fallback), Maru machine sprites at the stations (with the procedural fallback), and Pimen blasts on hits inside the interior feel. It will be merged to master and shown to the owner as a look check. It must match its spec and plan, keep the deterministic sim untouched, and keep a fresh clone (no paid files) drawing exactly as before.

## What to review

- THE SUBJECT (impl): the range `adb2854...HEAD`, worktree `C:\Users\djuar\FTLite\.worktrees\art-ii`, branch `art-ii`. The full diff (excluding package-lock.json, review and plan docs) is prepared at `.superpowers/sdd/art-ii-branch.diff` (4506 lines, mostly art/import.json and manifest.json); read it there instead of running git.
- The spec: `docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md` (refined, converged).
- The plan: `docs/superpowers/plans/2026-11-16-art-ii-bought-art.md` (Decisions 1-14, Tasks 1-6, spec notes).
- Per-task reviews approved every task; their minor notes are in `C:/Users/djuar/FTLite/.superpowers/sdd/progress.md` (the section headed "Art-ii"). Triage them.
- The run dir `docs/superpowers/reviews/2026-11-16-art-ii-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec/plan.** Every behaviour the plan promised, present and right.
2. **The invariants named in the focus notes below.** Each one, traced through the diff.
3. **`tsc --noEmit` clean** (run it); lint if the project has it.
4. **Test adequacy** for the risky paths, and whether the tests actually exercise the diff.
5. **Anything the plan said to do that the diff does not.**
6. **Fresh clone fallback:** with none of the paid files, every new feature (`houseFloor`, `crewArt`, `consoleArt`, `blastArt`) is missing and the game draws exactly as on master: Puny tinted crew with 8 facings, procedural desks with strips and cursor, no blasts, procedural floors. Trace each branch; check that no code calls `assets.texture`/`assets.animation` on a paid name without the feature check.
7. **Determinism boundary:** nothing under src/renderer/src/sim, authority, src/network or src/shared changed; no sim RNG in the renderer; pngjs and scripts/ stay out of the renderer; the palette builder is deterministic.
8. **Cross-feature interaction:** crew (taller, rotated when downed) with consoles (sprites, quarter turns, south-wall overlap accepted), the Art-i-b bob/lights/fixtures/glows, callouts (per-player lift), the carried torpedo, blasts with the flash/smoke/debris, the duel interior and the sector renderer both wired the same way.
9. **Manifest and credits:** all paid entries satisfy the rules (source URL, retrieved, credit, required false, no duplicate names), notices/credits regenerated, LimeZu credit present, explosion-big unbound.
10. **The palette:** palette.json produced by the builder with art/palette-overrides.json; every role and ramp colour in the palette; the regenerated colours (floorSeam/ambient, wallLight/lampOff, failed) look intended.
11. **Leftover concerns:** the trailer attributions (some commits say Claude Sonnet 5.5, the implementing agents' honest attribution; the controller accepts this), the per-task minors.

## Reading manifest

- .superpowers/sdd/art-ii-branch.diff:L1-L4506 — the branch diff (read by range; art/import.json and manifest.json hunks can be skimmed)
- docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md — the spec
- docs/superpowers/plans/2026-11-16-art-ii-bought-art.md:L1-L101 — header, constraints, decisions, file structure
- C:/Users/djuar/FTLite/.superpowers/sdd/progress.md — the Art-ii section at the end
- src/renderer/src/render/crewArt.ts, crewSprites.ts, consoleModel.ts, consoleLayer.ts, interiorFeel.ts, blastModel.ts, callouts.ts, calloutModel.ts, assetNames.ts, fallback.ts, renderer.ts, duel/interiorView.ts — current files
- scripts/art/buildPalette.ts, scripts/art-palette.ts, art/palette-overrides.json, src/renderer/src/render/palette.json
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

- Packs: Maru-98 Mars sets, LimeZu Modern Interiors (premade crew 04, 07, 13, 19), Pimen Explosion VFX; no grate floors; set dressing out of scope.
- 16 px art at 2x; one house palette built from the packs; quarter turns are the only rotation.
- Paid art never enters git; a fresh clone falls back to today's art.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- Accepted look points: south-wall seated crew overlap their console art; the rack and med pod overlap neighbouring floor.

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
- **P1**: a promised behaviour is missing or wrong, a visible regression in ordinary play (either mode, with or without paid art), a leak across runs, a test that cannot catch the defect it claims to, or a silent deviation from the spec or plan.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
