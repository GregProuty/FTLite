## Role
<!-- reuse -->

The subject is an implementation plan for the FTLite "playtest2feedback" spike, Helm flight. Fresh subagents will execute it task by task, verbatim, in a worktree. It builds:
- a held throttle ramp;
- Newtonian flight for the Cutter;
- cold gas thrusters with a compressor-fed tank;
- mouse steering with a gas-boosted turn;
- the Helm's ENGINE/COMPRESSOR power split;
- the Helm console UI.

The sim must stay bit-identical on Node, Electron and Firefox, and it runs locally and online with one authority. Anything an implementer would have to "check at execution" or guess is a defect. So is any code step that wouldn't compile against the current branch, any task that consumes something a later task produces, and any test that can't pass against the helpers that exist.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-18-playtest2feedback.md` at commit `44205fbf`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec it implements, converged after 3 review rounds: `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md`.
- The format template it follows: `docs/superpowers/plans/2026-11-18-w1-pew-pew.md` (Global Constraints and Task 1).
- Code under `src/renderer/src/`:
  - sim/tactical: `physics.ts`, `predict.ts`, `duel.ts`, `defs.ts`, `tuning.ts`, `hunter.ts`, `state.ts`;
  - sim/duel: `step.ts`, `modules.ts`, `state.ts`, `snapshot.ts`, `throttle.ts`, `scripted.ts`, `scriptedPilot.ts`;
  - net: `contracts.ts`, `codec.ts`;
  - authority: `core.ts`, `checkpoint.ts`, `duelCheckpoint.ts`;
  - app/duel: `input.ts`, `runtime.ts`, `onlineDuel.ts`, `onlineSource.ts`, `scene.ts`, `telemetry.ts`, `controlsList.ts`;
  - render/duel: `situationModel.ts`, `consoleModel.ts`;
  - ui: `ui/duel/HelmStation.tsx`;
  - audio: `audio/soundBank.ts`;
  - the tests under `tests/`.
- The run dir `docs/superpowers/reviews/2026-11-18-2026-11-18-playtest2feedback-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Quoted edit anchors.** The plan says "match every edit by the quoted text". Spot-check that quoted old text exists verbatim on master, especially in `step.ts`, `physics.ts`, `runtime.ts`, `onlineDuel.ts`, `core.ts` and `HelmStation.tsx`.
6. **Determinism and versioning.**
   - Does Task 1's bump-alone-then-bless respect the bless guard (`scripts/golden/blessGuard.ts`)?
   - Does Task 13's gameplay bless work?
   - Is the known-red window (the K list recorded in Tasks 2, 5 and 7, and re-pinned in Task 8) rigorous enough that a real regression can't hide in it?
7. **Arithmetic.**
   - The speed cap and unquantised thrust in `flyShip` must keep the Hunter's and the Valkyrn's flight bit-identical. Check the claim, and that the plan has a test proving it.
   - The integer gas and compressor accumulator.
   - The boost "far" bands (|d| > 4, sin 6°) against the turn step.
8. **The online path (Task 10).** Held fields from the session, the prediction of `thrMille`, and `helmPower` envelopes. Is it consistent with `onlineSource.ts`, `onlineDuel.ts` and the authority's held handling?
9. **The UI (Task 11).** Does the HelmStation layout fit the existing block, and do the jsdom tests match the component's real structure?
10. **The gates (Task 8).** Are the tuning knobs and their bounds sensible? Can the scripted crew realistically win in 3 to 5 minutes, and what happens if tuning doesn't land?
11. **The parallel work.** Master already moved to SIM 54 (pew pew W-1 or Valkyrn work). Does the plan avoid any assumption that conflicts with W-1's or the Engineering spike's changes on master (for example `shipClass(...)` parameters)?

## Reading manifest

- `docs/superpowers/plans/2026-11-18-playtest2feedback.md:L1-L4192`: the subject. Read Global Constraints and Decisions (L1-L70) fully, then each task by range.
- `docs/superpowers/specs/2026-11-18-playtest2feedback-design.md:L1-L410`: the spec.
- `docs/superpowers/plans/2026-11-18-w1-pew-pew.md:L1-L150`: the conventions template.
- `src/renderer/src/sim/tactical/physics.ts:L1-L80`: `flyShip` and `stepFlight`.
- `src/renderer/src/sim/tactical/predict.ts`: the prediction defaults (read the whole file; it's short).
- `src/renderer/src/sim/tactical/duel.ts:L1-L60`: `stepDuel`.
- `src/renderer/src/sim/tactical/defs.ts:L60-L130`: `shipClass` and the classes.
- `src/renderer/src/sim/duel/step.ts`: the whole file, the crew Helm step.
- `src/renderer/src/sim/duel/modules.ts`: the helm module, `DUEL_NOT_SNAPSHOTTED`.
- `src/renderer/src/sim/duel/state.ts:L60-L130`: `createDuel`.
- `src/renderer/src/sim/duel/snapshot.ts:L140-L210`: helm values and restore.
- `src/renderer/src/net/contracts.ts:L30-L100`, `src/renderer/src/net/codec.ts:L140-L160`.
- `src/renderer/src/authority/core.ts:L320-L340`, `src/renderer/src/authority/core.ts:L430-L440`, `src/renderer/src/authority/checkpoint.ts:L35-L45`, `src/renderer/src/authority/duelCheckpoint.ts:L65-L80`.
- `src/renderer/src/app/duel/input.ts`, `runtime.ts`, `onlineDuel.ts`, `onlineSource.ts`: read the ranges the plan's tasks 9 and 10 edit.
- `src/renderer/src/ui/duel/HelmStation.tsx`, `src/renderer/src/render/duel/situationModel.ts`, `src/renderer/src/render/duel/consoleModel.ts`: read the ranges Task 11 edits.
- `scripts/golden/blessGuard.ts`: the version-bump rules.

Read by range (`sed -n`), not whole files, except where noted. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff`, `npx tsc --noEmit -p tsconfig.web.json` and read-only `node -e` arithmetic are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Everything in the spec's owner-decision list (spec L37-L46): Helm only; no drag but gravity; ship-relative thrusters on A/D, Q/E and ←/→ plus ↑/↓; hold for a steady push; LMB steering; gas-boosted turns; the ENGINE/COMPRESSOR split; the Valkyrn unchanged.
- The spec's converged rules (§1-§8) are binding. A plan deviation needs a stated reason.
- The branch is `spike/playtest2feedback` in `.worktrees/playtest2feedback`. Nothing merges until the owner plays it.

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

- **P0**: the plan is unexecutable as a whole, or following it would break determinism, the goldens' bless guard, or the online authority.
- **P1**: a task will fail at execution (tsc, a missing interface, a wrong signature, a quoted anchor that doesn't exist), a task depends on a later one, a test can't pass as written, or a spec rule is dropped or contradicted without a reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
