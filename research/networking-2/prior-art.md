# FTLite networking: prior art from shipped games

Date: 2026-11-13. Web research only, no code changes.

Question: FTLite has a deterministic 60 Hz TypeScript sim, a state of roughly 5-10 KB, 2-4 players who each walk one crew member and use consoles, and a Windows (Electron) build that must cross-play with a web browser build. Which model fits best: brief A (the host relays confirmed inputs, every machine simulates, with prediction and rollback) or brief B (one authoritative simulation sends snapshots, clients interpolate and predict only their own avatar)?

How sure each claim is. **[V]** means I checked it against a primary source: developer blog, official docs, source code or a talk. **[S]** means it comes from secondary or community sources (fan protocol docs, hosting guides, forum consensus). **[U]** means it is unverified: my own background knowledge, or a likely inference I did not confirm in this session. For several games in the brief (Void Crew, Stormworks, Artemis Cosmos, Sea of Thieves, Overcooked) no developer has published networking details that I could find. The table says so for those games and does not guess.

Owner decisions this research takes into account (set 2026-11-13):
- **Platforms:** Windows desktop (Electron) plus a web browser build, with cross-play between them.
- **Players:** friends only, who join with an invite or join code.
- **If the host leaves:** the run pauses and is saved, and someone re-hosts it later. No host migration, and no dedicated servers at first.
- **Late join:** a player can only rejoin their own seat.

---

## 1. Comparison table

| Game | Model | Topology | Transport / platform | Players | Own-character latency | Host leaves | Rejoin / join in progress | Desync handling | Known pain points |
|---|---|---|---|---|---|---|---|---|---|
| **Artemis Spaceship Bridge Simulator** | Server simulates. It sends delta object updates, and clients send console commands **[S]** | One PC is the server, each station is a client, mostly on a LAN **[S]** | Its own binary protocol. Fan docs only, port 2010 TCP **[U]** | 1 ship, about 6 stations (more ships possible) | None needed. Stations are UI panels, not avatars | The game ends. The server is the game | A client can claim a free station at any time. The server sends the full state on a "ready" request, and frees a station if it misses heartbeats (about every 3 s) **[S]** | Not an issue: there is one sim | Built for LAN. Internet play needs port forwarding **[S]** |
| **Artemis Cosmos** | Not published **[U]** | | | | | | | | |
| **Pulsar: Lost Colony** | Host-authoritative through Photon (PUN master client) **[S/U]** | Player host, through the Photon cloud relay | Photon Cloud. Players report "can't connect to Photon cloud" failures **[S]** | Up to 5 | Not documented | Not documented. With PUN the default is that the master client role moves but the state does not (see section 2.5) | Store page says drop-in/drop-out **[S]** | n/a | Depends on a third-party relay |
| **Barotrauma** | Server-authoritative state replication. Clients send inputs **[V for server-auth / child process; U for prediction details]** | The "Host" button starts a **separate child server process**, and the host's client talks to it over a pipe **[V, source code]**. Dedicated servers also exist **[S]** | Lidgren UDP at first, later Steam P2P/relay as well **[S]** | Up to 16 by default (configurable) **[U]** | Own character predicted and corrected (rubber-banding reported) **[S/U]** | A hosted game ends with the host. A dedicated server keeps the campaign going **[S]** | Join in progress is supported. The campaign save lives on the server **[S]** | n/a (one authority) | Lag spikes caused by misusing reliable UDP (developer post) **[V]**. Mods must match the server **[S]** |
| **Space Station 13 / 14** | **Server-authoritative, with client prediction by rewind and resimulate** **[V]** | Dedicated servers, often 50-200 players | Its own UDP stack (Robust Toolbox) | Many | Each client predicts **only its own inputs**. A server state arrives for a past tick, and the client rewinds, applies it and re-runs its inputs to the present **[V]** | n/a (dedicated) | Join in progress is the core feature: full state, then deltas **[V]** | Mispredictions, not desyncs. Each system must be written to be predictable **[V]** | Prediction code runs about 10 or more times per tick, so sounds and popups need "predicted" APIs. `IsFirstTimePredicted` is misused to hide mispredicts. Atmos and power cannot be predicted. Randomness needs a shared seed **[V]** |
| **Lovers in a Dangerous Spacetime** | Local co-op only. No online play **[S]** | n/a | n/a (Steam Remote Play Together is the usual workaround **[U]**) | 1-4 | n/a | n/a | n/a | n/a | No published reason for skipping online play. It is plausibly a design choice (couch co-op, physics-heavy) **[U]** |
| **Overcooked 2 / All You Can Eat** | Not published. Online play was added with Team17's help after the team checked whether the code base could support it **[V, interview]** | Player host. A third-party guide says P2P **[S]**. The developer says Steam servers are used on PC **[S]** | Steam and console platforms | 1-4 | Not published. Players report 150-300 ms lag to a distant host **[S]** | Not published | Not supported in a level **[U]** | n/a | Developers said "due to the complexity of online networking, it has been difficult for us to narrow down... causes" **[S]**. Reviews call online play "noticeable sometimes" **[S]** |
| **Factorio** | **Deterministic lockstep**. The server **relays inputs** and decides which tick each action runs in **[V]** | Started as pure P2P. Later used a server (headless or a player) that relays **[V]** | Its own UDP | Up to hundreds | **"Latency state"**: a throwaway copy rebuilt from the confirmed state every tick, with the player's own unconfirmed actions replayed on top **[V]** | A player-hosted game ends. Headless servers are common | Join in progress by **downloading the whole map**, then catching up **[U, widely known]** | Desync = the game state is no longer identical. Players file desync reports, and the developers hunt for tick-level causes **[V]** | The latency-state code mishandled skipped ticks and latency changes. That produced 400-action "megapackets" that cascaded into kicking players on 200-player servers, and the rewrite took about two weeks **[V]**. Predicting cars produced duplicate sounds and particles from tiny mismatches **[V]** |
| **Deep Rock Galactic** | Unreal listen server, host-authoritative **[U]** | Player host | Steam (and Xbox) | 1-4 | Unreal's built-in movement prediction **[U]** | **The mission ends for everyone. No host migration** **[S, player reports]** | Joining between missions works. **No rejoin after a disconnect** is a long-standing player request **[S]** | n/a | Hosts can quit to deny rewards. Players suspect migration is hard because the terrain is generated and destructible **[S]** |
| **Valheim** | Hybrid **distributed authority**: the first player into a zone simulates its physics and AI **[S]** | A server (dedicated or player host) plus zone-owner clients | Steam (and PlayFab crossplay **[U]**) | Up to 10 | Players own their own character **[S]** | A player-hosted world stops. Dedicated worlds keep running | Join any time | Not lockstep. A zone owner's bad connection lags everyone near them **[S]** | "If the zone owner has poor connectivity, everyone in that zone suffers." Mods raise the bandwidth caps **[S]** |
| **Stormworks** | Not researched in depth. Host-authoritative physics is likely **[U]** | | | | | | | | |
| **Sea of Thieves** | Dedicated Unreal servers. Details not published (I found no networking talk) **[U]** | Dedicated | Microsoft | 4 per ship, several ships per server | Unreal movement prediction **[U]** | n/a | Join in progress is supported | n/a | n/a |
| **Void Crew** | Unity. Netcode not published. Won a Unity Awards multiplayer prize **[S]** | Player host **[U]** | Steam | 1-8 **[U]** (a Unity post says 1-6) | | | Drop-in **[U]** | | |
| **Stardew Valley** | **Host-authoritative state sync** with "NetFields" that send deltas **[S]** | Player host. Third-party dedicated-server mods exist | Steam / GOG Galaxy / LAN | 1-4 (8 on PC in 1.6 **[U]**) | Own farmer simulated locally **[U]** | **The farm stops. Farmhands cannot load the farm without the host** **[S]** | Farmhands rejoin **their own cabin** (a seat-like slot) **[S]** | n/a | Host validation is loose: a client can push team state changes as deltas **[S, one user's analysis]** |
| **Don't Starve Together** | Server-authoritative. Clients predict their movement ("Lag Compensation" option) **[V, Klei support]** | Dedicated or player host. Caves run as a second shard **[U]** | Klei's own system plus Steam | 1-6 (more with mods) | Prediction is on by default. Turning it off gives honest positions but input lag. Players are split on which is better **[V/S]** | A player-hosted world stops | Join any time | n/a | "Due to a lack of actual lag compensation, movement prediction is unreliable" (community). Switching the setting mid-move causes sliding bugs **[S]** |
| **Risk of Rain 2** | Unity UNet, **host-authoritative**. Clients send Commands, the host sends RPCs and SyncVars **[S]** | Player host | Steam / consoles | 1-4 | Client-side movement **[U]**. A popular mod adds client-predicted projectiles because the base game makes non-hosts wait **[S]** | The run ends **[U]** | Join between stages **[U]** | n/a | Mod lists hashed and checked on connect **[S]** |
| **FTL / Into the Breach** | Single player only | n/a | n/a | 1 | n/a | n/a | n/a | n/a | Subset never published a networking reason. Pause-based design and tight scope are the likely reasons **[U]** |
| **Teardown (MP, 2025-26)** | **Hybrid**: a deterministic **reliable command stream** for destruction, plus **unreliable state sync** for transforms and players **[V]** | **The hosting player is the server.** No dedicated servers **[V]** | Moved from Saber's backend to **Steam Networking** **[V]** | Small groups | Clients simulate locally and are corrected by host state. Snaps are visible in complex scenes **[V]** | Not covered | Joining replays the command stream. **Joining is disabled once the buffer fills** **[V]** | Destruction uses fixed-point math to stay deterministic **[V]** | "A mix of many techniques with tons of special cases." Backwards compatibility was "the single most time-consuming part." Merging the MP branch took months **[V]** |
| **Space Engineers / Starbase** | Server-authoritative with client simulation of the controlled grid **[U]** | Dedicated + player host | Steam | many | | | | | Known for rubber-banding on large grids **[U]** |
| **Age of Empires I/II** | **Deterministic lockstep** P2P. Commands scheduled **2 turns ahead** **[V]** | P2P | UDP over 28.8k modems | 8 | **None**: input delay is accepted. "250 ms of command latency was not even noticed," and 250-500 ms was playable **[V]** | n/a | No join in progress | Out-of-sync stops the game. "Very subtle differences would multiply over time," and tracing them took huge logs **[V]** | Desync hunting. Developers had to learn that commands are delayed **[V]** |
| **GGPO-style fighting games** (contrast) | Lockstep + **rollback**: predict remote inputs, roll back and resimulate when the real inputs differ | P2P (or a relay) | various | 2 | Small input delay + rollback | Match ends | No | Hash checks | Needs tiny state, a cheap tick and full determinism. A solo developer said "there are no easy solutions," and his next game won't have online play **[V, KungFu Kickball postmortem]** |

---

## 2. Patterns

### 2.1 Crew and station games settle on one authority sending state
Every crew or station game I could pin down uses **one authoritative simulation that replicates state**: Artemis, Barotrauma, SS13/14, DST, Stardew, RoR2, DRG and (probably) Pulsar. None uses lockstep. The reasons that come up again and again:
- **Join and rejoin are trivial.** Send the current state and you are done (Artemis's "ready" request, SS14's full state then deltas, Colyseus's "full state on join, then patches").
- **One slow player doesn't stall the rest.** In lockstep, "the game speed is limited by the slowest player" (Factorio FFF #76). AoE had to build adaptive turn lengths for the same reason.
- **Hidden information and cheat resistance come free.** SS14 keeps secret data off clients that don't need it, and its visibility system (PVS) sends only the entities near each player.
- **The state is small or can be culled.** Lockstep pays off only when the state is "simply too large to exchange" (Fiedler). Crew games are mostly small ships and a few dozen entities.

### 2.2 When lockstep wins
Lockstep wins when the state is huge, each player sends few inputs, and players accept input delay: AoE (thousands of units on modems), Factorio (whole factories), Teardown's voxel destruction (sending changed voxels "completely choked the connection"). Even then, the modern versions are **hybrids**:
- Factorio puts a server in the middle to relay and order inputs. The developers moved off pure P2P because of NAT problems.
- Teardown uses commands only for destruction and plain state sync for players and objects.
- For joining, both download or replay the whole history, which is the slow part. Teardown disables joining once its replay buffer fills.

### 2.3 Lockstep's recurring cost: hunting desyncs
- AoE: "very subtle differences would multiply over time."
- Factorio: desyncs from mod scripting gotchas (Serpent serializer quirks) and a cached unit-group speed (FFF #340). Players had to file desync reports with state diffs.
- KungFu Kickball: he had to find every piece of gameplay state he had missed, through many test matches against himself, and switch to fixed-point physics because floats "aren't deterministic across different computer chips."

A snapshot model does not have this failure mode. It has **mispredictions** instead, and those only affect what one player sees, briefly.

### 2.4 How teams predict the local avatar
There are three flavours, from cheapest to richest:
1. **Throwaway "latency state" (Factorio).** Each tick, copy the confirmed state and replay your own unconfirmed inputs on top. There is no explicit correction logic: "mismatches correct themselves." It is cheap to reason about, but the edge cases (skipped ticks, changes in latency) produced the megapacket incident, and effects that should fire once (sounds, particles) fire twice when predictions are off by a hair (FFF #412).
2. **Rewind and resimulate your own inputs from the last server state (SS14, Gambetta, Overwatch, Valorant).** This is the standard method. SS14's guide is the best practical writeup. The lessons from it:
   - Prediction code runs many times per tick, so sounds and UI must be "predicted" or guarded.
   - Randomness must be seeded by entity and tick.
   - Some systems simply aren't predicted.
   - `IsFirstTimePredicted` hides mispredicts. It does not fix them.
3. **Client owns its own character (Journey, Valheim, a lot of Photon PUN games).** This is the simplest option. KungFu Kickball abandoned it because client authority caused collision disputes, and it opens the door to cheating.

Others' avatars are **interpolated** (Valve Source: render about 100 ms in the past between two snapshots). They are not predicted.

### 2.5 The host leaving: almost nobody migrates
- **DRG, Stardew, DST, RoR2, Teardown (no dedicated servers), Overcooked, player-hosted Barotrauma:** the session ends or stops when the host leaves. DRG players have asked for migration and rejoin for years.
- **Photon PUN** reassigns the "master client" automatically. But "Photon does not move player properties or cached events," and the docs advise not relying on the master client in fast-paced games.
- **Warframe** is the famous case of migration that exists and loses progress. Its forum threads are titled "Host migration: the Achilles heel."
- The shipped answer is: **end or pause the session, keep the save, and offer dedicated servers for groups that care** (Barotrauma, DST, Valheim, Factorio headless).

The owner's rule (pause, save, re-host later) is the industry norm, not a compromise.

### 2.6 Rejoining your own seat
- Artemis frees a station after heartbeats stop.
- Stardew farmhands rejoin their own cabin.
- Colyseus holds a seat through `allowReconnection(client, seconds)` and a reconnection token kept on the client.

All of these depend on the authority being able to **send the full current state at once**, which is natural in a snapshot model.

### 2.7 What teams say they'd do differently
- **Teardown:** the result is "a mix of many techniques with tons of special cases," and the team is trying simpler approaches in its next engine. They are unsure whether merging the MP branch into the main code was right. Backwards compatibility cost the most time.
- **Factorio:** the latency-hiding queue needed a two-week rewrite. Every small prediction mismatch had to be fixed because duplicate effects are so visible.
- **AoE:** keep metering from day one, test on bad networks early, and teach single-player programmers that commands are delayed.
- **KungFu Kickball:** determinism is the hardest problem. A thin server that keeps the clock and reuses a late player's last input stops one slow peer stalling everyone. "No easy solutions."
- **Overcooked:** online play was added late and stayed hard to debug.
- **SS14:** prediction has to be built into every system from the start. Retrofitting it onto old server-only code is still ongoing.

### 2.8 Browser co-op and cross-play
- **Browsers have no raw UDP.** The options are WebSocket (TCP, so it suffers head-of-line blocking), WebRTC data channels (unreliable or unordered UDP-like delivery, but they need STUN/TURN and a signalling server), and WebTransport (UDP-like, but it needs an HTTP/3 server and is not yet in all browsers **[U]**).
- **There is no Steam relay in a browser.** A browser cross-play build needs **your own relay or signalling server**. That server becomes a natural place for join codes, seat tokens and (later) a dedicated simulation.
- **WebRTC P2P often fails to connect directly.** Commonly cited figures are about 15-22% of sessions needing a TURN relay (callstats.io 2016, vendor estimates), and more on mobile and corporate networks **[S]**. You will run a relay either way.
- **.io games** (agar.io and similar) and the main JS framework, **Colyseus**, are server-authoritative. Only the server changes state. Clients get the full state on join and then delta patches at a fixed rate, and seats are held for reconnection. A browser game played by friends is the standard Colyseus use case.
- **PeerJS / WebRTC mesh** works for 2-4 friends, but every peer must connect to every other (the same NAT problem Factorio hit). Hosting in a browser tab also has a trap: **Chrome heavily throttles timers in background tabs** (down to about once per minute after 5 minutes hidden, under its "intensive throttling" rules, when certain conditions are met **[V, Chrome blog; conditions apply]**). A browser player who hosts and tabs away could stall everyone. Running the sim in a Worker, or hosting from the Electron build or a relay server, avoids this.
- **JS cross-engine determinism is not guaranteed.** ECMAScript says `Math.sin`, `cos`, `exp`, `pow` and similar are "implementation-approximated." Chrome (V8, which Electron also uses), Firefox (SpiderMonkey) and Safari (JavaScriptCore) may return different last bits. Basic arithmetic (+ - * /) and `Math.sqrt` are IEEE-exact, so a sim that avoids transcendentals, or uses its own lookup tables or fixed-point maths, stays deterministic. **This matters a lot for brief A with browser cross-play.**

---

## 3. Lessons for FTLite

### 3.1 Verdict: brief B, keeping determinism as an asset
The evidence favours **brief B**. That means one authoritative simulation, which sends state (full snapshots or deltas) at maybe 20-30 Hz. Clients render other players with a little interpolation and **predict only their own crew member's walking**, by rewinding to the last server state and replaying their own unconfirmed inputs (SS14 / Gambetta). This is a few hundred lines of code, not a whole-sim rollback.

Why B fits:
- **The state is tiny.** 10 KB full, and far less as deltas. Bandwidth, the one big reason for lockstep, does not apply. At 20 Hz even full snapshots are about 200 KB/s per client before compression, and deltas of a mostly-static ship will be a few KB/s.
- **The direct avatar plus console UI matches SS14, Barotrauma and Artemis**, which are the closest genre matches, and they all use an authority plus state.
- **The owner's decisions are all things B does for free.** Rejoining your own seat means: send the snapshot and re-bind the seat. Host leaving means: the authority writes its save, which is the same data as a snapshot. Join codes go through a relay. Friends only means cheating is low stakes, but B still keeps enemy-event secrets on the host.
- **Browser cross-play.** B needs only the **host's** machine to run the sim exactly. Clients that compute a slightly different `Math.sin` merely mispredict a bit, while in A they would **desync**. Brief A with cross-play would need a promise that the sim is bit-identical across V8, SpiderMonkey and JavaScriptCore, plus desync tooling on the scale of Factorio's.
- **Expansion.**
  - *Larger crews:* lockstep cost grows with players times rollback depth, while B's cost grows with state size only.
  - *Multiple ships and PvP:* B can cull per player (SS14's PVS) and hide the other ship's internals.
  - *Spectators:* in B they just receive snapshots.
  - *Dedicated servers:* the sim is TypeScript, so **the same code runs headless in Node** on the relay. Moving from host to dedicated server changes where the sim runs, not the protocol (Barotrauma's "host runs a child server process" is exactly this pattern).
  - *Mods:* hash and check the mod list on connect (RoR2). In B only the host runs the gameplay mod code, which avoids Factorio-style mod desyncs.

### 3.2 What to keep from brief A
- **Keep the deterministic sim and the golden-hash tests.** They make prediction exact for the local avatar, make replays and bug reports cheap, and make "save on host leave" trustworthy.
- **Sending inputs from client to host is right in both briefs.** Clients send intents (move to tile, use console, vote). They never send state.
- **Optional later:** a hash of the host's state in each snapshot lets a desktop client check its own prediction in debug builds. That is Factorio's desync tooling, applied cheaply.

### 3.3 Concrete design notes the evidence supports
1. **Run the authority in a place browsers can't throttle.** That is the Electron host, a Worker, or the relay. If a browser player can host, run the sim in a Worker, and warn the host about background tabs.
2. **Use one relay service from day one.** It handles join codes, WebSocket fallback, WebRTC signalling and TURN, and seat tokens. It doubles as the future dedicated server.
3. **Predict walking and door and console *requests*. Do not predict combat outcomes, fire spread or enemy AI.** Factorio and SS14 both skip hard-to-predict systems such as fighting, atmos and power. Show console clicks instantly as "pending" in the UI, and confirm them when the snapshot arrives.
4. **Sounds and effects must fire on confirmed state, or once per predicted event ID.** Otherwise you get the Factorio car and SS14 popup bug, where one action produces the effect ten times.
5. **Seat reconnection works like Colyseus.** Hold the seat for N seconds after a drop, with a token kept on the client. When the run is paused for host loss, the save file records which seat belongs to which player.
6. **Meter early, and test with fake lag and two clients** (AoE's lesson, SS14's `net.fakelagmin`).
7. **Make snapshots versioned and compact from the start.** Teardown found backwards compatibility the biggest cost.

### 3.4 What evidence would change the answer
- **If the state grows past about 100 KB with lots of churn** (large fleets, many ships fully simulated), deltas get expensive and Factorio-style input relay becomes attractive. Even then, use Factorio's version: a server orders the inputs, there is a latency state, and join means downloading the map.
- **If PvP needs fair, low-latency hit resolution between players on different machines**, you would add server-side lag compensation (Valve/Overwatch style) on top of B, not switch to A.
- **If measurements show the sim is bit-identical across Chrome, Firefox and Safari** (a cross-engine golden-hash test of a long run), **and** the full tick costs well under 1 ms so that rolling back 10-20 ticks per frame is affordable, brief A becomes viable. It would give instant response for *everything*, not just walking. Without both of those measurements, A is a risk of permanent desync hunting with little benefit for a 2-4 player crew game.
- **If the owner drops browser cross-play**, A's determinism risk falls (Electron everywhere means one V8 version), but B still wins on joining, the host-leaves save and simplicity.

---

## Sources

Primary or official:
- Space Station 14 docs, "Guide to Prediction": https://github.com/space-wizards/docs/blob/master/src/en/ss14-by-example/prediction-guide.md (site: https://docs.spacestation14.com)
- Factorio Friday Facts #76 "MP inside out": https://factorio.com/blog/post/fff-76
- Factorio Friday Facts #83 "Hide the latency": https://factorio.com/blog/post/fff-83
- Factorio Friday Facts #302 "The multiplayer megapacket": https://factorio.com/blog/post/fff-302
- Factorio Friday Facts #340 "Deep desyncs": https://factorio.com/blog/post/fff-340
- Factorio Friday Facts #412 "Car latency driving": https://factorio.com/blog/post/fff-412
- Paul Bettner and Mark Terrano, "1500 Archers on a 28.8": https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
- Dennis Gustafsson, "Teardown Multiplayer": https://blog.voxagon.se/2026/03/13/teardown-multiplayer.html
- Barotrauma source, ChildServerRelay.cs: https://github.com/FakeFishGames/Barotrauma/blob/master/Barotrauma/BarotraumaShared/SharedSource/Networking/ChildServerRelay.cs
- Barotrauma dev post on lag and Lidgren: https://barotraumagame.com/uncategorized/test-build-with-an-attempt-to-fix-the-lag
- Barotrauma wiki, Hosting a Dedicated Server: https://barotraumagame.com/wiki/Special:Redirect/page/3035
- Klei, Network and Performance Troubleshooting (Lag Compensation): https://support.klei.com/hc/en-us/articles/360029555272
- Photon PUN, Host Migration / Master Client: https://doc.photonengine.com/pun/current/gameplay/hostmigration
- Colyseus docs, State sync: https://docs.colyseus.io/state ; Reconnection: https://docs.colyseus.io/room/reconnection
- Glenn Fiedler, "What every programmer needs to know about game networking": https://gafferongames.com/post/what_every_programmer_needs_to_know_about_game_networking/
- Glenn Fiedler, Deterministic Lockstep / Snapshot Interpolation / State Synchronization: https://gafferongames.com/post/deterministic_lockstep/ , https://gafferongames.com/post/snapshot_interpolation/ , https://gafferongames.com/post/state_synchronization/
- Valve, Source Multiplayer Networking: https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
- Valve, Latency Compensating Methods (Yahn Bernier): https://developer.valvesoftware.com/wiki/Latency_Compensating_Methods_in_Client/Server_In-game_Protocol_Design_and_Optimization
- Gabriel Gambetta, Fast-Paced Multiplayer series: https://www.gabrielgambetta.com/client-server-game-architecture.html
- Tim Ford, "Overwatch Gameplay Architecture and Netcode" (GDC 2017): https://www.gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and
- Riot, "Peeking into VALORANT's Netcode": https://www.riotgames.com/en/news/peeking-valorants-netcode
- Chrome timer throttling (intensive throttling): https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- ECMAScript spec, Math object (implementation-approximated functions): https://tc39.es/ecma262/#sec-function-properties-of-the-math-object
- KungFu Kickball, "Online multiplayer the hard way": https://www.gamedeveloper.com/game-platforms/online-multiplayer-the-hard-way
- Overcooked 2 online origin (GamesBeat interview): https://gamesbeat.com/overcooked-2-chefs-it-up-with-online-co-op-against-the-night-of-the-living-bread/

Secondary or community (lower confidence):
- Artemis protocol docs (fan reverse-engineered): https://artemis-nerds.github.io/protocol-docs
- Pulsar Photon connection thread: https://steamcommunity.com/app/252870/discussions/0/3106901028643551341
- Overcooked 2 developer Steam posts: https://steamcommunity.com/app/728880/discussions/0/1872875054775217319
- DRG host-leave and rejoin threads: https://steamcommunity.com/app/548430/discussions/1/3719440044287578752 , https://devtrackers.gg/deep-rock-galactic/p/17551c7b-host-migration-should-be-mandatory-for-any-game-with-peer-to-peer-connections
- Valheim zone ownership (hosting-company guide): https://xgamingserver.com/docs/valheim/troubleshooting-network
- Stardew Valley multiplayer wiki and modding fundamentals: https://stardewvalleywiki.com/Multiplayer , https://www.stardewvalleywiki.com/Modding:Modder_Guide/Game_Fundamentals
- DST movement prediction forum thread: https://forums.kleientertainment.com/forums/topic/139089-movement-prediction-settings-for-dst/
- RoR2 modding wiki (UNet): https://risk-of-thunder.github.io/R2Wiki/Mod-Creation/C%23-Programming/Networking/UNet/ ; ClientPredictedProjectiles mod: https://thunderstore.io/c/riskofrain2/p/Drastic/ClientPredictedProjectiles/changelog
- Void Crew (Unity blog on Vivox): https://unity.com/ja/blog/hutlihut-games-vivox-voice-chat-void-crew
- WebRTC TURN usage figures: https://webrtchacks.com/usage-stats/ , https://medium.com/@fippo/67b185e49765
- Warframe host migration complaints: https://forums.warframe.com/topic/1060950-host-migration-the-achilles-heel-of-warframe/
- Lovers in a Dangerous Spacetime (local co-op): https://en.wikipedia.org/wiki/Lovers_in_a_Dangerous_Spacetime
