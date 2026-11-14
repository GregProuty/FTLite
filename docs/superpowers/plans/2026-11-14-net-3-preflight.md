# Net-3 Recovery Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Remove the two independently identified recovery hazards before adding real transports and saved-session orchestration.

**Architecture:** Keep the existing authority executor and journal. Make link teardown safe at completed replay boundaries, and prevent a faulted partial state from becoming a resumable checkpoint.

**Tech Stack:** TypeScript, Vitest, byte loopback and existing authority/replay v2.

**Spec:** Approved `docs/superpowers/specs/2026-11-13-net-1-foundations-design.md` sections 3, 5, 8 and 10; `docs/superpowers/specs/2026-11-13-networking-decision.md` Net-3; independent findings F-1/F-2 in `docs/superpowers/reviews/2026-11-14-net-1b-opus-review.md`. User authorized merge and moving on to networking on 2026-11-14.

## Global constraints

- SIM_VERSION 35, MAX_PLAYERS 4, golden b87a0284 and existing fixture vectors unchanged.
- No raw-input bridge, mid-tick producer wait, new command ID, wire epoch, gameplay changes or widened admission budget.
- Preserve the completed-boundary restore lifecycle, bounded resume recovery and exact replay/ledger semantics.
- Do not change concurrent Helm code, owner checkout edits or Cloudflare credentials. No deployment in this preflight.
- Reproduce Opus hypotheses before treating them as verified defects; use real loopback overflow where feasible, not only a synthetic callback.

### Task 1: Complete disconnect cleanup and reject faulted checkpoints

**Files:** `src/renderer/src/authority/core.ts`, `authority/checkpoint.ts`; focused tests in `tests/authorityRecovery.test.ts`, `tests/replayV2.test.ts`, `tests/checkpointV2.test.ts` or a dedicated `tests/authorityDisconnect.test.ts`. Change narrowly related files only when required by a demonstrated lifecycle dependency.

**Contract:** A synchronous Link.close during a result/event/publication send must never leave half-detached authority state. Defer cleanup until the current journal frame completes; remove ingress, finish affected pending/control results as unavailable, clear that player's held input, unsubscribe once, and journal the boundary so production replay matches. Repeated close and owner unsubscribe are idempotent. No recursive nested begin or stale processing of disconnected entries from captured loops; inspect drain/controls/tick loops carefully. Respect frame ordering: the outer frame captures its own final state before the detach frame. Failure cleanup must remain safe when a frame faults before completion.

A faulted authority cannot seal a new resumable checkpoint, and external checkpoint validation rejects phase:error. Keep the CrashRecord last-good checkpoint and optional snapshotAfterFault for diagnostics; do not remove crash diagnostics or claim the partially executed state is healthy. Replaying a completed prefix stays supported.

- [ ] Write meaningful regressions for F-1: force reliable queue overflow while a replay frame is active, verify no crash caused by nested journal boundaries, held neutral, no orphan pending/control ledger entries, idempotent cleanup and replay checkpoint equality. Exercise already queued ingress and at least control/publication closure; add tick-result coverage if a separate path matters.
- [ ] Write F-2 regressions: inject a real authority fault, checkpoint() refuses without further mutation; validateCheckpoint rejects a well-shaped error-phase checkpoint; last-good CrashRecord checkpoint restores and resumes using the supported detached-producer lifecycle.
- [ ] Run focused tests to record expected red failures, then implement the minimal fixes.
- [ ] Run changed suites plus authority/replay/checkpoint/loopback/disposal/golden/parity tests and typecheck. Preserve all expected fixtures and gameplay comparisons. Commit with a report of exact commands/results.
- [ ] Obtain independent task review and address material findings. Run final full tests/typecheck/build once the fixes are stable; record that the merged Helm+Net-1b baseline is 1732 tests/135 files, 60.40s Vitest (slightly over the prior Net-1b-only 60s timing budget), not a performance regression claim against identical coverage.

## Next deliverable

The Net-3 internet-session spec follows the approved WebRTC/Cloudflare topology and the completed account handoff. It must resolve delayed command admission, secure room/seat authentication, Electron process ownership, bounded state deltas, reconnect/bot handoff, checkpoint fencing and re-hosting before implementation. Net-3 does not implement Net-4 prediction or Net-6 WSS gameplay relay.
