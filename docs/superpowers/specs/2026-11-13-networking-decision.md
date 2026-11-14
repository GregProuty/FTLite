# Networking Decision Record (Net-0)

Status: approved 2026-11-13. Not an implementation plan. Net-1 is split into Net-1a (the boundary) and Net-1b (durability) by the accepted Net-1 review.

Evidence:
- `research/networking-2/measurements.md`: measured in the real code (sizes, CPU, determinism, inputs, headless).
- `research/networking-2/prior-art.md`: what shipped co-op games use.
- `research/networking-2/transport-and-ops.md`: transport, services and costs.
- Earlier briefs: `docs/superpowers/specs/2026-11-13-networking-research.md` (Brief A, inputs relayed and every machine simulating) and `research/2026-11-13-networking-research.md` (Brief B, one authority sending state).

## 1. The owner's requirements

- Internet play in the first networked version. One player per machine. Friends join with an invite or join code; there is no public matchmaking.
- Windows (Electron) and a web browser build, with cross-play between them. Steam is undecided and optional later.
- FTL-style keyboard and mouse: click to move, clickable console cards. A mouse player must sit at a console to use it.
- When the host leaves, the run pauses and is saved; it is re-hosted later. There is no host migration and there are no dedicated servers at first.
- Late join is only a rejoin to your own reserved seat. A dropped player's crew member is run by a bot. Anyone can pause. Every player must run the same game version.
- The design must leave room to grow: dedicated servers, larger crews, spectators, perhaps more ships.

## 2. What the evidence says

| Question | Finding | Source |
|---|---|---|
| Is bandwidth a reason to choose a model? | **No.** The full state is 630 values (Skiff) or 773 (Cutter), 0.3–0.8 KB deflated. A busy-combat client-visible delta at 20 Hz is 20–32 B (p95 49 B), about 0.5 KB/s per peer. That is the same order as relaying inputs. Brief B's 360 KiB/s planning figure was 10–20 times too high. | measurements |
| Can we afford rollback? | **Yes.** `step()` takes 4.5–7.2 µs (median). Resimulating 24 ticks costs at most 0.36 ms at p99 and matched exactly in 500 of 500 trials. Browsers run at the same speed. | measurements |
| Is the simulation the same on every engine? | **Yes, on every engine we could test.** 900 of 900 per-second hashes matched over 15 min across Node, Electron 37, Chrome, Edge and Firefox (SpiderMonkey), on the main thread and in Workers. The sim uses no transcendental Math, Date or random. Safari/JSC, ARM and macOS were not tested. | measurements |
| What do comparable games ship? | One authoritative simulation sends state, and clients predict their own avatar: Artemis, Barotrauma, Space Station 13/14, Don't Starve Together, Stardew Valley, Risk of Rain 2, Deep Rock Galactic. Lockstep wins only with huge states (Age of Empires, Factorio), and its teams name desync hunting as their worst cost. Almost no co-op game migrates the host. | prior art |
| Transport for browser cross-play | **WebRTC data channels in a star around the host**, plus a small cloud service for join codes, signalling, seat tokens and a save mirror. A TURN relay serves the roughly 15–22 % of links that cannot connect directly, and a secure WebSocket relay is the last resort. Steam and EOS are desktop-only, so they can only be later add-ons. Hathora closed its game hosting on 2026-05-05, so the authority stays plain TypeScript with no vendor SDK. | transport |
| Can a browser tab host? | Best effort only. A hidden tab's timers wake once a second. The Electron app is the preferred host, running the authority in a `utilityProcess` with background throttling off. A browser host runs the authority in a Worker, catches up by timestamp, and asks the player to keep the tab visible. | transport, measurements |
| Cost | Cloudflare TURN costs $0.05/GB after 1 TB free. At the measured delta sizes, a state-sending host costs about the same as relaying inputs: roughly $0 at 100 sessions and around $100 a month at 1,000. | transport, measurements |

## 3. The decision

**One authoritative simulation per run (Brief B's topology), sending state, with clients that predict by resimulating with the deterministic simulation (Brief A's machinery).**

1. **Authority.** One process owns the run: the host's Electron `utilityProcess` today, or a browser Worker, or a Node dedicated server later. All three run the same headless simulation. It alone draws random numbers, resolves votes, jumps, purchases and rewards, and writes saves.
2. **Commands up.** Clients send their held input (movement axes, held repair) at the tick rate, plus **semantic commands** for everything that today depends on a menu cursor. That is about 22 commands, such as `buy(itemId)`, `vote(option)`, `jump(destination)`, `fire(weapon, enemyRoom)`, `setPower(system, delta)`, `door(id, state)`, `sit(console)`, `stand`, `scan(target)` and `moveTo(tile)`. Each one carries an ID so it is applied once. The mouse UI emits these directly, and the gamepad and keyboard cards are rebuilt on top of them.
3. **State down.** The authority sends the full simulation state as deltas against an acknowledged baseline, at 20–30 Hz, with a full refresh when a baseline is missing. The state is small enough to send whole. Because this is friends-only co-op, hidden information (the random-number state) goes to clients too, which is what makes exact prediction possible. A dedicated public server would later send only a client-visible projection.
4. **Prediction (second milestone).** Each client keeps the latest authoritative state, replays its own unacknowledged inputs on top with the real `step()`, and renders the result. Its own walking and console UI then feel instant. Other players' crew are interpolated between authoritative samples. A misprediction is corrected by the next state, so engine differences can never become a permanent desync. Sounds and effects fire once per authoritative event, keyed by event ID.
5. **Determinism is kept and guarded** because it now buys exact prediction, replays, saves and re-hosting. A cross-engine golden-hash test (Electron, Chrome, Firefox, and Safari when available) joins the suite, and a lint rule bans non-exact Math functions in the sim.
6. **Transport.** A narrow interface: `Session` (host, join, links) and `Link` (send on `reliable-ordered` or `unreliable-latest`, stats, capabilities), with a loopback provider for tests and offline play. The first real provider is WebRTC, with Cloudflare (a Worker and one Durable Object per room) for join codes, signalling, seat tokens and the save mirror, Cloudflare TURN, and a WSS relay in the same Durable Object as a last resort. A "relay only" setting hides IP addresses.
7. **Sessions.** Lobby, then compatibility handshake (protocol version and content digest), then seat reservation, ready, full-state sync, running, reconnecting or paused, ended. Reconnecting rebinds a seat token, sends a full state and resumes. When the host leaves, the run pauses for everyone and the latest checkpoint becomes the save. The checkpoint (about 1 KB gzipped) is sent to every seat at each safe point and mirrored in the room's Durable Object, so whoever holds the newest one can re-host. Focus loss pauses only local input. A whole-session pause is a command with a visible owner.

**What would change it.** Brief A's pure input relay (every machine simulating, no state stream) would become a later optimisation only if the state grew past about 100 KB with heavy churn. It is not needed at these sizes. PvP fairness would mean adding server-side lag compensation to this model, not switching models.

## 4. Milestones (each one playable and testable on its own)

| # | Milestone | Proves |
|---|---|---|
| Net-1a | **The boundary, offline.** Commands with IDs, loopback Session/Link, independent clock, client-owned menu state, host-side bots consuming published state, and couch cutover. Add the small AST Math guard early. Clients decide tick T from end-of-T−1 state; authority never waits inside a tick. | Couch play works through the same authority boundary that online play will use. |
| Net-1b | **Durability, offline.** Entity disposal/reuse, per-viewer HUD model, replay/checkpoint v2 and real-browser cross-engine hashes. | The boundary supports long-lived runs and reproducible recovery before Net-3. |
| Net-2 | **FTL-style keyboard and mouse, offline.** Click to move (pathfinding in the sim as `moveTo`), clickable console cards while seated, hotkeys, and a per-player screen layout (your console large, the others as status pills). | The new controls are fun before any network exists. |
| Net-3 | **Two machines over the internet, no prediction.** WebRTC with Cloudflare signalling and TURN, join codes, seat tokens, deltas at 20–30 Hz with interpolation, rejoining your own seat, pause and save when the host leaves, and re-hosting from the newest checkpoint. Electron is the host. | The model works end to end on real networks. |
| Net-4 | **Prediction.** Resimulation from authoritative state for your own avatar and console UI. A latency and loss harness (50–300 ms RTT, jitter, loss, outages). Corrections stay under half a tile in ordinary play. | It feels local at internet latencies. |
| Net-5 | **The browser build.** The browser client, a browser host in a Worker with the visibility warning, and cross-play with Windows. | Windows and browser play together. |
| Net-6 | **Hardening.** The WSS relay fallback, the relay-only privacy setting, chaos tests (kill host or client, sleep a laptop, change networks), and measuring the real TURN share. | It survives real-world networks. |

Later, each optional: Steam lobbies and invites as an add-on, a dedicated Node server with a client-visible projection (the same authority), spectators (a read-only role), and larger crews.

Implementation status, 2026-11-14: the Net-1b offline implementation gate passes recycling/disposal, viewer HUD, durable snapshot/checkpoint/replay v2 and the checked-in Cutter/Skiff determinism fixture in Node, real Electron Chromium and real Firefox. The full regression suite, typecheck, production build and unchanged acceptance rows pass; measured results and platform limits are recorded in [docs/gates.md](../../gates.md#net-1b-final-review-and-validation). Whole-branch review and the scoped restore-fix re-review are complete. Final source 9b8fddd passes 1,680 tests, build/typecheck, unchanged acceptance rows and all three engine checks; Net-1b merged as 3047027 on 2026-11-14; the combined Helm/Net-1b tree passed 1,732 tests, typecheck and build. This does not provide internet transport, hosting, join codes or re-host orchestration; those remain Net-3 work.

## 5. Open questions (none blocks Net-1)

1. Safari support: test JavaScriptCore determinism once a Mac is available. Until then prediction still works, because corrections are bounded.
2. Cloudflare account and development hostname are now resolved (2026-11-14 handoff); TURN and Wrangler authentication are prepared. The actual Worker and internet transport are not deployed. Net-3 implementation design: `2026-11-14-net-3-internet-sessions-design.md`.
3. Whether the browser build is also a single-player and couch-play target, or networked only.
