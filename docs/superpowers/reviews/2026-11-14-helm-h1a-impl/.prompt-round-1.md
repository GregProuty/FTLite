## Role
<!-- reuse -->

The subject is the implementation of H-1a of FTLite's Helm demo, the dev flight view: a `?mode=flight` launch mode (env `FTLITE_MODE`, `npm run dev:flight`) with a local fixed-step runtime around a new single-ship sim step (`stepSoloFlight`), keyboard and pointer input, a follow camera, a pure tactical map-view model, a Pixi layer that draws it with an overlay and a feel panel. It is about to merge to master and become the base for H-1b (the solo duel screens). The standard: correct against the refined H-1 spec and the plan, no regression in the sector game, determinism rules respected in sim code, no leaks or stuck input, and a flight view that behaves well in play (zoom, pan, pause, interpolation).

## What to review

- THE SUBJECT (impl): the diff `master...HEAD` on branch `helm-h1a`, worktree `C:/Users/djuar/FTLite/.worktrees/helm-h1a` (`git diff master...HEAD`; 6 commits: 5 plan tasks and one final-review fix `5939b6e` for wheel accumulation and pump-before-draw).
- The spec: `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (H-1a = §11's first row; §3, §4, §5, §6, §7, §9, §10, §12) and the plan `docs/superpowers/plans/2026-11-15-helm-h1a-flight-view.md` (Decisions section; the plan was Codex-reviewed and the code follows it except the final fix).
- The run dir `docs/superpowers/reviews/2026-11-14-helm-h1a-impl/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Correctness against the spec and plan.** Does the diff do what the subject promises?
2. **Bugs:** off-by-one errors, unhandled error paths, races, lost or duplicated work, resource leaks.
3. **Consistency with existing patterns** in the surrounding code.
4. **Test coverage of the risky paths**, and tests that pass for the wrong reason.
5. (Claude) **The sector game is unchanged** with no mode set: `main.ts` `startSector()` vs master's `start()`, `src/main/index.ts` load paths with `FTLITE_MODE` unset, `package.json` scripts.
6. (Claude) **Runtime timing** (`app/duel/runtime.ts` with `authority/tickDriver.ts`): `driver.pump()` called at the top of `frame()` before the pause toggles are synced (does a pause pressed this frame still let due ticks run once? is that acceptable?), alpha computed once per frame and used for both the camera follow and the draw (`flightMode.ts`), the pause-reason set, and behaviour after a long blur (tick debt catch-up bursts).
7. (Claude) **Input:** the wheel accumulator (100 px per notch, remainder kept, reset after 200 ms idle, sign), key state on blur, preventDefault on Tab/Space/arrows/Backspace, pointer drag mapping through the letterbox, listener cleanup in `dispose`.
8. (Claude) **The model and layer:** grid labels, contour radii, culling thresholds, predicted-path horizon by zoom, bearing ring, off-screen arrows, parallax stars; no display objects created per frame.
9. (Claude) **The sim change:** `stepSoloFlight` and the exported `hitStatics` follow the determinism guard and leave `stepFlight`/`stepDuel` unchanged.

## Reading manifest

- `git -C C:/Users/djuar/FTLite/.worktrees/helm-h1a diff master...HEAD --stat` then the diff per file.
- `src/renderer/src/app/duel/runtime.ts`, `input.ts`, `flightMode.ts`, `mode.ts` (whole files, small)
- `src/renderer/src/render/tactical/camera.ts`, `tacticalModel.ts`, `tacticalLayer.ts`, `feelModel.ts`, `feelPanel.ts`
- `src/renderer/src/sim/tactical/physics.ts`, `contacts.ts` (the changed parts)
- `src/renderer/src/main.ts`, `src/main/index.ts`, `package.json`, `scripts/dev-mode.ts` against `git show master:<path>`
- `src/renderer/src/authority/tickDriver.ts` (unchanged; how `pump`, `setPaused` and debt work)
- tests: `tests/tacticalSoloFlight.test.ts`, `tacticalCamera.test.ts`, `duelInput.test.ts`, `tacticalModel.test.ts`, `tacticalLayer.test.ts`, `flightRuntime.test.ts`
- spec `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (whole, about 170 lines)

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined H-1 spec and the Codex-reviewed H-1a plan are the authority; their (rec.) choices were taken under the owner's standing order and may be questioned only with evidence of a defect.
- H-1a is the flight view only; the duel, Weapons view, interior, Tab presence and restart are H-1b.
- No change to `net/contracts.ts`, `authority/`, `sim/duel/` or sector behaviour.
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

- **P0**: breaks the sector game, makes the sim nondeterministic, or crashes the flight view at startup.
- **P1**: a real bug in ordinary use of the flight view (wrong behaviour, stuck input, leak, wrong drawing), a spec or plan requirement missing or contradicted without saying so, or a test that passes for the wrong reason on a risky path.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
