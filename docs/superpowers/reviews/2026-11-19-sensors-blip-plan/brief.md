## Role
<!-- reuse -->

The subject is an implementation plan for FTLite's two-player duel: the "sensors blip". When the enemy ship is beyond the crew's sensor range, the crew's maps show a rough blip (a dotted circle re-pinged every 120 game ticks at a new guess, with an edge arrow when it is off screen) instead of today's exact last-seen ghost. It is drawing only. Fresh subagents will execute the plan task by task, verbatim, in a new worktree cut from master. So anything left to "check at execution", any code block that would not compile against master, any quoted anchor that is not in the file, any test that cannot pass, and any step that touches the sim, a wire schema or a golden is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-19-sensors-blip.md` at commit `d74e07b7`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-19-sensors-blip-design.md` (converged in review). The plan's "Decisions" section lists where it departs from the spec's letter; judge each.
- The code under `src/renderer/src/` and `tests/` on master, which is what the plan's worktree will start from.
- The run dir `docs/superpowers/reviews/2026-11-19-sensors-blip-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Every quoted "replace this text" anchor.** The plan matches edits by quoted text. Check each quoted anchor is in the named file on master exactly once, character for character (the files are long lines; mind spacing and comments).
6. **Task 1 (the worktree).** Are the worktree, branch and junction commands right for this repo on Windows (compare the W-4a plan's "Worktree setup (controller)" in `docs/superpowers/plans/2026-11-19-w4a-loadout.md`), and is the empty base commit and the smoke check sound?
7. **Task 2 (`fogModel`).** The hash's arithmetic against the spec's formula and the pinned values in the test; the held ping (`index`, `madeAt`), the age formula and the plan's Decision that `age` never returns exactly 1; "no enemy ghost" and every reader of an `'enemy'` ghost in `src` and `tests`; the two rewritten `tests/engineeringFog.test.ts` cases against what that file holds today; how the tests build a tactical state with the enemy beyond range and set `tick`.
8. **Task 3 and 4 (the map model and the layer).** `TacticalDraw.blip`, the on-screen rule, the `'blip'` `ArrowTarget`, `ARROW_NAMES`, the rounded distance and label inside the existing `arrow` helper, the plan's added `ArrowDraw.alpha?` and `blipMark`; whether the goal glow and the FIRING SOLUTION mark (`render/tactical/weaponsModel.ts`) can attach to the new arrow; any `switch` or `Record<ArrowTarget, ...>` elsewhere that the new member breaks; how the layer test reads Pixi's drawn instructions and whether such a test can run in this repo's test environment (look for an existing layer test to compare).
9. **Task 5 (the readout, the scene, the sit card).** `readoutRows`' input type and every caller; which scene call passes the fog; the plan's new `sitCardBelow(t, fog)` export in `scene.ts` and whether a scene-level test of it is feasible as written.
10. **Drawing only.** Does any step edit a file under `src/renderer/src/sim/`, a schema, a golden or the determinism fixture, or change anything the sim reads? Does the view-side hash avoid `Math.random` and the sim's random state?
11. **Task 6.** The verification commands exist in `package.json` and are run as the repo's rules require; the `docs/gates.md` entry matches the file's format.

## Reading manifest

- `docs/superpowers/plans/2026-11-19-sensors-blip.md:L1-L1329`: the subject (header and constraints L1-L59; Task 1 L60, Task 2 L123, Task 3 L509, Task 4 L786, Task 5 L974, Task 6 L1206).
- `docs/superpowers/specs/2026-11-19-sensors-blip-design.md`: all of it.
- `docs/superpowers/plans/2026-11-19-w4a-loadout.md`: grep for "Worktree setup (controller)" and read that section.
- `src/renderer/src/render/tactical/fogModel.ts:L1-L44`.
- `src/renderer/src/render/tactical/tacticalModel.ts`: the draw types (grep `ArrowTarget`, `ArrowDraw`, `GhostDraw`, `TacticalDraw`), the input's `fog`, `ringCrossesRect`, `ARROW_NAMES`, the `arrow` helper and `edgePoint`, the sensor ring and ghosts block. Read the ranges the plan quotes.
- `src/renderer/src/render/tactical/tacticalLayer.ts`: `arrowGlyph`, `dashCircle`, the sensor ring and ghosts drawing, where arrows and labels are drawn.
- `src/renderer/src/render/tactical/weaponsModel.ts`: grep `enemyArrow`, `fog`, `ArrowTarget`.
- `src/renderer/src/render/duel/readoutModel.ts`, `src/renderer/src/render/duel/sitModel.ts`: `readoutRows` and `sitCard`.
- `src/renderer/src/app/duel/scene.ts`: grep `stepFog`, `readoutRows`, `sitCard`, `fogView`; read the ranges the plan quotes.
- `src/renderer/src/sim/tactical/state.ts`, `src/renderer/src/sim/tactical/science.ts`: `TacticalState.tick`, `contactSeen`, `pointSeen`, `sensorRange` (read only).
- `tests/engineeringFog.test.ts` (all), `tests/duelReadout.test.ts`, and any existing test of the tactical layer or the scene the plan models its tests on (grep `tests/` for `tacticalLayer`, `createTacticalLayer`, `buildTacticalDraw`, `tacticalModel`).
- `package.json`: the scripts section. `docs/gates.md`: the last two entries.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Everything the spec decides, including its §7 judgement calls: the ping holds still between pings; the enemy's exact ghost goes; the readout's range is to the blip; an enemy that starts out of range has a blip from the start; pings run on game time; an off-screen blip gets an edge arrow labelled `BLIP ~<n>`.
- Drawing only: no sim file, wire schema, hash, golden or version changes.
- The enemy ship only: the derelict and the enemy's torpedo keep today's fading ghost.
- Built in its own worktree `.worktrees/sensors-blip` on branch `sensors-blip` cut from master.
- The numbers are starting values; do not propose retuning them.

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

- **P0**: the plan is unexecutable as a whole, or executing it as written would change the sim, the wire or a golden, or leak the unseen enemy's exact position.
- **P1**: a task will fail at execution as written (typecheck, a missing or differently shaped interface, a quoted anchor that is not in the file, a test that cannot pass), a task consumes something a later task produces, a spec rule is missing or built differently without a stated reason, or a step is ambiguous in a way two implementers would build differently.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
