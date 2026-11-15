# Net-3d Task 4 report

Status: DONE

Commit: `37ef32a feat(net): coordinate local online rooms and guest reconnect`.

Implemented in `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, base `01ea483`.

## Implementation

- Main session owner with fixed public errors, detached safe statuses, 64 bounded status listeners, one active operation, explicit last-value ready coalescing, and epoch-checked completion/cancellation.
- Host/Join persist the issued token before connecting or publishing lobby success. Storage failure retains the active credential with `persistent:false,error:storage-write-failed`. Startup reads the saved seat for Reconnect availability. Reconnect checks configured origin and uses only the original token and stored compatibility.
- Join probes compiled Skiff then Cutter only on incompatible. Sector init uses capacity (including sparse/vacant seats), seed 2026, default characters and empty unlocks; committed init, digest/layout/run/hash/lease identity and exact baseline values are validated before utility allocation.
- Standalone owned transport exists before service connection/start. Native link-issued registration calls startAttempt synchronously. Equal-generation host link issuance is serialized; native plus service route readiness is required before Start. Offered peer endpoints stay private until commitment.
- One authority utility is created for duplicate event/reply commitment. Host-local and guest streamed ports stay separate; host-local cap derives from RTC framing constants. Guest ports use the native negotiated cap. Authority startup and local attachment finish before attaching guests; attachPeer acceptance is not treated as full-state sync.
- Native attempt-close subscription emits once per retiring pending/ready attempt, bounds observers at 64 and removes them on disposal. Peer identity is removed before intentional close, so old callbacks cannot retire replacement attempts.
- Guest losses use a fresh service/transport context and original token, with backoff 1/2/4/8/cap8 seconds inside a total 30-second monotonic budget including factories, connection and sync. RetryAfter is preserved; terminal errors stop. Explicit Retry creates a new budget. A later guest loss after successful reconnect starts another fresh attempt.
- The epoch-checked renderer view-state hint completes only the local reconnect watchdog/display bookkeeping, per controller ruling. It cannot grant native/service readiness, create/resume authority, change producer ownership or bypass the existing full-state ACK ingress gate.
- Host renews every five seconds with one nonce per request and an expiry watchdog; invalid/failed renewal, own service/transport/utility loss, suspend, or clock discontinuity stops authority. Guest loss/issuance failure alone leaves healthy host authority alive. Active host reconnect fails host-lost and cannot recreate a utility.
- Leave preempts busy work and retains the seat, with best-effort host-release. Forget enqueues serialized removal immediately after cancellation and fences replacement operations until disposal/clear finish. Late native factory returns are disposed; unresolved factories are bounded at four across cancellation generations. Repeated dispose callers wait for the same cleanup. Automatic retry continuations check the retiring owner epoch, including reentrant Leave from a status observer.

## Exact consumer interfaces

`src/main/network/onlineSession.ts` exports:

```ts
interface OwnedOnlineTransport {
  controller: TransportController;
  onExit(callback: () => void): () => void;
  dispose(): Promise<void>;
}
interface OnlinePlatform {
  createTransport(identity: HostIdentity): Promise<OwnedOnlineTransport>;
  startHost(identity: HostIdentity, signal: AbortSignal): Promise<HostProcessHandle>;
  channel(): { port1: MessagePortMain; port2: MessagePortMain };
  publishPort(descriptor: OnlinePortDescriptor, port: MessagePortMain): void;
  onVisibleGone(callback: () => void): () => void;
}
interface OnlineSessionDeps {
  config: OnlineConfig;
  seatStore: SeatStore;
  service(): RoomServiceClient;
  platform: OnlinePlatform;
  clock: OnlineClock;
  scheduler: OnlineScheduler;
  nonce(): string;
}
interface OnlineSessionOwner {
  dispatch(action: OnlineAction): Promise<OnlineResult>;
  status(): OnlineStatus;
  subscribe(callback: (status: OnlineStatus) => void): () => void;
  suspend(): Promise<void>;
  dispose(): Promise<void>;
}
function createOnlineSession(deps: OnlineSessionDeps): OnlineSessionOwner;
```

- `RoomServiceClient` is the actual `ReturnType<typeof createRoomServiceClient>`; provide a fresh client per factory invocation with active main config. Do not inject a different test-only networking composition in the app.
- `OnlineClock` is `{nowMs():number; epochMs():number}`: monotonic for budgets, wall epoch for service grants/tickets. `OnlineScheduler` is `{setTimeout(callback:()=>void,ms:number):unknown;clearTimeout(handle:unknown):void}`. Both types are exported from onlineRetry and re-exported from onlineSession. `nonce()` supplies 32 lowercase hex characters from random 128-bit material.
- `publishPort` must throw on unsuccessful transfer; coordinator retains/closes the endpoint until the call succeeds. Descriptor epoch is monotonically increasing across replacements. Status epoch is zero before attachment. Native adapter must retain exit observation after readiness and own the underlying transport window; wrapping only startGuestTransport's controller loses that ownership.
- `subscribe` registers future changes; callers can obtain the initial detached value with `status()`. Initial saved-seat read may emit an asynchronous availability update. Full IPC sender/port validation remains Task5.
- Sector exports: `sectorCompatibility(capacity:number):RoomCompatibility`, `sectorJoinCompatibilities():readonly RoomCompatibility[]`, `sectorInit(snapshot:RoomSnapshot):RunInit`, `validateCommittedSectorStart(snapshot:RoomSnapshot,committed:CommittedStart):Promise<RunInit>`.
- Retry export: `createOnlineRetry(clock:Pick<OnlineClock,'nowMs'>,scheduler:OnlineScheduler)` returns `{run(attempt:(signal:AbortSignal)=>Promise<void>,onWait:(retryAtMs:number)=>void):Promise<void>;cancel():void}`. RetryAt is monotonic clock time.
- TransportController adds `onAttemptClosed(callback:(attemptId:string)=>void):()=>void`. It reports failure, replacement, explicit close and disposal exactly once for attempts actually admitted; coordinator filters intentional retirement by current identity.
- OnlinePeers is coordinator-internal: `createOnlinePeers(OnlinePeersDeps)` exposes `issued`, `reconcile`, `closed`, `serviceReady`, `signal`, `ready`, `allReady`, `dispose`. `OnlinePeer` includes seat/attempt identity, owned port, latestPayloadLimit and transfer ownership marker.

## TDD and verification

1. Initial RED: `npx vitest run tests/onlineCoordinator.test.ts tests/onlinePeers.test.ts tests/onlineRetry.test.ts tests/onlineSector.test.ts`.
   Exit 1: all four suites failed on missing implementation modules, as expected before source existed.
2. Native loss RED: `npx vitest run tests/rtcTransportOwner.test.ts`.
   Exit 1: 8 passed, new pending/ready retirement test failed because `onAttemptClosed is not a function`.
3. Coordinator expansion RED: `npx vitest run tests/onlineCoordinator.test.ts`.
   Exit 1: 14 passed, 3 failed. Reconnect was offered without a saved seat; subsequent guest loss did not launch a new attempt; terminal error during reconnect incorrectly looped until test timeout. Fixed saved-seat availability, completed recovery state and terminal-error propagation.
4. Peer expansion RED: `npx vitest run tests/onlinePeers.test.ts`.
   Exit 1: 1 passed, 2 failed. Start readiness ignored service route readiness; stale failed signal after replacement invoked fatal callback. Added serviceReady gate and current-peer rejection handling; issuance loss now retires only that guest.
5. Cancellation bounds RED: `npx vitest run tests/onlineCoordinator.test.ts`.
   Exit 1: 18 passed, 2 failed. Forget had not enqueued clear while cleanup was pending; fifth unresolved native factory did not reject at capacity. Added cancellation/clear fence and four-factory admission limit.
6. Startup/retry/disposal RED: same coordinator command.
   Exit 1: 20 passed, 3 failed. Rejoining guest was attached before local startup completed; second dispose caller completed early; unavailable RetryAfter was lost. Added authorityReady, shared disposal promise and retryAfter preservation.
7. Automatic retry epoch RED: same coordinator command.
   Exit 1: 24 passed, 1 failed. A Leave from a status observer was undone by the old retry continuation (`join` called twice). Added exact retired epoch check.
8. Final GREEN:
   `npx vitest run tests/onlineCoordinator.test.ts tests/onlinePeers.test.ts tests/onlineRetry.test.ts tests/onlineSector.test.ts tests/rtcTransportOwner.test.ts tests/hostProcess.test.ts tests/roomServiceClient.test.ts`
   Exit 0: **7 files, 115 tests passed**. Coordinator 25; peers 3; retry 4; sector 2; RTC owner 9; host process 16; service client 56. No warnings/errors in Vitest output.
9. Final typecheck: `npm run typecheck`, exit 0 (`tsc -b`, no diagnostics).
10. Whitespace: scoped `git diff --check` / staged check passed. Git's normal LF-to-CRLF notices are not test errors.

The first green attempt exposed a test fixture missing the signal's seatGeneration and an incomplete HostResponse mock; both fixtures were corrected. Compiler first failed TS6307 for the existing sector validator's transitive graph plus missing digest declaration; no validator duplication was introduced.

## Compiler adjustment and files

`tsconfig.node.json` gains `resolveJsonModule:true` and inputs for:

- `src/network/session/serviceClient.ts`, `src/network/rtc/contracts.ts`
- `src/renderer/src/net/env.d.ts`, `net/contracts.ts`, `net/codec.ts`, `net/receivePolicy.ts`
- `src/renderer/src/sim/**/*`, explicit `sim/**/*.json`
- `src/renderer/src/authority/checkpoint.ts`, `authority/ledger.ts`
- `src/renderer/src/clientControl/cardController.ts`, `clientControl/inputFrame.ts`

These are the existing validator/RunInit type graph and RTC cap constants consumed by main. No simulation behavior, renderer production code, dependency pins or digest inputs changed.

Source/tests: new onlineSession.ts, onlinePeers.ts, onlineRetry.ts, onlineSector.ts; modified rtcTransport.ts; new onlineCoordinator/onlinePeers/onlineRetry/onlineSector tests; updated rtcTransportOwner test and hostProcess mock; tsconfig.node.json.

## Self-review and boundaries

Reviewed ownership and identity checks, service event ordering, private credential/status separation, sparse logical seats, utility commitment deduplication, late resources, reconnect terminal handling, and the exact native adapter types. Fixes found during review have reproducing tests and red/green evidence above.

No unresolved implementation concern. Native Electron adapter/app composition and actual workerd/native application proof remain Task5 onward; this task's structural tests do not claim those gates passed. Empty ICE is deliberate loopback-only behavior; no TURN/WAN/fencing/checkpoint-recovery claim. Service trust and equal-generation correlation limits remain unchanged, with serialized issuance at this coordinator boundary. Full root/service suites and final acceptance/replay gates remain controller-owned. No cloud, deployment, secrets, .env, owner checkout, dependency pins, ledger or design edits, and no subagents dispatched.

## Review fix round 1: reconciliation lost during issuance

Status: DONE.
Commit: `a96b9c5 fix(net): drain roster reconciliation after peer issuance`.

Confirmed the Important finding with two regression tests in `tests/onlinePeers.test.ts`. A generation change while that seat's link-request remained pending produced only requests `[1]`, instead of `[1,1]`. A departing first guest whose pending issuance rejected produced only `[1]`, instead of continuing to healthy seat 2 with `[1,2]`.

`onlinePeers.ts` now records reconciliation requested during an active drain and reruns against the latest roster after the pending request settles. Issuance failure handling is per seat, so later seats are still processed. Each drain attempts a seat generation at most once, preventing reentrant reconciliation/failure callbacks from creating an immediate retry loop; a newer generation remains eligible during the same drain. Failure cleanup checks the captured generation before retiring/notifying a peer. Issuance remains serialized with one current issuing seat and no added queue.

RED command: `npx vitest run tests/onlinePeers.test.ts`.
Result: exit 1, 2 failed and 4 passed. Both race regressions failed with the exact request arrays above. The new persistent-failure/reentrant-reconcile test already passed on the previous implementation and remains a non-regression guard against an incorrect drain-loop fix.

GREEN command: `npx vitest run tests/onlinePeers.test.ts tests/onlineCoordinator.test.ts`.
Result: exit 0, 2 test files and 31 tests passed (6 peer, 25 coordinator); no test warnings/errors.

Typecheck: `npm run typecheck`, exit 0 (`tsc -b`, no diagnostics).
Whitespace: `git diff --check -- src/main/network/onlinePeers.ts tests/onlinePeers.test.ts`, no errors; only Git's ordinary LF-to-CRLF notices.

Self-review: checked the drain remains serialized, rereads current seats after awaits, cannot immediately repeat an unchanged failed generation, and does not retire a newer generation from an older request's rejection. Only the peer source and peer test are changed. No API changes, no full-root run, no parent plan/spec edits, no agents. No unresolved concerns.
