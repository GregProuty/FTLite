# Net-3e Task 2 implementation report

Status: DONE, awaiting controller review. Base: `d81f2f91dafe7c6a626da297fb0b941f5372c8f0`. Worktree: `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`.

Commit: `740fc3115e0ef1b436a4bf45f037da74f7158f25` (`feat(network): enforce utility leases at authority boundaries`), exactly 24 source/test/tool files. Post-commit status contains only the controller-owned plan/spec approval edits. This plan workspace remains outside the commit.

## Delivered behavior

- The real utility entry supplies independent monotonic/epoch clocks and cryptographic 16-byte lowercase hexadecimal renewal nonces. Private initialization validates/copies the lease identity, creates the gate closed, installs the runtime and ready response, then explicitly requests the first renewal.
- The generic host process has `onLeaseRequest`, `applyLease`, `invalidateLease`, and `completeBootstrap`. It retains only the newest renewal for late subscribers, retires the older nonce locally, and bounds private requests using the existing stamped request correlation. Utility validates the echoed request/grant and private fence/bootstrap identity. No request timestamp crosses production IPC.
- `OnlinePlatform.startLeasedHost(identity, signal, sessionLease)` requires a valid matching lease identity. Existing `startHost` and actual application's old online wiring remain in place for Task 4. Local/couch callers remain explicitly ungated.
- Authority starts paused when supplied a session gate, and the bootstrap latch rejects ordinary ingress/Resume until explicitly released. Bootstrap release requires open permission and is one-shot for the initial authority; restore cannot release it.
- Gate checks are outside swallowed producer callbacks, before control preparation, each admission, player-control application, and each tick's final preflight. Producer opportunity and admission settlement finish before the driver consumes its next ordinal/debt. Producer exceptions cannot bypass the permission check.
- Fencing latches before callbacks/cleanup, defers reentrant settlement until a completed boundary, settles pending ordinary/control commands as unavailable, clears held inputs, and records existing seal/watchdog/lifecycle/control replay actions. Rejected unadmitted ingress does not advance high water or pollute an enclosing replay frame. Trusted pause cleanup remains available while closed.
- `resetPausedEpoch()` clears only fenced-session deadline ranges/debt, preserves the next simulation ordinal, and remains paused. Ordinary valid-lease five-second stalls still execute all 300 ticks, and existing ordinary pause debt behavior passes unchanged.
- Utility grant application first exposes any old closed permission to the mode. A close occurring inside the grant's own clock sample is recognized by the close-plus-accept revision transition and synchronously delivered through a temporary closed work-gate view before the grant response. This prevents timer starvation from hiding an expiry beneath a useful newer grant. Generic utility code does not mutate simulation fields.
- Trusted native suspend and resume invalidate leased permission. Existing local suspend behavior remains unchanged. OS sleep itself was not exercised.
- Service `request(operation, { signal })` retires local pending correlation/timer/listener/byte ownership on abort. It retains bounded request-ID tombstones to ACK a later reply without granting work or pretending to undo the service operation.

## Interfaces for following tasks

`AuthorityDeps` and `ModeHostDeps` accept optional `sessionGate?: SessionWorkGate`. `ModeHost.completeBootstrap(): void` is required. `HostProcessOptions.sessionLease?: SessionLeaseIdentity` is private, and required by the separate leased online entry. The caller must generate a fresh cryptographic `utilityEpoch` with `randomBytes(16).toString('hex')` for every utility launch; the required identity signature means main supplies that epoch, while the utility generates each renewal nonce. All identity and nonce strings remain strict 32-character lowercase hexadecimal values.

`HostProcessHandle.applyLease(request, grant)` resolves only after the utility's private response. Stale/replaced local renewal requests reject as `stale-lease`; utility refusal rejects as `lease-unavailable`. Subscribe once after native readiness: the latest earlier renewal is delivered immediately. Forward the request nonce unchanged to the service, and echo the complete request back with the validated grant. `invalidateLease(reason)` retires main's pending renewal and forwards the matching utility identity.

The tick-driver fourth argument is an optional `(nextTick, tickTimeMs) => boolean` preflight; a no-argument callback is compatible. The controller explicitly accepted these extra arguments so authority can run its producer opportunity before ordinal consumption while preserving original wall deadlines.

`createHostRuntime` supplies internal `settleSessionFence()` via the existing mode pause boundary and `completeBootstrap()`. `createUtilityHost` additionally accepts utility-only `leaseClock` and `nonce` dependencies; a leased initialization without them fails closed. These are supplied in the shipping utility entry, never renderer IPC.

The service client's pending-plus-aborted-ID ownership remains capped at 64. A very long sequence of aborted requests with no replies can reach capacity until a reply arrives or the connection is replaced. This is an explicit constant-memory policy, not an unbounded cancellation history. Abort uses the existing redacted `stale-connection` error code.

## RED/GREEN evidence

All commands ran in the named worktree on 2026-11-15. Full suite, acceptance, cross-engine replay and combined service/native gates are intentionally deferred to Task 6 per controller direction; no redundant full-suite run was performed here.

1. `npx vitest run tests/authorityLease.test.ts` at 14:40:59 exited 1: six RED tests. The existing authority advanced 120 ticks while closed; bootstrap was absent; unguarded driver consumed 120 ordinals instead of stopping after one.
2. After guard/fence implementation, `npx vitest run tests/authorityLease.test.ts tests/authorityClock.test.ts` at 14:41:59 exited 0: 24 tests.
3. Bootstrap-bypass and restored-mode tests were added before implementation. `npx vitest run tests/authorityLease.test.ts tests/modeHost.test.ts` at 14:42:33 exited 1 with two failures (player Resume advanced high water before bootstrap; mode bootstrap absent). At 14:42:47 the same command exited 0: 22 tests.
4. `npx vitest run tests/utilityHost.test.ts tests/hostProcess.test.ts` at 14:43:27 exited 1 with three RED cases: no first renewal, unsafe leased fallback without utility clock/nonce, and main rejected renewal notifications. At 14:44:29 it exited 0: 29 tests.
5. `npx vitest run tests/roomServiceClient.test.ts tests/onlinePlatform.test.ts` at 14:45:13 exited 1: abort did not settle the renewal (test timed out) and leased-only entry was absent. At 14:46:01 it exited 0: 64 tests. A later extension verifies that abort also removes the old five-second request timeout.
6. Reentrant publication fencing test at 14:47:29 failed with replay-result divergence. Root cause: an unadmitted unavailable reply was appended to the active tick's replay results. The explicit nonjournaled reply fix passed `npx vitest run tests/authorityLease.test.ts` at 14:47:44 (8 tests), and root typecheck passed.
7. Admission-settlement fencing test at 14:48:35 failed: a duplicate-result callback closed permission but one tick still executed. Moved admission/held/callout preparation before final tick preflight, and made each leased admission its own completed journal boundary. The 10-file focused run at 14:48:50 passed 228 tests.
8. Self-review found unseen expiry during utility timer starvation and blocked trusted pause cleanup. `npx vitest run tests/authorityLease.test.ts tests/utilityHost.test.ts` at 14:53:48 failed both new cases (authority stayed running after a useful regrant; trusted pause reason remained session-fenced). After fixes, the authority/utility/mode run at 14:54:46 passed 38 tests, and typecheck passed.
9. Exact expiry-inside-receipt and OS-resume forwarding were verified RED at 14:56:11: `npx vitest run tests/utilityHost.test.ts tests/hostProcess.test.ts` failed the two cases. The receipt-transition handling was temporarily removed to observe the regression and restored after RED. At 14:56:38 utility/host/service tests passed 89 tests and typecheck passed.
10. Final covering command at 14:57:22 exited 0: 23 files, 376 tests. It includes all requested task files, all authority suites, replay v2/v3, checkpoint suites, Task 1 gate tests, affected online fixtures, transport window, and sector stream coverage:

```text
npx vitest run tests/authorityLease.test.ts tests/authorityClock.test.ts tests/authority.test.ts tests/authorityBoundary.test.ts tests/authorityRecovery.test.ts tests/authorityIngress.test.ts tests/authorityEvents.test.ts tests/authorityDisconnect.test.ts tests/replayV2.test.ts tests/replayV3.test.ts tests/checkpointV2.test.ts tests/checkpointStartup.test.ts tests/checkpointBots.test.ts tests/sessionLease.test.ts tests/utilityHost.test.ts tests/hostProcess.test.ts tests/modeHost.test.ts tests/networkBoundary.test.ts tests/roomServiceClient.test.ts tests/onlinePlatform.test.ts tests/sectorStream.test.ts tests/onlineCoordinator.test.ts tests/transportWindow.test.ts
```

11. Final `npm run typecheck` exited 0. Final `npm run build` immediately following the covering run exited 0 for main, preloads and renderer. Earlier intermediate typecheck errors for required test-fixture interfaces, narrowed initialization typing and one duplicate fixture method were resolved before these final gates.
12. `git diff --check` passed; only Git's existing LF-to-CRLF normalization advisories appeared.

## Native evidence

Final built production source digest: `0899ea3eb2ba6b55a30acce14f5fa72dfa0397af85573b9c1d7346ec394c7a94`.

```text
npx tsx scripts/network/lease-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native.json
npx tsx scripts/network/lease-smoke.ts --probe=fault --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native-fault.json
npx tsx scripts/network/lease-smoke.ts --probe=timeout --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native-timeout.json
```

- [Normal native report](lease-native.json): exit 0, PASS, Electron 37.10.3, launcher 16,918ms, actual main-thread stall 16,009.4268ms. Utility first renewal observation 143.1704ms, last gameplay mutation 12,128.1342ms: 11,984.9638ms after request observation, before its 12,000ms upper deadline. The authority stopped at tick 711/high-water `[108, 0]`; 36 later ingress attempts were observed and all 36 rejected unavailable. Last gameplay state remained fixed and held inputs neutral.
- Fresh grant remained paused; observed fenced debt of one tick was reset to zero only on regrant. Explicit player Resume then advanced five ticks with no expired-session catch-up.
- Separate delayed-grant utility rejected a still-matching renewal after at least 16,340ms. The test wrapper deliberately withholds subsequent five-second renewal timer opportunities in that second utility, preserving the current nonce while real production utility clocks measure the delay. This is disclosed in the report; production timing/permission code is unchanged.
- Two actual utility exits were observed before normal success, zero windows remained, and launcher verified owned PIDs absent and removed its exact isolated temporary directory/profile.
- [Fault report](lease-native-fault.json): intentional fault, exit 1, fixed `injected-fault` native diagnostic, one utility/one observed exit, zero windows; process and temp cleanup true. Final rerun duration 485ms.
- [Timeout report](lease-native-timeout.json): intentional launcher timeout, exit 1, fixed `launcher-timeout` diagnostic; killed only this invocation's native process tree and verified owned PIDs absent; process and temp cleanup true. Final rerun duration 2,738ms.

The native harness wraps the built shipping `authorityHost.js` entry with test-only utility-local publication/ingress observation and PortLink ACKs, so main's block does not hide authority evidence behind transport backpressure. It uses controlled grants, not a service. It records bounded aggregate evidence rather than unbounded packet histories. Normal launch has a 55-second child deadline within the 60-second launcher budget; the actual runs complete far below that bound. Fault/timeout modes cannot return success.

Real-service re-host proof, actual OS suspension, cloud/live TURN, two-machine internet verification, and app switch are NOT RUN / outside this task. No secrets, deployment, upgrades, merges, pushes, owner checkout edits or unrelated cleanup occurred; the old policy-rejected directory was not touched.

## Self-review and remaining scope

Reviewed nonce/identity validation and epoch ownership, initial request ordering, private response capacity, abort listeners/timers, driver ordinal/debt order, replay outcomes, reentrant settlement, ordinary pause behavior, restore/bootstrap separation, missed-expiry regrant handling, trusted power callbacks, native process exits and exact temporary ownership. The regressions discovered during review were fixed with the RED/GREEN evidence above.

No known blocking concerns. Controller should review the gate-to-mode missed-expiry bridge and replay seal semantics particularly closely. Task 3 owns baseline capture/commit coordination; Task 4 must switch the actual online owner to `startLeasedHost`, subscribe/cancel renewal work, generate fresh cryptographic utility epochs, and release bootstrap only after its initial committed checkpoint. Saved-session UI and online-owner resume behavior remain for later tasks.

## Review fix round 1 (base 740fc31)

Status: R1 and R2 fixed; explicit bot-input coverage from R3 added. R4 remains the documented existing LF-to-CRLF advisory. Fix commit: `f86ab6b2b9505340847a3c8633d817efce08c833` (`fix(network): fence each control and bound native lease cleanup`), exactly ten source/test/tool files. Post-commit status contains only controller-owned plan/spec edits. Controller review: [task-2-review.md](task-2-review.md).

### R1: control callback fencing and explicit replay v4

The reviewer reproduced the semantic gap correctly: permission was checked only before taking the queue, and remaining player controls stayed in the local captured queue when a result callback closed the gate. Each protected control now checks permission, including a final check after the last result callback. If permission closes, the accepted prefix completes without publishing Resume, the remainder returns to the queue, and existing seal/watchdog/lifecycle frames reject it unavailable and publish the trusted paused state. Control revision advances only for the accepted prefix and actual trusted lifecycle effects.

The controller explicitly ruled that the demonstrated partial-drain serialization limitation warrants a minimal replay revision, rather than treating expected result records as executable instructions. Replay **v4** adds exactly the paired optional fields `{ processedCount: <nonnegative safe integer>, fenced: true }` to a `controls` action. The count means the number of ordered control records in the accepted prefix, including any trusted lifecycle records; playback validates it against the actual queued count. The pair must occur together, unknown keys are rejected, and v2/v3 reject the new metadata. Existing subsequent seal/watchdog/lifecycle actions represent rejection and pause. Expected results remain verification outputs and never steer replay.

Recording remains v2/v3 until the first interrupted control drain requires v4; it then stays v4 for that authority. Existing v2/v3 playback remains supported. Explicitly upgrading an unchanged v2 or v3 journal to v4 produces the same replay result. Tests cover a one-control final-callback fence, two-control fences from explicit invalidation/clock expiry/reentrant input, exact accepted-prefix/revision behavior, unavailable suffix results, no running publication, malformed or out-of-range counts, incomplete metadata pairs, and unknown keys.

Downstream impact: `ReplayV4` joins the public `Replay` union and is exported by the authority replay module. `CrashRecord.replayVersion` records the actual version; sector crash diagnostics now forward that value instead of hardcoding 3. No checkpoint, SIM, gameplay protocol or recovery metadata version changed. Task 3 should preserve the opaque replay version in diagnostics; ordinary checkpoint payloads remain checkpoint v2. Repository source/tool searches found no additional v2/v3-only runtime consumers needing migration.

### R2: one launcher deadline, including cleanup

The launcher now creates one absolute monotonic deadline: 60,000ms for ordinary runs, with ten seconds reserved from native execution for cleanup. `lease-smoke-lifecycle.ts` bounds the target exit, the killer process itself, emergency termination observation, filesystem removal and each explicit retry/backoff against that same deadline. Recursive deletion uses zero built-in retries so no independent linear retry schedule can outlive the budget. Killer waits reserve the tail of the shared deadline for terminating and observing the exact owned helper/target. Deadline failures produce fixed `cleanup-timeout`/`launcher-deadline` diagnostics and nonzero exit.

A final watchdog stays armed until process exit. It is unref'ed after reporting so a fully cleaned invocation exits promptly, but any lingering child/filesystem handle is still subject to the original whole-launcher bound. Its emergency termination targets only this invocation's known native child and exact utility PIDs. Temporary targets are still resolved/checked under the exact `ftlite-lease-smoke-` directory; removal only follows confirmed native-process cleanup.

The new `cleanup-timeout` probe shortens the same total budget to 5,000ms, launches a real native utility, and injects a killer wrapper that performs the actual owned-tree kill but deliberately remains alive. This verifies that the killer's own wait cannot keep the launcher alive indefinitely. The helper also has a focused real-process test with an injected sleeping killer, plus a test that an earlier stage's elapsed time reduces the cleanup stage's remaining budget.

### R3/R4 and evidence association

The explicit bot expiry test uses the real `createBotClient` and `createClientRun`. It first admits bot held input, then publishes an unresolved event so the bot produces both a held frame and a real vote command. Those decisions are queued before expiry; after expiry, tick, command high water and held high water stay fixed, and held state becomes neutral. This closes the indirect-producer coverage gap without touching files merely to satisfy filenames. Unchanged authorityClock/networkBoundary suites remain in the focused verification set, consistent with the controller's file-organization ruling.

Every refreshed native report now includes `provenance.commit`, SHA-256 maps for 21 relevant source/harness files and 20 built main/preload/renderer artifacts. The commit field identifies the pre-fix checkout head because the evidence run precedes commit; the exact source hashes identify the executed fix state. All 41 hashes in each of the four final reports were recomputed and matched the final files before commit. This pins utility entry, generic utility/runtime, main bridge, native wrappers and loaded bundles in addition to the gameplay content digest.

`git diff --check` passes with the same recorded LF-to-CRLF normalization advisories. No warning-free claim is made.

### Fix-round RED/GREEN and final commands

1. At 15:10:36, `npx vitest run tests/authorityLease.test.ts` exited 1: three new two-control regressions failed because the second Resume returned `applied` after the first result callback fenced permission. The direct bot case passed against the already implemented ingress gate.
2. After the initial R1 fix, the 15:11:17 authority/replay/clock run reported 53 passed and one failure in existing trusted-pause-while-closed coverage. The final post-result check was incorrectly applied to a trusted-pause-only drain. Restricting that check to protected records fixed it. The 15:11:56 authorityLease/replayV2/replayV3/authorityClock/networkBoundary run passed 87 tests.
3. At 15:13:46, `npx vitest run tests/leaseSmokeCleanup.test.ts tests/replayV3.test.ts` observed RED for the absent deadline-cleanup helper; the 14 migration/backward-playback tests passed. At 15:14:37, `npx vitest run tests/leaseSmokeCleanup.test.ts` passed both tests, including the actual sleeping killer and shared-budget case.
4. The first native cleanup-timeout attempt before rebuilding exited early with `native-probe-failed` at 478ms: the changed source digest did not match the older built runtime. This was not accepted as the cleanup-timeout proof. After `npm run build` succeeded, the intended probe returned `cleanup-timeout`, exit 1, process/temp cleanup true at 4,013ms. Final evidence was refreshed again after launcher self-review.
5. Final focused run at 15:18:36 exited 0: **6 files, 92 tests**. Final root `npm run typecheck` exited 0. Final `npm run build` exited 0. No full suite was run, as instructed.

```text
npx vitest run tests/authorityLease.test.ts tests/replayV2.test.ts tests/replayV3.test.ts tests/authorityClock.test.ts tests/networkBoundary.test.ts tests/leaseSmokeCleanup.test.ts
npm run typecheck
npm run build
npx tsx scripts/network/lease-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native.json
npx tsx scripts/network/lease-smoke.ts --probe=fault --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native-fault.json
npx tsx scripts/network/lease-smoke.ts --probe=timeout --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native-timeout.json
npx tsx scripts/network/lease-smoke.ts --probe=cleanup-timeout --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native-cleanup-timeout.json
```

The refreshed normal 16-second proof was necessary because R1 changes production authority behavior. Final gameplay content digest is `eca2c1ba88b7c43f9f8ef0a1e0fe1c4a49abc4bddb92278c8683fd7524281df7`.

- [Normal](lease-native.json): exit 0, PASS, total 17,074ms; main stall 16,008.4061ms; last utility gameplay mutation 11,990.1876ms after first request observation; tick 710; 36/36 post-deadline attempts rejected; delayed matching grant rejected; fresh grant stayed paused with zero debt; explicit Resume advanced five ticks; 2/2 utility exits and zero windows.
- [Fault](lease-native-fault.json): exit 1, injected fault, 598ms; process/temp cleanup true.
- [Timeout](lease-native-timeout.json): exit 1, `launcher-timeout`, 2,782ms; process/temp cleanup true.
- [Slow killer cleanup timeout](lease-native-cleanup-timeout.json): exit 1, `cleanup-timeout`, 4,030ms under its 5,000ms total deadline; process/temp cleanup true. This is the required dedicated negative cleanup proof, not another normal stall run.

Self-review covered final-callback closure, held/rejected bot traffic, accepted-prefix counting, trusted pause retention, legacy playback, version promotion without downgrade, crash diagnostic version propagation, pending filesystem work under the watchdog, bounded killer termination and exact artifact hash association. No known blocking concerns remain. Controller plan/spec changes remain unstaged; no external services, secrets, deployments, upgrades, owner checkout changes or unrelated cleanup occurred.

## Review fix round 2 (base f86ab6b)

Status: R5 fixed, awaiting controller re-review. This round changes exactly the authority core, replay action/parser, and two focused test files. Controller review: [task-2-rereview-1.md](task-2-rereview-1.md). Commit: `c157a30ad2807ea20917125e782ca80398615431` (`fix(authority): settle queued trusted resumes when fencing`).

R5 was reproduced as described: an earlier trusted Resume remained in `controlQueue` when `settleFence()` began. The protected-control guard broke before reaching the appended trusted pause; the settlement path then published running state and omitted the pause's revision. The bootstrap case also reproduced when its first permission sample was useful but the clock expired before the queued bootstrap Resume applied.

Fence sealing now discards pending trusted Resume intents before adding/applying its trusted pause. Ordinary seals keep their existing behavior. To make this external lifecycle decision replayable without changing legacy semantics, replay v4 permits one additional optional field on a seal action: **`discardLifecycleResumes?: true`**. The flag is emitted only when a fence seal actually removes queued lifecycle records whose `paused` value is false. Those discarded intents do not increment control revision or resume gameplay; queued trusted pause records are preserved, and the ensuing fence pause applies normally.

The controller explicitly accepted this narrowly scoped v4 seal metadata. It is strictly literal `true`, unknown keys are rejected, and v2/v3 reject it. Playback uses the explicit seal flag, never expected results. A flagged seal without a queued trusted Resume produces action divergence; it cannot silently become an ordinary no-op seal. New tests also prove that ordinary v2/v3 seals still preserve a queued trusted Resume for the following controls action. The v4 controls cutoff contract from round 1, checkpoint v2, SIM and gameplay protocol remain unchanged. Downstream Task 3 consumers should accept the updated `ReplayAction` seal shape when retaining v4 journals; no generic checkpoint/mirror payload interpretation changes.

### RED/GREEN and verification

1. At 15:25:28, `npx vitest run tests/authorityLease.test.ts` exited 1: two new regressions failed. Queued trusted Resume produced `{ phase: 'running', pauseReason: null, controlRevision: 1 }` instead of paused/revision 2; expiry before bootstrap control application produced running/revision 0 instead of paused/revision 1. The other 15 tests passed.
2. After the fence-seal fix, the five-file focused run at 15:25:54 passed 70 tests and root typecheck passed.
3. Added strict flag/unknown-key/cross-version/no-op semantic checks and explicit legacy seal-preservation tests. Final focused command at 15:26:49 exited 0: **5 files, 72 tests**. Final typecheck and build both exited 0.

```text
npx vitest run tests/authorityLease.test.ts tests/replayV2.test.ts tests/replayV3.test.ts tests/utilityHost.test.ts tests/modeHost.test.ts
npm run typecheck
npm run build
npx tsx scripts/network/lease-smoke.ts --report-path=.superpowers/sdd/2026-11-15-net-3e-recovery-internet/lease-native.json
```

4. The affected normal native proof was refreshed after the build: exit 0, PASS, total 16,908ms. Main stalled 16,002.9054ms; the last utility gameplay mutation occurred 11,990.3185ms after the first request observation, before its 12,000ms upper deadline. Authority stopped at tick 712/high-water `[108, 0]`, rejected all 36 post-deadline attempts, rejected the delayed matching grant, stayed paused on fresh grant with zero debt, and advanced five ticks only after explicit Resume. Both utility exits were observed; zero windows and process/temp cleanup true.
5. [Refreshed normal report](lease-native.json) records digest `43e1dc6d2bd7065f23f0fd5f9fa1396250c373d401378f725fea5f4dd8b09659`. All 21 source and 20 built-artifact hashes were recomputed after the run and match the final files. Its checkout commit is the pre-fix head; exact file hashes identify the tested round-2 source snapshot.
6. Cleanup harness code did not change, so the round-1 fault, timeout and slow-killer reports were retained without rerunning, as directed. They remain evidence pinned to their prior tested source/artifact snapshots; only the normal report represents the current authority build. No full suite was run.
7. `git diff --check` passes with the already documented LF-to-CRLF advisories.

Self-review checked discard selection before callbacks, preservation of trusted pauses, closed-gate rejection of later Resume requests, lifecycle ordinal/revision behavior, promotion to v4 only when needed, explicit replay effects, strict malformed/cross-version rejection and unchanged legacy seal behavior. The queued-Resume and bootstrap-expiry tests compare completed replay checkpoints with live checkpoints. No known blocking concerns remain. Parent plan/spec edits stay unstaged, with no external service, deployment, credentials, owner checkout or unrelated cleanup work.
