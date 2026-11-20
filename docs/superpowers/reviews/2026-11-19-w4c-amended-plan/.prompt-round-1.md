## Role
<!-- reuse -->

The subject is an implementation plan, W-4c, for FTLite's two-player duel: the crew ship's (the Hound's) mouse-flown MANUAL torpedo, and the SIM_VERSION bump that closes W-4. It converged in review before, and has now been edited to follow a spec amendment and the revised W-4b plan that runs before it: two mode flags (`pewManual`, `gunManual`) in place of one (`gunsManual`), `gunMode {slot, manual}`, R and Shift+R in place of Z, V retired at the Hound's Weapons seat, and E / Q moved to a target room. Fresh subagents will execute it task by task, verbatim, on branch `w4-weapons-controls` after W-4b's fourteen tasks. So any code block, test or anchor that still assumes the old shapes, or that does not match what the revised W-4b plan leaves on the branch, is a defect.

## What to review

- THE SUBJECT (plan): `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md` at commit `e2ce19cb`, worktree `C:/Users/djuar/FTLite`, branch `master`.
- **What changed since it last converged:** `docs/superpowers/reviews/2026-11-19-w4c-amended-plan/w4c-amendment.diff` (a prepared `git diff` of the plan, 864ca5a5 to e2ce19cb, 37 hunks). Review the changed text closely and the unchanged text only for places the amendment should have changed and did not.
- The plan that runs before it, whose results W-4c builds on: `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md` (its "Seam for W-4c" section and Tasks 3 to 12).
- The specs: `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md` (the amendment; it wins) and `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (W-4; §7 is the manual torpedo).
- **The code W-4c edits will be the W-4 branch after W-4b**, which does not exist yet. Today's branch is in the worktree inside this repo, `.worktrees/w4/` (at `3b2a90c5`: W-4a and W-4b Tasks 1 and 2). Judge W-4c's anchors and interfaces against today's branch code for anything W-4b does not touch, and against the W-4b plan's own code blocks for anything W-4b changes. Master's copy of the source is older and must not be used.
- The run dir `docs/superpowers/reviews/2026-11-19-w4c-amended-plan/` holds `ledger.md` and every round's output.

## What to check, in priority order

1. **Executability against the actual branch.** For every interface the plan consumes (methods, signatures, types, schemas, helpers, exports), grep the source and confirm it exists with the assumed shape. A task that would fail to compile or import as written is a P1.
2. **Spec conformance.** Where the plan deviates from the spec, is the deviation stated and justified?
3. **Task ordering and dependencies.** Does any task consume something a later task produces?
4. **Test adequacy.** Can the tests the plan writes pass against the helpers that exist, and do they cover the risky paths?
5. **Agreement with the revised W-4b plan's seam.** Every shape W-4c anchors on (the `handControl` body, the `pewFire` AUTO refusal line, the online source's `turret(slot)` call, the online held frame, the Hound branches' mode block and `modeRequests`, the keys) must match the W-4b plan's "Seam for W-4c" and the W-4b task that produces it, text for text where W-4c quotes text to replace.
6. **Left-over old shapes.** Any remaining `gunsManual`, `gunMode {manual}` without a slot, Z as the guns' mode key, V as the Hound's torpedo mode key, `'weaponMode'` as KeyZ's action, a shared gun tag, E / Q stepping `torpLock` at the Hound's seat, or an old W-4b task number.
7. **Launching a MANUAL torpedo in tests, smokes and the gate entry.** At the Hound's seat it is now: select the torpedo, R, then F (or the left button). Check every test, smoke step and manual-gate line that sets the torpedo to MANUAL or a gun to MAN.
8. **The guns during a flight (W-4 §7, amendment §2.6).** No gun in hand whatever the two flags say; both fight on AUTO; R and Shift+R still work during a flight; `pewFire` refused `missile-in-flight` after the `pewManual` refusal. Is each still tested with the two flags in every combination that matters?
9. **A / D selection around a flight with E / Q now the target room.** Does anything in W-4c's seat task still read `requests.torpStep` or the contact controller's old E / Q path at the Hound's seat?
10. **The SIM bump task's merge note.** The branch is cut from SIM 60 and master is at 61; the plan's own mechanics stay V to V + 1 and the note says the merge controller bumps to 62. Is the note placed where the executor and the merge controller will see it, and does it contradict any step?

## Reading manifest

- `docs/superpowers/reviews/2026-11-19-w4c-amended-plan/w4c-amendment.diff:L1-L790`: what changed.
- `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md:L1-L1574`: the subject (header and Decisions L1-L116; Task 1 L117, Task 2 L188, Task 3 L512, Task 4 L699, Task 5 L940, Task 6 L1229, Task 7 L1319, Task 8 L1422).
- `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L1-L110`: the W-4b header, Global Constraints, Decisions and the Seam for W-4c.
- `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md`: Task 4 (from L627, `handControl`, `gunMode`), Task 6 (from L1203, the keys, `modeRequests`, the Hound branches, the smokes), Task 7 (from L1702, the `pewFire` refusal), Task 9 (from L2760, the prediction), Task 12 (from L3310, E / Q). Grep for the shapes W-4c quotes.
- `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md:L1-L424`: the amendment.
- `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md:L390-L425`: §7 the manual torpedo; grep the rest as needed.
- `.worktrees/w4/src/renderer/src/sim/tactical/` (`state.ts`, `weapons.ts`, `missiles.ts`, `manualTorpedo.ts`, `turret.ts`), `.worktrees/w4/src/renderer/src/sim/duel/step.ts`, `.worktrees/w4/src/renderer/src/app/duel/` (`runtime.ts`, `onlineDuel.ts`, `onlineSource.ts`, `weaponsSeat.ts`, `scene.ts`, `input.ts`, `torpedoCamera.ts`), `.worktrees/w4/src/renderer/src/net/`, `.worktrees/w4/src/renderer/src/authority/`, `.worktrees/w4/src/renderer/src/ui/duel/WeaponsStation.tsx`, `.worktrees/w4/src/renderer/src/app/controlsList.ts`: read the ranges the plan's tasks quote.
- `.worktrees/w4/tests/`: grep for the test files the plan's tasks name (`manualTorpedo*`, `w4*`) and their helpers.

Read by range, not whole files. Do not explore beyond this manifest unless a finding requires it, and say so under `not_verified` if you do.

## Constraints
<!-- reuse -->

- Read-only. Do not modify any file. Do not run `codex`. Read, Grep and Glob are the tools. Never run the test suite.
- Do not read `.env*`, `secrets/`, `node_modules/`, `.pnpm-store/`, or any credential or key file.
- Be specific. Every finding's `evidence` cites the subject by line (`spec L<n>`, `plan L<n>`, or `file:L<n>` for code) and, where the claim is about the codebase, the source file and line. No generic advice.

## Fixed decisions
<!-- reuse -->

These were made by the owner and are not up for reversal. Flag a violation of one; do not propose replacing it.

- Everything the amendment spec decides, and everything in the W-4 spec's §16 Decisions and owner-answered §17 items that the amendment does not replace.
- W-4c keeps its eight tasks and their order.
- The MANUAL torpedo is flown by holding the left button; during a flight no gun is in hand and every powered gun fights on AUTO.
- Z and V do nothing at the Hound's Weapons seat; R flips the selected weapon's mode and Shift+R sets both guns.
- The plan's own version mechanics (V to V + 1 alone in its last task); the merge to master bumps again and is not this plan's.
- The plan's git rules, commit-message convention, known-red window mechanism and fallout rule.
- The Valkyrn and the Hunter stay bit-identical. The fence tests are never edited.

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

- **P0**: the plan is unexecutable as a whole after W-4b, or executing it as written would break determinism, the online authority, or the Valkyrn/Hunter bit-identity.
- **P1**: a task will fail at execution as written (typecheck, a missing or differently shaped interface, a quoted anchor that neither the branch nor the W-4b plan produces, a test that cannot pass), a left-over old shape that changes behaviour, a spec rule missing or built differently without a stated reason, or a step ambiguous in a way two implementers would build differently.
- **P2**: should fix, not blocking.
- **P3**: nit.

At most 12 findings; prefer fewer verified ones over many speculative ones. If you are unsure whether something is a problem, put it under `not_verified` rather than inventing a finding.
