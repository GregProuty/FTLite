# Networked multi-screen FTLite: networking model research

Date: 2026-11-13. Status: research only, nothing built. Code facts were read from `C:\Users\djuar\FTLite` on branch `tempo` (SIM_VERSION 32).

## TL;DR

Use a **host-authoritative input relay with deterministic client prediction and rollback** (a "server-relayed rollback" design, the same shape as Photon Quantum and Factorio's latency hiding). One player's Electron app is the host. It owns the tick clock and the order of inputs. Every machine runs the real `step()`. Clients send their own inputs up. The host sends down a small "confirmed input frame" for each tick, plus a state hash every second. Each client applies its own input straight away, guesses the other players' inputs (they keep doing what they last did), and rolls back and re-simulates when the host's confirmed frame differs from the guess. When a hash does not match, or a player joins or reconnects, the host sends a full `flatten()` snapshot (about 5–6 KB) and the client loads it. This design fits FTLite unusually well. The state is tiny (600–770 numbers). One tick costs about 5–10 µs, so re-simulating 10 ticks costs about 0.1 ms. The determinism tooling you already have (flatten, hash, golden replays, the save/load/continue property test) is exactly what rollback needs. And because the host owns time, one laggy player only hurts their own view and never freezes everyone, which is the big weakness of pure lockstep. **Ship it in two steps.** Phase 1 is the same protocol with no prediction (plain host-relayed lockstep on a LAN, where 1–3 ticks of input delay can't be felt). Phase 2 adds prediction and rollback for the internet. **Transport:** WebSocket on the LAN first, then WebRTC data channels with join codes, using a tiny signalling Worker plus STUN/TURN. Steam networking comes later, only if the game ships on Steam. **Screens:** every player sees the whole ship, with their own crew member highlighted and their own console card large and clickable. It is not Artemis-style "you only see your station". **Controls:** FTL-style mouse input fits this model if clicks become *orders inside the Intent* (a move target, a console command) that the sim carries out. Steering the client with fake stick input does not fit as well.

What would change my mind: (a) if a two-machine soak finds cross-machine desyncs that I can't explain, drop prediction and go to host snapshots plus interpolation, with prediction only for your own avatar (row C below); (b) if the owner wants different builds to play together (for example a mod or an older version), determinism can't be relied on, so row C again; (c) if it ships on Steam first, swap the transport for Steam lobbies plus Steam Datagram Relay (the protocol stays the same).

---

## 1. Networking models scored for FTLite

Scores run from 1 (poor) to 5 (great), for this game: 2–4 co-op players, a 60 Hz deterministic sim, direct-control walking, tactical pace, tiny state, and determinism tooling already built.

| Model | Own-avatar feel (internet) | Remote players look smooth | One bad link hurts everyone? | Needs bit-exact determinism | Bandwidth | Effort given existing code | Join / reconnect | Desync handling | Total |
|---|---|---|---|---|---|---|---|---|---|
| **A. Peer lockstep, inputs only** (Factorio, AoE, RTS) | 2: every input waits RTT plus a buffer (80–200 ms on the internet) | 5: everyone sees the same thing | 1: the slowest peer stalls the game for all | 5 (fatal without it) | 5: a few KB/s | 4 | 2: needs a state transfer anyway | 2: a desync ends the game unless you resync | 26 |
| **B. Peer-to-peer rollback (GGPO)** | 5: zero local delay | 3: remote avatars can snap when a guess was wrong | 3: the mesh can still stall on a dead peer | 5 | 5 | 3: the mesh needs N² links, the session layer is harder | 3 | 3 | 30 |
| **C. Host-authoritative snapshots/deltas, client predicts own avatar, interpolates the rest** (Source, Barotrauma, Space Engineers, Unreal) | 4: own walking is predicted, but console actions wait RTT | 4: interpolated about 100 ms behind | 5: the host never waits | 2: not required (snapshots fix everything) | 2: 20–30 Hz × several KB per client, about 1–3 Mbit/s from the host without delta work | 2: needs delta compression, a partial-sim predictor and reconciliation | 5 | 5: there is no such thing as a desync | 31 |
| **D. Host-relayed inputs + deterministic prediction/rollback + hash-checked snapshot resync** (recommended; the Photon Quantum shape) | 5: own input applies immediately to the full sim | 3–4: remote avatars may correct by a few pixels on a wrong guess; walking is easy to guess | 5: the host owns the clock; a late input lands on a later tick | 4: needed for quality, but a snapshot resync covers mistakes | 5: about 2–4 KB/s per client | 4: reuses step/flatten/unflatten/hash as they are | 5: send a snapshot, then the inputs since | 5: the hash detects it, a snapshot repairs it, both are logged | **38** |
| E. Hybrid C+D (snapshot rebase): host snapshots at 10–20 Hz, clients load the latest and re-simulate forward with their own inputs | 5 | 4 | 5 | 3 | 3 | 4 | 5 | 5 | 34 |

Why D over C for this game: C is the safe industry default for games whose simulations *aren't* deterministic or whose state is large (Barotrauma, Space Engineers, every Unreal game). FTLite has the opposite profile: deterministic, tiny, and cheap to step. C would also make every console action (Confirm on Weapons, a vote, a door toggle) wait a full round trip, because you can only predict your own movement cheaply in C. In D the whole sim is predicted, so your own console presses feel instant. E is the fallback if determinism ever becomes painful. It needs no new protocol (the snapshot messages are already part of D), so you can switch modes with a flag.

Why not pure lockstep (A): it is the classic RTS answer, and Factorio still uses it (every client simulates and only input actions are sent). But Factorio had to bolt on a separate "latency state" so that walking didn't feel like it waited a round trip, and its later posts describe how hard that was to get right for cars. FTLite's core verb is walking your own body through one-tile doors. Making that wait an internet round trip is the wrong trade.

### What comparable games use

| Game | Model | Lesson for FTLite |
|---|---|---|
| FTL | single-player only | The controls are worth copying (see section 7); there is no netcode to copy. |
| Lovers in a Dangerous Spacetime | local only; online only through Steam Remote Play Together (video streaming) | Remote Play Together is a zero-work stopgap that the owner can use **today** to test remote play (only the host needs the game). |
| Overcooked! 2 | online co-op with one player as host (the community says P2P; the developer has not documented it); lag depends on the host | Player-hosted co-op is accepted in this genre. |
| Factorio | deterministic lockstep, inputs only, plus a latency-hiding layer | Determinism plus inputs-only works at scale; hiding latency on your own avatar is the hard part. |
| Barotrauma (crew-on-a-sub, closest in feel) | server-authoritative; the server syncs state to clients; the developer cites Glenn Fiedler's articles | The genre's default when the sim isn't deterministic. |
| Space Engineers | client/server with client prediction; uses determinism to reduce corrections; turns prediction off in bad cases | Determinism is a tool for prediction quality, not only for lockstep. Keep a "prediction off" fallback. |
| Valheim | dedicated or host server that relays; each zone is simulated by its "owner" client | Ownership splits are hard to reason about. Avoid them for a small ship. |
| Deep Rock Galactic, Pulsar: Lost Colony, Starship Simulator | Unreal or Unity host/listen-server replication, session co-op (sources don't spell out the netcode details) | 4-player crew games ship fine with one player hosting. Starship Simulator assigns each player a role aboard the ship. |
| Artemis Spaceship Bridge Simulator | one server PC (often the main screen) and station clients over TCP port 2010; LAN-first, internet by port-forwarding | The model for multi-screen. TCP works for a tactical bridge game. |
| EmptyEpsilon (open-source Artemis-like) | the server is the main screen; clients find it by UDP broadcast on the LAN; a headless server or VPS for internet; one machine can run several stations | Copy the LAN discovery and the headless host. |
| Photon Quantum (engine) | deterministic predict/rollback, with a server relaying inputs | The exact shape of model D, proven in commercial games. |

## 2. Transport and connectivity

Messages in model D are small. They are inputs (4 players × about 4 bytes per tick), confirmed frames, a hash every 60 ticks, and an occasional snapshot of about 5–6 KB (about 1.5–1.9 KB as JSON, because most values are integers). Batching 2 ticks per packet at 30 Hz gives about 2–4 KB/s per client including headers, or about 10–15 MB per player per hour.

| Option | Good | Bad | Cost |
|---|---|---|---|
| **WebSocket, host runs a server in the Electron main process** (`ws` package), clients connect by IP:port; LAN discovery by UDP broadcast (`dgram`), as EmptyEpsilon does | Simplest possible; easy to test headless in Node; reliable and ordered | TCP head-of-line blocking hurts on lossy links; needs port-forwarding for the internet | free |
| **WebRTC data channels** (built into Chromium, so it runs in the renderer with no native module) + a signalling service + STUN + TURN fallback | Real NAT traversal; unordered/unreliable channels (`ordered:false, maxRetransmits:0`) avoid head-of-line blocking; encrypted; works off Steam | Signalling and ICE are fiddly; about 10–20% of connections need TURN | Signalling: a Cloudflare Worker + Durable Object holding join codes (free tier is enough). STUN: free public servers. TURN: Cloudflare Realtime TURN at $0.05/GB after 1,000 GB/month free, which is effectively $0 at 15 MB per player-hour |
| Relay server (WebSocket to a VPS that forwards) | Always connects; easy | You run a server; extra hop of latency; TCP | about $5/month VPS |
| **Steam** (lobbies, invites, Steam Datagram Relay) | Best player experience: invite a friend, IP hidden, relay often lowers ping, free | Steam builds only; `steamworks.js` exposes lobbies but only the **old** `sendP2PPacket`/`readP2PPacket` API, not ISteamNetworkingSockets/Messages/SDR, so you'd need another binding (for example `steamworks-ffi-node`) or a fork; a native module in the main process | Steam's $100 app fee |

**Recommendation.** Put every transport behind one small interface (`send(peer, bytes, reliable)`, `onMessage`, `peers`). Then:
1. **Phase 1:** WebSocket host in the main process, direct IP plus LAN broadcast discovery. Reliable and ordered is fine on a LAN.
2. **Phase 2:** WebRTC data channels with 6-character join codes through a Cloudflare Worker, STUN, and Cloudflare TURN. Send inputs on an unreliable channel, each packet carrying the last 8 ticks of inputs (redundancy beats retransmission). Send snapshots and lobby messages on a reliable channel.
3. **Later, only if shipping on Steam:** a Steam transport (lobbies + SDR) behind the same interface. Keep WebRTC for non-Steam builds.

## 3. Determinism findings from the code

What already holds (good news):
- **Fixed tick.** `TICK_HZ = 60`, `DT = 1/60`, hazards every 5th tick (`src/renderer/src/sim/tuning.ts:2-5`). `step()` runs systems in a fixed order and increments `state.tick` (`sim/step.ts:28-63`).
- **No transcendental math in the sim.** A grep of `sim/` and `shared/` finds only `Math.sqrt` (`sim/bot.ts:121`, `sim/director.ts:59,84`, `sim/interact.ts:31,49`, `shared/intent.ts:22`), plus `Math.floor` and `Math.imul`. All of these are exactly specified by IEEE-754 and ECMAScript. No `sin/cos/pow/exp/log/atan2`, no `Math.random`, no `Date.now` in the sim. This matters: ECMAScript leaves `Math.sin` and friends implementation-defined. V8 uses an fdlibm port that is stable in practice, but its output has changed between V8 versions, and other engines differ.
- **RNG.** mulberry32 on 32-bit integers (`shared/rng.ts:1-26`), seven named streams (`sim/state.ts:16`), all in the snapshot (`sim/flatten.ts:28`).
- **Intent sanitising.** `clampIntent` removes NaN and -0 (`shared/intent.ts:20-30`), and `flatten` writes -0 as 0 (`sim/flatten.ts:24`).
- **Iteration order.** JS `Map`/`Set` iterate in insertion order by spec, and the sim sorts where order matters anyway (`sim/console.ts:129`, `sim/interact.ts:118`, `sim/debrisTargets.ts:30`).
- **Snapshot and hash.** `flatten()` writes the whole canonical state, with the version and layout hashes in the header (`sim/flatten.ts:22-63`). `hashF64` is FNV-1a over the raw bytes (`shared/hash.ts:1-11`). `saveSnapshot`/`loadSnapshot` check the format, SIM_VERSION and layout (`sim/snapshot.ts`). `runReplay` hashes every 60 ticks to localise a divergence (`sim/replay.ts:21-31`). The key property for rollback is already tested: "save at tick N, load, continue equals an uninterrupted run" (`tests/snapshot.test.ts:139`).
- **Measured** (tsx on this machine, fresh states): starter ship 608 values with 1 player and 677 with 4; cutter 702/771; skiff 605/674. That is 4.8–6.2 KB raw and 1.5–1.9 KB as JSON. One `step()` takes about 2–9 µs. One `hashState()` takes about 12–20 µs. Rollback of 10 ticks, one restore and one hash cost well under 1 ms.

Risks, and what to do about each:
1. **Component storage is module-global.** `Position`, `Health`, `Life`, `Stable`, `Owner` and `Seated` are plain arrays shared by the whole JS realm (`sim/components.ts:2-13`), indexed by bitecs entity id (`sim/state.ts:122-129`). Two `SimState` objects in one process **share crew positions**. So rollback must not keep a second "confirmed" SimState object. Save with `flatten()` into a ring buffer of Float64Arrays and restore with `unflatten()` into the single live state. Headless host and client tests must also run in **separate workers or processes**, not as two states in one vitest worker. (Alternatively, move components into the state. That is a bigger change, but it would make in-process multi-state tests trivial.)
2. **Analog stick values.** Raw gamepad doubles go through `clampIntent`'s sqrt normalisation. JSON round-trips doubles exactly, but to be safe and small, **quantize moveX/moveY to int8 (−127..127)/127 on every machine, the local one included**, before both sending and stepping. Then every peer steps bit-identical inputs. Today's `CompactIntent` (`sim/replay.ts:9-15`) is the natural wire format to extend.
3. **Cross-machine float behaviour.** With the same Electron build (Electron 37.10.3, the same V8), the basic IEEE operations (+ − × ÷ sqrt) give identical results on x64 and arm64. V8 does not fuse `a*b+c` into an FMA, because JS semantics forbid it. The remaining risks are a different Electron/V8 between peers, or someone adding `Math.sin` or similar later. Mitigations: the handshake refuses to connect unless app version, SIM_VERSION and layout hash all match; add a lint rule (or a test that greps the sim) banning `Math.(sin|cos|tan|atan2|pow|exp|log|hypot|cbrt|random)` and `Date.now/performance.now` in `sim/` and `shared/`; keep the golden test.
4. **Clock and accumulator.** The local loop throws away backlog on long frames ("slow motion, not catch-up", `app/loop.ts:9`). That is fine alone, but wrong when networked: a client that falls behind must catch up to the host's tick, by re-simulating. The networked loop has to replace `stepAccumulator` with "target tick = host tick estimate + lead". The host should also keep its own catch-up cap.
5. **State outside the sim.** Callouts are app state, deliberately kept out of Intents and replays (`app/session.ts:57`). Audio cues come from counter diffs (`app/session.ts:130-133`). Networked: send callouts as their own small reliable message. For cues, use the confirmed state for other players' events and the predicted state only for your own actions, or rollback will replay sounds twice or play ones that didn't happen.
6. **Layout picked by player count** (`app/session.ts:64`). The host chooses it and sends the layout id in the start message.
7. **Bots.** `botIntent` (`sim/bot.ts:289`) reads only the state, so it is deterministic. Run it **on the host only** and send its output as that crew member's input. This also gives you "a bot takes over a dropped player" for free.
8. **Hidden state that isn't snapshotted.** `scratch` is cleared at the top of every step (`sim/step.ts:31`), and `injectionScratch` is written and read within the same hazard tick (`sim/step.ts:44-45`). Both are safe to skip. Add a test that randomly saves and loads mid-run on all three ships and checks the hashes still match an uninterrupted run, so that any future non-snapshotted field is caught.

**Detecting and repairing a desync:**
- Every 60 ticks the host sends `(tick, hashState)` for a confirmed tick. Clients compare it with their hash of the same *confirmed* tick, not the predicted one, so they keep a confirmed checkpoint.
- On a mismatch: the client sends its `flatten()` of that tick, so the host can diff it, and asks for a resync. The host sends `saveSnapshot` plus the confirmed inputs since then. The client calls `loadSnapshot`, re-simulates forward, and carries on. The player sees one snap.
- Diagnostics: record `FLATTEN_MANIFEST` section offsets (`sim/flatten.ts:8`) so a diff tool can say "first differing value: section `enemy`, field 12". Log both arrays, the seed and the input log to the crash store. The existing crash format (baseline snapshot plus inputs since, `app/session.ts:120-121`) is already a replay.

## 4. Session features

- **Lobby and join codes.** The host creates a session and gets a 6-character code (from the signalling Worker in Phase 2, or shows its LAN IP in Phase 1). Lobby messages: `hello{appVersion, simVersion}`, `roster`, `pickCharacter`, `ready`, `start{seed, layoutId, playerCount, slotMap}`. Refuse any version mismatch with a clear message.
- **Player count is fixed at run start.** `createSimState(layout, playerCount, …)` (`app/session.ts:65`) builds one crew member per player, and the snapshot size depends on it. So players join in the lobby only. No mid-run drop-in for new players in v1.
- **Reconnect: yes. Host migration: no.** A dropped player's slot stays reserved and the host's bot drives their crew member. Reconnecting gets a snapshot plus the inputs since, and the player takes over again. If the **host** drops, the run pauses for everyone. The host autosaves a snapshot every 30 s, so any player can "re-host from the last save" (manual migration). Real host migration needs every client to hold authoritative input history and a leader election, which isn't worth it for 2–4 friends.
- **Save and continue.** The `saveSnapshot` JSON is already a save file. Restriction: `loadSnapshot` refuses other SIM_VERSIONs (`sim/snapshot.ts:31`), so saves don't survive updates. Say so in the UI.
- **Pausing.** Today the game pauses when the window loses focus (`main.ts:52-55`). Networked, focus loss must **not** pause the game. See section 7.4 for the co-op pause design.

## 5. Multi-screen UX

Artemis and EmptyEpsilon give each officer a **station screen** and a separate shared **main viewscreen**. That works because their officers don't have bodies. FTLite's whole point is that you walk your body to a console, so a station-only screen would hide the fires, boarders and crewmates you need to react to. Recommendation:

- **Every player's screen shows the whole ship** (it already fits the 1280×720 internal canvas, `shared/resolution.ts:4-5`), the enemy window and the clock card, all read from the same synced state.
- **Your own crew member** gets a highlight ring and your name. Other players get small name tags.
- **Your own console card is large and clickable** while you are seated: helm, weapons with the enemy window ready to target, doors, engineering power bars. When standing, a context strip shows what Interact would do. **Other players' cards shrink** to one-line status pills ("Ana: WEAPONS, charging 70%"), because co-op talk needs to know who is where.
- **Navigation and events** open as an overlay on the seated player's screen. Votes show on everyone's screen, because votes are per player.
- **Optional spectator or main-screen client**: a client with no player slot that renders the shared couch view (today's layout) on a TV, for mixed couch-plus-remote groups.

Architecture: the renderer and HUD already read `SimState` with no side effects (`deps.renderer.draw(state, alpha, bubbles)`, `buildHudModel(state, slots, …)`, `app/session.ts:143-144`). Add a **viewer** parameter (local player ids) to `buildHudModel` and the console layer. Then the same code draws the couch view (viewer = all) or a per-player view (viewer = [pid]). The draw interpolation (`recordPrev` before each tick, `app/session.ts:118`) keeps working, as long as a rollback calls `recordPrev` against the state that was *presented* before the re-simulation, so that corrections blend rather than jump.

## 6. Phased plan

**Phase 0: preparation (no networking).**
- Move ticking out of `session.ts` into a `TickDriver` with the operations `submitLocalInput(pid, intent)`, `confirmFrame(tick, intents[])`, `predictTo(tick)`, `save()/restore()` (flatten ring buffer). Single-player and couch play use a driver that confirms immediately.
- Quantize intents. Lint rule for banned Math functions. Add the viewer parameter to the HUD.
- Tests: the existing suite plus "a random save/load mid-run matches the uninterrupted hash" on all ships, and "quantized intents replay identically".

**Phase 1: two Electron instances on one LAN, host-relayed lockstep, no prediction.**
- WebSocket host in the main process and UDP broadcast discovery. The client sends input with the tick it's for. The host builds each confirmed frame with a 2-tick input delay (33 ms, which can't be felt on a LAN) and broadcasts it. Clients step only confirmed frames. Hash every 60 ticks; snapshot on join or mismatch.
- Per-player screens (section 5), reconnect with bot takeover, host-only pause.
- Risks: protocol bugs, cross-machine desync, the clock-sync loop. Tests:
  - **Headless two-process test.** A Node host process and a Node client process (separate processes because of the global components) run scripted inputs for 10 minutes and compare hashes every second.
  - **Two real machines**: the owner's PC plus a laptop, ideally one ARM laptop if available.
  - **Desync drill**: change one value on the client and check the hash catches it and the snapshot repairs it within 1 s.

**Phase 2: internet.**
- WebRTC transport, join codes, TURN. Client prediction and rollback: the client runs ahead of the host by RTT/2 plus a jitter buffer, so its inputs arrive on time. It applies its own inputs immediately, guesses remote inputs by repeating the last one (and never repeats button presses), and when a frame is confirmed it restores, re-simulates and re-presents. Redundant input packets.
- Risks: visible corrections on remote avatars, audio double-firing, clock drift, NAT failures. Tests:
  - **A latency/jitter/loss simulator** in the transport interface (for example 120 ms ± 30 ms, 3% loss, reordering), run in CI on the two-process test.
  - **Desync soak**: 4 simulated players, 2 hours, random inputs, zero hash mismatches allowed. Also measure rollback depth and correction size.
  - **NAT matrix**: home, phone hotspot, and an office/CGNAT network (TURN path).

**Phase 3: polish.**
- Steam transport if shipping there; host autosave and re-host; a spectator or TV client; netgraph overlay (RTT, rollback depth, resyncs); mixed couch plus online (several local players on one client).

## 7. Keyboard and mouse, FTL-style controls

The owner wants keyboard and mouse supported "like FTL": click a crew member, click a room to send them (with pathfinding); click a weapon, then an enemy room, to target; click power bars and system icons; click doors; hotkeys for weapons, doors and pause. In FTLite each player controls **one** crew member, so "select a crew member" goes away. You are always your own crew member. Everything else maps well.

### 7.1 Click-to-move: an order in the sim, not fake stick input

Two ways:
- **(a) Client-side pathing that emits stick intents.** The client runs a BFS (like `firstStep`/`walkTo` in `sim/bot.ts:35,118`) on its view of the state and outputs moveX/moveY each tick. It needs no sim change. But the path is planned on a predicted, possibly stale state. Under rollback, the same stick values replayed after a correction can push you into a door frame (the memory note: walking must line up with one-tile doors). It also sends a continuous input stream for what was one click.
- **(b) A move order inside the sim (recommended).** Add `moveTarget` (a tile index, or −1) to `Intent` and the per-crew target to the state and `flatten`, which means a SIM_VERSION bump. Each tick, `movementSystem` steers toward the next BFS step, reusing the bot's pathing code. Any non-zero stick input or a new click cancels or replaces the order. Clicking a room picks the nearest free tile in it, or the console tile if you clicked a console. The order is **one input on one tick**: deterministic, replayable, re-planned on the true state every tick, and harmless under rollback, because the order replays and the sim re-plans around the door that just closed. Bots can use the same mechanism.

### 7.2 Console clicks as commands

Add one optional `command` per tick to `Intent`, queued like the existing press edges (`app/intents.ts:10-34`). Possible commands:
- `selectRow(station, row)`, which equals moving the cursor to that row and pressing Confirm;
- `fire(slot, enemyRoom)`, for FTL's click-weapon-then-click-room;
- `power(station, +1/−1)`;
- `door(doorIdx)` / `airlock(idx)`;
- `vote(choice)`;
- `navSelect(node)`.

The sim validates each one exactly as it validates stick and Confirm today. **Keep the presence rule**: the command only acts if your crew member is seated at the matching console (a door click needs the Doors seat, a weapon target needs the Weapons seat), otherwise it is ignored. Hovering a door you can't control shows "sit at Doors". This keeps FTLite's co-op design (people have to be in the right seats) while giving FTL's speed. **Open question for the owner**: does "copy FTL" mean a mouse player may operate systems from anywhere, as FTL does? That would undo the Coop-i/ii design. My recommendation is no.

Implementing it as "set cursor plus Confirm" for most commands keeps all the console logic in one place. Only `fire(slot, room)` and `power` need direct handlers. The wire encoding grows from `[moveX, moveY, buttons]` (`sim/replay.ts:9`) to `[mx, my, buttons, cmdKind, cmdA, cmdB]` as small integers, a few bytes.

### 7.3 Mixing keyboard+mouse and gamepads

Yes, by design. The sim sees only Intents, and `deviceManager` already maps devices to slots. Networked, each machine owns its local slots. Rule: **one mouse per screen**, so a machine with a keyboard+mouse player has that player as the "screen owner". Extra gamepad players on the same machine still use stick and Confirm, and their cards show smaller. WASD walking, E for Interact, Space for Confirm-or-pause (see below), 1–4 for weapons while seated at Weapons (FTL's number keys), and hotkeys for doors and power while seated at those consoles. Make hotkeys rebindable.

### 7.4 Pausing in real-time co-op

FTL's Space-to-pause-and-plan works because one person runs the ship. With 2–4 people, any one person pausing interrupts the others, and pausing over a network is a social problem as much as a technical one. Technically it's easy: the host stops issuing confirmed frames. Options:
1. **Host-only pause**: simple, but unfair to clients.
2. **Anyone can pause, everyone sees "Paused by Ana"**, and anyone can resume after 3 s. Cheap, and works for friends. **Recommended for v1.**
3. **Tactical pause with a budget**: for example 3 pauses per sector, or a shared "time-out" meter. Good for later balance.
4. **Planning pause**: while paused, players may queue move orders and a weapon target. These are delivered as commands on the first tick after resume. This keeps FTL's "pause and plan" without anyone acting during the pause. A nice Phase 3 addition.

Focus loss never pauses a networked game. A player whose window is hidden just gets a "away" badge.

### 7.5 What this changes in the per-player screen

A mouse player's screen needs clickable targets: room hover highlights and a path preview line for click-to-move, a large console card with real buttons (rows, power pips, weapon slots), the enemy window as a click target while seated at Weapons, and door icons on the ship view that are clickable while seated at Doors. Gamepad players see the same layout with a cursor highlight instead of hover. This makes the "own card large, others small" layout from section 5 a requirement rather than a preference: a 4-card couch HUD has no room for mouse-sized targets.

## 8. Open questions for the owner

1. Internet play at launch, or LAN first? Phase 1 is LAN-only.
2. Steam release planned? That changes the Phase 3 transport.
3. Should mouse players be able to control systems without sitting at the console (true FTL), or keep the presence rule (my recommendation)?
4. Mixed couch plus online in v1 (two players on one machine plus one remote), or one player per machine?
5. Pause rule: anyone pauses (recommended), host only, or a budget?
6. Is it fine that saves and sessions only work between identical game versions?
7. Should a dropped player's crew member be bot-driven (recommended) or stand still?
8. While waiting for Phase 1: try Steam Remote Play Together on the current build for a remote playtest. It costs nothing.

## Sources

- Factorio FFF #76 "MP inside out": https://factorio.com/blog/post/fff-76
- Factorio FFF #83 "Hide the latency": https://factorio.com/blog/post/fff-83
- Factorio FFF #302 "The multiplayer megapacket": https://factorio.com/blog/post/fff-302
- Factorio FFF #412 (car latency driving): https://factorio.com/blog/post/fff-412
- Artemis protocol docs (unofficial): https://artemis-nerds.github.io/protocol-docs
- Artemis port and remote play notes: https://wiki.dallasmakerspace.org/wiki/Artemis_spaceship_simulator , https://forums.trmn.org/viewtopic.php?p=30513
- EmptyEpsilon LAN play: https://github.com/oznogon/EmptyEpsilon/wiki/LAN-(local-network)-play
- EmptyEpsilon headless server: https://github.com/daid/EmptyEpsilon/wiki/Headless-Dedicated-Server
- EmptyEpsilon internet play: https://github.com/oznogon/EmptyEpsilon/wiki/Internet-Play
- Barotrauma networking (modding docs): https://evilfactory.github.io/LuaCsForBarotrauma/lua-docs/manual/networking
- Barotrauma developer lag post (cites Fiedler): https://barotraumagame.com/uncategorized/test-build-with-an-attempt-to-fix-the-lag
- Space Engineers physics and prediction interview (Jan Hlousek): https://80.lv/articles/jan-hlousek-on-setting-up-in-game-physics-optimization/
- Space Engineers multiplayer overhaul: https://blog.marekrosa.org/2018/07/space-engineers-multiplayer-overhaul/
- Valheim networking (community): https://supercraft.host/wiki/valheim/better_networking/
- Overcooked! 2 online (Team17 support): https://support.team17.com/en/articles/319376-overcooked-2-multiplayer-with-local-and-online-players-ps4-xbox-switch
- Lovers in a Dangerous Spacetime, no online, Remote Play Together: https://couchcoopfavorites.com/lovers-in-a-dangerous-spacetime , https://steamcommunity.com/app/252110/discussions/0/3106889614417188869
- Starship Simulator multiplayer (dev forum, FAQ): https://forums.unrealengine.com/t/starship-simulator-dev-progress/2076546 , https://wip.starshipsimulator.co.uk/faq.php
- Deep Rock Galactic multiplayer: https://deeprockgalactic.wiki.gg/wiki/Multiplayer
- Unreal networking overview: https://dev.epicgames.com/documentation/unreal-engine/networking-overview-for-unreal-engine
- Glenn Fiedler, Deterministic Lockstep: https://gafferongames.com/post/deterministic_lockstep/
- Glenn Fiedler, State Synchronization: https://gafferongames.com/post/state_synchronization/
- Glenn Fiedler, Networked Physics (2004): https://new.gafferongames.com/post/networked_physics_2004/
- Valve, Source Multiplayer Networking: https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
- Gabriel Gambetta, client-side prediction and server reconciliation: https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html
- GGPO rollback: https://www.ggpo.net/
- Photon Quantum (deterministic predict/rollback): https://doc.photonengine.com/quantum/current/getting-started/quantum-intro
- "1500 Archers on a 28.8" (AoE lockstep): https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- V8 fdlibm port: https://chromium.googlesource.com/chromium/src/+/refs/tags/113.0.5672.6/third_party/fdlibm/README.chromium
- Math results changing across V8 versions: https://macwright.com/2020/02/14/math-keeps-changing
- sin/cos divergence between JS engines: https://codeberg.org/perplexdotgg/bounce/issues/8
- Steamworks networking overview: https://partner.steamgames.com/doc/features/multiplayer/networking
- ISteamNetworkingSockets: https://partner.steamgames.com/doc/api/ISteamnetworkingSockets
- steamworks.js (API in client.d.ts): https://github.com/ceifa/steamworks.js
- steamworks-ffi-node: https://awesome.ecosyste.ms/projects/github.com%2FArtyProf%2Fsteamworks-ffi-node
- Cloudflare Realtime TURN pricing: https://developers.cloudflare.com/realtime/turn/faq/ , https://developers.cloudflare.com/realtime/pricing/
- FTL controls reference: https://ftl.fandom.com/wiki/Controls
