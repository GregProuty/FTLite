# Net-3c Task 6 implementation report

Worktree: `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, starting commit `780b79c`. Implementation commit: `3d53f51` (`feat(net): add bounded generic room service client`). Only Task 6 files were staged; the parent's validation-document edit remains unstaged.

## Delivered API

Import from `src/network/session/serviceClient.ts`:

```ts
createRoomServiceClient(options: RoomServiceClientOptions): RoomServiceClient

interface RoomServiceClientOptions {
  baseUrl: string;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  createWebSocket(url: string): RoomServiceSocket | Promise<RoomServiceSocket>;
  clock: RoomServiceClock;
  allowInsecureLocalhost?: boolean;
}
interface RoomServiceClock {
  nowMs(): number; // EPOCH milliseconds, not performance.now().
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
interface RoomServiceSocketEvent { readonly type: string; readonly data?: unknown }
interface RoomServiceSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(text: string): void;
  close(): void;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', callback: (event: RoomServiceSocketEvent) => void): void;
  removeEventListener(type: 'open' | 'message' | 'close' | 'error', callback: (event: RoomServiceSocketEvent) => void): void;
}

create(compatibility: RoomCompatibility, capacity: number): Promise<SeatSession>
join(code: string, compatibility: RoomCompatibility, seatToken?: string): Promise<SeatSession>
connect(session: SeatSession): Promise<RoomSnapshot>
request<T extends RoomOperation>(operation: T): Promise<RoomReply<T>>
getTurn(): Promise<TurnCredentials>
putCheckpoint(metadata: SessionCheckpointMetadata, bytes: Uint8Array): Promise<void>
getCheckpoint(): Promise<{ metadata: SessionCheckpointMetadata; bytes: Uint8Array }>
onEvent(callback: (event: RoomServiceEvent) => void): () => void
close(): void
```

Exports also include `RoomOperation`, `RoomReply`, `RoomServiceEvent`, `RoomServiceClientError`, `RoomServiceClient`, and the option/socket/clock types. `RoomOperation` is the distributive omission of `requestId` from the shared `RequestFrame` union. Do not supply request IDs. `RoomReply<T>` maps each operation to its success outcome with the shared `kind` discriminator:

| Operation | Resolved outcome |
| --- | --- |
| ready / remove-seat | `{kind:'snapshot',snapshot}` |
| start-propose | `{kind:'proposal',proposalId}` |
| start-commit | `{kind:'started',initBase64,initHash,lease}` |
| link-request | `{kind:'attempt',attemptId}` |
| signal / link-ready / host-release | `{kind:'void'}` |
| lease-renew / rehost-claim | `{kind:'lease',lease}` |

Fixed service errors reject with `RoomServiceClientError`, whose `message` is only the fixed code and which exposes `code`, `retryable`, and optional `retryAfterMs`. Unknown exceptions become redacted fixed errors. Public events exclude `authenticated` and `reply` and never include a seat token. `create`/`join` explicitly return the private `SeatSession`; caller storage remains out of scope.

HTTPS origins only; reject userinfo, query, fragment, and base path prefixes. Explicit `allowInsecureLocalhost:true` allows HTTP only for `localhost`, `127.0.0.1`, or `[::1]`. All production HTTP requests use `redirect:'error'`. Tokens go only into Authorization; first WS frame contains the single-use socket ticket and connection ID. ACK/auth have no request IDs. Event callbacks receive copies and run synchronously before the ACK. Reply promises resolve only after exact operation/context validation and successful ACK submission.

## State and bounds

- 64 pending requests, admitted before allocating IDs; 262,144 total retained pending-frame UTF-8 bytes. Shared 98,304-byte frame parser also bounds outbound frames.
- Four in-flight HTTP/socket-factory operations, at most two checkpoint body operations, four retained live link routing records, 64 subscribers, and four socket listener removers. No application retry queue.
- One five-second absolute deadline covers HTTP headers, streamed bytes, and response validation; numbered requests also have five-second timers. Socket factory/auth waits are bounded by five seconds and remaining single-use ticket lifetime. A late factory result is closed.
- Body reading preallocates only its byte cap, limits empty reads to 64, checks absolute time before/after each read, yields every 64 reads and at EOF so workerd clocks/timers advance, cancels without awaiting cancellation, and releases its reader lock. REST responses cap at 8,192 bytes; checkpoint responses at 262,144. Checkpoint metadata header caps at 4,096 and fetched exact bytes must match SHA-256.
- `create`, `join`, and `connect` supersede prior work. `close` is terminal and aborts HTTP, rejects pending/handshake promises, removes listeners, closes its socket, clears tokens/routing state/subscriptions, and suppresses late effects.
- Host authority changes abort stale TURN/checkpoint PUT HTTP work and reject obsolete pending requests. A bounded tombstone retains each rejected request's correlation until its reply or deadline so a legitimate late reply cannot poison the connection. Tombstones count against the existing pending count/byte limits. GET checkpoint may validly retrieve an older saved host generation after rehost.
- Preserve the matching rehost claim across its preceding `host-changed` event. Actual runtime also proved that `host-departed` precedes host-release's reply; preserve only that matching same-generation release. Other obsolete work rejects. No service wire change was needed.
- Failure cleanup runs before notifying error callbacks, allowing explicit replacement work begun by such a callback to survive. Callback close/throw suppresses further old-connection ACK/dispatch effects.

The client and its future focused helpers now belong to the recursive `src/network/session` content-digest manifest. A source-mutation fixture proves changes there invalidate compatibility. No golden/layout/SIM/version fixture was changed.

## Task 7 native composition sequencing

1. Construct the service client at the main/test edge with native fetch, a supported socket factory, and an epoch clock. `allowInsecureLocalhost` is only for explicit trusted local development. The production module imports only shared room/RTC contracts; it imports no simulation, Electron, filesystem, or Worker service module.
2. Create/join (or supply the returned session to `connect`). Install all `onEvent` subscribers before connecting or requesting links. Handle rejected returned promises; failure/close intentionally rejects outstanding work. Retain returned session/token only in the authorized caller's memory.
3. Connect both peers, obtain each peer's own ephemeral ICE via `getTurn`, and have both subscribers/native IPC routing ready before the host calls `request({type:'link-request',guestSeatId})`. Avoid awaiting TURN from inside `link-issued`: prefetch ICE so native start can be dispatched immediately.
4. In the synchronous `link-issued` callback, form native `RtcAttemptOptions` as `{...event.link,iceServers}` (optional `iceTransportPolicy`). The shared validator accepts this direct composition. Dispatch native `startAttempt` / start IPC synchronously before returning. Do not await its promise before registering the attempt or handling later signals. Register native-to-service signal forwarding before starting the native peer.
5. In the following `signal` callback, dispatch the original `event.signal` to that registered native attempt. Native-to-service signals call `request({type:'signal',signal})` and handle rejection. The client checks existing route direction, connection IDs, host generation and guest generation; no rewriting occurs. BOTH native pair identities use the guest's seat generation; host-own seat generation remains separate service authority. The runtime test uses host generation-of-seat 2 versus guest generation-of-seat 1 to prove this composition.
6. Send `request({type:'link-ready',attemptId})` only on native authentication readiness. Ready/start operations then use exact current roster revision. Subscribe before issuance because link events precede the `link-request` reply. The client dispatches each event synchronously before ACK and before processing a subsequent signal event.
7. Close native attempts on `link-state:closed`, `host-departed`, `host-changed`, terminal service `error`, and caller disposal. Caller-owned native transports must also close when explicitly calling `service.close()`. No automatic reconnect/rehost/retry is implemented. Renew the actual host lease with fresh 32-hex nonces while a native proof runs; the service lease lasts 15 seconds and the production utility gate remains deferred.

The service integration adapter lives only in `services/signalling/tests/clientIntegration.test.ts`. It runs the production client inside the pinned actual workerd test runtime, invokes the shipping Worker public route entry with real `env.ROOMS`/`env.DIRECTORY` SQLite Durable Objects, accepts actual upgraded sockets, and performs a supported `evictDurableObject(...,{webSockets:'hibernate'})` between auth and signalling. No fake Room/server/HTTP success response substitutes for this proof. The trusted test boundary alone adds synthetic platform IP/salt and converts unsupported workerd `redirect:'error'` to `manual`, rejecting redirects. TURN's external provider call alone is intercepted with the existing synthetic provider test helper. No provider/account secrets were read.

## RED/GREEN command record

Commands ran from the task worktree. The following records retain exact command, failing observations, totals, and eventual green output; repeated passing test-name lines are omitted from intermediate RED runs.

Initial RED:

```text
> npx vitest run tests/roomServiceClient.test.ts
RUN v3.2.7 C:/Users/djuar/.codex/worktrees/56fc/FTLite
FAIL tests/roomServiceClient.test.ts [ tests/roomServiceClient.test.ts ]
Error: Cannot find module '../src/network/session/serviceClient' imported from 'C:/Users/djuar/.codex/worktrees/56fc/FTLite/tests/roomServiceClient.test.ts'
Caused by: Error: Failed to load url ../src/network/session/serviceClient (resolved id: ../src/network/session/serviceClient) in C:/Users/djuar/.codex/worktrees/56fc/FTLite/tests/roomServiceClient.test.ts. Does the file exist?
Test Files 1 failed (1)
Tests no tests
exit 1

> npx vitest run tests/roomServiceClient.test.ts
✓ tests/roomServiceClient.test.ts (26 tests) 1125ms
Test Files 1 passed (1)
Tests 26 passed (26)
exit 0
```

Actual-service lifecycle RED and regression RED:

```text
> npm --prefix services/signalling test -- tests/clientIntegration.test.ts
> ftlite-signalling@0.0.1 test
> vitest run tests/clientIntegration.test.ts
RUN v4.1.0 C:/Users/djuar/.codex/worktrees/56fc/FTLite/services/signalling
FAIL tests/clientIntegration.test.ts > drives real public endpoints through production clients: unequal-generation RTC, start, TURN, checkpoint, lease and rehost
RoomServiceClientError: stale-generation
  fault -> invalidateAuthority -> event (host-departed) -> receive
Test Files 1 failed (1)
Tests 1 failed | 2 passed (3)
exit 1

> npx vitest run tests/roomServiceClient.test.ts
FAIL preserves host-release when host-departed precedes its reply
AssertionError: promise rejected "RoomServiceClientError: stale-generation" instead of resolving
FAIL bounds an unresolved socket factory and closes sockets produced after expiry
Error: Test timed out in 5000ms.
Test Files 1 failed (1)
Tests 2 failed | 26 passed (28)
exit 1

> npx vitest run tests/roomServiceClient.test.ts
✓ tests/roomServiceClient.test.ts (28 tests) 1193ms
Test Files 1 passed (1)
Tests 28 passed (28)
exit 0

> npm --prefix services/signalling test -- tests/clientIntegration.test.ts
Test Files 1 passed (1)
Tests 3 passed (3)
exit 0
```

The first service typecheck found workerd's TextDecoder options require `ignoreBOM` and socket event listener typing must be structural across DOM/workerd. Both were fixed; no runtime policy was relaxed.

Digest RED:

```text
> npx vitest run tests/contentDigest.test.ts
FAIL build gameplay content digest > invalidates when gameplay or protocol source src/network/session/serviceClient.ts changes
AssertionError: expected '53b5efcb4d55573a787210f39f236b22ca445…' not to be '53b5efcb4d55573a787210f39f236b22ca445…' // Object.is equality
Test Files 1 failed (1)
Tests 1 failed | 30 passed (31)
exit 1
```

Self-review RED, then additional stream RED before fixing the same source:

```text
> npx vitest run tests/roomServiceClient.test.ts
FAIL redacts invalid UTF8 HTTP replies as malformed frames
AssertionError: expected [Function] to throw error including 'invalid-frame' but got 'unavailable'
FAIL rejects turn credentials immediately when host authority changes during its await
AssertionError: expected false to be true // Object.is equality
FAIL rejects changing host seat without a host generation transition
AssertionError: promise resolved "{ kind: 'snapshot', …(1) }" instead of rejecting
Test Files 1 failed (1)
Tests 3 failed | 36 passed (39)
exit 1

> npx vitest run tests/roomServiceClient.test.ts
Same three failures above, plus:
FAIL bounds immediately resolved empty reads before accepting a valid HTTP reply
AssertionError: promise resolved "{ snapshot: { …(10) }, …(3) }" instead of rejecting
FAIL checks the absolute deadline between productive immediate response reads
AssertionError: promise resolved "{ snapshot: { …(10) }, …(3) }" instead of rejecting
Test Files 1 failed (1)
Tests 5 failed | 36 passed (41)
exit 1
```

First combined 72-test rerun passed individual assertions but reported an unhandled rejection in the superseding-join test: its intentionally rejected create promise acquired a handler too late after the new I/O yield. Attached that test's rejection handler before triggering replacement. No unhandled rejections remain in final gates. Service typecheck also exposed the optional-only event-data type's lack of overlap with native non-message events; `RoomServiceSocketEvent` now contains the universally available `type` field.

Final callback/ACK self-review RED:

```text
> npx vitest run tests/roomServiceClient.test.ts
FAIL rejects connect if its authentication ACK cannot be sent
AssertionError: promise resolved "{ …(10) }" instead of rejecting
FAIL does not erase a replacement connect started synchronously by an error callback
AssertionError: expected [ { type: 'auth', …(2) } ] to have a length of 2 but got 1
Test Files 1 failed (1)
Tests 2 failed | 41 passed (43)
exit 1
```

Final GREEN (after all production changes, 07:22:41/42 local runtime output):

```text
> npx vitest run tests/roomServiceClient.test.ts tests/contentDigest.test.ts tests/rtcBridge.test.ts tests/rtcTransportOwner.test.ts tests/rtcPeer.test.ts tests/rtcFrames.test.ts tests/rtcDataLink.test.ts tests/rtcRuntimeGate.test.ts tests/networkBoundary.test.ts
RUN v3.2.7 C:/Users/djuar/.codex/worktrees/56fc/FTLite
✓ tests/rtcRuntimeGate.test.ts (53 tests) 13ms
✓ tests/rtcTransportOwner.test.ts (8 tests) 14ms
✓ tests/rtcPeer.test.ts (57 tests) 25ms
✓ tests/rtcDataLink.test.ts (18 tests) 50ms
✓ tests/rtcBridge.test.ts (9 tests) 17ms
✓ tests/networkBoundary.test.ts (25 tests) 153ms
✓ tests/rtcFrames.test.ts (12 tests) 9ms
✓ tests/contentDigest.test.ts (31 tests) 1462ms
✓ tests/roomServiceClient.test.ts (43 tests) 2020ms
Test Files 9 passed (9)
Tests 256 passed (256)
Duration 3.00s
exit 0

> npm --prefix services/signalling test -- tests/clientIntegration.test.ts
> ftlite-signalling@0.0.1 test
> vitest run tests/clientIntegration.test.ts
RUN v4.1.0 C:/Users/djuar/.codex/worktrees/56fc/FTLite/services/signalling
Test Files 1 passed (1)
Tests 3 passed (3)
Duration 3.67s
exit 0

> npm run typecheck
> ftlite@0.0.1 typecheck
> tsc -b
exit 0

> npm --prefix services/signalling run typecheck
> ftlite-signalling@0.0.1 typecheck
> tsc --noEmit
exit 0

> git diff --check
exit 0
> git diff --cached --check
exit 0
```

Git reported its existing LF-to-CRLF working-copy normalization notices when staging; no whitespace errors were reported. Final test/typecheck runs reported no warnings/errors. No optional full-root, full-service, native, build, cloud, account, deployment, billing, or DNS actions were performed. Parent owns broad final regressions/native proof and independent review. This task proves service-client composition in actual local workerd; it does not claim native RTC, utility 12-second gating, WAN, forced TURN, automatic recovery, or online-demo readiness.
