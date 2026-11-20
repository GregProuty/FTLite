## Role
<!-- reuse -->

The subject is an implementation plan for FTLite's two-player duel, "Helm round 2" (the Hound's crew Helm: a throttle that stays, a tap to cut with a `thrCut` latch, 50 % reverse, drag and stabilise under thrust, a fixed turn, a cold gas charge, the right-click heading and Space auto-face removed; console, map ring, settings, hints, the scripted Helm's cut, a bless and a version bump). It converged after two review rounds against the code at `02b1ef81` (SIM 62). Master then moved: W-4 was bumped to SIM 63 alone (`1b0103a8`) and the sensors blip landed (`926a9a19`). Master was merged into the branch (`2c4f7c5d`), and the plan was re-based onto it: new base, version 63 at the base and the bump 63 → 64, new golden values, moved anchors, and a new Decision 19 on the blip. Fresh subagents will execute it task by task, verbatim, on this branch. So any anchor, quoted code, version number, golden value or check that does not match the code at `2c4f7c5d` is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-20-helm-round2.md` at commit `b3e2e1d8`, worktree `C:/Users/djuar/FTLite/.worktrees/helm-round2`, branch `helm-round2`.
- **What changed since it converged:** `docs/superpowers/reviews/2026-11-20-helm-round2-plan-rebase/rebase.diff` (a prepared `git diff 0c5b8e15 b3e2e1d8` of the plan). Review the changed text closely. Review the unchanged text only for places the re-base should have changed and did not: a left-over 62 that means the base version, a left-over `02b1ef81` that means the code base, and an anchor in a file master changed.
- **What master changed in the code:** `git diff --stat 02b1ef81 2c4f7c5d -- src tests scripts package.json` lists 17 files: `app/duel/scene.ts`, `render/duel/leadModel.ts`, `render/duel/readoutModel.ts`, `render/tactical/fogModel.ts`, `render/tactical/tacticalLayer.ts`, `render/tactical/tacticalModel.ts`, `sim/tuning.ts`, the goldens (`tests/golden/basic.json`, `duel-1.json`, `duel-rematch.json`, `tests/fixtures/determinism-v2.json`) and the tests `engineeringFog`, `sensorsBlip*`, `valkyrnViews`. Every plan anchor in those files must match the code now in this worktree.
- The spec it implements (fixed): `docs/superpowers/specs/2026-11-19-helm-round2-design.md`. The earlier review record: `docs/superpowers/reviews/2026-11-20-helm-round2-plan/` (its six fixes must survive the re-base).
- The run dir `docs/superpowers/reviews/2026-11-20-helm-round2-plan-rebase/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Every anchor in the 17 changed files** (line numbers and the quoted text the plan replaces): Task 4's puffs (`tacticalModel.ts`), Task 8's and Task 10's `scene.ts` edits, Task 10's `readoutModel.ts` COASTING row, Task 11's velocity line (`tacticalModel.ts`) and its draw point (`tacticalLayer.ts`). Does the quoted text exist verbatim at 2c4f7c5d?
6. **Decision 19's claim that the blip does not collide** with Task 10's readout row, Task 11's ring and Task 13's sit card (`sitCardBelow`). Check the readout's row count rule and the scene's count-only `readoutRows` calls; check the layer's draw order.
7. **Version and golden values:** `SIM_VERSION = 63` at the base, the bless at 63, the bump to 64, `basic.json`'s `final f616991e`, the duel-1 and rematch values the plan quotes as "before". Compare them with `tests/golden/*.json` and `git log -1 --format=%B 1b0103a8`. Any left-over 62 or 6aad809e.
8. **Task 1's checks** with the new base: `git merge-base --is-ancestor 2c4f7c5d HEAD`, the code-equality check, and the suite step with no fixed counts. Will they pass on this branch as it stands after the plan's docs commits?
9. **Kind (a) fallout from the blip:** tests added or changed by the blip (`sensorsBlip*`, `engineeringFog`, `valkyrnViews`) that the plan's changes (the velocity ring, the THRUST row, the removed boost puffs, the sit card) could break. Are they in the right tasks' run lists?

## Reading manifest

- `docs/superpowers/reviews/2026-11-20-helm-round2-plan-rebase/rebase.diff:L1-L384`: what changed.
- `docs/superpowers/plans/2026-11-20-helm-round2.md:L1-L111`: header, Global Constraints, Decisions (19 is the blip), coverage.
- `docs/superpowers/plans/2026-11-20-helm-round2.md`: Task 1 (L112), Task 4 (L982), Task 8 (L2192), Task 10 (L2965), Task 11 (L3201), Task 13 (L3456), Task 14 (L3568), Task 15 (L3683), Task 16 (L3746). Grep the rest for `62`, `02b1ef81`, `6aad809e`.
- `src/renderer/src/app/duel/scene.ts`, `src/renderer/src/render/duel/readoutModel.ts`, `src/renderer/src/render/tactical/tacticalModel.ts`, `src/renderer/src/render/tactical/tacticalLayer.ts`, `src/renderer/src/render/tactical/fogModel.ts`, `src/renderer/src/sim/tuning.ts`: the ranges the plan quotes.
- `tests/golden/basic.json`, `tests/golden/duel-1.json`, `tests/golden/duel-rematch.json`: the header lines the plan quotes.
- `tests/sensorsBlip*.test.ts`, `tests/engineeringFog.test.ts`, `tests/valkyrnViews.test.ts`: what the blip tests pin.
- `git log -1 --format=%B 1b0103a8` and `git diff 02b1ef81 2c4f7c5d -- <file>` for any of the 17 files, when a finding needs it.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Everything the spec's §1 owner calls and §11 judgement calls decide: A / D turn; drag 0.15 and stabilise 80 for the Hound, acting under thrust; a fixed turn rate; the cold gas as a shared charge (720, spend 8, wait 30, refill 3, push 70 u/s²); the right-click heading and Space auto-face (and the AUTO-FACE button) leave the player's crew Helm; the throttle stays where it is left, an unattended Helm keeps it; a tap is judged against the throttle at keydown; the latch; reverse 50 %; the bots keep auto-face.
- The build sits on W-4 + master (`2c4f7c5d`, SIM 63) and bumps SIM once, 63 → 64, with the repo's bless pattern.
- The Hunter, the Valkyrn and its Flight seat, and the non-newtonian Helm are unchanged and stay bit-identical.
- Spec §5's gate rule: only the scripted Helm's five named constants may move to fix a per-seed gate; never the Hunter's knobs or the gate bands. The aggregate band stays `it.skip`.
- The fence tests are never edited.

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

- **P0**: the plan is unexecutable as a whole, or executing it as written would break determinism, the online authority, or the Hunter/Valkyrn bit-identity.
- **P1**: a task will fail at execution as written (typecheck, a missing or differently shaped interface, a quoted anchor the branch does not have, a test that cannot pass), a spec rule missing or built differently without a stated reason, or a step ambiguous in a way two implementers would build differently.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
