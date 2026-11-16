# Net-3e Task 5: saved-session UI and explicit re-host

Implemented on `codex/net-3` in `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, from reviewed Task 4 base `c0f3445`. Source/test commit: **`a2618fe`** (`feat(net): restore committed sessions through explicit rehost`). Nineteen exact source/test files were staged. The controller's `progress.md` remains unstaged and was not edited by this implementer.

## Result and interfaces

- Added strictly validated `{type:'rehost'}`, named preload `rehost(): Promise<OnlineResult>`, and `saved`, `saving`, `rehosting` phases. The existing renderer bridge spreads the named API; no generic RPC, payload/grant/token import or privileged gameplay Resume was added. Existing `no-checkpoint` is sufficient; no new service error or protocol revision was introduced.
- Added `OnlineSessionOwner.prepareExit(): Promise<void>` and trusted `resume(): Promise<void>`. `suspend()` sends utility invalidation before retirement. OS resume invalidates any remaining utility, reconnects the saved seat and never sends gameplay Resume or bootstrap completion. Player Resume remains the existing gameplay-client pause command.
- Saved transitions retain room snapshot, role, logical seat and last committed receipt. Losing the retry budget retains this information too; an unauthenticated saved context offers Reconnect rather than Re-host. Service-reported active lease state disables Re-host. Saved contexts keep their service subscription and refresh committed metadata; receipt age remains monotonic and is displayed as time since local receipt.
- Manual claim validates authenticated service GET bytes before claiming. Expected generation comes from the service snapshot. A confirmed winner reads the latest committed GET again, validates room/run/compatibility/hash/checkpoint and fixed crew count, creates a fresh leased utility, restores paused, requests a paused baseline and commits it under the new generation before attaching any local/remote producer. `completeBootstrap` remains exclusively in initial Start. Native full-state ACK gates remain unchanged.
- `validateSectorMirror(mirror, capacity?)` now optionally checks the room's exact fixed player count for recovery. This matters because capacities one/two can share Skiff compatibility. Generic mirror storage and service code still do not decode sector payloads.
- A fresh mirror coordinator owns each restored generation. Old pending uploads are cancelled; old private pending bytes cannot replace the post-claim GET. New-generation sequence starts at one when no baseline exists. A losing claimant follows the service-declared host and creates no utility. `host-changed` retires old ports/peers/producers and reconnects using the existing token, without claiming. Native factory ownership includes a gameplay epoch so host loss during a delayed factory cannot resurrect retired authority.
- Renderer disposal drops old client outboxes but retains the frozen state/UI/seat until the first validated replacement publication. Saved/rehosting UI shows committed tick, receipt age, possible rollback, separately labelled uncommitted local progress, Reconnect/Re-host/Leave/Forget, restoring copy and paused restore copy. Existing wrapped-strip sizing and letterboxing were preserved.
- Final capture, local adoption/persistence and upload share one monotonic 3,000ms budget. `prepareExit` installs its shared promise before publishing saving status, preventing reentrant Leave/quit callbacks from duplicating captures. Timeout starts host release and existing bounded native cleanup without waiting for a hung save. Forget cancels immediately and retains the existing serialized credential/mirror clear. A small `registerOnlineExit` helper wires normal window close and app `before-quit` to the same preparation/disposal and prevents repeated callbacks from bypassing or duplicating it.
- Addressed Task 4's minor finding: mirror load and downloaded validation preserve fixed `save-too-large` rather than collapsing it into unavailable. Tests cover both mirror-coordinator diagnosis and owner saved-session status.

## Connection-preserving claim ruling

Source inspection found that `RoomAuth.join` increments seat generation and retires its socket. `RoomLifecycle.rosterChanged` fences an active host whose connection/generation no longer matches its lease. Therefore unconditionally reconnecting a successful claimant would revoke the authority just won.

The controller explicitly approved the following integration in this task:

1. A validated own-host `host-changed` event supplies the actual acknowledged service snapshot. Keep this authenticated connection.
2. If the successful claim reply was lost, query ownership with a fresh `lease-renew` on that same connection and validate its identity/nonce/deadline before constructing authority. This main-process confirmation grant is **never** forwarded as utility work permission. The new utility independently originates its own nonce/request-start and receives its own renewal.
3. If no definitive host-changed snapshot exists, reconnect to the service and adopt its actual state. This can fence an uncertain own claim; remain saved and require another explicit Re-host. Never infer success from timeout, the claim reply alone, or arithmetic. A competing service winner is followed without creating local authority.

No service endpoint, socket protocol or service-client API extension was needed. Tests cover lost reply with event, absent event, two contenders, conflict, invalid-state rejection, obsolete departure and burned generation. An owned claim whose post-claim payload is corrupt releases its lease and returns to a recoverable state.

## RED/GREEN evidence

All times below are local Vitest output times on 2026-11-15.

1. **16:20:34** `npx vitest run tests/onlineRecovery.test.ts`: RED, 12 failures. Missing saved identity, rejected rehost action, absent prepareExit, and absent trusted suspend behavior. The native/service boundaries are injected; restores execute the real production authority/checkpoint code.
2. **16:21:05** contract/mirror/renderer/menu run: RED, 4 failures / 67 passes. Rehost contract rejected, oversized load diagnosis collapsed, frozen presentation disposed on replacement, saved receipt UI absent. The renderer test was corrected to distinguish the replica from the separately owned frozen allocation; it then retained the intended lifetime assertion.
3. **16:24:28** recovery/coordinator/mirror/contract integration: 92 passed / 6 failed. One recovery assertion incorrectly referenced `checkpoint.runId`; checkpoint2 stores this at `checkpoint.init.runId`, so the assertion was corrected without changing serialization. Four old coordinator expectations deliberately changed from cleared error state to retained saved state. The remaining guest retry regression was fixed, preserving automatic ordinary transport recovery.
4. **16:26:10** IPC/bridge/renderer/menu: 38 passed / 2 failed. New OS resume assertion showed the owner method was not called; lifecycle wiring fixed it. The old renderer assertion required disposing the frozen view immediately on attach; it was updated for the approved preserve-until-valid-state behavior while retaining disposal of the old replica and no old command replay.
5. **16:27:11** recovery/coordinator/IPC/renderer: GREEN, 70 tests.
6. **16:28:19** expanded recovery: RED, 2 failures / 15 passes. Post-claim corruption did not release the won lease; reentrant saving observers caused 1,206 captures. Explicit failed-activation release and promise installation before status callbacks fixed both. **16:28:44** recovery/coordinator: GREEN, 50 tests.
7. **16:29:21** new quit lifecycle test: RED, helper absent. **16:29:43** exit/recovery/renderer: GREEN, 28 tests; typecheck also passed.
8. **16:30:56** late-native-factory regression: RED, a retired restore still constructed one authority. Gameplay epoch fencing fixed it; **16:31:10** focused GREEN.
9. **16:31:35** saved-identity regression: RED, retry exhaustion erased seat/snapshot; oversized owner-status case already passed. Retained saved status and authenticated-context capability gating fixed this.
10. **16:31:52** covering run: GREEN, **226 tests / 14 files** (command below).
11. **16:32:58** invalid-state claim rejection: RED, status remained rehosting. Failure handling now returns to saved even for this fixed service code. **16:33:11** recovery/coordinator/exit: GREEN, 55 tests.
12. **16:34:12** wrong fixed capacity: RED, valid one-seat checkpoint for the two-seat room created authority before failing. Optional mode capacity validation now rejects it during preflight. **16:34:27** final affected run: GREEN, **59 tests / 4 files** (recovery22, coordinator33, exit1, sector3).

Initial typecheck also found ordinary TypeScript control-flow narrowing across asynchronous event mutation and one fixture literal widening. Explicit snapshot reads and fixture `ok: true as const` fixed these; no suppressed compiler errors were added.

## Verification

Final distinct covering total is **228 tests across 14 files**. The covering run contained 226 tests before the last two recovery regressions; all four subsequently affected files passed in the final 59-test run. Other files were unchanged after their covering run.

```text
npx vitest run tests/onlineRecovery.test.ts tests/onlineCoordinator.test.ts tests/onlineSessionContract.test.ts tests/onlineIpc.test.ts tests/onlineBridge.test.ts tests/onlineRenderer.test.ts tests/sessionMenu.test.ts tests/onlineExit.test.ts tests/onlineMirrors.test.ts tests/onlinePlatform.test.ts tests/roomServiceClient.test.ts tests/onlinePeers.test.ts tests/onlineRetry.test.ts tests/onlineSector.test.ts

npx vitest run tests/onlineRecovery.test.ts tests/onlineCoordinator.test.ts tests/onlineExit.test.ts tests/onlineSector.test.ts
```

- Latest `npm run typecheck`: PASS after the final source change.
- Latest `npm run build`: PASS after the final source change; existing pinned dependencies, no upgrades.
- `git diff --cached --check`: PASS before source commit. Git emitted only existing/configured LF-to-CRLF advisories.
- No full root-suite rerun, service build/deploy or native recovery run was performed for this focused Task 5 scope. No service source changed.

## Self-review, limitations and Task 6 handoff

Self-review checked strict public boundary, actual generation selection, lost-success confirmation, pre/post-claim validation, private pending exclusion, paused commitment before producer attachment, late factory fencing, stale event identity, retry retention, save deadline/reentrancy and Forget cleanup ordering. No known blocking concern remains for Task 5.

The test service is an injected atomic model; the existing 59 service-client tests and unchanged reviewed service contracts cover parsing/fencing boundaries. It is not a replacement for the next native gate. Task 6 must kill the actual authority, recover on Skiff and sparse Cutter, capture actual saved/rehosting/paused UI at normal/small sizes, verify first-state ACK and explicit gameplay Resume, and record source-pinned replay/hash/resource evidence. No actual recovery screenshots are claimed here.

Task 6 can invoke `window.ftlite.online.rehost()` through the existing named preload surface and observe public `phase`, `snapshot`, `ownSeat`, `mirror`, `attachmentEpoch`. New UI test IDs are `rehost`, `mirror-status`, `pending-save`, `rollback-warning`, and `mirror-error`; existing `status`, `pause`, `forget-seat` remain. `registerOnlineExit` is now part of the real app lifecycle and should be included in native source pinning.

Filesystem writes and already accepted service commits cannot be undone by cancellation. The existing serial file ownership and late-write/Forget fencing remain in force. Pending local data is labelled and never imported into an existing room; no export feature was added.

Protocol2, SIM_VERSION35, checkpoint2 and existing replay2/3/conditional replay4 ruling remain unchanged. No gameplay re-bless, acceptance threshold change, HTTPS capability, live TURN, secrets, cloud action, deployment, merge, push, owner-checkout edit or unrelated cleanup occurred.
