# Net-3c Task 3 report

Implemented against `bb36105` in `C:/Users/djuar/.codex/worktrees/56fc/FTLite`, branch `codex/net-3`. No cloud/account/credential actions, native wire changes, root dependencies, root suite, or additional agents.

## Result and verification

Final source checks (2026-11-15):

- `cd services/signalling; npm test`: **8 files,119 tests passed**, exit0,9.93s. Includes41 Task3 focused cases (sockets13, signals21, hibernation7). Parent explicitly requested this final full service run after the focused gates.
- `npm run typecheck`: exit0.
- `npm run build`: exit0; Wrangler4.156.0 dry-run,66.72KiB upload /15.12KiB gzip; Room/Directory bindings. No deployment. Wrangler prints an available-update notice; pins unchanged.
- The full suite deliberately prints two workerd exceptions from existing negative tests that DROP `room_meta` and `directory_rooms`. Those tests pass and exercise fail-closed accounting. No console/log suppression was added.

TDD evidence:

1. `npm test -- tests/sockets.test.ts`: initial7/7 RED, expected101 upgrade but got503. After socket integration7/7 GREEN.
2. `npm test -- tests/signals.test.ts`: initial12/12 RED, link-request still returned unavailable/error. After coordinator integration, combined sockets/signals19/19 GREEN.
3. `npm test -- tests/sockets.test.ts tests/signals.test.ts tests/hibernation.test.ts`: mixed-direction candidate129 initially returned void instead of capacity. Fixed aggregate budget per controller ruling;27/27 GREEN. A separate64KiB fixture failure was traced to PowerShell's non-UTF8 source encoding (replacement character made65537bytes); changed fixture to literal `\u00e9` escape and added an independent byte-length assertion. This was a test-fixture error, not a parser defect.
4. `npm test -- tests/sockets.test.ts tests/signals.test.ts -t 'hash'`: pending-auth concurrency RED, digest count2 instead of1. Durable auth_started guard fixed it; focused plus auth integration43/43 GREEN at that stage.
5. `npm test -- tests/signals.test.ts -t 'unrelated'`: RED stale-generation when readiness arrived during link hashing. Per controller ruling, replaced global latest-request cancellation with bounded per-pair operation stamp. Unrelated readiness and endpoint-retirement cases GREEN; added same-pair supersession coverage.
6. Self-review found outbound delivery needed its own authority recheck after asynchronous operations. `npm test -- tests/sockets.test.ts -t 'awaited operation'`: RED send returnedtrue after SQL revocation; fixed delivery revalidation and absent post-auth connection handling. Final full service119/119 GREEN above.

The first test-file creation command used duplicated relative paths and created no files (No test files found); corrected before the first meaningful RED. Initial socket GREEN printed event-handler return-value warnings from the test close listener; changed its arrow body to return void. Initial auth integration exposed the old transport fixture mismatch described below. No failures remain in final checks.

## Storage / API handoff

`RoomStore` remains the sole schema owner and uses existing singleton service_schema version1 with idempotent table creation. Added:

- `room_connections`: opaque socket_id primary locator, nullable unique seat_id/connection_id, own seat generation,5s auth deadline, durable auth_started, last_request, last_sent, last_ack. At most8 unauthenticated plus capacity authenticated records. Closed rows are deleted. Attachments contain only socketId; each event and outbound delivery reads SQLite authority.
- `room_credits`: (socket_id,sequence,bytes), maximum64 rows /262144 outstanding bytes per socket. Payloads are never persisted. ACK only deletes existing sent credit when last_ack < sequence <= last_sent. Duplicate/future ACKs cannot free credit.
- `room_socket_rates`: maximumcapacity seat rows. Durable token buckets: signal30/s burst60, ACK120/s burst240, retained across connection/seat-generation replacement and hibernation. Quota exhaustion closes1013. Every numbered request uses signalling quota; ACK has its independent bucket.
- `room_attempts`: maximum128 retained rows and3 live host/guest pairs, independent host seat generation and guest generation, room host generation, both connection IDs, SHA256 ticket hashes, issued/expiry times, two ready bits, directional candidate counters, live flag. Candidate admission caps the SUM at128, including null end markers. Closed rows expire at their persisted setup deadline; completed live routes survive the30s setup deadline while their identities remain current.
- `room_link_pending`: one operation stamp per current guest pair with host/guest connection IDs and30s expiry. Replaced only by another request for that pair; retirement deletes matching pending operations; finalizers only delete their own stamp. No application request/retry queue.

`SocketDelivery` exports ConnectionRow, LifecycleRequest, RequestHandler and methods used by Room: upgrade/message/close/retireSeat/sweep/current/byConnection/send/broadcast/roster. Runtime getWebSockets + socketId attachments recover transport handles without storing mutable authority in attachments. `onRetire` is installed to invalidate pair routes. `onRosterChange` is a Task4 hook called on connection/readiness/removal/join changes; it is unset in this task.

`Room.lifecycleRequest?: (ConnectionRow,LifecycleRequest) => ReplyOutcome | Promise<ReplyOutcome>` is the narrow Task4 integration point. Start/lease/rehost requests return correlated unavailable until installed. No new explicit public RPC methods were introduced; existing RPCs preserve DomainResult boundaries. Worker forwards socket upgrades only after existing route/IP/Directory checks; TURN/checkpoint remain unavailable.

`SignalCoordinator.issue(connection,guestSeat)`, `forward(connection,RtcSignal)`, `ready(connection,attemptId)`, `retire(connection)`, `invalidate(attempt)`, `sweep()`, `allGuestsReady()` are available to Task4. `allGuestsReady()` revalidates/sweeps current routes and requires both ready bits for every occupied guest; Task4 must additionally enforce its own connected/readiness/revision/proposal/lease conditions. The current task never starts a run.

## Client ordering / invalidation contract

- A successful auth atomically consumes its single-use ticket and connects the current generation, then sends authenticated(sequence1) before roster. No seat token appears in that session view. Invalid/non-auth/binary/repeated auth closes1008; a second auth while hashing cancels the pending one before another digest starts.
- Numbered requests must strictly increase per connection; ACK/auth allocate no request IDs. Replies are correlated, and server sequence monotonically increases across events/replies/hibernation. Async replies may complete out of request order, per controller ruling. Unrelated later requests never cancel an accepted async pair issuance.
- On pair replacement, old route becomes non-live in SQL before closed events. New distinct random tickets are inverted between endpoints; only hashes persist. Guest answerer link-issued is sent FIRST, host offerer SECOND, with NO await between sends. Both sends occur before later signal events can execute. Host request reply follows issuance. A failed endpoint send cancels the attempt and releases only that failed connection; remaining endpoints receive closed if their credit permits.
- BOTH native RtcIdentity.seatGeneration values are the guest's generation. The host's own seat generation is separately persisted and checked. Original RtcSignal objects are forwarded without rewriting only after room,attempt,host-generation,guest-generation,current sender/target identities,direction and candidate bounds pass.
- Host/guest link-ready is idempotent individually. Only both bits emit link-state ready. Rejoin/removal/disconnect/failure/expiry invalidate routes and emit link-state closed to still-current endpoints. Old close callbacks cannot clear replacement seat state. Clients must close native transports on invalidation; future client/native tasks own their side of that contract.
- Credits count complete UTF8 encoded envelopes. Overflow closes1013; no payload retry queue or secret persistence. Expiry is checked on events in addition to alarms. Room alarm derives auth/ticket/pending/attempt/room deadlines from SQL.

## Existing tests adjusted / limitations

Only existing `tests/auth.test.ts` retirement case changed: it previously created a socket whose attachment itself supplied seat/generation authority. Task3 uses SQLite authority, so the fixture timed out. It now exercises the production ticket/upgrade/auth helper and HTTP rejoin, asserting generation2 and close1000; no duplicated connection-table fixture remains. Existing unavailable TURN/checkpoint expectations remain unchanged.

Runtime tests cover real pinned workerd/SQLite, eviction with webSockets:'hibernate', single-use replay, auth expiry/cap, forged attachment authority, revocation, replayed request IDs, independent host/guest replacement, unequal native generations, cross-guest/from/to/direction/generation spoofing, aggregate candidate128/129,64KiB SDP UTF8 boundary,128-row cleanup,3 pairs, byte/count credit, throwing/slow sends, pending-crypto cancellation, and durable quotas/credits/partial ready/ticket consumption/candidate budget.

Some boundary tests seed persisted deadlines/counters or refill quotas to isolate the targeted limit; they do not claim wall-clock load benchmarking. Throwing-send and pending-digest tests replace only those external effects while exercising actual Room instances and SQL. Hibernation proof uses the installed runtime eviction helper, never a reconstructed fake class.

Task4 must install its lifecycle handler, preserve after-await authority/operation checks, and wire proposal/lease invalidation using the provided hooks. This implementation does not establish gameplay readiness, native end-to-end proof, deployed/WAN/TURN proof, or online-demo readiness. Parent-owned spec edits and draft validation document were left unstaged. No unresolved architecture ruling remains.

## Review round1 fixes (base b00f9e0)

Both findings reproduced before production changes:

- `npm test -- tests/signals.test.ts -t 'survivor|maximum escaped'`: RED,3 failed /21 skipped. Overflow and throwing readiness sends each produced survivor states `[closed, ready]` instead of `[closed]`. The escaped-SDP case accepted a98304-byte client frame but its server envelope was98315bytes; workerd visibly reported uncaught `invalid-frame` and the correlated-reply assertion timed out. No diagnostics were suppressed.
- After fixes, the same command: GREEN,3 passed /21 skipped,exit0.
- Final `npm test -- tests/signals.test.ts tests/sockets.test.ts tests/hibernation.test.ts`: GREEN,3 files /44 tests passed,exit0,10.10s.
- Final `npm run typecheck`: exit0. `git diff --check`: clean (only platform CRLF conversion notices). No root suite, full service rerun, cloud actions, or added agents for this round.

Readiness notification now rereads durable attempt liveness before each ready send and stops immediately after a missing/failed recipient delivery, invalidating the attempt if needed. Closed notifications still reach surviving endpoints. Regressions cover both output-credit overflow and an actual runtime socket's synthetic throwing send; neither permits ready after cancellation.

SocketDelivery now handles the shared encoder's fixed invalid-frame rejection explicitly. An envelope exceeding the unchanged ROOM_FRAME_BYTES limit raises fixed DomainFailure too-large before sequence/credit mutation or recipient closure; other fixed encoder validation failures become invalid-frame domain failures, while unexpected exceptions remain visible. The originating numbered signal request receives its correlated error. The escaped-SDP regression verifies exact98304 inbound /98315 outbound bytes, accepted client parsing, untouched recipient sequence/credits, both connections surviving, no oversized forwarded event, and a subsequent valid signal succeeding. No wire limit was relaxed and no innocent recipient is disconnected by attacker-controlled envelope expansion.
