# Net-3c Signalling Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Preserve the already selected execution method and authorized continuation.

**Goal:** Implement and verify the local production Worker/Room service and generic client, then carry actual RTC game traffic through its authenticated signalling.

**Architecture:** SQLite Room owns per-room state; singleton Directory owns allocation/global budgets through epoch-bound lifecycle reservations. Hibernating WebSockets carry bounded authenticated control/signalling only. Main-side client supplies transient credentials to the existing native transport; no gameplay in the service.

**Tech Stack:** Isolated services/signalling package; Wrangler4.156.0, Cloudflare Vitest plugin1.4.11, Vitest4.1.0, workers-types5.20261029.1, TypeScript5.8.3. Existing Electron37.10.3/root Vitest3.2.7 unchanged.

**Spec:** docs/superpowers/specs/2026-11-15-net-3c-signalling-service-design.md, including both builder resolutions. Parent Net-3 Internet Sessions design remains authority. Builder questions/resolutions: docs/superpowers/reviews/2026-11-15-net-3c-builder-check.md.

## Global Constraints

- Existing isolated codex/net-3 at39b5dc1; preserve owner checkout/Helm/uncommitted handoff and retained benchmark worktree. No cloud deployment, secret reads/copies/provider credentials, billing/DNS action or global process kill.
- Protocol2, SIM_VERSION35, snapshot/checkpoint2, strict replay2/receive-time replay3; no fixture bless, changed golden b87a0284, lowered gameplay floors or timing ceilings.
- Root dependencies/test framework stay unchanged; service has its own lockfile. Generic shared/client/service modules cannot import sector/ECS. Exact limits and fail-closed rules in spec bind all tasks.
- MAX_PLAYERS4; pair RTC seatGeneration means guest generation on BOTH endpoints. Service separately checks each socket's own generation and connection identity. No rewritten signals.
- Server lease/checkpoint/rehost land here; utility12s gate, live mirror loop, UI/token disk persistence, automatic reconnect/rehost and deployed/WAN/forced-TURN proof remain later. Never claim online-demo readiness.
- Every retained queue has byte/count bounds; cancellation invalidates awaited effects. No secrets/SDP/candidates/addresses/provider errors in logs. Local TURN tests intercept provider calls with synthetic values.
- Focused tests/typecheck per task; real pinned workerd/SQLite/hibernation proof mandatory. Parent runs complete service suite/root suite/native regressions once at final source, plus one whole-slice review and one combined fix/scoped review.

## Review Focus

1. A delayed Directory expiry/loss reply must not erase a started/rehosted room or release its new charge (Task4).
2. Hibernation or an async crypto/provider await must not restore consumed tickets, stale socket authority or old seat generations (Tasks2/3/5).
3. Unknown/slow/oversized requests and ACK floods must remain bounded before Room allocation/provider calls (Tasks1/2/3/5).
4. Unequal endpoint generations and replacing host versus guest must compose with unchanged RTC authentication/ordered start-signal IPC (Tasks3/6/7).
5. A fail-open test harness, lost correlation, or disposed provider must not fabricate native readiness, permit credential leaks or leave a process (Tasks6/7).

## Shared contract map

Task1 exports from src/shared/roomSession.ts: RoomCompatibility; RoomSnapshot (roomId,joinCode,runId,compatibility,capacity,hostSeatId,hostGeneration,phase,rosterRevision,seats with seatId/seatGeneration/occupied/connected/ready); SeatSession (snapshot,seatId,seatGeneration,seatToken); SocketTicket (ticket,connectionId,expiresAtEpochMs); LeaseGrant (roomId,hostGeneration,hostSeatId,nonce,expiresAtEpochMs); SessionCheckpointMetadata (version1,protocolVersion2,roomId,compatibility,runId,hostGeneration,checkpointSequence,capturedTick,payloadSha256); LinkIssued (attemptId,role,identity: RtcIdentity,localTicket,expectedRemoteTicket,ticketExpiresAtEpochMs); TurnCredentials (iceServers,expiresAtEpochMs).

ClientFrame = auth(ticket,connectionId), ack(sequence), or numbered RequestFrame with the spec's operations. Ack/auth do not allocate pending request IDs. ServerEnvelope = {sequence,payload}; payload discriminates authenticated(session view without token), reply(requestId,outcome), roster/start-proposed/started/link-issued/signal/link-state/lease/checkpoint-status/host-departed/host-changed/error. Reply outcomes distinguish snapshot, proposalId, attemptId, committed start(init/hash/lease), LeaseGrant, void, fixed ServiceError. Unknown fields rejected; service errors are fixed codes/retryable/retryAfterMs. Implementers choose idiomatic TypeScript unions matching this single map, not independent schemas per layer. Shared parseClientFrame(text), parseServerEnvelope(text), encodeServerEnvelope(value), validateCompatibility(value) enforce exact bounds.

Room capacity fixes logical slot count, not number of current humans; init player count is validated at game edge. Socket-ticket issuance only after create/rejoin (one current pending ticket); active/previously consumed connection requires token rejoin to advance generation before replacement. Metadata header X-FTL-Checkpoint is base64url UTF8 JSON <=4096bytes; authenticated seat/connection headers X-FTL-Connection and X-FTL-Seat-Generation accompany checkpoint operations. TURN body contains current connectionId/seatGeneration/hostGeneration. HTTP body reader has a5s deadline; at most2 in-flight checkpoint bodies/Room, released in finally. Auth/quotas precede large-body consumption.

### Task 1: Pinned runtime proof and shared service contracts

**Files:** services/signalling/{package.json,package-lock.json,wrangler.jsonc,tsconfig.json,vitest.config.ts,.gitignore}; src/shared/{rtcSession,roomSession}.ts; services/signalling/src/{index,room,directory,http,crypto,errors}.ts; services/signalling/tests/{runtime,protocol}.test.ts and test-only runtime probe; root package scripts/contentDigest/tests only narrow contract integration.

**Interfaces:** shared map above; replace native-only shared RTC types with RtcIceCandidateData/RtcIceServerConfig, structurally assignable to native types. Service exports Worker default, Room and Directory; initial routes fail closed until implemented. Helpers readBoundedBody(request,maxBytes,timeoutMs=5000):Promise<Uint8Array>, tokenHash(value):Promise<string>, randomHex128(), randomToken256(), normalizeJoinCode(), serviceError(code,status,retryAfterMs?):Response. Fresh schemas/version helpers are storage-only; no placeholder auth success.

- [ ] RED protocol exact/+1 lengths, duplicate/extra fields, base64/hash/ID/compatibility shape, binary WS, large declared versus actual streamed body and timeout. Shared RTC existing tests must retain behavior.
- [ ] Install exact service-local pins, use new_sqlite_classes Room/Directory and compatibility_date2026-10-23; root scripts test:signalling/typecheck:signalling/build:signalling forward with npm --prefix. Ignore service .wrangler/dist/coverage and local secret files. No root dependency upgrades.
- [ ] Actual runtime capability tests: SQLite transaction rollback and persistence; accepted hibernating socket survives real eviction/reconstruction with new instance marker and persisted state/attachment. Inspect installed helper exports, not latest-doc assumptions. Test-only ProbeDO stays outside shipping bundle. If unsupported, report specific gap before building dependent service.
- [ ] Run npm --prefix services/signalling test -- tests/runtime.test.ts tests/protocol.test.ts; service/root typecheck; root rtcPeer/rtcTransportOwner/contentDigest tests; service wrangler deploy --dry-run --outdir dist. Expected all pass and actual workerd evidenced. No deployment/login.
- [ ] Commit/report exact installed versions, exports, runtime proof and shared types for downstream tasks.

### Task 2: Directory budgets and durable room/auth HTTP boundary

**Files:** services/signalling/src/{index,directory,room,http,crypto,errors}.ts; src/room/{store,auth}.ts; tests/{directory,auth,http}.test.ts; shared contract adjustments only if needed.

**Interfaces:** Directory.reserveRoom(compatibility,capacity,ipHash):Reservation; commitRoom/resolveCode/resolveRoom; reserveActivation/commitActivation/releaseFenced/reconcile interfaces from spec; reserveTurn(ip-independent seat authorization passed by Room):void. Room.initialize(reservation,hostTokenHash):RoomSnapshot; create/join/socketTicket/checkpoint placeholders return fixed unavailable until their task. RoomStore owns SQL schema and synchronous transactions. Expose internal methods only through namespace stubs, never public URL passthrough. Directory methods async as cross-DO work requires; transaction bodies synchronous.

- [ ] RED actual-runtime concurrent code collision/100th+101st room/1000stored cap, invalid IP/salt/accounting fail closed,5create/20join per minute and10k IP metadata/expiry; no Room allocation for unknown IDs. Failed initialize/abandoned reservation charges until safely reconciled; exact initialization retry versus conflict.
- [ ] Implement bounded Worker routes/origin handling (missing/native or configured allowed origin, null permitted for Electron; no auth from origin). POST create/join with exact compatibility/token-derived seat; no query/token logging. Hash and persist tokens only. Lobby30min, capacity1..4, lowest seat, host0, revoked slot generation retained. Persistent expiry and conservative Directory accounting per spec.
- [ ] RED rejoin advances generation and retires old connection before replacement, revoked token cannot claim reused slot, new join after frozen/retained phase rejects, same compatibility required, seat index spoof ignored/rejected. Auth reader/stream deadline closes cleanly and releases in-flight slots.
- [ ] Implement one-current socket ticket/seat, random connectionId, hash-only30s ticket, requires fresh create/rejoin generation eligibility; do not activate socket until Task3 atomic consume. Missing token =>401, malformed=>400, incompatible=>409, quota=>429, accounting unavailable=>503, all fixed redacted bodies/no-store.
- [ ] Run service focused directory/auth/http runtime suites +service typecheck/dry-run; commit/report SQL/public/internal boundaries and exact APIs for Task3/4. No socket success fake.

### Task 3: Hibernating authenticated sockets and native pair tickets

**Files:** services/signalling/src/room/{sockets,signals}.ts, room.ts/store/auth integration; tests/{sockets,signals,hibernation}.test.ts.

**Interfaces:** Room.webSocketMessage/Close/Error use persisted connection records; SocketDelivery sends ServerEnvelope with persisted64message/262144byte credits. SignalCoordinator issues LinkIssued for both endpoints; RtcSignal forwarded unchanged. Room socket delegates lifecycle requests to a narrow handler installed Task4; unavailable otherwise. Current socket status/readiness/roster mutations persist.

- [ ] RED first-message5s timeout,8unauth cap, atomic single-use ticket (concurrent replay), second auth/other unauth messages, stale attachment after generation replacement, revocation and hibernation reconstruct. SQLite authoritative on every message; alarms+event checks enforce expiry even delayed alarm.
- [ ] Implement exact shared schemas, ordered IDs/replies and server sequences;30/sec burst60 signalling and120/sec burst240 ACK counters durable. ACK future/duplicate cannot release unsent credit;64message/256KiB limits close1013, no secret payload persistence. Slow/throwing send isolated; close old connection never clears new seat state.
- [ ] Implement ready/remove-seat and host-only link-request; random distinct local/expected tickets inverted, hashes only,30s setup and128row cleanup,3pairs. BOTH endpoints' native seatGeneration=guest generation. Persist/check host own generation separately. Send guest then host link-issued without intervening await; original signal routing checks full current pair/direction/candidate bounds. Both link-ready bits required for start.
- [ ] RED unequal generations, replaced host and guest independently, cross-guest/from/to spoof, ticket/attempt replay, stale/future hostgen, offer/answer direction, expired route,128/129candidate,64KiB SDP boundaries and output credit. Runtime evict while authenticated/partially consumed/quota near limit; after wake all authority/credit/quotas persist.
- [ ] Focused actual-runtime socket/signal/hibernation suites +typecheck/dry-run; commit/report client event order and invalidation contract.

### Task 4: Atomic start, leases, checkpoint storage and rehost

**Files:** services/signalling/src/room/{lifecycle,checkpoints}.ts, directory.ts/room.ts/store/socket delegates; tests/{lifecycle,checkpoints,activationRaces}.test.ts.

**Interfaces:** lifecycle handler consumes start-propose/commit, lease-renew, host-release,rehost-claim. Room.reconcileExpiry(expectedEpoch,now) is synchronous SQL/no callback to Directory. Directory reserveActivation(roomId,previousEpoch,operationId,expectedGeneration,targetGeneration), commitActivation(epoch,generation,activeDeadline), releaseFenced(epoch,receipt); precise operation outcomes persisted. Checkpoint raw HTTP uses shared metadata/header contract and token/currentconnection auth.

- [ ] RED propose with unready/unlinked/disconnected/stale roster;30s proposal, opaque init size/hash, roster changes invalidate; concurrent exact/competing commits, one frozen roster/init and one first lease. Await boundaries recheck auth/readiness/generation.
- [ ] Implement builder-resolved epoch protocol: reserve charge BEFORE grant; Room commits unacknowledged outcome, Directory ack, Room activates/returns only if still valid. Pending operations survive crashes, exact retries reconcile; lost accounting retains charge. Deadline cleanup must fence Room then compare Directory epoch, never blindly free stale phases.
- [ ] RED start at lobby expiry with delayed/lost ack; crash at each prepare/reserve/commit/ack boundary; full100active retained rehost refusal, two rehosts racing last slot, delayed old loss/expiry after newepoch; no early usable grant, no erased live mapping or double release.
- [ ] Server15s lease/nonce, expired renewal denied, current socket/hostgen required, host loss/release retained7days, explicit one-winner claim incrementsgen, no-checkpoint rejects. Test delayed successful operation beyond lease useful lifetime returns no usable grant. Utility gate remains absent here and docs explicit.
- [ ] Checkpoint262144 exact/+1, header4096, SHA256, auth-before-body,2inflight bodies/5s timeout, old lease/gen fenced after hash/body await; exact retry idempotent/conflict rejects; crash leaves old committedbytes, ordering generation/sequence permits earlier capturedtick. GET reserved token only and retention expiry.
- [ ] Focused real-runtime lifecycle/checkpoint/activation race suites +typecheck/dry-run; commit/report transaction/ack recovery contract. No game-mode validation or authority lease implementation.

### Task 5: TURN brokerage and durable provider budgets

**Files:** services/signalling/src/turn.ts, Room/index/Directory integration; tests/{turn,redaction}.test.ts.

**Interfaces:** issueTurn(currentSeatConnection):Promise<TurnCredentials>; fixed provider HTTP only, injectable via official Workers test fetch interception, not arbitrary user URL. Env TURN_KEY_ID/TURN_KEY_API_TOKEN server-only. HTTP service auth/currentconnection/hostgen checked before and after provider.

- [ ] RED stale/unauth/retained denied before provider, one issuance attempt/minute/seat and1000/day globally including failures; race across rooms cannot exceed globalquota; accounting failure no provider; hibernation does not reset quotas.
- [ ] Fixed endpoint, TTL3600, redirect:error,5s abort, response16KiB/201, validate8servers/16URLs/2048byte URL/512byte credentials, providerhost/protocol allowlist, remove port53 and require usableTURN. Expiry=request-start+3600s; no refund of unknown result.
- [ ] RED non201/redirect/timeout/large/malformed/empty-after-filter/SSRF-like URL, revoked generation while awaiting, repeatfailedissuance, no raw tokens/ICE/SDP/provider body in responses/logs/storage. Valid response uses synthetic credentials, never owner .env.
- [ ] Focused runtime TURN/redaction tests +typecheck/dry-run; commit/report tested provider shape and explicit live-TURN NOT RUN.

### Task 6: Generic service client for main-side composition

**Files:** src/network/session/serviceClient.ts and focused helpers if needed; tests/roomServiceClient.test.ts; shared contract/core digest integration; service tests/clientIntegration.test.ts with real service endpoints.

**Interfaces:** createRoomServiceClient({baseUrl,fetch,createWebSocket,clock,allowInsecureLocalhost?:boolean}) returns create(compatibility,capacity):Promise<SeatSession>; join(code,compatibility,seatToken?):Promise<SeatSession>; connect(session):Promise<RoomSnapshot>; request(operation):typed Promise<RoomReply>; getTurn():Promise<TurnCredentials>; putCheckpoint(meta,bytes)/getCheckpoint(); onEvent(callback):Unsubscribe; close():void. Named convenience methods optional only if thin typed request wrappers. No persistent token store/automaticretries/UI. HTTPS only except explicit trusted loopback development option; reject userinfo/query/fragment, requests redirect:error.

- [ ] RED malformed replies/events, correlation gaps/stale IDs,64pending cap before IDallocation, frame/byte bounds, token never in URL/publicevent/error; overlapping connect/join/close late-await effects, disposal aborts/rejects/removes all listeners. Exact per-operation validation before pending resolve.
- [ ] Implement HTTP Authorization/private token memory and WS first-auth ticket; no seat token sent over WS. Sequence validation/ACK after synchronous event dispatch; auth/ACK not pending request IDs; terminal generation changes invalidate stale work. Stream LinkIssued directly compatible with existing RtcAttemptOptions, no simulation imports.
- [ ] Real Workers endpoint integration uses production client (Node-side supported runtime launcher or equivalent actual-runtime bridge): create/join/auth/ready/link/propose/commit, TURN syntheticresponse, checkpoint/lease/rehost plus malformed/replay rejection. Never substitute fake Room for runtime proof; unit fake sockets cover callback races separately.
- [ ] Root focused client/RTC/shared/digest tests, root+service typecheck, service client integration. Commit/report exact methods and native composition sequencing for Task7.

### Task 7: Local Worker-to-native-RTC gate and final service evidence

**Files:** scripts/network/room-service-smoke.{ts,cjs} and scoped client/preload support; services/signalling/scripts/local-runtime.ts; package scripts, docs/gates.md, services/signalling/README.md. Reuse existing native owner/RTC/client components and harness cleanup patterns, no second product protocol stack.

**Interfaces:** test:room-service-runtime launches pinned real workerd with isolated temporary SQLite state and synthetic quota salt, builds production Electron entries, drives production service client in main with local HTTP/WS, existing native controllers and actual utility/remote sector client. No deployed hostname, real TURN request or secret access. Fixed localhost ephemeral port, bounded launcher timeout, exact owned process/profile cleanup.

- [ ] Actual room create/join/ticket auth/ready/nativepair; unequal host/guest seat generations; native both-ready before serverlink-ready/startcommit/authority creation+attachment. Observe real guest full/ACK/owned command and matching authority publication. Private observer cannot generate service responses or RTC ACKs.
- [ ] Independently replace guest and host socket generations, observe old attempt invalidation/close and new pair readiness; stale signal/ticket rejected, no cross-seat routing. Caller starts native attempt synchronously on link-issued before later signal IPC; delayed first offer cannot be lost. Backendlease explicit renew in harness only, no claim utility is lease-gated.
- [ ] Require actual Worker SQLite/hibernation suite evidence, native PC/window/utilityexit plus Worker process exit and temporary state/profile removal. Faults page/worker/timeout/missingevidence all nonzero; no globalkill. Service testprovider distinguishes fake TURN HTTP from actual local signalling/RTC. No WAN/forcedrelay/twophysicalPC claims.
- [ ] Full service suite/typecheck/dry-run; focused native normal/negative+root typecheck/build; report artifact paths/versions/commands/timings. Parent final root suite/existinghost+RTC gates and service gate as warranted, one whole-slice review/fix/rereview. No duplicate acceptance/engines unless canonical serialized policy changes.
- [ ] Document reproducible local commands, configured quotas/expiry/migrations, ignored .dev.vars.example variable names only, deployment prerequisites/NOTRUN boundaries and remaining3d/3e work. Commit/report.

## Self-review and completion boundary

All parent3c auth/lobby/signalling/TURN and server-side race requirements map to Tasks1-7. Global capacity/expiry authority is explicit (Task4), native generation mapping is shared (Tasks3/6/7), and all five review-focus risks have named checks. Product UI/token storage/retry/utilitylease gate/live mirrors/deployment/hardware remain outside this plan. Pins are research-verified; installed runtime capability proof in Task1 is a dependency gate. Follow existing SDD ledger/review workflow without reopening already approved execution or stopping between tasks.
