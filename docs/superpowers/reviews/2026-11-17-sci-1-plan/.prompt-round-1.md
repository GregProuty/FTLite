## Role
<!-- reuse -->

An implementation plan (13 tasks, 4382 lines) for Sci-1 in FTLite (Electron + PixiJS 8 + React/zustand UI overlay + TypeScript, vitest; a deterministic lockstep/rollback duel sim): an Artemis-style Science job. The enemy starts unidentified in Patrol and turns hostile after 20 s or on an ambush hit; a derelict contact with loot is salvaged by flying close and slow; one ship scanner runs two-level scans from Science, Helm or Weapons (Science faster); Weapons tunes a laser frequency A/B/C. SIM_VERSION 44 -> 45 in the Artemis-ii two-step, with golden blessing. Fresh subagents will execute each task verbatim, seeing only that task's text, so code that would not compile, tests that cannot pass against the real helpers, or anything left to 'check at execution' is a defect. The spec was already reviewed to convergence.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-17-sci-1-science-scans.md` at commit `0379cb98`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements: `docs/superpowers/specs/2026-11-17-science-scans-design.md` (reviewed to convergence; its review run is docs/superpowers/reviews/2026-11-17-science-scans-spec). Precedents: `docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md` (SIM_VERSION two-step, MIGRATIONS, bless) and `docs/superpowers/plans/2026-11-17-enemy-ship-window.md` (the contact window).
- `src/renderer/src/sim/tactical/`, `src/renderer/src/sim/duel/`, `src/renderer/src/net/`, `scripts/golden/` (duelOracle, canonical-trace, bless), `src/renderer/src/app/duel/` (input.ts, controls.ts, contactController.ts, duelMode.ts, onlineDuel.ts, scene.ts), `src/renderer/src/ui/` (store, actions, views, duel/*, stage/*), `src/renderer/src/render/duel/` (consoleModel, consoleLayout), `src/renderer/src/render/tactical/` (tacticalModel, tacticalLayer, hullModel, dashModel, crtTheme, camera), and `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-17-sci-1-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. For each task, check its Interfaces Consumes against the source and the earlier tasks' Produces (names, parameter and return types), and that every code block compiles against the real signatures (grep them).
6. The two-step: Tasks 1-5 claim the oracle stays `same` and goldens unchanged (dormant rules at neutral values). Verify each dormant claim (e.g. Patrol never entered, scanner always true, salvaged 1, no new rng draws before Task 6) and that the oracle/bless commands and their expected outputs match scripts/golden and package.json.
7. Task 6 (behaviour on, same-version bless, re-pinned scripted values, gates): is the rule for fixing old tests (makeHostile) strict enough that an implementer cannot silently weaken a test? Are measured values given rules, and does a gate-band failure stop and report (no band edits, no retune)?
8. Determinism: every new field in the science module in spec 6.2 order, the clone builds fresh containers, validation widened, the derelict trig via dirBetween only.
9. Presentation tasks 7-12: layout numbers (fourth tab, Weapons block 248, contact window 420, Science block) do not overlap existing UI per consoleLayout; the contact controller re-key keeps the enemy-window behaviour (aim, Esc, intercept) for Helm/Weapons; online and single-player wiring both send the new commands; the React tests match how existing .tsx tests render.
10. Task order: no task consumes something only a later task produces.

## Reading manifest

- docs/superpowers/plans/2026-11-17-sci-1-science-scans.md:L1-L4382 (the subject; read task by task)
- docs/superpowers/specs/2026-11-17-science-scans-design.md (the spec, about 180 lines)
- docs/superpowers/plans/2026-11-17-artemis-ii-throttle.md (grep bless, MIGRATIONS, oracle)
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

- Everything in the spec's section 2 (owner decisions) and its reviewed rules.
- SIM_VERSION 44 -> 45 in two steps; gate bands are never edited and nothing is retuned without the owner.
- CRT amber presentation; Sci-1 keeps two players (Sci-2 adds the third online seat).

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

- **P0**: the plan would break determinism or the online replica, or is unexecutable as a whole.
- **P1**: a task will fail at execution (tsc error, missing or misnamed interface, wrong signature, a test that cannot pass), a task consumes something only a later task produces, a spec requirement is dropped without a stated deviation, or existing tests would break.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
