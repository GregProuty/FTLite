## Role
<!-- reuse -->

A design spec for a presentation-only feature in FTLite (Electron + PixiJS 8 + React/zustand UI overlay + TypeScript, an FTL-like co-op game): an FTL-style enemy ship window on the duel's Weapons and Helm consoles. Clicking the enemy on the tactical map opens a CRT-amber window with the enemy's room map; the Weapons officer arms LASER, gets a reticle cursor and clicks a room to set the laser lock via the existing lock command. It will become an implementation plan executed by fresh subagents, so every interface it names must exist (or be explicitly new), and every rule must be unambiguous and testable.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md` at commit `a8b6ff73`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The CRT map spec `docs/superpowers/specs/2026-11-17-crt-map-design.md` (colour roles, damage, blinks) and the Artemis consoles spec `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md` (console layout, clicks through the duel keyboard).
- `src/renderer/src/app/duel/` (input.ts pointer and keys, duelMode.ts, onlineDuel.ts), `src/renderer/src/ui/` (store, actions, views, duel/*, stage/*), `src/renderer/src/render/duel/` (consoleModel, consoleLayout), `src/renderer/src/render/tactical/` (tacticalModel, tacticalLayer, hullModel, weaponsModel, crtTheme).
- The run dir `docs/superpowers/reviews/2026-11-17-enemy-window-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Map left-click path: the pointer source today only samples position, wheel and right/middle drag (input.ts). Is the spec's left-click sample + `pickShip` sufficient, and does a left-click on a React console button or on the window itself also reach the map (double handling)? How do React overlays and the Pixi canvas share pointer events today?
8. `Esc` is mapped to `pause` in input.ts and onlineDuel.ts has its own Escape handling (leave prompt). Is the spec's 'window takes Esc while open' implementable in single player and online without breaking the leave prompt?
9. `T` toggle, the crew slot, `systems[crew].target` and the station check: do these exist in the UI view data the React layer receives, or does the spec assume sim state the UI cannot see?
10. Damage look reuse: the spec says the window uses the same enemy damage table and blink as tacticalLayer drawShip, but the window draws SVG in React while the map draws Pixi. Is the table shareable (exported pure data), or would the plan duplicate it?
11. Window placement 'inside CONSOLE_RESERVE, under the side column, over the right part of the map': check consoleLayout for a free rectangle and whether that wording is self-consistent.
12. Cursor hiding and the reticle inside the CRT glow wrapper: do CrtGlow/CrtScreen allow pointer events and a custom cursor?

## Reading manifest

- docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md:L1-L126 (the subject)
- src/renderer/src/app/duel/input.ts:L1-L169 (keys, duel keyboard ui, pointer source)
- src/renderer/src/app/duel/duelMode.ts (grep for pointer, createDuelKeyboard, console, lock; read the relevant ranges)
- src/renderer/src/app/duel/onlineDuel.ts:L55-L80, L195-L220 (Escape handling online)
- src/renderer/src/ui/store.ts:L1-L33; src/renderer/src/ui/actions.ts:L1-L129; src/renderer/src/ui/views.ts (grep DuelView and console)
- src/renderer/src/ui/duel/DuelUi.tsx:L1-L43; src/renderer/src/ui/duel/WeaponsStation.tsx:L1-L48; src/renderer/src/ui/stage/CrtContext.tsx:L1-L32; src/renderer/src/ui/stage/Button.tsx:L1-L70
- src/renderer/src/render/duel/consoleLayout.ts:L1-L14; src/renderer/src/render/duel/consoleModel.ts:L1-L59
- src/renderer/src/render/tactical/hullModel.ts (whole, pure geometry); src/renderer/src/render/tactical/tacticalModel.ts:L1-L60, L240-L326; src/renderer/src/render/tactical/tacticalLayer.ts:L90-L160 (drawShip damage table)
- src/renderer/src/sim/tactical/weapons.ts:L1-L90; src/renderer/src/sim/tactical/state.ts:L30-L60, L110-L155

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Only the laser is aimable from the window; the missile keeps hand steering.
- Aiming only sets the laser lock (the existing lock command); FIRE/Space still fires; no auto-fire.
- Helm can open and view the window but cannot aim.
- CRT amber look.
- Presentation only: no sim change, SIM_VERSION stays 42, goldens unchanged.
- The window is a general 'contact window' (future Science role), but only the ship contact is built now.

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

- **P0**: the feature would need a sim or determinism change, or the spec cannot be built as a whole.
- **P1**: an interface the spec relies on does not exist and is not declared new, a rule two implementers would build differently, a conflict with existing input (Esc pause, clicks, console buttons) in ordinary play, or an untestable acceptance criterion.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
