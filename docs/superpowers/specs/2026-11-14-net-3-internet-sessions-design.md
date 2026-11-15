# Net-3: Internet sessions

Status: approved implementation design under the Net-0 decision; builder check complete. Written 2026-11-14 after Net-1b merged as 3047027, alongside Helm H-0a. Current implementation and remaining deployment scope are recorded below.

Implementation update, 2026-11-15: Net-3a through Net-3d are implemented and reviewed on `codex/net-3`. [Net-3d validation](../reviews/2026-11-15-net-3d-validation.md) proves two actual local app processes, assigned-seat controls, bots/reconnect, and bounded native cleanup. Final runtime source `33d674b`; root2,479/service222 tests pass, acceptance28.205s meets the unchanged30s target, and three-engine replay passes. The branch remains unmerged. Net-3e still owns independent utility fencing, mirrors/rehost, deployment and live TURN/WAN/two-machine proof; internet-demo readiness is not claimed.

## 1. Outcome and scope

Two Windows Electron computers on different networks can create/join a private room, occupy one reserved crew seat each, start the same run, play through WebRTC with TURN fallback, reconnect to their own seat, and later re-host the latest saved checkpoint after the host leaves. Start with the sector run as the integration harness; service, transport and sessions must also carry the Helm duel when H-0/H-1 supplies that mode.

The approved choices remain host authority, WebRTC star topology, Cloudflare signalling/storage/TURN, fixed roster after start, and manual checkpoint-based re-hosting. Net-3 does not implement Helm combat, own-avatar prediction, browser packaging/hosting, public matchmaking, automatic host migration, WSS gameplay relay, or a relay-only product setting. Forced relay is a required test. Net-2 mouse controls are not required for the demo.

## 2. Current implementation and prerequisites

`net/contracts.ts` provides byte-oriented Link/Session; `authority/authority.ts` owns simulation/ledger/checkpoints; `clientControl/clientRun.ts` owns a validated replica and controller UI. `app/localRuntime.ts` constructs the authority in the renderer and supplies local pre-tick producers. Main opens one window; preload only forwards suspend/resume. No online provider, room service, utility-process host or online lobby exists.

Current ingress requires requestedTick/held.tick equal the authority tick. Real latency makes normal remote input stale. The client also advances IDs before capacity rejection, requiring an ordered retry policy online. RunInit/codec/publication types are sector-specific; Helm design section 11b requires mode-independent transport.

Before transport, the separate recovery preflight fixes Opus F-1 synchronous close during an open journal frame and F-2 sealing/restoring an error-phase partial state. Preserve the last-good CrashRecord checkpoint and diagnostic snapshotAfterFault. No gameplay re-bless.

## 3. Process ownership and modes

Use native Chromium WebRTC in a dedicated hidden, sandboxed BrowserWindow with `backgroundThrottling:false`. Host authority runs in `utilityProcess`; visible-renderer stalls cannot gate it. Main owns process/window/port lifetimes and validates IPC senders. Preload exposes only typed session operations/status and transferred MessagePorts, never raw ipcRenderer or filesystem/shell access. Utility or transport-process death triggers saved-session recovery. Suspend requests a trusted pause and best-effort save; resume remains paused until explicit player action.

Alternatives considered: node-datachannel would put transport beside authority but adds native ABI/packaging work; renderer authority avoids IPC but fails the approved independent-clock boundary. The selected Chromium transport plus utility authority avoids a new native dependency. Prove the port bridge and independent clock in real Electron first.

Transport/session modules must not import sector or tactical state. Introduce a compile-time mode registry, initially `sector`, later `duel`, with adapters for init/input validation, authority/replica construction, state-image conversion, checkpoint validation, and disconnect/rejoin policy. Generic messages carry bounded bytes and a mode ID/schema version. Do not rewrite the simulator merely to introduce this seam. Unknown modes reject before allocation.

A state image is mode metadata plus a dense finite Float64 canonical value array. The adapter validates the complete reconstructed image before replica writes; delta code knows indices/lengths, not gameplay. Signalling treats checkpoint payloads as opaque bounded bytes; hosts/clients perform mode validation. Build the same content digest into renderer, utility and tests, including mode simulation/data/command schema and protocol policies. Test with a minimal second mode to prove no sector assumptions; the shipping duel adapter belongs to H-2 after H-0/H-1.

## 4. Protocol and identities

Network session protocol is **2**. Existing local loopback/replay-v2 fixtures remain explicitly supported. Protocol, mode/schema, simVersion, layout hash and content digest must match before seat acceptance/start/sync. Show a concrete compatibility error; no silent downgrade.

| Identifier | Meaning |
|---|---|
| roomId | Secure random 128-bit room identity |
| joinCode | Eight case-insensitive Crockford-base32 characters, collision checked; unrelated to tokens |
| runId | Existing authoritative run identity, preserved through re-host |
| hostGeneration | Persisted DO-controlled increasing fencing value |
| seatId / seatGeneration | Stable roster player index / increasing producer-replacement generation |
| connectionId | Random identity for each signalling/WebRTC attempt |
| command ID | Existing (player, sequence), shared through the authority ledger by successive human/bot producers |

SDP/ICE messages bind room, host generation and both endpoint connection IDs. Authentication binds sockets to seats; never trust a client-supplied player index. Each WebRTC reliable channel begins with a short-lived single-use link ticket issued by the room and separately delivered to authenticated endpoints. Check it before accepting game bytes. A peer label alone is not authentication.

## 5. User and session flow

Add Host / Join / Resume saved session alongside couch play. Host sees a code and roster; Join takes that code. Main stores seat tokens in private userData using atomic writes. No tokens in URLs, logs, crash reports or analytics. Visible renderer receives its seat ID; hidden transport receives only its transient link ticket. Long-lived TURN credentials stay server-side.

States: idle -> creating/joining -> lobby -> connecting -> syncing -> running/paused -> reconnecting -> saved/ended/error. Host starts only after human seats are ready and connected. Freeze roster and mode init atomically before creating authority. New players cannot join after start; only the original token can reclaim a reserved seat. Lobby removal revokes a token before slot reuse. Size tables from mode player count bounded by MAX_PLAYERS.

Map physical keyboard/controller player 0 to the assigned logical seat; emit only owned input. Use existing per-player HUD and mode rendering. Focus loss neutralizes local input and stops production, without pausing everyone. Explicit pause retains visible owner/reason. Camera and console controls remain mode-owned.

## 6. Remote admission and input lifetime

Every asynchronous human binding uses explicit receive-time admission: this includes the host renderer over MessagePort as well as remote WebRTC guests. Existing synchronous couch/localRuntime and in-process bot bindings remain strict and unchanged. No process waits for renderer input. A port is not considered synchronous merely because it stays on one computer. At a completed authority boundary, admit the original remote envelope for the next unexecuted tick in receive order. requestedTick means the latest host tick observed by the sender. Never rewrite an envelope before duplicate comparison.

For a new expected sequence, reject future ticks and ticks over 120 simulation ticks old (two seconds at 60 Hz). Duplicate lookup precedes this age check so a delayed retry returns its original purchase result. Results identify actual execution tick. Target/visit/offer checks still run at execution; latency never substitutes a replacement target by index. Paused input obeys bounded controls, adds no clock debt, and cannot bypass semantic staleness checks.

Remote held frames retain increasing sequences, use the same age window and apply newest-per-seat at the next tick. A host receipt-age watchdog neutralizes held input after 250 ms without valid input; it does not trust client wall time. Connected active producers send neutral or held frames at 60 Hz. Focus loss also sends reliable neutralization so a dropped latest packet cannot leave movement/repair held. Journal watchdog transitions; replay does not read a wall clock. Local bots are not expired by the remote watchdog.

The online sender retains immutable commands until acknowledged, bounded at 256/seat, reserving one queue slot for pause/resume. For receive-time bindings only, a well-formed owned/current-run command with the next expected sequence receives a terminal cached result even when over-capacity: consume that ID without increasing gameplay admissionCounts. This lets a higher-ID resume follow a rejected ordinary action at a paused, saturated tick. Local strict semantics stay unchanged. Duplicate/conflict lookup precedes capacity rejection. Wrong-run/unowned/malformed and out-of-order IDs never consume another player's expected ID. Every remote response includes expectedSequence and whether the ID received a terminal disposition. On expected-sequence gaps, stop higher IDs and resend the identical retained missing envelope; if unavailable, reconnect with a fresh producer generation/full sync. Never substitute another command under an already used ID. Reject excessive UI actions before allocating IDs. Conflicts close the link. Bounded ingress and signalling limits still prevent rejected commands from creating an unlimited work loop. Published high-water and terminal results retire admitted/rejected IDs. Required regression: fill the ordinary tick budget, pause, send ordinary command N then resume N+1; N is terminally rejected, N+1 resumes, retries return cached results, and gameplay capacity stays exhausted until a tick advances.

Journal original remote envelopes, binding admission policy and effective tick. Add **replay v3** for these records; preserve v2 parsing/execution for existing golden/offline evidence. Sealed core checkpoint v2 can stay unchanged if all required state remains represented; the network wrapper is separately versioned below. No SIM_VERSION bump merely for transport metadata. Tests prove unchanged local strict admission, charge-before-command behavior, and stale-target rejection.

## 7. WebRTC Link and bounded delivery

Host offers one RTCPeerConnection per guest. Use reliable ordered data for commands/results/events/control/full state/checkpoints, and unordered maxRetransmits:0 for held input/ordinary deltas. No media tracks or capture permissions. Link is ready only after both channels and ticket handshake succeed. Buffer at most 64 ICE candidates before remote description, 128 total/negotiation; cap SDP at 64 KiB and setup at 30 seconds. Ignore obsolete attempt IDs.

Binary framing has kind/version/length and strict caps before allocation. Chunks are at most min(16 KiB, negotiated SCTP maximum). Chunk only reliable large messages. Logical budgets: checkpoint 256 KiB uncompressed, full state 128 KiB, input 4 KiB. Measure actual outputs in CI; do not reuse the historical 1 KiB checkpoint estimate. Reject invalid lengths/counts and compression bombs.

Per-peer reliable application queue plus browser bufferedAmount is capped at 1 MiB. At most two partial assemblies, each expiring after ten seconds. Overflow closes explicitly. Latest packets have one replaceable slot per stream and never queue behind stale packets. Drain bounded work through bufferedamountlow; copy/transfer bytes to isolate caller mutation. Close is idempotent and safe inside send, as required by recovery preflight F-1.

## 8. State deltas and presentation

Authority remains 60 Hz; ordinary remote state sends at **20 Hz**, every third completed tick. First sync, rejoin, pause, end and control boundaries send full state immediately/reliably. Reliable results/events retain run/event IDs and wait for a compatible state tick before presentation.

Full images carry stateSequence, tick, metadata, value count and checksum. Client acknowledges only after reconstruction and mode validation. Delta references an acknowledged immutable baseline; changed indices are sorted, unique and in range. Include current publication/control metadata. Never delta against an unacknowledged latest packet. Keep at most 64 images/peer under a bounded full-state memory budget; eviction/missing base triggers a rate-limited full refresh. If delta is no smaller, send full. Reject stale sequences. Wrong hash requests a full refresh once; a repeated invalid full state closes the link.

Render 100 ms behind authority (two ordinary samples), interpolating only mode-approved positions/headings. Snap on seat/sector/target-generation/pause/end/teleport transitions. Keep confirmed state separate from presentation; no extrapolation through a dead link and no gameplay prediction. Record RTT, loss, resync count, queue size and direct/relayed route; redact addresses, SDP, candidates and tokens.

## 9. Cloudflare service and authentication

TypeScript Worker in `services/signalling`, SQLite-backed Room DO per room and a small Directory DO for join-code allocation/expiry and global budgets. Neither runs gameplay. Room owns roster, token hashes, compatibility, host lease/generation and committed checkpoint. Use hibernating WebSockets; persistent data belongs in SQLite, not only in-memory maps or socket attachments.

Versioned endpoints:

- POST /v2/rooms: allocate room/host seat/code/token. Idle lobby expiry 30 minutes; active session max 24 hours before explicit save/re-host.
- POST /v2/rooms/{code}/join: compatibility and optional existing token; new seats only in lobby.
- POST /v2/rooms/{roomId}/socket-ticket: Authorization-header seat token exchanges for a single-use 30-second ticket. WebSocket authenticates in its first message within five seconds; no token query strings. Bound unauthenticated sockets and permit nothing else before authentication.
- Authenticated socket schemas: ready/roster/start proposal+commit, SDP/ICE, link ticket, lease refresh, checkpoint status, host departed and rehost claim. Validate direction/type/size and active generations.
- POST /v2/rooms/{roomId}/turn: current authenticated seat/connection, at most one batch/minute/seat; return ICE servers plus expiry.
- PUT/GET /v2/rooms/{roomId}/checkpoint: active leased host writes; reserved seats read. Cap request bytes, verify byte hash, atomically commit under host generation.

Seat tokens are secure random 256-bit values; store only hashes. Rejoin advances seatGeneration and invalidates old connections before replacement. CORS/origin filtering supplements authentication: Electron file origin is not proof of seat ownership. Never reuse TURN API tokens for room auth.

Development quota defaults, configurable and tested: 5 creates/IP/minute, 20 join attempts/IP/minute, 30 signalling messages/seat/second (burst60), 100 active rooms globally, 1000 TURN issuances/day. Enforce global caps before allocation/provider calls; fail closed when accounting is unavailable. Hash IP bucket keys with a server-only salt and expire them. These are demo budgets, not a general account service. Show retryable errors; do not automatically buy a plan or raise budgets.

## 10. Account/TURN configuration

Owner handoff lives at `docs/superpowers/research/2026-11-14-cloudflare-setup-handoff.md` in the owner checkout. Intended endpoint, not deployed: `https://ftlite-signalling-dev.gprout009.workers.dev`. Account `ffb0dfdd5fa8ccc1da8801ee4e95b752`, independently verified with `wrangler@4.156.0 whoami --json` on 2026-11-14; only account ID was printed. Existing TURN app is `ftlite-dev`. Earlier credential-generation 201 is not gameplay connectivity proof.

Owner root .env holds TURN_TOKEN_ID/API_TOKEN. Worker bindings are TURN_KEY_ID/TURN_KEY_API_TOKEN via Wrangler secrets or ignored service-local .dev.vars. Never print values, use VITE_ names, or copy credentials into fixtures. Request ttl3600, renew on demand before ICE restart within five minutes of expiry. Filter port53 URLs for browsers; support provider UDP/TCP/TLS addresses. Never log ICE credentials.

Pin service-local Wrangler to an explicitly tested version at least two weeks old; 4.156.0 already works with this account. Use SQLite migrations supported by that pin; current docs' newer exports syntax is not assumed compatible. Dry-run config/migrations first. No unrelated DNS or custom-domain changes. Free/SQLite availability is confirmed; measure actual service cost/limits rather than repeating estimates.

## 11. Guest loss and rejoin

Loss closes producer binding and neutralizes held input at a recorded completed boundary. Mode policy decides takeover: sector installs its existing published-state bot; duel records lifecycle absence and follows unattended-console rules, with no seat bot. Transport must not decide this gameplay difference.

Room authenticates the reserved token, advances seatGeneration and closes the old connection before replacement tickets. Authority retires old/bot producer at a boundary, seals/rejects pending commands as required, then sends reliable full state/watermarks. Fresh UI starts at water+1 and held high-water, carrying no abandoned pending commands; cached results preserve deduplication. Human input resumes only after full-state acknowledgement. Rejoin never automatically unpauses. Host checkpoint includes bot memory.

Retry signalling/ICE after 1,2,4,8 seconds (cap8), with a 30-second attempt window and explicit retry afterward. Cancellation closes every peer/port/timer and invalidates tickets. No roster changes during reconnection.

## 12. Saved checkpoints, leases and manual re-host

SessionCheckpointV1 wraps roomId, mode compatibility, runId, hostGeneration, checkpointSequence, payload bytes/SHA-256, captured tick and protocol. DO verifies active lease/generation and monotonic sequence, atomically stores bytes/metadata, then acknowledges. Peers validate mode payload and retain latest committed save. Rank by generation/sequence, not tick: a later generation can resume an older saved tick. Guests cannot replace a save by claiming a higher tick.

Capture before start, every 300 completed ticks, on pause/mode safe point, and graceful host exit. Also capture within five wall-clock seconds of new paused control state. Use completed-boundary APIs; pending commands receive explicit unavailable results and producers reconcile them. If periodic sealing disrupts inputs, implement nondisruptive completed-boundary capture rather than weakening exactly-once behavior. Coalesce redundant mirror writes, retain immediate graceful-exit save.

Host renews a server-issued lease every five seconds, valid 15 seconds. Each request carries a unique nonce and current generation; the utility owner records its monotonic request-start time. A matching reply grants local work only until request-start + 12 seconds, never receipt-time + 12. Ignore obsolete nonces/generations and replies arriving after their useful deadline. Only one renewal request is current; abort older attempts. The host process checks an independent lease-valid gate before every admission/control/tick, including every catch-up tick. Expiry closes the gate, neutralizes producers and pauses; player Resume cannot reopen it. Invalidate the gate on process resume/suspend, clock discontinuity or service fencing, requiring a fresh server grant. Do not replay elapsed expired-lease time as catch-up debt after regrant: reopen a fresh paused clock epoch and resume explicitly. Lease effects are journaled as trusted session lifecycle data; offline replay follows recorded effects, not a real lease. The DO refuses renewal of an already expired generation: the old host must use the same explicit claim/rehost flow as any other seat. DO rejects expired writes. Required tests delay a successful reply beyond its useful lifetime while granting a new host, and resume a suspended old host while pressing Resume; neither old authority may admit, tick or commit. Clients freeze on host link loss and show last committed checkpoint age. Graceful exit waits up to three seconds for save commit; failure preserves a clearly marked local pending save and displays mirrored age. Abrupt loss can lose progress after the last safe checkpoint; no promise that every last command survives host kill.

No automatic election. A reserved seat explicitly chooses Re-host after old lease expires/releases. DO atomically increments hostGeneration and grants one winner; old links/tickets are invalid. New host restores committed state detached/paused, recreates producers/links, syncs everyone, then requires explicit resume. Retain checkpoint/roster/token hashes seven days after loss/end, then expire with a clear message. Exported local saves may outlive the room but create a fresh room/invitation flow; they cannot replace an active room arbitrarily.

## 13. Delivery and proof

| Slice | Deliverable | Required proof |
|---|---|---|
| Preflight | Safe disconnect journal; reject faulted saves | Actual overflow/crash regression and unchanged replay/golden |
| Net-3a | Receive-time admission/outbox, utility authority, byte ports, mode session seam | Delayed host inputs and replay agree; UI stalls do not stop authority; restart/suspend/fault cleanup; unchanged sector loopback |
| Net-3b | Delta codec and RTC Link using Net-3a admission | Backpressure, loss resync and real RTCPeerConnections carry delayed/retried input correctly |
| Net-3c | Local Worker/Room auth/lobby/signalling/TURN | Workers-runtime tests of hibernation, token replay, concurrent starts/rehosts, quotas/redaction |
| Net-3d | Host/Join UI and online sector session | Two local Electron instances; correct assigned-seat controls/HUD; reconnect/bot handoff; couch regressions |
| Net-3e | Mirrors/leases/rehost and deployed internet proof | Forced TURN, host kill/rehost, compatibility rejection and two physical computers on different networks |

Each slice gets its own plan/review. Complete a working slice before broadening implementation. No false shipping duel adapter before H-0/H-1 is ready.

Final gates: regression/typecheck/build, sector acceptance/golden and tactical tests, cross-engine replay, actual Electron process/link tests, Worker integration, and two-machine playtest. Exercise 50/150/300 ms RTT, jitter/loss, five-second stall, malformed frames, duplicate/conflicting input, stale targets, exhausted-cap resume, guest reconnect, old-seat connection, TURN expiry, service interruption, crash during upload, and host loss while paused. Measure RTT, bandwidth/queue budgets and selected route.

Two tabs on one PC, a credential 201, local service mocks or a health endpoint cannot prove internet demo readiness. Owner involvement is needed only for real second-network/hardware verification and account/billing interactions that actually require them. Unavailable platform/hardware gates remain NOT RUN.

## 14. Research checked 2026-11-14

- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) and [MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports): Node utility authority and Chromium transport bridge.
- [W3C WebRTC](https://www.w3.org/TR/webrtc/): ordering/retransmission, bufferedAmount and negotiated SCTP limits. Wire budgets above are project choices, not WebRTC limits.
- [Cloudflare TURN credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/): server-side generate-ice-servers, 201 response, port53 warning; [TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/) recommends ICE restart.
- [Durable Object WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/): hibernation and attachment lifetime; durable roster/saves require storage.
- [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and [exports/migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/): SQLite on Free and version-sensitive configuration. Documentation does not prove provisioning.
