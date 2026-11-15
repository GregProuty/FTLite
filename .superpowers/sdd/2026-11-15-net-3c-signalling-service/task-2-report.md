# Task 2 report — Directory admission and durable Room HTTP auth

Base: `e774e05`, existing `codex/net-3` worktree `C:/Users/djuar/.codex/worktrees/56fc/FTLite`.

Implemented creation, join/rejoin, socket-ticket issuance, persistent Directory budgets, and conservative creation/lobby expiry. Socket activation, TURN, checkpoint, activation and lease operations remain unavailable. No deployed or online-readiness claim. No root dependencies, shared contract, fixtures, account settings or credentials changed.

## RED/GREEN evidence

Commands below ran from `services/signalling`, in real pinned workerd/SQLite via the existing Cloudflare Vitest plugin.

1. Initial HTTP RED: `npm test -- tests/http.test.ts` exited 1.

   ```text
   Test Files  1 failed (1)
        Tests  6 failed | 1 passed (7)
   ```

   Missing implementation produced `expected 503 to be 200` for creation, `expected 503 to be 404` for unknown IDs, and `expected 503 to be 400` for malformed admission. Initial accounting-fault setup also reported `no such table: directory_rooms: SQLITE_ERROR` because the table did not exist yet.

2. Initial Directory/auth RED: `npm test -- tests/directory.test.ts tests/auth.test.ts` exited 1.

   ```text
   Test Files  2 failed (2)
        Tests  10 failed (10)
       Errors  65 errors
   ```

   Four auth tests failed on scaffold 503 instead of creation 200; Directory methods were missing (`The RPC receiver does not implement "reserveRoom"`). Concurrent calls amplified missing-method diagnostics. No claim that this initial missing-method run was clean.

3. First implementation run: `npm test -- tests/directory.test.ts tests/auth.test.ts tests/http.test.ts` exited 1 with 13 passed, 4 failed, and 6 unhandled errors. Root causes: this pinned test plugin preserves storage across tests in one file, and passing Workers RPC thenables directly to Vitest rejection matchers creates extra rejected RPC property lookups. Test setup now resets singleton Directory rows per case, compares allocation counts before/after, and awaits RPC through native promise helpers. No production isolation behavior was changed.

4. GREEN after those corrections: same command exited 0, 3 files/17 tests passed. Expanded collision/expiry/retention cases then passed `npm test -- tests/directory.test.ts`: 1 file/11 tests.

5. Expected RPC exceptions emitted runtime stack diagnostics even when correctly caught. Parent approved uniform `DomainResult<T> = {ok:true,value:T}|{ok:false,error:ServiceError}`. All explicit public DO RPC methods now use `wrapDomain`; callers use `unwrapDomain`. Only the private recognized domain exception is converted; unexpected exceptions still throw. Public HTTP payloads are unchanged. After this adjustment the focused suite passed 22 tests without expected-domain exception stacks or Vitest unhandled errors.

6. Additional body-cleanup RED: `npm test -- tests/auth.test.ts tests/http.test.ts` exited 1, 15 passed/1 failed. `cancels an unread unauthorized body without waiting for an untrusted cancel promise` failed `expected false to be true`: early authorization rejection left the body uncanceled. Worker `finally` now cancels unread bodies without awaiting cancellation. `npm test -- tests/http.test.ts -t 'cancels an unread'` then exited 0, 1 passed/8 skipped.

7. Focused command before the final upgrade-quota coverage case: `npm test -- tests/directory.test.ts tests/auth.test.ts tests/http.test.ts` exited 0.

   ```text
   Test Files  3 passed (3)
        Tests  27 passed (27)
   Duration  7.00s
   ```

8. Final complete service suite, explicitly requested by parent: `npm test` exited 0. The final added case explicitly verifies independent socket-upgrade/join limits, invalid direct IP-hash rejection, and minute-window reset. There are 28 Task2 cases (12 Directory, 7 auth, 9 HTTP), plus 50 existing runtime/protocol cases.

   ```text
   Test Files  5 passed (5)
        Tests  78 passed (78)
   Duration  7.29s
   ```

9. `npm run typecheck` exited 0 (`tsc --noEmit`, no diagnostics). `npm run build` exited 0:

   ```text
   wrangler deploy --dry-run --outdir dist
   wrangler 4.156.0 (update available 4.162.0)
   Total Upload: 43.06 KiB / gzip: 10.63 KiB
   env.ROOMS (Room)               Durable Object
   env.DIRECTORY (Directory)      Durable Object
   --dry-run: exiting now.
   ```

   This was local bundle validation, not deployment. Existing migration/bindings remain unchanged. `git diff --check` reported no whitespace errors (Windows line-ending notices only).

### Deliberate unexpected-error diagnostics

The final test run deliberately retains exactly these runtime diagnostic headers, followed by the corresponding production stack, without suppressing stderr or logs:

```text
uncaught exception; source = Uncaught (in promise); stack = Error: no such table: room_meta: SQLITE_ERROR
uncaught exception; source = Uncaught (in promise); stack = Error: no such table: directory_rooms: SQLITE_ERROR
```

The first belongs to `retains failed accounting and ignores receipts for an older epoch`: the test drops Room metadata, runs real cross-DO reconciliation, and asserts Directory `charged` remains 1. The second belongs to `does not allocate or expose secrets when Directory accounting is unavailable`: the test drops Directory accounting, asserts HTTP 503 with exactly `{error:{code:'unavailable',retryable:true}}`, and asserts no additional Room allocation. These injected corruptions are deliberately unexpected exceptions to `wrapDomain`; all ordinary capacity/auth/conflict failures use structured results. The test runner reports no unhandled-error section and exits 0.

## Covered behavior

- Concurrent 100th/101st room admission; 1,000 stored records independently of active charges; 10,000 live IP keys and expiry cleanup; forced random-code collision during concurrent reservations; charge retention across real eviction.
- Five creates and twenty joins per IP/window, including failed incompatible joins without quota refunds. The same IP row separately holds twenty socket upgrades/minute; IP metadata expires two minutes after the last accepted operation. Missing/malformed platform IP or missing salt fails before Room/Directory allocation; forwarded headers are ignored.
- Unknown IDs resolve through Directory before Room allocation. Public internal URLs are rejected. All successful/private responses and errors use no-store; fixed error bodies; body size/keys/UTF-8/duplicate-key validation uses the shared bounded parser.
- Native/no-origin, Electron `null`, and configured origins; disallowed origins denied. Origins convey no identity. Query credentials rejected.
- Exact initialization retry, changed initialization/hash conflict, no public mapping before commit, abandoned initialization fencing, confirmed-but-private creation charge retention, stale-epoch receipt rejection, unavailable accounting charge retention, lobby retention and eventual removal after Room fencing.
- Lowest free seat, host seat 0/generation 1, exact opaque compatibility, seat spoof rejection, revoked slot generation retention, revoked token rejection after slot reuse, frozen/retained new-human rejection, reserved-token rejoin.
- Rejoin commits the new generation and clears connection/readiness/tickets before returning, then closes matching real accepted hibernating transports. Test sockets are created solely at the runtime-test boundary; shipping socket route remains unavailable.
- Hash-only token/ticket persistence, thirty-second random socket ticket, one issuance eligibility per create/rejoin generation, concurrent single winner, durable eligibility across eviction, expiry cleanup, old generation rejected after a deliberately delayed crypto await.
- Actual five-second stalled HTTP body timeout, reader lock release and subsequent admission; early unauthorized request cancellation does not wait for an untrusted cancellation promise.

## Public HTTP boundary

- `POST /v2/rooms`: exact `{compatibility,capacity}`, returns shared `SeatSession` for seat 0.
- `POST /v2/rooms/{code}/join`: exact `{compatibility}`; optional `Authorization: Bearer <seatToken>` selects rejoin, otherwise lowest free lobby seat. Returns `SeatSession`.
- `POST /v2/rooms/{roomId}/socket-ticket`: exact `{}` plus Bearer token; returns shared `SocketTicket`. Missing token 401; malformed input 400; conflict/incompatible/state/ticket-used 409; quota/capacity 429; accounting failure 503; oversized body 413; body deadline 408.
- Recognized socket/TURN/checkpoint routes remain fixed unavailable after required route/IP/Directory checks. They do not consume checkpoint bodies or fabricate sockets/leases.
- Env adds optional `IP_HASH_SALT` and comma-separated `ALLOWED_ORIGINS`. Missing salt fails closed. Tests inject a synthetic salt/IP only at the test boundary; production trusts only platform `CF-Connecting-IP`.

## Internal API handoff

`errors.ts` exports `DomainResult<T>`, `wrapDomain(operation)`, `unwrapDomain(result)`, and `failure(code)`. All explicit public DO RPCs return `Promise<DomainResult<T>>`; unwrap before further mutations. `fetch` and runtime `alarm` retain normal platform return types. No RPC method has a public URL passthrough.

Directory instance is `env.DIRECTORY.get(env.DIRECTORY.idFromName('global'))`:

```ts
reserveRoom(compatibility, capacity, ipHash): DomainResult<Reservation>
commitRoom(roomId, epoch): DomainResult<void>
resolveCode(code): DomainResult<{roomId:string} | null>
resolveRoom(roomId): DomainResult<{roomId:string} | null>
reserveJoin(ipHash): DomainResult<void>
reserveSocketUpgrade(ipHash): DomainResult<void>
reconcile(): DomainResult<void>
releaseFenced(roomId, receipt): DomainResult<void>
reserveActivation(roomId, previousEpoch, operationId, expectedGeneration, targetGeneration)
  : DomainResult<ActivationReservation> // unavailable until Task4
commitActivation(roomId, epoch, operationId, generation, activeDeadline)
  : DomainResult<void> // unavailable until Task4
reserveTurn({roomId,seatId,seatGeneration,connectionId})
  : DomainResult<void> // unavailable until Task5
```

The signatures above omit their Promise wrapper for readability. `Reservation` contains roomId/joinCode/runId/compatibility/capacity/chargeEpoch/createdAtEpochMs/reservationExpiresAtEpochMs/lobbyExpiresAtEpochMs. `ActivationReservation` contains roomId/chargeEpoch/operationId/generation/expiresAtEpochMs.

Creation flow: Directory reservation charges first; Worker hashes a generated token; Room initializes; Directory `commitRoom` calls Room `confirmCreation` before the public mapping transaction; Worker returns token only after Directory commit. Confirmed/private lobbies remain charged until Room reports their authoritative lobby expiry. No network wait occurs inside a SQL transaction, and Room confirmation/reconciliation never calls Directory back.

Room instance is `env.ROOMS.get(env.ROOMS.idFromName(roomId))`:

```ts
initialize(reservation, hostTokenHash): DomainResult<RoomSnapshot>
confirmCreation(epoch): DomainResult<number> // authoritative lobby deadline
join(compatibility, token?): DomainResult<SeatSession>
socketTicket(token): DomainResult<SocketTicket>
reconcileExpiry(epoch, now): DomainResult<ExpiryReceipt>
```

`ExpiryReceipt` variants: `absent {epoch}`; `live {epoch,generation,phase,deadline}`; `fenced {epoch,generation,phase:'lost'|'ended',retainUntilEpochMs}`. Directory checks both the originally queried epoch and the current stored epoch before applying reconciliation. Unknown/cross-generation results preserve the charge. An absent uninitialized Room persists a tombstone before reporting absence. Retention deletion also tombstones Room before Directory removal.

## SQLite/storage handoff

- Existing singleton `service_schema(version=1)` initializer remains authoritative/idempotent. Task2 adds tables using `CREATE TABLE IF NOT EXISTS`; no SQLite PRAGMA user_version.
- Directory `directory_rooms`: primary room_id, unique code, reserved data JSON, epoch, generation, phase, charged, committed, deadline. At most 1,000 live rows and at most 100 charged rows. Private reservations have committed=0.
- Directory `directory_ip`: primary ip_hash (HMAC-SHA256 only), window_start, creates, joins, upgrades, expires_at. At most 10,000 unexpired rows. Daily TURN metadata is intentionally deferred with TURN admission.
- Room `RoomStore` owns all Room schema and synchronous transaction helpers. `room_meta` is one row: packed immutable reservation key, initial host hash, epoch, room/run/code, compatibility JSON, capacity, host seat/generation, phase, revision, creation confirmation, deadline and retention deadline.
- `room_seats` has exactly capacity rows (1..4): seat_id, generation, nullable token_hash, nullable connection_id, connected, ready, ticket_eligible. SQLite is authority; transport attachments only locate sockets. Vacant/revoked slots retain generations. `revokeSeat` is an internal Store primitive requiring caller host/current-connection authorization in Task3; it rejects host removal/non-lobby itself.
- `room_tickets` has at most one row/seat: seat_id, generation, SHA-256 ticket_hash, random connection_id, expires_at, consumed. Task3 must atomically consume under current seat generation/connection authorization; must never infer authority from attachments or restore consumed tickets. Task2 does not consume or activate tickets. Expiry/rejoin/revocation remove ticket rows, while ticket_eligible stays false until rejoin.
- `room_fence` is a singleton tombstone. Expired retained data/tokens are deleted. Room/Directory alarms derive earliest persisted deadline; delayed alarms cannot authorize expired data.

## Self-review, remaining owners, limitations

Self-review covered bounded room/IP/ticket metadata, auth rechecks after crypto, no SQL-await transactions, conservative epoch application, hash-only persistence and early body cleanup. The unread-body issue was caught by a new RED test and fixed. TypeScript private methods/properties are implementation internals; all outside traffic is confined to explicit Worker routes.

Task3 must integrate proposal/attempt invalidation with the existing generation-retirement path, atomic socket ticket consumption, current connection SQL checks, socket limits/attachments/alarms and websocket operations. Task4 must extend Room expiry with live lease/activation fencing (current active expiry refuses unavailable), retained rehost, checkpoint data and the two in-flight checkpoint-body slots. Task5 implements the unavailable TURN reservation/provider path and daily metadata. This task deliberately does not invent those authorities or provide usable lease/socket success. Parent owns whole-slice/root/native validation; only service tests/typecheck/local bundle ran here.
