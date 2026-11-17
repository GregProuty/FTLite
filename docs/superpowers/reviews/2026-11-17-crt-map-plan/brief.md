## Role
<!-- reuse -->

The subject is the implementation plan for the CRT map in FTLite (Electron + PixiJS 8.19 + TypeScript + React UI overlays, vitest): the console views (Helm map, Weapons map, flight view) become an amber CRT ship display (a CRT setting, an amber ramp, dash/hatch helpers, readout emphasis, the tactical layer in amber with a pixi-filters bloom, React CRT screen and bezel, wiring, verification). Fresh subagents will execute each task alone, verbatim, in the worktree `.worktrees/crt-map`, so code that would not compile or pass as written, a missed caller, or an interface the plan assumes but the branch lacks is a defect. Nothing may change the deterministic sim.

IMPORTANT: the plan was prototyped on master c439423; the branch has since merged newer master (HEAD 869a27e), which brought the art spike (painted-ship tokens/fire, changes in renderer.ts, interiorFeel.ts, duel/interiorView.ts) and newer React UI work. Check every edit the plan makes (exact old strings, line anchors, file contents it replaces) against the files as they are NOW on the branch.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-17-crt-map.md` at commit `6cb6345` (content unchanged at HEAD 869a27e), worktree `C:\Users\djuar\FTLite\.worktrees\crt-map`, branch `crt-map`.
- The spec: `docs/superpowers/specs/2026-11-17-crt-map-design.md` (refined in `docs/superpowers/reviews/2026-11-16-crt-map-spec/`, converged).
- The code it changes: `src/renderer/src/render/tactical/*`, `src/renderer/src/render/duel/readoutModel.ts`, `src/renderer/src/render/renderer.ts`, `src/renderer/src/app/duel/*`, `src/renderer/src/app/feelBoot.ts`, `src/renderer/src/main.ts`, `src/renderer/src/ui/` (views.ts, store.ts, duel/*.tsx, stage/*.tsx, any region files), `package.json`, `tests/`, `docs/gates.md`.
- The run dir `docs/superpowers/reviews/2026-11-17-crt-map-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Drift since the prototype:** every replace-this-with-that edit in Tasks 4-6 (renderer.ts, scene.ts, flightMode.ts, duelMode.ts, main.ts, DuelUi.tsx, FlightUi.tsx, views.ts, store.ts, ReadoutPanel, Panel, Bar, Banners, MapOverlay, FeelPanel) still matches the current file text exactly; new fields required on DuelUiView/FlightUiView are set by every producer and fixture on the current branch (grep tests and probes).
6. **Every colour in console views** (the plan's Decision 2 list) against the current tactical layer and overlays, including anything master added since c439423.
7. **Determinism boundary and guards:** no sim/authority/network/shared changes; artGuards and uiBoundary test counts the plan expects (+9, +2) against the current guards.
8. **The test counts and baseline** (prototype 4040 -> 4097) against the current branch's suite, which master has grown.
9. **pixi-filters** dependency addition (version pin, lockfile), the jsdom test for the filter.

## Reading manifest

- docs/superpowers/plans/2026-11-17-crt-map.md:L1-L2487 — the subject (L1-L184 header, decisions, files, Step 0; L185-L417 Task 1; L418-L607 Task 2; L608-L775 Task 3; L776-L1261 Task 4; L1262-L1972 Task 5; L1973-L2186 Task 6; L2187-L2487 Task 7 and notes)
- docs/superpowers/specs/2026-11-17-crt-map-design.md — the spec
- src/renderer/src/render/tactical/tacticalLayer.ts, fxModel.ts, tacticalModel.ts; render/duel/readoutModel.ts; render/renderer.ts; render/theme.ts
- src/renderer/src/app/duel/scene.ts, flightMode.ts, duelMode.ts; app/feelBoot.ts; main.ts
- src/renderer/src/ui/views.ts, store.ts, duel/*.tsx, stage/*.tsx
- tests/ (grep for DuelUiView, FlightUiView, duelProbeFixture, crt, ReadoutPanel)
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

- The console screens become an amber CRT ship display (owner, 2026-11-17).
- Readability first; the default strength keeps thin lines readable.
- Presentation only: no sim, command, snapshot or authority change; SIM_VERSION and goldens unchanged.
- The interior (on foot) view keeps its current look.
- The spec as refined (converged) is the contract; the plan may state justified deviations.

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

- **P0**: the plan is unexecutable as a whole, or following it would change the deterministic sim.
- **P1**: a task will fail at execution (tsc, missing interface, wrong signature, an edit whose old text no longer exists, a missed caller or fixture, a test that cannot pass as written), a step is ambiguous in a way two implementers would build differently, a visible regression, or the plan silently deviates from the spec.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
