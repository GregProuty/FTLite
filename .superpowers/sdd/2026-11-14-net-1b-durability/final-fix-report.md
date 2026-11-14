# Net-1b combined final fix report

Implementation commit: `eaf8986` (`fix(net): enforce restore lifecycle and bounded resume recovery`), based on `1a755f8` on `codex/net-1b`. This report is committed separately after implementation so it can identify the implementation commit. No subagents, owner-checkout changes, fixture blessing, external setup or broad gate runs.

## C-001: supported external restore lifecycle

- Public `Authority.restore` now rejects any attached binding before validation, allocation or live mutation. The old live run and its producers remain usable after this unsupported call. Restore uses the checkpoint's exact publication/event/control cursors; the obsolete live-cursor maximum has been removed.
- The headless owner validates the entire detached checkpoint plus its same-run/layout/player-ownership constraints before teardown. Invalid snapshot, bot memory and ownership checkpoints preserve the original view, UI, bots and playable authority.
- Successful headless restore detaches the binding, disposes the old client replica, closes both old sessions without draining queued traffic, restores the authority, and creates fresh sessions/client/bots before attachment. Old reliable packets/results, authority ingress and old bot references cannot continue into the restored run.
- Saved bot repeat/decision timestamps are reinstated; absent memory starts fresh. Command and held counters are synchronized to the restored sealed ledger, including saved producer memory that had generated unadmitted commands. Cached terminal vote rejections reconcile optimistic UI state before publication.
- Direct authority tests now explicitly detach/close/recreate sessions for supported restores. Corrupt-checkpoint validation tests detach before calling restore so the new lifecycle guard does not mask validation coverage. Existing cached purchase/vote, held freshness and terminal-state tests remain intact and pass.

## C-002: bounded resume recovery

- A paused authority supplies a per-control-drain recovery set to the same ledger used by replay. At exhausted ordinary allowance, only explicit `setPaused(false)` can queue, at most once per player before controls drain. Ordinary traffic still has the 16-command per-player/tick allowance.
- Recovery retains ownership/run/sequence/duplicate/conflict/requested-tick checks and the existing 256 pending/link/ingress bounds. Only successfully queued recovery consumes its slot; stale admission still consumes/caches its sequence according to existing ledger semantics. Duplicates reuse their result and never apply twice.
- Recovery leaves persisted `admissionCounts` at 16. Repeated restores cannot add gameplay commands in that tick. After a successful resume, ordinary admission renews only when the simulation advances to another tick. If another player's pause keeps the run paused, a completed control drain permits another bounded recovery.
- Spec sections 3, 5 and 10 document the lifecycle and controller-approved cap exception. The task-4 integration report's obsolete attached-client assumption is explicitly amended.

## Red/green evidence

Before production edits:

```text
npm test -- tests/restoreRecovery.test.ts tests/checkpointV2.test.ts tests/checkpointBots.test.ts
```

Exit 1: **8 failed / 22 passed**, 3 files, 1.05s Vitest duration. Failures reproduced attached-client restore silently succeeding; saturated control and sealed-gameplay checkpoints rejecting resume; repeated restore failing recovery; recovery traffic remaining over-capacity/expected-sequence; headless retaining old views/producers; headless accepting mismatched ownership; and publication cursors incorrectly retaining newer abandoned history. Fresh-client lifecycle and invalid snapshot/bot preservation checks already passed on the original implementation.

After the scoped production fixes, the same command exited 0: **30 passed**, 3 files, 1.08s. Additional regressions cover the 256 pending bound, checkpoint repeat/counter normalization, recovery renewal after another player's pause, and the headless saturated-checkpoint public flow.

An intermediate typecheck caught removal of `core.cursors`, which the deterministic harness still consumes. That method was restored; no harness caller changed. One supplemental test initially advanced UI repeat timestamps beyond the live simulation before checkpointing; the checkpoint correctly rejected it. The test now probes future repeat behavior on a detached UI clone. Neither remains failing.

## Final focused verification

```text
npm test -- tests/restoreRecovery.test.ts tests/checkpointV2.test.ts tests/checkpointBots.test.ts tests/checkpointStartup.test.ts tests/replayV2.test.ts tests/authority.test.ts tests/authorityRecovery.test.ts tests/authorityClock.test.ts tests/authorityEvents.test.ts tests/authorityIngress.test.ts tests/authorityBoundary.test.ts tests/netLedger.test.ts tests/loopback.test.ts tests/simDisposal.test.ts tests/botClient.test.ts tests/cardController.test.ts tests/golden.test.ts tests/netParity.test.ts tests/determinismHarness.test.ts
```

Exit 0: **201 tests passed across 19 files**, 4.32s Vitest duration. Includes 14 new restore/recovery tests, supported lifecycle cached purchase/vote retries, complete replay-checkpoint equality for recovery boundaries, existing 2,000-cycle disposal/sentinel verification, golden/parity and deterministic harness unit coverage.

```text
npm run typecheck
git diff --check
git diff --cached --check
```

All exit 0 after the final implementation. Git reported only the existing CRLF normalization advisory for the integration report/new test; no whitespace errors.

## Remaining validation and scope

No known failing focused checks. The controller owns the single scoped re-review and fresh full tests/typecheck/build/acceptance/real-browser determinism gates. Those full/browser gates were intentionally not run here. SIM_VERSION remains 35, MAX_PLAYERS remains four, golden final remains `b87a0284`, and neither golden nor determinism fixtures changed. No network epochs, command IDs, wire schemas, general live rollback or broader control budget were introduced.
