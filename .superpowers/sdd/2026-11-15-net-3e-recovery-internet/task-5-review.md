# Spec Compliance

- **Issues found.** The manual recovery, named IPC, saved identity, paused baseline commitment, and bounded exit requirements are implemented, but frozen-view preservation introduces a renderer failure when replacing a session with a different crew count on the same ship (`src/renderer/src/app/onlineSession.ts:45`).
- **Cannot verify from this diff:** actual native recovery, first-state ACK across real processes, and saved/rehosting/paused screenshots at normal and small sizes. These are explicitly deferred to Task 6; the injected recovery tests are not native evidence (`task-5-report.md:67`). Existing native ACK enforcement was not broadened into a whole-branch review.

# Strengths

- Recovery validates authenticated checkpoint bytes both before claiming and after obtaining the actual service snapshot, including fixed capacity; it neither uses private pending bytes nor guesses a winning generation (`src/main/network/onlineSession.ts:320`, `src/main/network/onlineSession.ts:327`).
- The connection-preserving claim ruling is followed: an own-host event supplies identity; a lost reply receives a separate same-connection ownership query; absent definitive events trigger service reconnection without automatic authority construction (`src/main/network/onlineSession.ts:339`).
- Restoration commits the paused generation baseline before attaching producers, and only initial Start calls `completeBootstrap` (`src/main/network/onlineSession.ts:253`, `src/main/network/onlineSession.ts:260`). Tests exercise real authority restoration, neutral held state, preserved high-water marks, contention, missing replies, corruption, and sequence restart (`tests/onlineRecovery.test.ts:87`).
- Exit capture, adoption and upload share the same remaining three-second budget, with shared exit ownership installed before callbacks; trusted suspend/resume remain distinct from gameplay Resume (`src/main/network/onlineSession.ts:224`, `src/main/network/onlineSession.ts:511`, `src/main/network/onlineSession.ts:523`).
- Re-host is a strict payload-free named action, with no privileged Resume API (`src/shared/onlineSession.ts:71`, `tests/onlineIpc.test.ts:26`).

# Issues

## Critical

- None found.

## Important

- **Frozen-state reuse omits crew-count compatibility.** `src/renderer/src/app/onlineSession.ts:45-46` reuses the previous frozen allocation whenever `layoutHash` matches. `restoreSnapshot` explicitly throws when `playerCount` differs (`src/renderer/src/sim/snapshot.ts:75`). This is reachable through the new in-session **Forget saved seat**, followed by **Try another code** (`src/renderer/src/render/sessionMenu.ts:110`, `src/renderer/src/render/sessionMenu.ts:112`): this path does not call the router's home/disposal callback, and `selectOnline` returns the existing renderer (`src/renderer/src/main.ts:75`, `src/renderer/src/app/sessionRouter.ts:11`). Moving from a one-seat to a two-seat Skiff, or a three-seat to a four-seat Cutter, therefore throws on the first valid replacement publication before sync processing. Include `playerCount` in the allocation reuse check (or allocate afresh on the first valid replacement publication while retaining the old view until then), and add a replacement-publication regression with the same layout and different capacity.

## Minor

- **Restored-tick copy becomes misleading after subsequent play.** `src/renderer/src/render/sessionMenu.ts:54-56` renders the current committed checkpoint tick as the restoration tick whenever `recovering` remains true; `setStatus` only clears that flag at idle (`src/renderer/src/render/sessionMenu.ts:124`). After recovery, Resume, more gameplay and another Pause, the UI claims the later checkpoint was the restoration point. Clear the restoration-only message when running resumes, or retain the actual restoration tick separately.

# Assessment

- **Task quality: Needs fixes.** The ownership and persistence boundaries are carefully implemented and supported by focused regression tests. The renderer allocation mismatch is a concrete user-visible regression that should be fixed before accepting this task.
- **Checks:** reviewed the supplied 158 KB package in bounded sections; recovered tool-output truncation from the package, without rereading changed source files. No git mutations or test reruns were performed; only this requested report was written.
- **Named outside-diff check — service event ordering and claim connection semantics:** inspected `src/network/session/serviceClient.ts:180-229`, `services/signalling/src/room/lifecycle.ts:170-186`, and `services/signalling/src/room/sockets.ts:96-100`. The real client validates host-change identity and the service withholds provisional active rosters; no unconditional winning-host rejoin was requested.
- **Named outside-diff check — bounded cleanup:** inspected disposal contracts in `src/main/network/onlinePlatform.ts:42`, `src/main/network/hostProcess.ts:165-172`, and `src/main/network/onlinePeers.ts:111`. Native utility disposal has its existing 250 ms bound, while transport/peer disposal initiates teardown without awaiting network replies.
- **Named outside-diff check — frozen allocation compatibility and reachable reuse:** inspected `src/renderer/src/sim/snapshot.ts:72-83` and renderer/router call sites in `src/renderer/src/main.ts:57-79` and `src/renderer/src/app/sessionRouter.ts:11`; this establishes the Important finding above.
- **Reported verification:** the implementer records 228 distinct covering tests, final affected-file GREEN, typecheck and build success (`task-5-report.md:43-59`). These runs were not repeated. No test-output warning is reported; the stated LF/CRLF notices are git advisories.
