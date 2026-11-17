## Role
<!-- reuse -->

The subject is a first-pass design spec for re-laying out the duel's Helm and Weapons console screens (React, pixel stage, amber CRT skin) in an Artemis-Bridge-Simulator-like arrangement, with clickable controls and, in a second part, a set-and-forget Helm throttle that changes the deterministic sim. It will become two implementation plans executed by fresh subagents who know nothing of this conversation, so every interface it names must exist or be clearly marked new, and every rule must be buildable one way only.

## What to review

- THE SUBJECT (spec): `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md` at commit `3357847`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The React UI layer spec it builds on: `docs/superpowers/specs/2026-11-16-react-ui-layer-design.md`.
- The duel UI (React), duel input/runtime, readout model, and the duel sim (paths in the manifest).
- The run dir `docs/superpowers/reviews/2026-11-17-artemis-spec/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Internal contradictions.** Any two sections that cannot both be true as written.
2. **Ambiguity.** Any requirement two implementers would build differently.
3. **Unstated assumptions** about the codebase, the vendor, the operator, or timing.
4. **Missing failure modes and degraded states.** What happens when each dependency fails, is slow, or returns something unexpected.
5. **Untestable acceptance criteria.** Any criterion with no observable check.
6. **Interfaces described that the codebase does not have.** Verify against the source.
7. Input integration: do clicks really behave exactly like the keys they stand for, given how runtime.ts consumes KeySample (press edges, fireDown/fireUp pairing, Tab clearing held keys, pause dropping presses)? Check spec §3, §4, §6 against src/renderer/src/app/duel/runtime.ts.
8. Pointer events: the canvas pointer source (input.ts createPointerSource) and its event target; will buttons above it break or leak wheel/drag/contextmenu, and is the "never takes focus" rule sufficient for Space/Enter?
9. Artemis-ii determinism: throttle state, command admission (where are seat checks and reasons done today), snapshot validation, scripted pair, predicted path, hunter unchanged, SIM_VERSION ordering against the parallel duel-fire branch.
10. Layout numbers: do the regions in §2 fit 1280×720 with today's readout row count and the Weapons top banner, and the interior view's readout column?
11. Tabs rules in §6 for single player and online: are all states reachable/consistent with controls.ts seatOf/consoleInReach and runtime's Tab/X handling?

## Reading manifest

- docs/superpowers/specs/2026-11-17-artemis-consoles-design.md:L1-L215 (subject)
- docs/superpowers/specs/2026-11-16-react-ui-layer-design.md (skim sections on sinks, stage, regions)
- src/renderer/src/ui/duel/DuelUi.tsx:L1-L32, src/renderer/src/ui/duel/ReadoutPanel.tsx:L1-L71, src/renderer/src/ui/duel/MapOverlay.tsx:L1-L30, src/renderer/src/ui/duel/Banners.tsx:L1-L23
- src/renderer/src/ui/views.ts:L1-L13, src/renderer/src/ui/sinks.ts:L1-L39, src/renderer/src/ui/actions.ts:L1-L114, src/renderer/src/ui/stage/Stage.tsx:L1-L8, src/renderer/src/ui/stage/Box.tsx:L1-L9
- src/renderer/src/render/duel/readoutModel.ts:L1-L103, src/renderer/src/render/duel/interiorModel.ts:L1-L47, src/renderer/src/render/tactical/crtTheme.ts:L1-L19
- src/renderer/src/app/duel/input.ts:L1-L140, src/renderer/src/app/duel/controls.ts:L1-L43, src/renderer/src/app/duel/runtime.ts:L1-L403, src/renderer/src/app/duel/duelMode.ts:L1-L82, src/renderer/src/app/duel/onlineDuel.ts:L1-L266, src/renderer/src/app/duel/scene.ts:L1-L119
- src/renderer/src/sim/duel/step.ts:L1-L183, src/renderer/src/sim/duel/state.ts:L1-L75, src/renderer/src/sim/duel/commands.ts, src/renderer/src/sim/duel/scripted.ts:L1-L264, src/renderer/src/sim/tactical/physics.ts:L1-L70, src/renderer/src/net/contracts.ts:L60-L100
- grep for the duel snapshot codec (`grep -rn "duel" src/renderer/src/net --include=*.ts -l`) and the command applier in src/renderer/src/sim/duel/ if needed.

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` are fine. Never run the test suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Layout only from Artemis; our amber CRT skin and m5x7 pixel text stay; no Artemis art copied.
- Panels are clickable, and every keyboard control keeps working.
- The Helm gets a set-and-forget throttle (a sim change); W/S nudge it; turning stays held on A/D and two mouse buttons.
- Weapons shows today's mechanics only (laser charge/fire, missile launch/magazine/steer, lock rooms); no new weapons.
- A top tab strip HELM / WEAPONS / SHIP, clickable where allowed.
- This is a first pass; the owner will tweak the look afterwards.

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

- **P0**: the design cannot be built as written, or it would break determinism, the online duel, or keyboard play.
- **P1**: a plan built from it would fail at execution (an interface the codebase does not have, a wrong assumption about input flow), a rule is ambiguous in a way two implementers would build differently, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
