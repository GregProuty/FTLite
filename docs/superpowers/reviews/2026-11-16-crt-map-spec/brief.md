## Role
<!-- reuse -->

The subject is the design spec for the CRT map in FTLite (Electron + PixiJS 8.19 + TypeScript + React UI overlays, vitest): when a player is at a console (Helm map, Weapons map, flight view), the tactical map and its React overlays become a monochrome amber CRT display (phosphor palette, glow, scanlines, mask, vignette, flicker, bezel, a strength setting). It will become an implementation plan executed by fresh subagents who see only the plan, so every requirement must be buildable against the real code without guessing, readability must survive the loss of hue, and nothing may change the deterministic sim.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-17-crt-map-design.md` at commit `fc3dd40`, worktree `C:\Users\djuar\FTLite\.worktrees\crt-map`, branch `crt-map`.
- The code it changes: `src/renderer/src/render/tactical/` (tacticalLayer.ts, tacticalModel.ts, weaponsModel.ts, fxModel.ts, shipColours.ts, camera.ts, feelModel.ts), `src/renderer/src/render/theme.ts`, `src/renderer/src/app/duel/scene.ts`, `duelMode.ts`, `flightMode.ts`, `src/renderer/src/ui/` (duel/*.tsx, stage/*, mount.tsx, UiRoot.tsx, views.ts, store.ts), `src/renderer/src/render/feel.ts` and `app/feelBoot.ts` (the ftlite-feel pattern), `src/renderer/src/main.ts`, `package.json`.
- References: the three images under `C:\Users\djuar\FTLite-shots\refs\` (you may view them).
- The run dir `docs/superpowers/reviews/2026-11-16-crt-map-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. **Scope:** which views really draw the tactical layer today (duel Helm/Weapons map, flight view, anything else such as the sector's map or a probe page); how the view value reaches React and Pixi; whether `crtActive(view)` can be computed where both need it; whether the interior's readout panel is the same component as the console's.
8. **The colour mapping:** every colour constant the tactical layer, fxModel, shipColours, weaponsModel and the React overlays use today (and any imported from theme.ts, like AMBER, GOOD, WARN, TEXT, DIM, BLUE); whether the "only ramp colours" test is buildable; whether friend/foe/damage/lock/warning stay distinguishable (blink rates, inverse bars) and what in the current UI is colour-only.
9. **React vs Pixi layering:** where the stage, the Pixi canvas and the proposed overlay and bezel sit (z-order, the session strip, letterbox, dpr); whether a CSS glow on PixelText (what is PixelText: DOM, canvas, image atlas?) works; whether the bezel would cover map content or labels.
10. **pixi-filters:** is it a dependency today? Version compatibility with Pixi 8.19; alternatives; the effect of a glow filter on per-frame cost.
11. **The setting:** consistency with ftlite-feel (storage, boot read, dev key detection); F10 conflicts with existing keys.

## Reading manifest

- docs/superpowers/specs/2026-11-17-crt-map-design.md — the subject
- src/renderer/src/render/tactical/*.ts; src/renderer/src/render/theme.ts
- src/renderer/src/app/duel/scene.ts, duelMode.ts, flightMode.ts
- src/renderer/src/ui/duel/*.tsx; src/renderer/src/ui/stage/*.tsx; src/renderer/src/ui/mount.tsx, UiRoot.tsx, views.ts, store.ts
- src/renderer/src/render/feel.ts; src/renderer/src/app/feelBoot.ts; src/renderer/src/main.ts (key handling, F9)
- package.json

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are fine. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The console screens become an amber CRT display for immersion (owner, 2026-11-17), matching the references in spirit.
- Readability first: the default strength keeps thin lines readable; full strength is the reference look.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- The interior (on foot) view keeps its current look.

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
- **P1**: a requirement relies on an interface or file that does not exist, two implementers would build it differently, a stated outcome is false, readability is lost for something the player needs (friend/foe, lock, damage, warnings), or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
