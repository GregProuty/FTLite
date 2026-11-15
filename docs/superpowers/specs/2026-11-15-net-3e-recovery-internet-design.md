# Net-3e: fenced recovery and internet verification

Status: proposed slice details under the approved Net-3 parent design; [builder check complete](../reviews/2026-11-15-net-3e-builder-check.md), ready for design approval and implementation planning. Source baseline `f62cf4e`, runtime `33d674b`, branch `codex/net-3`. No product code, deployment or credentials changed for this document.

## Outcome and existing decisions

Finish the approved internet-session design: the authority must stop independently when its lease is no longer valid; players retain a server-committed recovery checkpoint; a reserved player can explicitly re-host that checkpoint; the same application can use deployed signalling and TURN. Internet-demo readiness requires real gameplay between two Windows computers on different networks, not merely a successful local or relay handshake.

The parent authority is [Net-3](2026-11-14-net-3-internet-sessions-design.md), particularly sections 10–13. Preserve host authority, the WebRTC star, fixed post-start roster, manual re-hosting, command/held watermarks, compatibility checks, main-only credentials and the mode boundary. No automatic election, prediction, public matchmaking, new gameplay mode, WSS gameplay relay, or billing/quota expansion.

Controller recommendation: deliver Net-3e in two verifiable stages. **Recovery** implements and proves utility fencing, mirrors and manual re-host locally. **Internet verification** wires TURN/HTTPS and produces a deployable candidate, then runs separately recorded deployed/relay/two-machine checks. These are stages of the same approved scope, not a declaration that local recovery completes Net-3e. Existing tools/dependencies stay pinned.

## Approaches

The parent already selected manual checkpoint recovery. Keeping renewal only in main cannot stop a utility while main stalls, so it cannot satisfy the fence requirement. Automatic migration or uploading arbitrary peer saves changes the agreed trust/rollback model. Use utility-owned lease timing plus the existing DO's committed checkpoint and atomic generation claim. Reuse the existing client/service APIs rather than introduce a second recovery backend.

The proposed stage split keeps useful, testable work independent of cloud access and hardware availability. Its cost is separate evidence for local completion and internet readiness. A single all-at-once delivery would obscure which guarantees have actually been proven.

## Verified code seams

| Current seam | Required change |
|---|---|
| `src/main/network/onlineSession.ts` renews every five seconds and destroys contexts on host loss | Keep orchestration in main, move permission to work into utility; retain a saved-session state after loss |
| `src/network/utilityHost.ts`, `hostRuntime.ts`, `modes/contracts.ts` have no lease gate | Add trusted private lease messages and a generic fail-closed gate, supplied to mode authority |
| `authority/core.ts` admission, controls and tick execution; `tickDriver.ts` retains catch-up debt | Check before each protected operation and catch-up tick; explicit fenced clock reset must not change ordinary pause/debt behavior |
| `core.ts::sealCheckpoint()` drains controls and rejects pending work; ledger export refuses pending entries | Capture regular completed baselines without an extra disruptive seal; explicitly settle pending work when safe-point sealing is required |
| `modes/sector.ts` already validates/restores checkpoint v2 and captures real bot memory | Add bounded mode-neutral capture notifications/requests and full validation for local mirrors |
| `RoomCheckpoints`, `RoomLifecycle`, `RoomServiceClient` already implement PUT/GET, nonce renewal, checkpoint status and atomic re-host claims | Integrate these APIs; preserve generation/connection/hash checks and quota accounting |
| `onlinePeers.ts` passes `iceServers: []`; client already has `getTurn()` | Add bounded main-owned credential acquisition and generation-bound attempt setup |
| `onlineConfig.ts` disables packaged/HTTPS online | Retain development default; enable an explicit reviewed HTTPS configuration only after the utility fence is integrated |

## 1. Independent utility lease

Use a generic utility-owned state machine: CLOSED, VALID, FENCED, DISPOSED. It contains room/run identity, host generation, a utility-instance epoch, one current renewal nonce, local request-start time and deadline. It never receives seat tokens, TURN credentials or URLs. Main authenticates to the service and forwards validated grants; visible/transport renderers cannot call lease operations.

The utility stamps the start of each renewal with its own monotonic clock **before** asking main to send the service request. Main forwards the nonce unchanged. Only a reply matching room, generation, host seat, utility epoch and current nonce can grant work. Local validity ends no later than request-start + 12,000ms; arrival time never adds twelve seconds. Also reject grants whose server expiry has already passed. Keep one request current, retire older requests, bound pending IPC, and ignore late/reordered replies.

The service lease remains 15,000ms and renewal cadence 5,000ms. Utility grants are private capability updates, not gameplay commands or renderer status. The utility checks its clock and grant directly before admitting input, before applying player controls, and before **each** tick, including catch-up ticks. An exception in this check fails closed; do not put it inside the existing swallowed producer callbacks. Bots are covered too. A check must stop tick-driver advancement itself, not merely return from a callback after consuming the tick ordinal.

On expiry, fencing or discontinuity: latch CLOSED/FENCED before touching producers; reject/settle already admitted pending work through journaled existing lifecycle/seal semantics; clear held state; pause at a completed boundary; prevent further admission, resume or authoritative publication claiming continued gameplay. Closing transports may follow, but is not the enforcement mechanism. Duplicate terminal responses may be read without admitting new work. Player Resume cannot clear the gate. Lifecycle cleanup and reading a last-good immutable checkpoint remain possible while closed.

Trusted suspend/resume messages invalidate the grant. Independently sample monotonic and epoch clocks in utility; backward/nonfinite readings or a discrepancy above the existing 2,000ms tolerance invalidate it. Never rely solely on a main-process timer or power event. Regrant discards only the fenced clock epoch's debt and remains paused; ordinary pauses and five-second stalls under a valid grant preserve all debt. If server generation expired, reconnect uses explicit re-host; it cannot renew the expired generation.

Initial start needs a utility-local timestamp despite the service commit happening first: commit the room using existing semantics, create the utility CLOSED, then issue a fresh utility-originated renewal. The initial commit's server-generated nonce is not a grant with an invented local start time. Authority initialization/capture is allowed while closed, but no gameplay/control admission or ticking is. Startup fails closed if a current useful grant cannot be obtained. Local/couch runtimes retain their explicitly ungated mode; online initialization must never silently fall back to it.

Use existing journaled trusted pause/held/seal effects where sufficient. Offline replay follows those recorded effects without consulting a live lease. Keep protocol2, SIM_VERSION35, checkpoint2 and replay2/3 unless implementation demonstrates a serialization incompatibility; any necessary format revision must be explicit with migration tests, not silently accepted under the old parser.

## 2. Captures and committed mirrors

Retain `SessionCheckpointMetadata` version1 and the existing 256KiB payload/4KiB metadata caps. A mirror is metadata plus exact payload bytes; verify SHA-256, compatibility, run/room, captured tick and mode checkpoint before accepting it. Generic session/storage code handles opaque bytes; mode validation belongs to the adapter. No sector imports in generic host/runtime code.

Capture the initial completed baseline before the first gameplay tick; every 300 completed ticks; on pause and existing mode safe points; within five wall-clock seconds of new paused control state; and on graceful host exit. Utility owns capture scheduling so a stalled renderer/main does not prevent recording a safe baseline. Main owns persistence/upload. Keep at most one capture/write in flight and one newest replacement candidate, with at most one last committed and one local pending checkpoint. Coalesce intermediate periodic candidates; do not discard the final graceful-exit candidate behind an older queued request.

Regular running capture uses the already completed 300-tick baseline (or a mode-provided equivalent) after execution/results settle, without calling public destructive `checkpoint()` a second time. Do not drain newly arrived input solely to create a save. Pending ledgers cannot be serialized or silently projected into a checkpoint. For paused/exit safe points, existing sealing may terminally reject pending work as unavailable; deliver results and reconcile producer watermarks. Add traces proving ordinary periodic saves do not introduce command rejection or ID reuse, including reentrant input during publication. If a boundary is not serializable, keep the previous valid checkpoint and retry at the next valid completed boundary; paused safe-point capture must still meet the five-second bound using explicit settlement.

Initial Start remains latched until the initial checkpoint is accepted by the DO. The original explicit Start intent may then release the bootstrap pause; recovery never reuses that intent. This prevents a newly started game from having no recoverable checkpoint. A failed initial save produces an actionable save/start error without allowing unmirrored gameplay.

Main assigns an increasing positive sequence within its current host generation and uploads exact captured bytes. Persist the local pending candidate atomically before upload when storage is available. An HTTP success acknowledges only that exact metadata/payload; a checkpoint-status event triggers authenticated GET and validation, not trust in the event alone. An uncertain upload is resolved by GET and exact identity/hash comparison. Sequence high-water survives reconnect/restart and is reconciled with the service; an existing generation never restarts at sequence1 blindly.

Guests GET and validate each newest advertised committed save, coalescing rapid notifications. Persist only the latest validated committed mirror. Rank by `(hostGeneration, checkpointSequence)`, never captured tick: a new generation may legitimately restore an earlier tick. Retain service receipts/metadata but never portray a locally pending save as committed. No peer can submit an alternative high-tick checkpoint to take over an existing room.

Add a separate bounded atomic mirror file in userData rather than expand the 8KiB saved-seat credential record. One file holds the current session's committed/pending entries with explicit status and combined maximum 544KiB (two 256KiB payloads, two metadata records and bounded envelope overhead); use a binary/length-delimited container or count encoded overhead if choosing JSON/base64. Exact temp ownership, serialized replace/clear, cancellation epochs and strict parser rules follow `seatStore.ts`. No tokens inside mirror bytes, status, logs or exported diagnostics. Storage errors are visible; last valid committed data remains intact. Forget clears both stores through the same fenced owner operation; a late upload/capture cannot recreate either file.

## 3. Manual re-host

On host loss, freeze the last confirmed presentation and retain saved-seat identity plus validated committed metadata. Keep/re-establish the authenticated service connection as needed; do not automatically create an authority. Display last committed captured tick and time since local receipt; label receipt age accurately because existing metadata has no server commit timestamp. Pending local progress is separately marked.

Offer Re-host only to a still-reserved, compatible seat when service state permits it and a committed checkpoint exists. Local presence of a mirror does not prove the server permits a claim. Read and validate the service checkpoint, then send `rehost-claim` with expected host generation and nonce. DO serializes contenders. A losing claim refreshes roster/host state and can reconnect to the winner; it does not allocate competing gameplay authority.

The winner adopts the actual service snapshot, not `oldGeneration + 1` guessed locally (failed provisional activation can burn generations). Re-read the committed checkpoint after claim, validate it against the new current room/run/compatibility, and restore detached/paused into a new fenced utility. Obtain a fresh utility-originated lease renewal before any input/tick permission. Save a committed paused baseline under the new generation before enabling Resume. Keep the same runId and logical seat IDs, rebuild bots/links, full-sync watermarks, and enforce full-state ACK before human production. Paused restoration neutralizes held inputs without resetting their high-water marks. Never replay abandoned client outboxes across host generations.

`host-changed` becomes an explicit generation transition for every surviving client: retire old attempts/ports/producers, preserve token ownership, adopt new identity and reconnect to the winner. Re-host is never triggered merely by receiving that event. First valid full state clears the frozen view. A manual Resume remains necessary after restore; no reconnect callback or lease reply may resume.

On graceful Leave/quit, pause and capture, retain the pending local save, await commit for at most3,000ms, then release/close ownership even if save failed. Surface last committed receipt age and local pending status. Abrupt kill may roll back to the last committed checkpoint. An exported local pending save can only create a fresh room/invitation through an explicitly separate flow; importing arbitrary saves into an existing room is out of scope. Preserve seven-day service retention and expired-room feedback.

## 4. HTTPS and TURN integration

Resolve configuration once in main: disabled; explicit HTTP loopback development; or an explicitly configured HTTPS service origin. Reject credentials/query/fragment/non-root path in origins. Packaged builds contain only an approved nonsecret origin, never provider tokens or arbitrary renderer-supplied endpoints. Development remains disabled when not configured. Existing `createOnlineSession` revalidation must preserve an HTTPS variant rather than silently converting it back to loopback-only.

Inject a main-owned TURN provider into peer setup. After authenticated service connection, acquire short-lived credentials before starting an attempt, within existing setup/retry budgets; preserve link-issued/early-signal ordering using the existing bounded transport queues. Never create unbounded deferred issuance work while fetching credentials. Coalesce one credential request per seat/connection/generation; respect service retryAfter and the one-request/minute limit, including failed attempts. A valid cached batch can serve multiple peer attempts until within five minutes of its expiry. Expired/near-expired credentials must refresh before restart; they cannot be reused after a host/seat/connection generation change without a new authorized binding.

An explicit loopback test/development provider may return empty ICE servers without contacting Cloudflare; HTTPS configuration requires the authenticated TURN path. If credential acquisition precedes native attempt registration, main must reserve the generation-bound setup slot synchronously and bound any early signals there by the existing SDP/ICE count and byte limits until transfer. The original setup deadline includes that wait. Never forward early signals into an unknown native attempt or silently drop them to avoid buffering.

Continue existing attempt retirement/recreation as the initial reconnect mechanism; new peer construction performs new ICE gathering with refreshed servers, avoiding a second unbounded negotiation state machine. If reusing a peer later, `setConfiguration()` alone is not an ICE restart. Production defaults to all candidate types; relay-only is a test control absent from ordinary player menus. Treat provider failure as an explicit retryable connection failure rather than silently claiming TURN fallback worked.

Filter browser-incompatible port53 URLs (service already does this), preserve supported UDP/TCP/TLS alternatives, and keep long-lived provider credentials only in Worker secrets. Main/hidden transport may hold transient ICE credentials in memory; visible renderer receives only sanitized route/RTT/queue status. No addresses, SDP, candidates, tokens or raw errors in reports. Quotas and pricing assumptions are not raised by this slice.

## 5. Player-facing state

Extend the named validated IPC actions/status, not generic RPC. Add explicit saved-session/re-host/saving states and fixed error codes; include capability flags, committed checkpoint generation/sequence/tick, monotonic local receipt age, and local-pending status. UI never supplies payload bytes or authority grants.

Example after loss: `Host disconnected. Last mirrored checkpoint: tick 1800, received 4s ago. [Reconnect] [Re-host] [Leave]`. While claiming: `Restoring the mirrored checkpoint...`. Once restored: `Restored at tick 1800. Paused. [Resume]`. Disable Re-host while an operation is pending or the service still reports an active lease; server rejection remains authoritative. Explain possible rollback without implying every last action survived. Preserve Net-3d wrapped-strip space, small-window fit, bot cards and frozen Door selection.

## 6. Verification and completion claims

Recovery tests must prove: utility fencing while main is blocked/killed; delayed/reordered/duplicate lease replies; closed-gate player Resume and bot input; expiry during a multi-pass catch-up; suspend/clock discontinuity; fresh paused epoch without expired debt; service re-host race with a stale surviving host; and replay agreement for lifecycle effects. Use fake clocks for exact12/15-second edges and real processes for independent enforcement. A timer unit test alone is insufficient.

Mirror tests cover pending and reentrant input, paused control updates, before-first-tick commit, duplicate/uncertain upload, failure during hashing/body read/write, stale-generation commit, local write failure, Forget races, corruption/oversize/incompatible data, ordering by generation/sequence rather than tick, and bounded capture/upload memory. Two-process native recovery must kill the actual host, restore from DO bytes on the guest, preserve sparse seats/bots, ACK gates and paused state, then admit an explicit Resume with matching replay/hash evidence. Repeated recovery must release every owned process/window/port/listener.

Internet verification extends the real-app driver, not a substitute coordinator. Prepare a reproducible deployable artifact/config and dry-run first. Reconfirm the intended account/project without exposing credentials; the existing owner handoff is historical evidence, not proof of current deployment. At the external-action stage present the exact release/config/secrets names/quotas for authorization; do not change billing, DNS or budgets. Only then provision the required Worker secrets/deploy and call live TURN. No root `.env` values need to enter chat or tracked files.

Record source/artifact/runtime versions and distinguish: local recovery PASS; deployed service PASS; actual relay selected and gameplay PASS; and two physical computers/different networks PASS. Force relay in the native test and verify selected candidate-pair type plus command/publication agreement, not just channel open. Exercise credential refresh, service interruption, host kill/re-host while running and paused, compatibility rejection,50/150/300ms latency/jitter/loss and five-second stalls. Capture bounded/redacted measurements. A provider201, two local windows, or health endpoint never earns the final claim.

Retain root/service regressions, typechecks/builds, acceptance30s target, cross-engine replay for authority changes, relevant existing native gates, and failure/timeout cleanup probes. Repeat only affected gates after fixes. Real OS sleep and second-network hardware checks must be labeled NOT RUN when unavailable; do not substitute synthetic tests without saying so.

## Delivery order and builder choices

1. Utility gate/private IPC + authority/tick-driver guard and native stall/expiry proof.
2. Completed-boundary capture + atomic mirror store + upload/download coordination; initial/pause/exit saves visible in the app.
3. Manual re-host + generation transitions + native host-kill recovery on Skiff/Cutter.
4. HTTPS/TURN configuration + bounded credential acquisition + deployable artifact and relay driver.
5. Authorized deployed/live-TURN verification and owner-assisted two-network playtest; honest final readiness report.

Implementation plans should keep each group playable/testable and receive independent review. Builder chooses module names, small abstractions and test organization. Decisions above about timing, ownership, caps, rollback, compatibility and external proof are binding. The known Net-3d nonreproduced cancellation-wait failure remains a test risk to investigate if it recurs; do not weaken its wait/cleanup assertions. The previously policy-rejected exploratory temp directory is unrelated and must not be retried as cleanup for this work.

## Research checked 2026-11-15

- [Electron powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor): suspend/resume events belong to main. This supports forwarding lifecycle invalidation, not relying on those events alone for utility safety.
- [Cloudflare TURN credentials](https://developers.cloudflare.com/realtime/turn/generate-credentials/) and [FAQ](https://developers.cloudflare.com/realtime/turn/faq/): generate temporary ICE credentials server-side and refresh for reconnection. Existing service implementation is the integration target; no pricing change is assumed.
- [W3C WebRTC](https://w3c.github.io/webrtc-pc/webrtc.html): relay policy and ICE restart semantics guide the forced-relay proof and reconnection design. A chosen policy is not itself evidence of a selected working relay route.

The12-second local lease window,5-second renewal,15-second server lease and all save/test budgets are project requirements from the approved parent, not claims imposed by these external APIs.
