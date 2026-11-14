# Net-1b final scoped re-review — Round 2

Scope: fixes only, `1a755f8..9b8fddd` (implementation `eaf8986`, report `9b8fddd`), against C-001/C-002 and the explicit controller rulings in `final-fix-brief.md`. Inspected the review package, final implementation, changed tests and documentation. This is not another whole-branch review.

**Verdict: approved for this scope. C-001 and C-002 are ADDRESSED. No new important breakage identified in the fix.**

## C-001 — ADDRESSED

`authority/authority.ts:59` rejects restore while any producer binding remains attached, before checkpoint validation, allocation or mutation. The obsolete live-cursor maximum and automatic reattachment are removed; supported restore continues from the checkpoint's exact cursors. This enforces the specified lifecycle instead of attempting seamless live rollback.

`headless/runner.ts:90-109` validates and detaches the checkpoint data and checks same-run/player ownership before retiring the current producers. Layout/content validation occurs in the common validator. Successful restore explicitly detaches the binding, disposes the old replica, closes old sessions without draining their queued traffic, restores the owner, and constructs fresh client/bot producers and sessions. Command/held counters are reconciled to the sealed ledger; saved repeat/decision memory is retained when present and absent memory starts fresh. Cached vote rejections are reconciled before fresh publication. Getter accessors expose the current UI/bots after replacement.

The focused regressions verify transactional rejection of an older checkpoint with an advanced attached client, continued usability of that old client, supported fresh-client resume, disposal of borrowed views, retirement of old bot references, discarded authority ingress/reliable packets/results, repeat timing/counter normalization, and preservation of the old usable owner after invalid snapshot/bot/ownership input. Existing purchase/vote retry tests now follow detach/recreate lifecycle and retain their deduplication assertions. Invalid-checkpoint tests explicitly detach first, so the lifecycle guard does not mask validation failures.

## C-002 — ADDRESSED

`authority/ledger.ts:52-65` implements the authorized narrow recovery allowance. Only an explicit resume can exceed an exhausted ordinary budget, and only if that player has not queued a recovery since the last control drain. Normal identity, sequence, duplicate/conflict and requested-tick checks remain; the 256 pending cap still applies. Only successfully queued recovery consumes the allowance, and it does not change the persisted ordinary admission count.

`authority/core.ts:180` supplies that allowance only while paused, and `:194` clears it at the control drain. Live admissions and replay share this code. No new wire schema, epoch, command ID, simulation version or general gameplay-cap change is introduced. The specification and integration report document the explicit controller-approved exception and the supported restore lifecycle.

The regressions cover saturated control and sealed pending-gameplay checkpoints, successful same-tick resume, unchanged gameplay rejection/counts, repeated restores without extra gameplay budget, duplicate/conflict/stale/unowned/wrong-run traffic, the pending-cap boundary, renewal only after another control drain, and complete replay-checkpoint equality. The owned headless public flow also resumes a saturated checkpoint through its recreated client.

## Verification and remaining limits

Reviewer executed:

```text
node node_modules/vitest/vitest.mjs run tests/restoreRecovery.test.ts tests/checkpointV2.test.ts tests/checkpointBots.test.ts --reporter=dot
```

**34/34 tests passed, three files, 1.08s, exit 0.** Also verified HEAD `9b8fddda183dd9ff32d2c241210635053e1d8eb5`, a clean tracked working tree, and `git diff --check 1a755f8 9b8fddd` (exit 0). The implementation report separately records 201 focused tests across 19 files and successful typecheck; those broader checks were not rerun by this reviewer.

No code/index/branch edits, broad suite or browser reruns, fixture changes or subagents. Final full tests/typecheck/build/acceptance/real-browser gates remain the controller's next step. Prior physical-controller, OS minimize/suspend, Safari/JSC, ARM and other platform gaps are unchanged. This scoped approval does not certify those platforms or the pending final all-gate run.
