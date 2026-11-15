## Role
<!-- reuse -->

The subject is an implementation plan for H-1b of FTLite's Helm demo: the solo duel screens. It adds a `?mode=duel` launch mode with a local runtime around the merged duel sim (`stepDuelTick`), and Tab switching between two characters with presence (player 1 starts away). It adds the Weapons console view, with laser charge, steerable missiles and a missile-path predictor. It adds the FTL-style Cutter interior view for repair, readouts, effects and shake, and an end screen with restart. It builds on H-1a, the dev flight view merged at `85a8a6a`. Fresh subagents will execute it task by task, verbatim, with no other context, so anything left to "check at execution" is a defect:
- every interface it consumes must exist on master with the assumed shape;
- every code block must compile under strict TypeScript;
- every test must pass against the code given;
- the sector game and the flight view must be unchanged;
- the plan must implement the H-1 spec's H-1b scope and state any deviation.

The plan's code was prototyped and screenshot-checked; review it on its merits.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-15-helm-h1b-duel-screens.md` at commit `fd651f7`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- The spec: `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (H-1b = §11's second row; §4 runtime incl. solo start, restart, pause reasons; §5 input and Tab; §7 views incl. the missile-path predictor contract, lock marker, readouts, effects and sparks; §8 interior; §10; §12; §13 risk 1) and the parent `docs/superpowers/specs/2026-11-14-helm-demo-design.md` §7, §8, §10, §11a, §12.
- The code it builds on: H-1a in `src/renderer/src/app/duel/` and `src/renderer/src/render/tactical/`; the duel sim `src/renderer/src/sim/duel/` (`state.ts`, `step.ts`, `commands.ts`, `tuning.ts`) and `sim/tactical/` (`missiles.ts`, `weapons.ts`, `state.ts` events); the interior layers `render/{tiles,effects,roomIcons,consoleLayer,crewSprites,boarderLayer,memory,worldFit}.ts` and `render/renderer.ts`; `main.ts`, `src/main/index.ts`, `package.json`.
- The run dir `docs/superpowers/reviews/2026-11-15-helm-h1b-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. (Claude) **Duel commands against the sim's rules**: requestedTick = `d.interior.tick`, per-player sequences, the solo start presence command on tick 0 of every duel, Tab sending presence false/true on one tick, away players cannot sit or stand, the E-press sit rule versus hold-to-repair (spec §5), the lock cycle, laser charge release on blur (the runtime sends `laserCharge {held:false}` on the next unpaused frame at Weapons, plan decision), and what results `stepDuelTick` returns for rejected commands.
6. (Claude) **Restart and the tick epoch**: restart disposes and recreates the driver and the duel, resets every view-owned cache, input edges and sequences (spec §4); the plan's `epoch()` mechanism for the boot to rebuild caches; pause reasons surviving restart; `disposeDuel` called exactly once.
7. (Claude) **The missile-path predictor**: the plan runs the sim's own `flyMissile` on a copy. Check that it cannot mutate live state (deep enough copy, no shared arrays), that it stops at planet/asteroid/edge/expiry per the spec contract, and the tick-for-tick test.
8. (Claude) **The interior view**: reuse of the existing layers outside `createRenderer` (what sector-only state they read), the duel fit leaving a 220-px column, the damage overlay, the allocation test after warm-up, and rebuild on restart.
9. (Claude) **The sector game and flight view unchanged**: the whole-file replacements of `main.ts`, `package.json`, and any H-1a files the plan modifies (e.g. `tacticalModel.ts`, `tacticalLayer.ts`, `runtime.ts`, `input.ts`, tests) must preserve H-1a behaviour; diff them against master.
10. (Claude) **Tests that pass for the wrong reason**, especially in the runtime tests driven by scripted keys.

## Reading manifest

- `docs/superpowers/plans/2026-11-15-helm-h1b-duel-screens.md:L1-L3298` the subject (Scope L21, Global Constraints L33, Decisions L46, File structure L85, Task 1 L111, Task 2 L365, Task 3 L1336, Task 4 L1723, Task 5 L2083, Task 6 L2711, After L3294)
- `docs/superpowers/specs/2026-11-14-helm-h1-views-design.md` (whole file, about 180 lines)
- `docs/superpowers/specs/2026-11-14-helm-demo-design.md:L132-L206` parent §7 and §8; `L207-L265` parent §10 to §12
- `src/renderer/src/sim/duel/step.ts`, `state.ts`, `commands.ts`, `tuning.ts`
- `src/renderer/src/sim/tactical/missiles.ts`, `weapons.ts`, `state.ts:L1-L80`
- `src/renderer/src/app/duel/*.ts`, `src/renderer/src/render/tactical/*.ts` (H-1a, on master)
- `src/renderer/src/render/renderer.ts`, and the heads of `render/tiles.ts`, `effects.ts`, `roomIcons.ts`, `consoleLayer.ts`, `crewSprites.ts`, `boarderLayer.ts`, `memory.ts`, `worldFit.ts`
- `src/renderer/src/main.ts`, `package.json`

Read by range (`sed -n`), not whole files. Do not `ls` or explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. `cat`, `sed`, `grep`, `git log/show/diff` and `node -e` arithmetic checks are fine. Never run the Jest suite (it can hang).
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- The refined H-1 spec and its parent are the authority. The (rec.) choices were taken under the owner's standing order and may be questioned only with evidence of a defect.
- Solo play: one person Tabs between two characters with presence (parent §11a, grill Q24). Standing up shows the FTL-style interior and players walk to repair (Q27). Both consoles are ship-centred minimal vector map views (Q25, Q26).
- H-1 must not touch `authority/` or `net/contracts.ts` (types may be imported), and must not change the duel or tactical sim's behaviour; the duel's authority mode is H-0c-ii.
- Determinism rules apply to the guarded roots (sim, authority, net, clientControl, events, shared). Render, app and input code is outside them.
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

- **P0**: the plan is unexecutable as a whole, breaks the sector game or the flight view, or changes sim behaviour.
- **P1**: a task will fail at execution (tsc error, missing interface, wrong signature, a test that cannot pass as written), an H-1b spec requirement is missing or contradicted without saying so, a duel command is sent in a way the sim rejects in ordinary play, or a test passes for the wrong reason.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
