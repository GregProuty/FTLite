## Role
<!-- reuse -->

The subject is the design spec for Art-iii in FTLite (Electron + PixiJS 8.19 + TypeScript, vitest): set dressing. Maru-98 prop sprites (bunks, seats, couch, locker, crates) are placed by a deterministic, render-only rule from each room's type, against the room's walls, in the console layer under the crew. It will become an implementation plan executed by fresh subagents who see only the plan, so every requirement must be buildable against the real code and the real sheets without guessing, a fresh clone without paid art must draw as today, and nothing may change the deterministic sim or the ship layout files.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md` at commit `cad50ea`, worktree `C:\Users\djuar\FTLite\.worktrees\art-iii`, branch `art-iii`.
- What Art-ii left on master: `art/import.json`, `src/renderer/src/render/palette.json`, `public/assets/manifest.json`, `scripts/art/buildPalette.ts`, `src/renderer/src/render/consoleModel.ts` (consolePlacement, deskPicture, consoles, WALL_GAP), `consoleLayer.ts` (sprite container), `fallback.ts`, `assetNames.ts`, `interiorFeel.ts` (fixtures), `particles/random.ts` (hashString, hashU32), the Art-ii spec `docs/superpowers/specs/2026-11-16-art-ii-bought-art-design.md`.
- Ship layouts: `src/renderer/src/sim/ship/cutter.json`, `skiff.json`, `starter.json`; `sim/ship/derived.ts`, `sim/ship/schema.ts` (rooms, edges, sites, airlocks, stations, spawns) — read only.
- The source sheets are in `C:\Users\djuar\FTLite-assets\maru-98-mars\` (outside the repo); you may view them as images to check the rectangles and what each sprite is.
- The run dir `docs/superpowers/reviews/2026-11-16-art-iii-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **The rectangles and sprite meanings** in section 1 against the sheets (are they exact bounding boxes, are they what the spec says, which way does each face?).
8. **The room rules** in section 2 against the Cutter's and Skiff's real room names and systems; the claimed list of dressed rooms; the "starter" ship.
9. **The slot rule** in section 3: the real names for door/opening edge tiles, breach sites, airlock tiles and spawns; whether airlock tiles are floor or wall; whether enough candidates survive the exclusions in each dressed room on the Cutter and Skiff (work out at least the Cutter's Crew Quarters, Galley and Lower Hold by hand); the corner rule; the adjacency rule; determinism.
10. **Drawing:** reusing consolePlacement for props (its arguments mean console sides and flush), the console layer's redraw rule and container order, interaction with the Art-i-b glows and fixtures, the crew drawn above.
11. **The palette:** adding new frames may move the palette (Art-ii's builder counts each distinct frame); is the spec's handling precise?

## Reading manifest

- docs/superpowers/specs/2026-11-17-art-iii-set-dressing-design.md:L1-L70 — the subject
- src/renderer/src/sim/ship/cutter.json, skiff.json (rows, rooms, stations, spawns, edges, sites, airlocks)
- src/renderer/src/sim/ship/derived.ts:L1-L100; sim/ship/schema.ts:L1-L40
- src/renderer/src/render/consoleModel.ts; consoleLayer.ts; fallback.ts; assetNames.ts; particles/random.ts:L1-L20
- art/import.json; public/assets/manifest.json (paid entries at the end); scripts/art/buildPalette.ts (frame counting)

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
- Art from the Maru-98 packs already bought; 16 px art at 2x; quarter turns only; one house palette.
- Paid art never enters git; a fresh clone falls back to today's look.
- No sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- Crew walking across a prop's floor is accepted as a look point, not a defect.

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

- **P0**: the spec cannot be built as a whole, or following it would change the deterministic sim.
- **P1**: a requirement relies on an interface, field or asset that does not exist, two implementers would build it differently, a stated outcome is false (e.g. a dressed room ends up with no slots), or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
