## Role
<!-- reuse -->

The subject is an implementation plan (Artemis-i) for an Artemis-style relayout of the duel's Helm and Weapons console screens in React, with clickable controls that merge into the duel keyboard. Fresh subagents will execute each task verbatim, seeing only their own task text, so any interface the plan consumes that does not exist with the assumed shape, any code that will not compile, and any test that cannot pass against the real helpers is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-17-artemis-i-consoles.md` at commit `a62447c`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md` (Artemis-i scope only: spec §1-4, §6, §7, §8 minus the Artemis-ii items).
- The code it changes (manifest).
- The run dir `docs/superpowers/reviews/2026-11-17-artemis-i-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. Keyboard merge (Task 1): does the new createDuelKeyboard keep every existing behaviour the runtime and online duel rely on (press edges, fireUp after a blur, repeat handling, PREVENT)? Check against tests/duelInput.test.ts and runtime.ts/onlineDuel.ts usage.
6. Import direction: render/duel/consoleModel.ts importing app/duel/controls and app/duel/input, and ui/actions.ts importing app/duel/input types; is there any architecture/lint test forbidding these (grep tests for import-boundary checks)?
7. Task 2 fixtures: do createDuel's default seats, the stand/sit steps, stationTile/stationRoom/points, canLaunch at round start and the cutter layout make the consoleModel test cases pass as written?
8. Task 4/5: DuelUi placement switches, the PixelText/Box sibling pattern for Button hit-testing, the Panel heights vs the content y offsets, and whether existing UI tests (uiDuel, uiCrt, sceneUi) stay green; the scene's readoutRows `console: true` and help change against tests that assert readout/help in the scene.
9. Task 5: every DuelViewSource implementer and fake (grep tests) gets mode/uiHeld; main.ts wiring compiles (startDuel's actions variable; startApp ordering).

## Reading manifest

- docs/superpowers/plans/2026-11-17-artemis-i-consoles.md:L1-L1093 (subject)
- docs/superpowers/specs/2026-11-17-artemis-consoles-design.md (sections 1-4, 6-8)
- src/renderer/src/app/duel/input.ts:L1-L140, tests/duelInput.test.ts, tests/onlineInput.test.ts
- src/renderer/src/app/duel/runtime.ts:L1-L403, src/renderer/src/app/duel/onlineDuel.ts:L1-L266, src/renderer/src/app/duel/onlineSource.ts:L1-L155, src/renderer/src/app/duel/duelMode.ts:L1-L82, src/renderer/src/app/duel/scene.ts:L1-L119, src/renderer/src/app/duel/controls.ts:L1-L43
- src/renderer/src/main.ts:L60-L200, src/renderer/src/ui/actions.ts:L1-L114, src/renderer/src/ui/views.ts, src/renderer/src/ui/context.tsx
- src/renderer/src/ui/duel/DuelUi.tsx, ReadoutPanel.tsx, MapOverlay.tsx, Banners.tsx; src/renderer/src/ui/stage/Box.tsx, Panel.tsx, Bar.tsx, PixelText.tsx, geometry.ts, CrtContext.tsx
- src/renderer/src/render/duel/readoutModel.ts:L1-L110, interiorModel.ts:L1-L47, src/renderer/src/render/tactical/tacticalModel.ts:L60-L300, weaponsModel.ts:L80-L95, src/renderer/src/render/theme.ts:L1-L45, src/renderer/src/render/tactical/crtTheme.ts
- src/renderer/src/sim/duel/state.ts, src/renderer/src/sim/tactical/weapons.ts:L1-L60, src/renderer/src/sim/tactical/tuning.ts:L1-L20
- tests/duelControls.test.ts:L1-L60, tests/uiDuel.test.tsx:L1-L60, tests/sceneUi.test.ts, tests/duelRuntime.test.ts (harness), tests/onlineDuelSession.test.ts (harness), tests/uiProbe.test.ts, tests/helpers/uiStore.ts
- src/renderer/src/app/uiProbe.ts, and `grep -rn "duelProbeFixture" src`

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
- Artemis-i does not change the sim; the throttle is Artemis-ii.

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

- **P0**: the plan as a whole cannot be executed, or it would break determinism, the online duel or keyboard play.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a test that cannot pass against the real helpers), a task contradicts the spec without saying so, or a case hit in ordinary play is unhandled.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
