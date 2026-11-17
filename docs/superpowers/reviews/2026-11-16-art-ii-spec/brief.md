## Role
<!-- reuse -->

The subject is the design spec for Art-ii in FTLite (Electron + PixiJS 8.19 + TypeScript, vitest): putting bought pixel art on screen in the ship interior. One LimeZu character per player replaces the tinted Puny crew, Maru machine sprites replace the procedural console desks, Pimen explosion animations play on hits, and the palette builder becomes a repo script. It will become an implementation plan executed by fresh subagents who see only the plan, so every requirement must be buildable against the real renderer code and the real imported sheets without guessing, and nothing may change the deterministic sim.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md` at commit `7b3d9ed`, worktree `C:\Users\djuar\FTLite\.worktrees\art-ii`, branch `art-ii`.
- What already exists on the branch: `art/import.json` (the frame list, 13 outputs), `src/renderer/src/render/palette.json` (the new 42-colour palette), `public/assets/manifest.json` (paid floor entries at the end), `scripts/art/importCore.ts` and `scripts/art-import.ts` (the import script), `docs/art/bible.md`.
- The renderer code it changes: `src/renderer/src/render/crewSprites.ts`, `facing.ts`, `assetNames.ts`, `fallback.ts`, `assets.ts`, `manifest.ts`, `consoleModel.ts`, `consoleLayer.ts`, `interiorFeel.ts`, `lightsModel.ts`, `effects.ts`, `renderer.ts`, `duel/interiorView.ts`, `sim/ship/derived.ts` (stationKind, read only), `sim/stationKinds.ts`.
- The Art-i spec and plans for context: `docs/superpowers/specs/2026-11-16-art-i-demo-polish-design.md`, `docs/superpowers/plans/2026-11-16-art-i-b-light-and-feel.md` (Decisions).
- The run dir `docs/superpowers/reviews/2026-11-16-art-ii-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **The imported sheet layouts.** Check `art/import.json` against the spec's frame indices: the crew outputs (52 frames, 24 columns, the right/up/left/down order the spec assumes for LimeZu rows 0-2), the stations and machines frame order used for `console.<kind>`, the explosion frame counts. The PNGs are in `C:\Users\djuar\FTLite-assets\` (outside the repo) and under `public/assets/paid/` in the worktree (gitignored); you may read them as images if useful.
8. **Crew integration.** The crew layer today: one sheet tinted per player, 8 facings, `crew.down` and `crew.sit`, `featureReady('crew')`, the Art-i-b bob, the torpedo carry overlay. Does the spec say how the per-slot sheets coexist with the existing required `crew.*` names, the manifest's no-duplicate-name rule, and boarders (which may share the crew sheet today)? Is the foot anchor rule ("lowest opaque row, measured at load") implementable with the assets API (textures only, no pixel access)? Is a 2-tile-tall sprite going to break anything that assumes a 1-tile crew (the carried torpedo offset, callouts, selection, room occlusion)?
9. **Console integration.** Sprite sizes (12-24 x 14-27 art px) against the 20 x 10 desk rectangle; quarter turns of a 3/4-view sprite; the Art-i-b cursor blink and glows positioned from the desk rectangle; console groups; the look tints; draw order and the redraw-only-on-change rule in consoleLayer.
10. **Blasts.** The hit signals and the duel's random smoke tile in interiorFeel, the presentation clock, layer placement, the cap; "a small hit spark at each breach opening" against Art-i-b's debris burst.
11. **The palette builder.** Determinism, overrides, and that re-running it reproduces the committed palette.json; tests that never read the owner's asset folder.
12. **Licences and credits.** LimeZu requires credit; Maru-98 and Pimen terms are not in the extracted packs; paid entries need source URLs and dates.

## Reading manifest

- docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md:L1-L60 — the subject
- art/import.json — the frame list (read the outputs' pack, output, columns and frame counts)
- src/renderer/src/render/palette.json; public/assets/manifest.json (end of file)
- src/renderer/src/render/crewSprites.ts:L1-L100; facing.ts; assetNames.ts:L1-L28; fallback.ts:L1-L25; assets.ts:L1-L100; manifest.ts:L1-L80
- src/renderer/src/render/consoleModel.ts:L1-L100; consoleLayer.ts; lightsModel.ts (screenCursor, glows)
- src/renderer/src/render/interiorFeel.ts:L90-L210 (onHit, smokes, draw, reset)
- src/renderer/src/render/boarderLayer.ts (does it use crew names?)
- src/renderer/src/sim/ship/derived.ts:L15-L100; sim/stationKinds.ts
- scripts/art/importCore.ts; docs/art/bible.md

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Scope: the ship interior (sector ship view and duel interior); bought packs Maru-98 Mars sets, LimeZu Modern Interiors (premade crew 04, 07, 13, 19), Pimen Explosion VFX.
- No grate floor tiles; floors are the dark Maru plating only.
- 16 px art at 2x on the 32 px tile; one house palette (now built from the packs); quarter turns are the only rotation.
- Paid art never enters git; a fresh clone falls back to today's art.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- Set dressing (beds, lockers, crates in rooms) is out of scope (later).

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
- **P1**: a requirement relies on an interface, field or asset layout that does not exist, two implementers would build it differently, a stated outcome is false, or a case hit in ordinary play (either mode, a fresh clone without paid art) is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
