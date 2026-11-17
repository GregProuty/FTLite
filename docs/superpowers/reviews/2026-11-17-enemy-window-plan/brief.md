## Role
<!-- reuse -->

An implementation plan (9 tasks) for a presentation-only feature in FTLite (Electron + PixiJS 8 + React/zustand UI overlay + TypeScript, vitest): an FTL-style enemy ship window on the duel's Weapons and Helm consoles. Clicking the enemy on the tactical map opens a CRT-amber window with the enemy's room map; the Weapons officer arms LASER, gets a reticle cursor and clicks a room to set the laser lock via the existing lock command. Fresh subagents will execute each task verbatim, seeing only that task's text, so code that would not compile, tests that cannot pass against the real helpers, or anything left to 'check at execution' is a defect. The spec was already reviewed to convergence.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-17-enemy-ship-window.md` at commit `bd20a9f8`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md`. Also the CRT map spec `docs/superpowers/specs/2026-11-17-crt-map-design.md` and the Artemis consoles spec `docs/superpowers/specs/2026-11-17-artemis-consoles-design.md`.
- `src/renderer/src/app/duel/` (input.ts, duelMode.ts, onlineDuel.ts, scene.ts, runtime.ts), `src/renderer/src/ui/` (store, actions, views, duel/*, stage/*), `src/renderer/src/render/duel/` (consoleModel, consoleLayout), `src/renderer/src/render/tactical/` (tacticalModel, tacticalLayer, hullModel, dashModel, crtTheme, camera), and `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-17-enemy-window-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. For each task, check its Interfaces Consumes against the source and the earlier tasks' Produces (names, parameter and return types).
6. Task 1 refactors tacticalLayer drawShip to use roomLook: confirm the extracted table reproduces the current inline table exactly (crew and enemy, levels 0-2, phases 0-1), so map pixels are unchanged.
7. Task 3 keyboard intercept: confirm no existing caller of createDuelKeyboard breaks, and that the pause and leave-prompt path online is unchanged when the intercept declines.
8. Task 6 scene order: confirm it follows spec section 6.5, and that scenes created without the contact option behave exactly as before (existing scene tests).
9. Task 8 React component test: confirm the harness matches how existing .tsx tests render (context providers, store, jsdom), and that SVG pointer events and the pointInPolygon hover work in jsdom as written.
10. Task 9 screenshot harness: the plan writes .art/shots from scratch (gitignored). Check it is plausible against how the app is launched (Electron, out/ build) and the query params the app actually reads.

## Reading manifest

- docs/superpowers/plans/2026-11-17-enemy-ship-window.md:L1-L2323 (the subject; read task by task)
- docs/superpowers/specs/2026-11-17-enemy-ship-window-design.md (the spec, about 200 lines)
- the source files each task modifies or consumes, at the ranges the task cites (grep to confirm signatures)
- the existing test files each task extends (grep for their helpers and imports)

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

- **P0**: the plan would change the sim or determinism, or is unexecutable as a whole.
- **P1**: a task will fail at execution (tsc error, missing or misnamed interface, wrong signature, a test that cannot pass), a task consumes something only a later task produces, a spec requirement is dropped without a stated deviation, or existing tests would break.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
