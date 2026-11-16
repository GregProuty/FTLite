## Role
<!-- reuse -->

The subject is the design spec for Art-i, a presentation-only polish pass on FTLite's ship interior (Electron + PixiJS 8.19 + TypeScript): an art bible, paid-asset support in the asset manifest, a palette-remap import script, pixel-perfect world scaling, a light and colour-grade layer, a code particle emitter, impact feel (flash, shake, hitstop) and ambient animation. It will become an implementation plan executed task by task by fresh subagents who see only the plan, so every requirement must be buildable against the real renderer code without guessing, and nothing may change the deterministic sim (SIM_VERSION, goldens, sim RNG, sim state).

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md` at commit `f149a18`, worktree `C:\Users\djuar\FTLite`, branch `master`.
- Research it draws on: `reports/Premium pixel art and VFX.md` (skim; only for claims the spec repeats).
- The renderer code it changes: `src/renderer/src/render/` (renderer.ts, worldFit.ts, letterbox.ts, tiles.ts, effects.ts, assets.ts, manifest.ts, licenses.ts, creditsText.ts, fallback.ts, assetNames.ts, doorModel.ts, crewSprites.ts, consoleLayer.ts, projectiles.ts, hazardTiles.ts, duel/interiorView.ts, duel/interiorModel.ts), `src/shared/resolution.ts`, `scripts/gen-credits.ts`, `public/assets/manifest.json`, `.gitignore`, `tests/boundary.test.ts`.
- The run dir `docs/superpowers/reviews/2026-11-16-art-i-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **Pixel-perfect math (section 4).** Is `snapWorldScale` correct given the real chain: letterbox stage scale (letterbox.ts, 0.5 steps at or above 1, fractional below 1), worldFit/duelFit scale at most 1, art drawn at 16 px shown at TILE_PX 32 (SCALE = TILE_PX/16 in effects.ts)? Are the stated outcomes (duel and Skiff crisp at stage 1, 1.5, 2, 3; sector Cutter crisp at stage 2 and above) true for cutter 29x13 (sector fit 0.655), skiff 18x9 (fit 1), starter 25x12 (fit 0.76)? Does changing the world scale break anything that assumes worldFit (callouts, projectile shot origins, enemy window placement, the band)?
8. **Signals the grade and impact feel rely on (sections 5 and 7).** Do the "hull", "fire aboard", "low-oxygen threshold" and "existing impact signal" exist for BOTH the sector SimState and the duel (DuelState / d.interior)? Does the duel interior get hull hits written into rooms.impactTick, or is the duel's hit signal elsewhere (tactical)? Name what is missing.
9. **Determinism boundary.** Anything in sections 5-8 that would read the sim RNG, mutate sim state, or need a sim field that does not exist.
10. **Layer order (section 5).** Does the stated order match the real containers (renderer.ts world.addChild order; interiorView.ts), and do "crew, consoles and hazards stay untinted" and "lights additive on top" both hold with it? Multiply and add blend availability in Pixi 8.19 (the advanced blend modes import).
11. **Paid licence (section 2).** Do the manifest schema (file regex raw|art, superRefine rules, credit/archived rules), creditsText and gen-credits accept the new class as described; does the packaged build (electron-builder copies out/renderer from public/) behave sensibly when paid/ is absent or present?
12. **Scope for one plan.** Is this too much for one plan; should it split (for example Art-i-a pipeline and pixel-perfect, Art-i-b light, particles and feel)?

## Reading manifest

- docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md:L1-L95 — the subject
- src/renderer/src/render/renderer.ts:L1-L87 — sector view layers, worldFit, shake, draw loop
- src/renderer/src/render/worldFit.ts:L1-L12 — sector fit
- src/renderer/src/render/letterbox.ts:L1-L7 — stage scale
- src/renderer/src/render/duel/interiorView.ts:L1-L72 — duel interior layers
- src/renderer/src/render/duel/interiorModel.ts:L1-L47 — duelFit, repair overlay
- src/renderer/src/render/tiles.ts:L1-L72 — procedural floors and walls
- src/renderer/src/render/effects.ts:L1-L120 — low-O2 tint, impact flash, fire, breach, vent
- src/renderer/src/render/hazardTiles.ts:L1-L89 — hazard helpers
- src/renderer/src/render/doorModel.ts:L1-L42 — door colours
- src/renderer/src/render/projectiles.ts:L1-L129 — existing shake
- src/renderer/src/render/crewSprites.ts:L1-L91 — crew drawing (bob hook)
- src/renderer/src/render/consoleLayer.ts:L1-L23 — consoles
- src/renderer/src/render/assets.ts:L1-L96 — manifest loading, optional/missing
- src/renderer/src/render/manifest.ts:L1-L64 — manifest schema
- src/renderer/src/render/licenses.ts:L1-L22 — licence allow-list
- src/renderer/src/render/creditsText.ts:L1-L43 — credits and notices
- src/renderer/src/render/fallback.ts:L1-L20 — featureReady
- src/renderer/src/render/assetNames.ts:L1-L28 — ASSET_NAMES
- src/shared/resolution.ts:L1-L6 — TILE_PX
- scripts/gen-credits.ts:L1-L12 — credits generation
- .gitignore:L1-L14
- tests/boundary.test.ts:L1-L30 — import boundary rules
- Grep in src/renderer/src/sim/ (state.ts, duel/state.ts, components.ts, hazards/) for the hull, fire, oxygen and impactTick fields for sections 5 and 7.

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
- 16 px art shown at 2x on the 32 px tile; one house palette; outlines on crew and usable objects only; light from the top-left.
- Paid art never enters git; the build-time import pipeline (not a runtime palette shader, not hand recolouring) is the chosen approach.
- Walls stay thin FTL-style bands (owner 2026-11-13).
- Avoid Mana Seed and AI-assisted packs.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- Process tier: views/feel (one spec, one plan, subagent build, one impl review, owner look as the gate).

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

- **P0**: the spec cannot be built as a whole, or following it would change the deterministic sim (SIM_VERSION, goldens, sim RNG or sim state).
- **P1**: a requirement relies on a signal, interface or field the codebase does not have, two implementers would build it differently, a stated outcome is false, or a case hit in ordinary play (either mode, any supported window size) is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
