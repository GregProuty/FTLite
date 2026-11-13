# Networking architecture research for FTLite

Research date: 2026-11-13. Status: decision brief; no networking implemented, no architecture approved. Sources below were consulted on this date. Recommendations and numerical targets are engineering proposals, not measured results.

## Recommendation

Use one authoritative simulation per run, with client commands, replicated presentation state, and interpolation. Keep the authority runnable both on a player's machine and on a dedicated server. Separate game protocol, transport, session directory, identity, and persistence. Start with private 1–4-player sessions including mixed couch/online crews unless the owner specifies a different launch scope.

Player-hosted versus dedicated hosting remains a product choice. For Steam-first friends-only play, a player host over Steam networking is the leading candidate, subject to proving an Electron-compatible native integration. For public cross-platform sessions that must survive a player leaving, prefer dedicated Node authority; prototype WebSocket delivery and evaluate latency before choosing a more complex transport. Do not promise automatic host migration as a free consequence of snapshots.

Do not select a vendor before confirming launch platforms, public/private access, host-loss expectations and operating budget. The owner has been asked about these expansion priorities; unanswered items remain open. The protocol/simulation boundaries below are useful under either hosting choice.

## Current code: assets and gaps

| Evidence | Networking implication |
|---|---|
| `sim/step.ts`, `tuning.ts`: fixed 60 Hz simulation, hazards every fifth tick | Preserve gameplay tick rate initially; network send rate is independent. |
| `shared/intent.ts`: compact movement and held/pressed actions; MAX_PLAYERS=4 | Reuse semantics, but add authenticated ownership, sequencing, time windows and structural validation. Existing boolean coercion/clamping is not a network parser. |
| `sim/snapshot.ts`, `flatten.ts`, `hash.ts` | Good checkpoint/replay foundation. Full flattened state contains telemetry and RNG; it is not automatically an efficient or safe client replication schema. |
| `sim/replay.ts` | Replay startup includes seed/layout/version but does not encode all creation options used by session startup, such as unlocked bonuses. Expand the initial-state contract or replay from a complete checkpoint. |
| `app/session.ts`, `app/loop.ts` | Authority currently follows render frames, drops excessive accumulated time and pauses on focus loss. Online authority needs an independent clock and explicit shared-pause policy. |
| `input/deviceManager.ts` | Local device slot reclaim cannot authenticate a remote player. Distinguish account, connection, local controller slot, crew identity and authority role. |
| `sim/components.ts`, `state.ts` | Components are process-global arrays, with a shared entity index explicitly preventing world ID collisions. This is not evidence of current corruption. Audit lifetime cleanup, memory growth and room isolation before multiplexing many runs; process/worker isolation is a useful initial boundary. |
| `app/session.ts`: callouts outside Intent/replay/snapshot | Replicate callouts as bounded ephemeral messages; do not accidentally omit them from online co-op. |
| `sim/ship/fleet.ts` and player-count-sized state | Reconnect to an existing crew slot is simpler than adding new crew mid-run. A larger crew affects maps, UI, balancing and arrays, not merely packet size. |
| Foundation design §4 | Already proposes host authority and approximately 5 Hz snapshots. Treat that rate and its 100–200 ms tolerance as unvalidated hypotheses. Direct movement and timed evasion now justify fresh latency testing. |

No network benchmark, transport integration, cross-runtime determinism test, NAT experiment or hosting quote was performed in this research pass.

## Architecture alternatives

| Model | Strengths | Costs / failure modes | Decision |
|---|---|---|---|
| Authoritative player host | No dedicated simulation fleet; fits friend groups; shared code with offline mode | Host advantage, trusted host can cheat, host sleep/crash ends authority, uplink fan-out | Recommended conditional launch topology |
| Authoritative dedicated server | Independent of players; better enforcement, stable scheduling, public-session foundation | Regional capacity, deployments, persistence, monitoring and ongoing cost | Prefer if continuity/public play is central |
| Deterministic lockstep | Small input traffic; replay-friendly | Waits for missing inputs; exact reproducibility required; divergence recovery and late join still need design | Do not choose by default |
| Whole-world rollback | Responsive local inputs despite network delay | Resimulation, event deduplication, memory/CPU budgets and complex corrections across hazards/UI | Defer; local movement prediction is a smaller option |
| Peer mesh / distributed authority | No single simulation owner in theory | Conflicting edits to shared ship/resources, topology complexity, split-brain and authority handoff | Reject for current scope |

Snapshot interpolation reconstructs remote presentation from authoritative samples; lockstep instead reproduces the simulation from inputs. The latter requires exact agreement, which local deterministic tests alone do not establish across deployed runtimes. JavaScript is not categorically incapable of determinism; it simply must be demonstrated for the actual build matrix. [Fiedler: snapshots](https://gafferongames.com/post/snapshot_interpolation/), [Fiedler: lockstep](https://gafferongames.com/post/deterministic_lockstep/).

## Transport and service choices

| Candidate | Fit | Research conclusion / gate |
|---|---|---|
| Steam Networking + Steam lobbies | Steam-first desktop private sessions | Strong candidate for identity/invites and relay transport. Prove SDK binding coverage, callbacks, packaging, Electron ABI and target OS builds first. Lobby ownership and simulation authority are distinct. |
| WebRTC data channels + signaling + TURN | Player-hosted browser/Electron cross-platform sessions | Supports configurable ordered/reliable delivery. Requires signaling, ICE handling, relay credentials and TURN capacity; NAT traversal is not universally direct. More operational complexity than “P2P is free.” |
| Secure WebSocket to dedicated Node service | Broad client compatibility, simple authoritative prototype | Good first baseline. Reliable ordered transport can delay fresh gameplay behind lost data; cap queues and test poor links. Not a general solution for reaching a player host behind NAT. |
| Colyseus | Node room lifecycle and state replication | Evaluate as infrastructure, with a projection of existing simulation state. Do not rewrite the deterministic simulation into framework state merely for convenience. Benchmark schema/update costs and lifecycle semantics. |
| Nakama | Accounts, social features, match services | Candidate if backend product needs justify it. Its server runtime integration is a separate compatibility investigation; do not assume an arbitrary existing Node bundle drops into its authoritative runtime. |
| EOS P2P | Potential cross-store native alternative | Official page was not readable in this pass. Keep as an unverified candidate requiring SDK/platform/account/relay/binding review before ranking it. |
| Raw UDP / custom reliability | Maximum control | Avoid initially: NAT, authentication, encryption, fragmentation, congestion control and retransmission are substantial work already handled by established stacks. |

Steam's relay supports peer and dedicated traffic; access outside Steam has conditions and requires coordination with Valve. The open-source GameNetworkingSockets library alone does not grant Valve relay access. [SDR requirements](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay), [networking APIs](https://partner.steamgames.com/doc/features/multiplayer/networking), [library](https://github.com/ValveSoftware/GameNetworkingSockets), [lobbies](https://partner.steamgames.com/doc/features/multiplayer/matchmaking).

WebRTC exposes ordered and retransmission options; ICE/STUN/TURN are connectivity components, not session authority. WebSocket applications must manage their own queue pressure. [Data channels](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel), [WebRTC connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols), [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket).

Colyseus provides server-owned schema synchronization and reconnection flows; these do not supply the game's policy for crew ownership, rewards or abandoned sessions. [State](https://docs.colyseus.io/state), [reconnection](https://docs.colyseus.io/room/reconnection). [Nakama authoritative model](https://heroiclabs.com/docs/nakama/concepts/multiplayer/authoritative/). [EOS candidate reference](https://dev.epicgames.com/docs/epic-online-services/multiplayer/nat-p2p-interface).

## Boundaries that preserve expansion options

```text
Devices -> local crew input -> client session -> transport -> authenticated command ingress
                                                           |
                                              authoritative run + fixed clock
                                                           |
                                          replication / checkpoints / run events
                                                           |
Client presentation <- interpolation/prediction <- transport

Directory / invites / authentication / save store sit beside this flow.
Offline mode uses an in-process connection to the same authority contract.
```

Extract a headless entry point for the existing simulation. Player-hosted authority should run outside the renderer; an Electron utility process is one available mechanism, while dedicated hosting uses a Node entry point. Both invoke the same gameplay code. Separate process isolation prevents renderer stalls from directly scheduling gameplay, but cannot prevent machine sleep. [Electron utility process](https://www.electronjs.org/docs/latest/api/utility-process).

Define transport capabilities (reliable ordered messages, replaceable updates, maximum payload, connection status and queue statistics) rather than a misleading universal `send()` with no delivery semantics. Define separate adapters for session discovery and credentials. Keep vendor IDs out of simulation state.

## Input, time and authority contract

- Handshake: protocol version, simulation/content digest, supported capabilities, run ID, role, authentication and reconnect proof. Reject incompatible gameplay builds before claiming a seat; cosmetic compatibility may be looser.
- Envelope: session ID, authority epoch, connection generation, sender sequence, message kind and bounded payload. Bind allowed crew IDs on the authority; never trust a client-supplied player ID alone. One connection may own two local players.
- Authority owns RNG, movement legality, damage, inventory, power, shops, event votes, jumps and rewards. A host's local inputs go through the same validation and action arbitration.
- Separate continuous state (move axis, held repair) from one-shot commands (confirm, cancel, purchase). Inputs carry sequence/time information; acknowledgments state what was processed. Deduplicate one-shots across retries and reconnects. Never replay an old Confirm every tick until a new packet arrives.
- Current Confirm is context-sensitive. A delayed command could activate a different menu row after a state change. Include expected context/revision or introduce semantic commands for consequential actions (buy item ID, vote option ID, jump destination ID); reject stale context and show the reason.
- Host chooses the execution tick within bounded latency/future windows. Client tick estimates are hints, not permission to speed up or backdate outcomes. Record final accepted command order for replay. Preserve deterministic tie-breaking; assess lower-ID/host advantage in contested controls.
- On input silence, clear held movement/repair after a bounded grace interval; never infer repeated button edges. On connection loss, release inputs immediately when detected. Values and timings are spike parameters, not shipping constants.
- Maintain a monotonic authority clock and ping/offset estimates. Client frame drops must not slow the server. Limit catch-up work; log sustained overload, reduce replication work or fail clearly rather than silently drifting forever. Pause simulation ticks explicitly while still servicing connection heartbeats.

## Replication and responsiveness

Keep three schemas: complete save/checkpoint state; client-visible replicated state; ephemeral event stream. Do not transmit all telemetry, hidden future outcomes or RNG merely because flatten() includes them. Trusted-friend hosts may see everything; dedicated hidden information should stay server-side.

Use stable gameplay IDs, tick, snapshot sequence and last-processed input sequence. Start with full snapshots for correctness, then measured optimization. Deltas refer to an acknowledged baseline; missing baselines trigger a full refresh. Bound reassembly, decompression and allocation. New snapshots can supersede queued old ones where transport allows; bulk checkpoint transfer must not starve input/control traffic.

Interpolate positions and cosmetic continuous values. Apply inventory, life state, seats, menu modes and door collision transitions discretely. Never interpolate a crew member through a sealed door or smooth death into an intermediate gameplay state. Handle teleports/jumps as discontinuities.

Spike 10/20/30 Hz updates while retaining 60 Hz simulation; compare against the old 5 Hz proposal. Measure input-to-visible-response, not only ping. Snapshot-only local movement incurs uplink + scheduling + update wait + downlink + interpolation delay. Therefore even a moderate RTT can feel sluggish. Start with responsive local UI selection; if movement misses the playtest target, predict only owned crew movement with authoritative correction and replay of unacknowledged movement inputs. Door opening and seat transitions require explicit reconciliation. Purchases, damage and votes remain confirmed by authority.

Events need IDs/ticks and bounded history so reconnect or correction does not replay sounds/rewards. A counter difference may collapse several events into one cue; model important hits, votes and outcomes explicitly. Hash complete state only against equivalent same-tick complete state. Hashes are diagnostics, not authentication, and a projected/interpolated client cannot match the full simulation hash.

## Lobby, crew ownership and lifecycle

Recommended launch proposal: private invitations, 1–4 total crew, mixed couch/online, fixed roster during combat, reconnect to reserved crew slots. Late arrivals may spectate or take a deliberately vacant/reserved crew slot at a safe point; arbitrary dynamic crew creation is a separate feature.

Lifecycle: create -> lobby -> compatibility/authentication -> seat reservation -> ready -> full state synchronization -> running -> reconnecting/paused -> ended -> results. Define timeout and cancellation at every transition. A room code locates a session; it is not sufficient authentication for a reserved identity. Invite expiry, kicks, revoked reconnect tokens, full rooms and simultaneous join requests need explicit results.

Disconnect proposal: clear controls, display connection loss, reserve the seat for a configurable grace period; allow the remaining crew to choose continued play or a bounded shared pause. Do not silently give a disconnected identity to the next keyboard/controller. Bot takeover is optional and must use normal authority input. Define vote denominator and jump-confirm requirements when crew disconnect; preserve game fairness without permanent softlocks.

Focus loss pauses local input only in online mode. Whole-session pause is a separate authorized action with visible ownership and resume policy. Host sleep is an authority outage, not a remote player's pause request.

## Reconnect, saves and host loss

Reconnect authenticates the same seat, establishes a new connection generation, transfers a coherent snapshot, then streams newer updates. Discard stale commands from the previous generation. A client may have sent a purchase without seeing its acknowledgment: use command IDs and authoritative results to avoid duplicates. Event history and state must agree at the snapshot boundary.

Persist versioned checkpoints atomically at safe boundaries, plus an optional accepted-command journal. Include RNG, content/version, crew mapping and run identity. Keep account tokens outside game save state. Define who owns a shared run and which participants can resume it. Completion/reward grants need run-scoped idempotency; host-trusted runs cannot underpin cheat-resistant public rankings.

Recommended first player-host behavior: show a clear host-loss screen and restore the latest available checkpoint through an explicit new hosted session. Document maximum possible progress loss. Do not label this seamless migration.

Recovery availability must be explicit: a checkpoint stored only on the departed host cannot be recovered while that machine is unavailable. To let remaining players resume, replicate a complete checkpoint to an authorized peer or a durable remote store, including integrity/version metadata and shared-save ownership rules. Otherwise the supported behavior is to wait for the original host to return. Choose checkpoint placement together with the host-loss product requirement.

If seamless migration is required: replicate complete authoritative checkpoints to eligible successors; preserve accepted command boundaries, deduplication and membership; elect one successor through a trustworthy coordinator/lease; increment authority epoch; fence old-host traffic; reconnect everyone; resolve incomplete commands consistently. A partition must not produce two valid histories. A client presentation snapshot lacks the hidden state necessary to become authority. A trusted player successor also inherits hidden information.

Dedicated servers avoid dependence on a player's departure, but server crashes still require checkpoint recovery, allocation/rejoin routing and deployment drain policy. Zero-loss recovery requires durable command acknowledgment semantics, not just periodic saves.

## Security and trust

Use authenticated encrypted transport; validate packet type, length, nesting, numeric ranges, enum values and ownership before simulation. Bound per-peer rates, pending commands, future ticks, snapshot sizes, retry attempts and decompressed data. Reject malformed data cheaply. Test duplicate, stale, spoofed and flood traffic. Transport encryption does not make a player host honest.

Keep native SDK/socket privileges behind narrow Electron IPC methods, validate IPC senders, preserve isolation/sandbox boundaries and load trusted local UI. Treat player names/chat/mod descriptions as data, never executable HTML or filesystem paths. Do not expose credentials through generic renderer IPC. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

For public play add reporting/blocking, host moderation, invite abuse controls and privacy/retention policies. Built-in voice/chat is a separate service and moderation/cost decision; retain game callouts regardless. Prefer relay-only privacy where hiding peer IPs is required, accepting relay cost/route tradeoffs. Avoid kernel anti-cheat for this cooperative scope; enforce inputs and distinguish trusted/untrusted progression instead.

## Performance, cost and operations

Measure snapshot sizes on both ships in quiet, busy and late-run states; record binary/JSON/compressed sizes, serialization CPU, delta rate, checkpoint size and memory lifetime. The earlier starter snapshot measurement is not a current capacity estimate.

Planning example only: a 6 KiB update at 20 Hz to three remote peers costs 360 KiB/s host outbound before headers/retries, roughly 1.24 GiB/hour. This is NOT a measurement. Bandwidth ≈ update bytes × updates/sec × recipients; relay accounting depends on provider. Budget signaling, relay traffic, simulation CPU, database/storage, logs, regional minimum capacity and support. Obtain current provider quotes after measuring workload; no dollar estimate is justified yet.

Scale by independent run, not distributed ticks within one run. Benchmark rooms/core and memory/room with current ECS allocation behavior before co-locating many rooms. Track tick duration, lag, RTT, jitter, loss, queue age, reconnect success, snapshot refreshes and end-to-end action latency at percentiles. Include build, region and transport in diagnostics without recording credentials. Drain servers during upgrades; pin active runs to compatible builds; have rollback and outage messages. Keep offline local play usable during service outages.

## Expansion decisions

| Future capability | Design now | Defer until needed |
|---|---|---|
| More stores/platforms | Portable game protocol and identity abstraction | Extra transport bindings and certification |
| Dedicated hosting | Headless authority with external clock and persistence interfaces | Fleet orchestration and regional scaling |
| Larger crews | Crew identity separate from connections; explicit caps | Rework four-player arrays/UI/balance and ship layouts |
| Multiple ships / PvP | Stable entity IDs, visibility-aware projection | Interest management, competitive trust and lag compensation |
| Spectators | Read-only role with no crew ownership | Spectator UX, delay/privacy rules |
| Mods | Content digest and compatibility policy | Safe distribution, sandboxing, signed catalogs |
| Persistent campaigns | Versioned run identity and checkpoint ownership | Save migration and cross-device/cloud conflict handling |
| Voice/chat | Separate channel/service contract | Media integration, moderation and retention |

## Validation gates before choosing the shipping design

1. **Headless isolation:** run authority independently of renderer; minimize/blur client without halting online simulation. Compare accepted-input replay against authoritative same-tick hashes. Exercise multiple room lifetimes and cleanup.
2. **Network harness:** two real processes, then four peers including two local crew on one peer. Inject 0/50/100/200/300 ms RTT, 0/20/50 ms jitter, 0/1/5% loss where transport permits, reordering, duplication, bandwidth limits and 2/10/60-second outages. For TCP test resulting stalls rather than claiming app-visible unordered packets.
3. **Game correctness:** simultaneous seat claims, menu-context changes, purchases/retries, repairs, doors, scan/shot timing, votes, jump confirmation, death, finale and reward acknowledgment. No duplicate spend/reward or stuck held action.
4. **Human feel:** compare snapshot-only and movement prediction at 100/200 ms RTT; record movement latency, corrections, mis-targeted actions and timed-evasion success. Proposed starting target: no visible correction exceeding half a tile in ordinary play; choose final thresholds from blinded playtests.
5. **Connectivity:** household NAT, restrictive network/UDP blocked, relay fallback, IPv4/IPv6, reconnect after network change, expired credentials and unavailable signaling. Demonstrate joining without manual router changes on the supported path.
6. **Lifecycle:** kill host/client/server, sleep laptop, rejoin same identity, reject stolen/revoked seat, reconnect during purchase/vote/jump, incompatible build and corrupt checkpoint. Assert documented progress-loss bounds.
7. **Operations/security:** malformed/flooded payloads, queue growth, exhausted room capacity, rolling deployment, provider outage and recovery; no cross-run state leakage.
8. **Economics:** measure representative room resource use and relay fraction; project low/expected/high concurrency and regional deployment costs. Choose a provider only after this worksheet is credible.

## Decisions still requiring the owner

Highest impact: launch platforms/stores and whether sessions must continue after the host leaves. Next: public matchmaking versus invitations, operating-cost tolerance, larger crew/multi-ship ambitions, late-join expectations and shared-save ownership. These can change the topology/provider recommendation; they do not invalidate the single-authority simulation boundary.

Suggested next artifact after those answers: an architecture decision record selecting topology and transport candidates, followed by a bounded networking spike specification. This research authorizes neither dependency installation nor production service provisioning.
