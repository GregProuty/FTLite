## Role
<!-- reuse -->

The subject is an implementation plan for H-1a of FTLite's Helm demo: the dev flight view (a `?mode=flight` launch mode with a local fixed-step runtime around a new single-ship flight step, keyboard and pointer input, a follow camera, a pure tactical map-view model and a Pixi layer drawing the Helm view, its overlay and a feel panel). Fresh subagents will execute it task by task, verbatim, with no other context, so anything left to "check at execution" is a defect: every interface consumed must exist on master with the assumed shape, every code block must compile under strict TypeScript, every test must pass against the code given, the sector game must be unchanged, and the plan must implement the H-1 spec's H-1a scope, stating any deviation. The plan's code was prototyped and screenshot-checked; review it on its merits.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-15-helm-h1a-flight-view.md` at commit `6dea2ab`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (H-1a = §11's first row; §3 entry, §4 runtime, §5 input, §6 camera, §7 views, §9 flight view, §10 architecture, §12 acceptance) and the parent `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §6, §10, §12.
- The code it builds on and replaces: `src/renderer/src/main.ts`, `src/main/index.ts`, `package.json`, `render/renderer.ts`, `render/theme.ts`, `render/panel.ts`, `render/assets.ts`, `input/sources.ts`, `authority/tickDriver.ts`, `net/contracts.ts` (types `MonotonicClock`, `Scheduler`), `sim/tactical/{physics,contacts,state,predict,map,grid,tuning,direction}.ts`, `tests/render.test.ts`, `tests/boundary.test.ts`, `tests/helpers/determinismGuard.ts`.
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h1a-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **The sector game is unchanged:** the whole-file replacements of `main.ts`, `src/main/index.ts` and `package.json` must preserve today's behaviour exactly when no mode is set (diff them against master), and `scripts/dev-mode.ts` must not affect `npm run dev`/`build`/`dist`.
6. (Claude) **The sim change** (`stepSoloFlight`, exported `hitStatics`): determinism-guard compliant, ship 1 untouched, tick advanced, and no behaviour change to `stepFlight`/`stepDuel`.
7. (Claude) **Runtime and input:** pause-reason set (spec §4), interpolation alpha, preventDefault on Tab/Space/arrows/Backspace, context-menu suppression, pointer wheel/drag mapping to internal pixels under the letterbox, listener cleanup, and that the camera works while paused.
8. (Claude) **The camera and model** against spec §6 and §7: zoom range and easing, follow/free/snap, zoom about cursor versus centre (the plan's decision), predicted-path horizon by zoom, bearing ring threshold, grid labelling (labels always name 500-unit squares), contour radii, culling thresholds, off-screen arrows.
9. (Claude) **Tests that pass for the wrong reason** (assertions too loose to catch a broken implementation), and the allocation test's validity in Vitest's node environment.

## Reading manifest

- `docs/superpowers/plans/2026-11-15-helm-h1a-flight-view.md:L1-L2318` the subject (Scope L21, Global Constraints L32, Decisions L44, File structure L80, Task 1 L103, Task 2 L342, Task 3 L852, Task 4 L1453, Task 5 L1733, After L2311)
- `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (whole file, about 170 lines)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L115-L131` parent §6; `L207-L265` parent §10 to §12
- `src/renderer/src/main.ts`, `src/main/index.ts`, `package.json` (whole files; the plan replaces them)
- `src/renderer/src/render/renderer.ts:L1-L110`, `render/letterbox.ts`, `render/theme.ts`, `render/panel.ts:L1-L60`, `render/assets.ts:L1-L60`
- `src/renderer/src/input/sources.ts:L1-L80`; `authority/tickDriver.ts`; `net/contracts.ts:L1-L40`
- `src/renderer/src/sim/tactical/physics.ts`, `contacts.ts`, `predict.ts`, `state.ts:L1-L60`
- `tests/render.test.ts:L1-L60`; `tests/helpers/determinismGuard.ts`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `node -e` arithmetic checks, and `npx tsc --noEmit` on scratch copies outside the repo are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined H-1 spec and its parent are the authority; (rec.) choices are taken under the owner's standing order and may be questioned only with evidence of a defect.
- H-1 is split into H-1a (this plan: flight view) and H-1b (duel: weapons view, interior, Tab presence, end/restart).
- H-1 must not touch `authority/` or `net/contracts.ts` (types may be imported).
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared); render/app/input code is outside them.
- Commits by explicit path only; the owner keeps unrelated uncommitted files in the checkout.

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

- **P0**: the plan is unexecutable as a whole, breaks the sector game, or makes the sim nondeterministic.
- **P1**: a task will fail at execution (tsc error, missing interface, wrong signature, a test that cannot pass as written), an H-1a spec requirement is missing or contradicted without saying so, or a test passes for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
