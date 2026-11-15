# Task 4 implementation report

Implemented in `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`, based on `3f89833`. Parent-owned specification and validation-document edits remain unstaged.

## Result and scope

- Atomic opaque start proposals/commits, current-connection authorization, frozen roster/init, first grant, explicit host release, 15-second leases and explicit checkpoint-backed rehost.
- Directory reserve → Room unacknowledged commit → Directory acknowledgement → Room activation. Exact retries recover persisted outcomes. No usable grant before final acknowledgement; delayed completion beyond the original lease is refused.
- Raw authenticated checkpoint PUT/GET with exact byte/hash/metadata checks, two in-flight readers, five-second body deadline, transactional replacement and retained-token reads.
- Parent-approved terminal activation barrier and persisted short accounting retry close lost-reservation/fence-ack recovery races.
- No utility authority gate, live mirror loop, UI, TURN provider, automatic reconnect/election, cloud/account/secret action, deployment, native test, root suite, or online-readiness claim. The utility request-start-plus-12-second authority gate remains future work; these backend grants alone do not make online authority safe or ready.

## RED / GREEN evidence

All commands ran in `services/signalling` using pinned workerd/SQLite via the existing Vitest worker plugin.

1. `npm test -- tests/lifecycle.test.ts`: initial RED **5 failed**, with missing lifecycle returning `unavailable`; direct lifecycle hook was absent. GREEN **5 passed** after coordinator implementation. Subsequent real-runtime regressions added ready linked humans, 30-second proposal deadline, 65,536-byte opaque init/hash, host disconnect, expiry notifications, and proposal hash cancellation.
2. `npm test -- tests/checkpoints.test.ts`: initial RED **5 failed**, HTTP returned 503 rather than 204 and the not-yet-implemented body-admission test timed out. GREEN **5 passed** after HTTP/storage integration. Added exact 4,096-byte metadata/retention deletion and transaction-abort rollback coverage afterward.
3. `npm test -- tests/activationRaces.test.ts`: first run **7 passed, 2 failed**. One expectation was narrowed to the valid `invalid-state` error for an expired lobby. The other exposed lost Room state being reported as live to accounting; fixed to return a fenced receipt. GREEN **9 passed**.
4. Added terminal barrier regressions: RED **9 passed, 4 failed** (unburned expired rehost generation, missing terminal-ack handling, next retry roughly 30 seconds instead of at most five seconds). Implemented `fenceActivation` and durable accounting retry; GREEN **13 passed**.
5. Added proposal operation-stamp and exact rehost-after-renewal regressions: RED **22 passed, 2 failed**. Earlier hash completion replaced a later proposal; exact claim returned the renewed nonce/deadline. Added persisted proposal stamp and immutable activation grant; GREEN **24 passed** across lifecycle/activation suites.
6. Added original 24-hour run deadline regression: RED **20 passed, 1 failed** across activation/checkpoint suites (rehost extended the deadline). Persisted the original active deadline with frozen start, then GREEN **31 passed** across the three task suites. The final transactional checkpoint rollback case increased task coverage to **32 tests**.
7. Initial complete `npm test`: **152 passed, 2 failed**. Both were earlier task placeholders: `auth.test.ts` manually fabricated `active` without a lease, and `sockets.test.ts` expected lifecycle to remain unavailable. The auth test now uses actual committed starts and valid fenced states; the socket test expects correlated `invalid-state` in the lobby. Directory's previous unavailable-activation placeholder also now verifies absent/conflicting activation refusal. Test cleanup deletes activation metadata alongside mappings.
8. Final `npm test`: **11 files passed; 154 tests passed; 10.91 seconds**.
9. Final `npm run typecheck`: **exit 0**, no diagnostics.
10. Final `npm run build`: **exit 0**, Wrangler 4.156.0 `deploy --dry-run --outdir dist`; **99.88 KiB upload / 20.59 KiB gzip**, only local bundle inspection, `--dry-run: exiting now`.
11. `git diff --check`: **exit 0**. Git emits the repository's LF→CRLF notices when inspecting files.

The complete service run still prints the two intentional inherited SQL-corruption diagnostics (`no such table: room_meta`, `no such table: directory_rooms`). They come from existing failure-injection tests and were not suppressed. Expected domain-level accounting failures in alarms retain their persisted retry; unexpected programming/storage exceptions still escape the domain boundary.

Runtime investigation also exposed workerd's compound-SELECT term limit after adding alarm sources. Alarm scheduling now uses a fixed list of scalar aggregates. Hibernation tests must consume HTTP error response bodies before eviction: an unconsumed 413 stream pins the object; the test now consumes it rather than increasing its timeout.

## Activation and recovery handoff

`Room.lifecycleRequest` is installed and delegates to `RoomLifecycle.request(connection, request)`. Public socket request/reply shapes are unchanged. `RoomLifecycle.leased(connection)` is the reusable synchronous current acknowledged host/connection/lease predicate for later tasks; it expires stale authority before returning a grant.

Directory RPCs retain `Promise<DomainResult<T>>` boundaries:

```ts
reserveActivation(roomId, previousEpoch, operationId, expectedGeneration, targetGeneration)
  => ActivationReservation
commitActivation(roomId, epoch, operationId, generation, activeDeadline)
  => void
fenceActivation(roomId, previousEpoch, operationId, expectedGeneration, targetGeneration,
                phase: 'lost' | 'ended', retainUntil)
  => ActivationFence
// ActivationFence = { roomId, chargeEpoch, operationId, generation }
releaseFenced(roomId, receipt) => void
```

Parent-approved choices:

- The Room's persisted random operation ID is also its new charge epoch. Prepared operations can therefore be identified even if a reserve response is lost.
- `reserveActivation`, `commitActivation`, and `fenceActivation` never call Room. Admission is a synchronous Directory transaction; it does not call `reconcile`. Public create/lookup and independent alarms reclaim expired other-room charges. False-full activation returns retryable capacity rather than exceeding the cap or making a Room→Directory→Room RPC chain.
- The Room persists a single exact tuple before reserve. Directory holds at most one operation tuple per mapping, with `acknowledged` values **0 reserved**, **1 committed**, **-1 terminal/fenced**. Existing charged lobby admission reuses one charge; retained admission increments the total only below 100.
- Room commit atomically stores the new epoch/generation/host, lease, unacknowledged operation, immutable initial grant and (for first start) roster/init/hash/original 24-hour deadline. Rehost does not extend that original deadline.
- Directory acknowledgement fixes the exact epoch/generation/deadline. Room rechecks current operation, connection, original lease lifetime and start roster before marking acknowledged and emitting/returning a grant. Renewal/checkpoint writes are refused while unacknowledged.
- A timed-out operation is irrevocably fenced in Room first. `fenceActivation` then either terminalizes the exact reservation or advances the exact previous epoch to a terminal operation even when reserve never arrived. It releases a charge only on that already-fenced Room proof. Delayed reserve of the terminal tuple rejects. An unrelated/newer epoch is never overwritten.
- Room does not replace unresolved fenced metadata before matching fence acknowledgement. It rechecks its captured epoch/generation/operation after the await, then adopts the terminal epoch and burns the target generation. A later explicit claim uses the new expected generation. Lost fence acknowledgements repeat idempotently; old fence receipts cannot damage a newer activation.
- `room_accounting` is a singleton retry record with a five-second deadline. Failed accounting retains its charge and metadata. Alarm recovery retries persisted pending activation or terminal accounting; no payload/request retry queue exists.
- `Room.reconcileExpiry` performs synchronous Room SQL fencing before returning a receipt and does not call Directory. Directory applies receipts only while its current epoch/generation still matches. Active lease expiry/host release invalidates routes and emits `host-departed`; expired retention removes bytes/tokens and tombstones the Room.

Crash/race tests exercise interruption before reserve, after real reserve, before Directory commit, and after real commit acknowledgement; exact retry after hibernation; delayed successful reserve at lobby expiry; delayed successful ack past lease usefulness; 100-charge retained refusal; two rehosts racing the last slot; stale loss/absent receipts after generation advancement; no-reserve/lost-reserve/lost-fence-ack terminal recovery; delayed reserve after terminal fence; stale terminal fence after a new generation; and persisted retry after unavailable accounting.

## Storage and checkpoint handoff

`RoomStore` remains the sole Room schema owner; the existing service-schema version 1 initializer is unchanged. New tables are idempotently created and bounded singleton records:

- `room_proposal`: verified opaque bytes/hash/revision and 30-second proposal identity.
- `room_proposal_pending`: one persisted hash-operation stamp and deadline; roster changes invalidate it; a finalizer deletes only its own stamp.
- `room_activation`: exact prepared/committed/acknowledged/fenced tuple, authority stamps and deadlines.
- `room_activation_grant`: immutable original grant for exact start/rehost retries after renewals.
- `room_lease`: current nonce/deadline/host connection and seat generation.
- `room_start`: frozen roster/init/hash/first grant/original active deadline.
- `room_checkpoint`: one committed metadata JSON/blob pair.
- `room_accounting`: one epoch/retry deadline.

`Directory.directory_activations` has one operation row per stored mapping and is deleted with the mapping. It retains terminal metadata until a subsequent operation replaces it; predecessor-epoch comparison fences old delayed messages.

Worker forwards `/v2/rooms/{roomId}/checkpoint` to Room only after existing route/IP/Directory checks. `RoomCheckpoints` handles internal `/checkpoint` fetch:

- PUT requires Bearer token, current `X-FTL-Connection`, `X-FTL-Seat-Generation`, `Content-Type: application/octet-stream`, and base64url UTF-8 JSON `X-FTL-Checkpoint` of at most 4,096 encoded bytes.
- Authentication/current acknowledged host lease/metadata checks precede body reading. At most two body requests are admitted per pinned Room instance; no reader queue. All exits release admission in `finally`.
- Streamed body is capped at 262,144 bytes with the existing five-second reader deadline. SHA-256 verifies exact bytes. Current connection, seat generation, host generation, captured lease nonce and original lease expiry are rechecked after body and crypto waits, then immediately before the SQL replacement.
- Exact metadata/hash/byte retry is idempotent. Conflicting same generation/sequence rejects; order is generation then sequence, never captured tick. Transaction abort, bad hash and fencing leave the previous committed bytes intact.
- GET requires only an authorized reserved token, including lost/ended retention; it returns raw bytes and the same metadata contract with `no-store`. It requires no current host connection and exposes no token hashes. Expired retention removes byte/token authority.
- `hash-mismatch` maps to HTTP400; `lease-expired` and `no-checkpoint` to409. Existing public shared message shapes and fixed errors remain authoritative.

## Self-review and concerns

Reviewed awaits and operation stamps, synchronous SQL transaction boundaries, stale epoch/generation handling, charge arithmetic, singleton/count/byte bounds, retained-token access, and the actual service diff. All required local gates pass. No unresolved architecture blocker is known; parent independent review remains the next step. Accounting outages intentionally fail closed and can temporarily retain charges or refuse a retained activation until recovery. No backend test establishes the future utility authority gate or online-demo readiness.

## Task 4 review fix round 1

Base: `c5d46ff` (implementation `7d5e685` plus parent documentation). Addressed both parent findings without changing Directory's terminal barrier or adding RPCs/schema.

1. A delayed capacity/conflict/not-found refusal no longer deletes the persisted activation tuple. An independently accepted exact retry can have reserved that same tuple after the first call observed refusal. The refusal is still returned to its caller, while exact recovery can finish the reservation. Otherwise the bounded pending deadline fences the operation and the existing terminal barrier completes accounting before a different claim replaces it. Thus a capacity refusal may leave the current claim pending until exact retry or terminal expiry; it cannot discard ambiguous operation history.
2. Final start acknowledgement now uses the same current host, connected/ready occupied-seat, roster-revision and fully ready route predicate as proposal/commit, with an explicit `active` phase allowance for the unacknowledged commit. A route replacement can change required readiness without changing roster revision. Failed final validation irrevocably fences Room authority before returning the fixed failure; no `started` grant is broadcast.

RED command, from `services/signalling`:

```text
npm test -- tests/activationRaces.test.ts -t 'earlier capacity|ready route is replaced'
Test Files  1 failed (1)
Tests       2 failed | 15 skipped (17)
```

The first regression exercised real Directory capacity refusal, freed one charged slot, performed a second real exact reservation, delayed both replies, then delivered the refusal first. Room's operation ID became `undefined` on the reviewed implementation. The second replaced a ready host/guest link using real `SignalCoordinator.issue` during delayed real Directory acknowledgement; roster revision stayed unchanged and the reviewed implementation incorrectly returned `kind: started`.

GREEN commands:

```text
npm test -- tests/activationRaces.test.ts tests/lifecycle.test.ts tests/checkpoints.test.ts
Test Files  3 passed (3)
Tests       34 passed (34)
Duration    7.61s

npm run typecheck
tsc --noEmit
exit 0
```

The refusal regression also verifies the successful epoch survives hibernation, releases its charge, and permits a fresh generation-3 claim. The replaced-route regression verifies both endpoints receive no started event, the Room operation is fenced/lost, and alarm accounting releases the charge. No full service/root/native suite or deployment was run in this scoped review round. Self-review checked the preserved tuple/deadline/terminal path and the active-phase readiness predicate; no remaining blocker is known.

## Task 4 review fix round 2

Base: `ba07dfa`. The prior final-ack readiness fix also ran after another overlapping exact commit had already transitioned the persisted operation to `acknowledged`. A legitimate subsequent link replacement therefore let the delayed caller fence an already-running session. Moved readiness validation and its failure fencing inside the refreshed `current.state === 'committed'` branch, directly alongside the first acknowledgement transition. There is no await between that validation and the transition. Already-acknowledged exact retries still revalidate current operation, connection and live lease, and return the immutable original grant without reapplying initial link readiness.

RED evidence:

```text
npm test -- tests/activationRaces.test.ts -t 'keeps an acknowledged start active'
Test Files  1 failed (1)
Tests       1 failed | 17 skipped (18)
```

The real-runtime regression overlaps two exact commits, delays A's real Directory acknowledgement, allows B to activate successfully, replaces the ready route through real signalling, then resumes A. Before the fix A returned `Error: invalid-state` instead of B's original started result.

GREEN evidence:

```text
npm test -- tests/activationRaces.test.ts tests/lifecycle.test.ts
Test Files  2 passed (2)
Tests       28 passed (28)
Duration    4.56s

npm run typecheck
tsc --noEmit
exit 0
```

The regression verifies both callers receive the identical original grant, only one started event reaches each endpoint, Room remains active/acknowledged, Directory stays charged, and no host-departed event is emitted. The earlier unacknowledged-route replacement rejection regression remains passing. Checkpoint files were untouched; no checkpoint/broad/root/native rerun or deployment was performed in this scoped round. Self-review confirmed the refreshed state guard encloses both validation and the first transition. No remaining blocker is known.
