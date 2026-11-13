# FTLite networking: transport, platform services, hosting and running costs

Research date: 2026-11-13. Prices and product status were checked against official pages where possible (see Sources). Anything marked **[unverified]** comes from third-party pages, older data, or my own knowledge, and I could not confirm it on an official page.

## 0. Owner decisions this report assumes (received 2026-11-13)

- **Platforms:** a Windows desktop build (Electron) **and** a web-browser build, with cross-play between them. The v1 transport therefore has to work in a plain browser. That rules out raw UDP, Node `dgram`, and any Steam- or EOS-only path for browser players. Steam stays optional for later.
- **Audience:** friends only, joining by invite or join code. No public matchmaking at first.
- **Host leaves:** the run pauses and is saved. The host, or another player who has the save, hosts it again later. There is no host migration and no dedicated server at first.
- **Late join:** a player can only rejoin their own reserved seat.

These decisions settle most of the transport question. In v1 the only peer-to-peer transport a browser can use is **WebRTC data channels**, and the only client-to-server transports are **WebSocket** or **WebTransport**. Section 6 builds on that.

---

## 1. Transports

### 1.1 WebRTC data channels (works in browsers and in the Electron renderer)

- **Delivery options.** A data channel can be reliable and ordered (the default), or unreliable and unordered (`ordered: false`, `maxRetransmits: 0`). With those options it behaves like UDP datagrams. The channel runs SCTP over DTLS over ICE/UDP, so it is always encrypted.
- **Cross-play.** Chromium in Electron and every current browser use the same `RTCPeerConnection` API, so one code path covers both builds.
- **Node side.** `node-datachannel` (bindings to libdatachannel, N-API 8, Node 18+, prebuilt binaries for Windows, macOS and Linux) works in Node and the Electron main process. libp2p uses it for its Node and Electron WebRTC transport. This means an Electron host could later run its WebRTC endpoint inside a utilityProcess instead of the renderer, and still talk to browser peers.
- **NAT traversal: how often TURN is needed.** No good public data from 2024–2026 exists. The figures that do exist:
  - callstats.io (2016, via webrtcHacks) reported about **22%** of conferences needing a TURN relay. Different write-ups describe the denominator differently.
  - Vendors commonly quote about **20%** of connections relayed **[unverified, secondary sources]**. A third-party note cites Twilio at about 85% direct, about 15% relayed **[unverified]**.
  - For comparison, the libp2p DCUtR study (IMC '26: 4.4 million attempts, 85,000 networks, 167 countries) measured about **70%** success for the hole-punching step alone, once address discovery had already worked. Pure hole punching therefore fails about 30% of the time, and ICE's other candidates recover some of those.
  - **Planning figure: 15–25% of peer links need TURN; use 20%.** It can be higher for mobile carriers (CGNAT, symmetric NAT), campus and corporate networks, and some consumer routers. With STUN only, plan for roughly one in five links failing, which in a 3–4 player session means one session in two or three affected. **TURN fallback is required for internet play.**

### 1.2 WebSocket / WSS to a server

- Works everywhere: browsers, Electron, and Node (`ws`, uWebSockets.js). Uses TCP over TLS on port 443, so it gets through nearly every firewall and proxy.
- The downside is head-of-line blocking. One lost packet holds back everything behind it. That hurts snapshot streams more than it hurts tiny input frames sent with redundancy.
- It is the universal fallback, and the natural transport for signalling, lobbies and save upload.

### 1.3 WebTransport (HTTP/3 / QUIC)

- **Browsers:** Chrome 97+, Firefox 114+, Safari 26.4+ (caniuse). It offers reliable streams and unreliable datagrams.
- **Electron:** it should be available because Electron bundles current Chromium (Electron 44.7 ships Chromium 152). I could not find Electron-specific documentation **[unverified]**.
- **Node:** Node has **no built-in WebTransport server** (Node 24). Options are third-party native bindings: `@fails-components/webtransport` (libquiche), `@moq/web-transport`, or pure-JavaScript `quico`. All are young.
- It needs a TLS certificate and a reachable server. **It is client-to-server only and cannot be peer-to-peer**, so it only helps once you run your own relay or dedicated servers. **Verdict:** a later upgrade from WSS on a relay or dedicated server. Not v1.

### 1.4 Raw UDP via Node `dgram` plus your own hole punching

- Available only in the Electron main process or a utilityProcess, never in a browser. That alone rules it out for v1 cross-play.
- You would also have to rebuild what ICE already does: STUN, punching, relay fallback, encryption. Windows Firewall also prompts when an app listens for inbound traffic (section 4.6). **Not recommended.**

### 1.5 Steam Networking Sockets / Steam Datagram Relay (SDR)

- **What it offers.** `ISteamNetworkingSockets` (connection-based) and `ISteamNetworkingMessages` (connectionless). Both support reliable and unreliable messages and fragmentation. P2P runs over SDR via `CreateListenSocketP2P` / `ConnectP2P`. Valve says that with SDR "IP addresses are never revealed."
- **Price.** Valve's SDR page does not mention cost. It is generally understood to be free for Steam games **[unverified on the official page]**.
- **Players not on Steam.** Your game must also ship on Steam, run your own "game coordinator" that issues credentials, and get SDKs and terms from Valve. Valve says this may not be available to every partner. **For browser players this is not a v1 option.**
- **steamworks.js (ceifa).** Its `client.d.ts` exposes only the **old `ISteamNetworking` P2P API** (`sendP2PPacket`, `readP2PPacket`, `acceptP2PSession`, with send types Unreliable, UnreliableNoDelay, Reliable and ReliableWithBuffering). Valve has deprecated that API. **There is no NetworkingSockets or NetworkingMessages.** It does have good lobby support: create, join, list, lobby data, invite dialog, and the `GameLobbyJoinRequested` callback.
- **steamworks-ffi-node (ArtyProf).** Built on koffi FFI, so Electron upgrades need no native rebuild. Targets SDK 1.64, MIT licence. Its README lists **Networking Sockets (34 functions: P2P by SteamID, listen sockets, reliable and unreliable, poll groups)**, Networking Utils (relay init, ping location, POPs), and full lobby matchmaking. NetworkingMessages is not named. Initialise it only in the main process. ASAR packaging breaks it, so the SDK redistributables and koffi must be in `asarUnpack`. It is a young, single-maintainer project **[maturity unverified]**.
- **greenworks.** "Best-effort" maintenance, with "active development is not a priority." Avoid.
- **Writing your own N-API addon.** Possible, but you would maintain C++ builds for every Electron ABI. Prefer koffi FFI or steamworks-ffi-node.
- **GameNetworkingSockets (open-source sibling).** BSD-3-Clause. Reliable and unreliable messages, AES-GCM-256 encryption, P2P through WebRTC's ICE with pluggable signalling. **SDR is not available outside Steam** to all partners. It is a native library, so desktop only. It is a valid future desktop-to-desktop transport, but it adds nothing over WebRTC once cross-play with browsers is required.

### 1.6 Epic Online Services (EOS) P2P plus relay

- Free, with P2P relay included. Lobbies, matchmaking and an account-free "Connect" interface also work across stores. EOS's own guidance says the relay is for P2P and not for authoritative servers. I did not re-check the current EOS terms page **[verify before committing]**.
- **No Node or Electron binding exists.** The only npm package wraps the REST API. You would need a koffi FFI layer over the EOS C SDK. Like Steam, EOS P2P is native-only, so browser players cannot use it.
- **Verdict:** a possible later desktop add-on for cross-store friends and identity. Not a v1 transport.

### Transport summary

| Transport | Browser | Electron | P2P | Unreliable | Hides IPs | v1? |
|---|---|---|---|---|---|---|
| WebRTC data channel | yes | yes (renderer; node-datachannel in Node) | yes, with TURN fallback | yes | only with relay-only ICE | **yes (primary)** |
| WSS to relay | yes | yes | no (via server) | no | yes | **yes (fallback, signalling)** |
| WebTransport | yes | probably | no | yes (datagrams) | yes | later, with servers |
| Node dgram | no | yes | DIY | yes | no | no |
| Steam sockets / SDR | no | via FFI | yes | yes | yes | later, Steam only |
| EOS P2P | no | via FFI (DIY) | yes | yes | yes, via relay | later, maybe |

---

## 2. Signalling, lobbies, relays and servers: services and prices

### 2.1 Cloudflare

- **Realtime TURN:** **$0.05/GB** of egress from Cloudflare to the TURN client. Ingress is free. The **first 1,000 GB per month are free**, a free allowance shared with Realtime SFU. STUN at `stun.cloudflare.com` is free and unlimited.
  - Credentials are minted via an API and last at most 48 hours.
  - TURN *TCP allocations* (RFC 6062) are not supported. Client-to-TURN connections over TLS are mentioned, but I could not confirm port 443 TCP/TLS ingress on the page **[unverified]**.
  - Relay addresses are IPv4 only.
- **Workers plus Durable Objects (signalling, join codes, lobbies, fallback relay, save storage):** Workers Paid has a $5/month minimum.
  - Requests: 1 million included, then $0.15 per million.
  - Duration: 400,000 GB-s included, then $12.50 per million GB-s, metered at 128 MB per object.
  - Incoming WebSocket messages are billed **20:1**. Outgoing messages are **free**.
  - Hibernating WebSockets cost no duration while idle.
  - SQLite storage: 5 GB-month included.
  - Free plan: 100,000 requests/day, enough for development.
  - Cloudflare's own example: 100 always-active objects receiving one message per second each cost $419/month. Constant 60 Hz traffic through a Durable Object costs real money. Using a Durable Object only for signalling is nearly free.

### 2.2 Other TURN providers

| Provider | Price |
|---|---|
| Twilio Network Traversal | $0.40/GB (US, EU); $0.60 (Singapore, Mumbai, Tokyo); $0.80 (Sydney, São Paulo). STUN free. |
| Metered.ca | Free 500 MB; $99/mo for 150 GB (+$0.40/GB); $199 for 500 GB (+$0.20); $499 for 2 TB (+$0.10); 50 TB tier at $0.04/GB overage. |
| Xirsys | **[unverified, third-party listing]** $39/mo for 50 GB (+$0.50); $99 for 150 GB; $199 for 500 GB. Free 500 MB. |
| Self-hosted coturn | VPS cost only. On Hetzner EU, roughly €5–40/month per box with **20 TB included traffic in EU locations** and about €1/TB overage. US and Singapore allowances are much smaller (around 1 TB in the US and 0.5 TB in Singapore, possibly scaled by plan in 2026), and Singapore overage is about €7.40/TB **[allowance figures unverified; Hetzner's 2026 page shows plans "from €5.49/€5.99" without traffic detail]**. You run the operations, abuse protection and credentials yourself. |

Cloudflare is cheaper than every managed alternative and needs no servers. **Use Cloudflare TURN.** Keep coturn as the self-hosted fallback if lock-in becomes a concern; coturn speaks the same TURN REST credential format.

### 2.3 Game backends and frameworks

- **PeerJS server:** a free, open-source signalling server for PeerJS clients. Fine, but a small Durable Object does the same job without a server to run.
- **Colyseus:** open-source Node room server, with the authority on the server. The licence is shown as open source on the site; I believe it is MIT **[licence not re-checked]**. Colyseus Cloud starts at **$15/month**, with no CCU limits and "unlimited bandwidth." Tier specs are not public on the page.
  - It fits a later dedicated-server phase well, since it is TypeScript and Node and our sim is TypeScript.
  - Its built-in state sync is schema-delta based and would duplicate our deterministic-input model.
- **Nakama (Heroic Labs):** open-source game backend (I believe Apache-2.0 **[licence not re-checked]**), self-hostable with Docker.
  - It provides accounts, friends, parties, matchmaking and a socket relay.
  - Heroic Cloud prices depend on CPU size and are not listed. There are no CCU limits, and support packages run $2,000+.
  - Heavier than FTLite needs for friends-only v1.
- **Photon (Exit Games):**
  - Free plan: 20 CCU, for development only.
  - 100 CCU: **$95 one-time for 12 months**.
  - 500 CCU: $95/month. 1,000 CCU: $185/month. 2,000 CCU: $370/month.
  - Premium: $0.29/CCU, minimum $580/month.
  - Traffic: about 3 GB per CCU included, then $0.05–0.10/GB.
  - A JavaScript SDK exists, but I did not confirm current JS support on the pricing page **[unverified]**.
  - Photon Realtime is a room relay (it carries messages, it does not run game logic), so it would work for input relay. It is proprietary, with CCU caps, which means lock-in.

### 2.4 Dedicated or containerised server hosts

- **Hathora: shut down.** Hathora announced on 2026-03-04, after Fireworks AI acquired it, that it was ending game hosting. **Full shutdown came on 2026-05-05.** Stormgate lost its online modes as a result. Unity also ended direct support for Multiplay hosting on 2026-03-31 (secondary sources). **Lesson: do not let gameplay depend on a single small hosting vendor's proprietary SDK.** Keep the server a plain Node process in a container.
- **Edgegap:**
  - Edge Cloud: **$0.00115 per vCPU-minute** (about $0.069 per vCPU-hour), 0.25–4 vCPU per deployment, egress **$0.10/GB**, 24-hour container cap.
  - Private Fleet: $0.0261 per vCPU-hour, or $280–350 per host per month, with 6 TB included.
  - Relays: 100 CCU for $8, 500 for $115, 1,000 for $225, 2,000 for $450. Overage is $0.14 per peak CCU plus $0.10/GB.
  - Free trial available. Edgegap publishes a Hathora migration guide.
- **Rivet:** open source (Apache-2.0), self-hostable. It appears to have shifted toward stateful "actors" and serverless workloads. Managed pricing could not be verified on an official page **[unverified]**.
- **AWS GameLift Servers (US East, Ohio):**
  - c6a.large costs $0.099/hour on-demand or about $0.03/hour Spot.
  - The page states "network bandwidth is free for all instance types generation 6 and later."
  - Container fleets are supported. There is a free tier, but its terms were not shown.
- **PlayFab Multiplayer Servers:** billed per core-hour, with 750 free Dasv4 core-hours per month for evaluation. I could not read current per-core rates from the official price sheet **[unverified]**.
- **Plain VPS (Hetzner, OVH and similar):** the cheapest option at our bandwidth needs, as long as you run the operations yourself.

### 2.5 Platform lobbies

- **Steam lobbies:** free with Steamworks (one-time $100 app fee). Exposed by both steamworks.js and steamworks-ffi-node, and gives friends invites through the Steam overlay. Desktop only.
- **EOS lobbies:** free, cross-store. Desktop only, with no Node binding.
- In the cross-play v1, neither can be the source of truth for rooms. **The Cloudflare join-code room is the source of truth.** A Steam or EOS lobby can later act only as an invite channel that carries the join code.

---

## 3. Cost worksheet

### Assumptions

- **Concurrency:** "N concurrent sessions" means N sessions running on average around the clock. A month is 730 hours, or 2.63 million seconds. That makes these numbers an upper bound: real games peak in the evening, so average concurrency is much lower than peak. For scale, 10,000 concurrent sessions is about 30,000 CCU, which would put FTLite among the top Steam games.
- **Session shape:** 3 players on average, in a star topology with the host as hub, so 2 peer links per session.
- **Model (a), input relay:** each player sends about 1 KB/s, including redundancy and headers. The host forwards everyone else's inputs, so each non-host player receives about 2 KB/s. One relayed link carries about 3 KB/s of TURN egress, counting both directions, because Cloudflare bills egress to both clients.
- **Model (b), snapshots:** host upload is 120 KB/s (2 KB at 20 Hz to 3 peers, as specified, about 40 KB/s per peer). One relayed link carries about 41 KB/s of egress (40 to the peer, 1 back to the host).
- **TURN fraction:** 20% of links. Expected relayed egress per session is 2 × 0.2 × link rate.
- **Exclusions:** signalling cost is negligible and left out. Totals are rounded and exclude tax.

### Per-session monthly traffic

| Path | (a) Inputs | (b) Snapshots |
|---|---|---|
| P2P with 20% TURN: expected TURN egress | 1.2 KB/s, about **3.2 GB** | 16.4 KB/s, about **43 GB** |
| Everything through a relay server: server egress | about 6 KB/s, about **16 GB** | about 121 KB/s, about **318 GB** |

### Monthly cost by architecture

| Architecture | 100 sessions | 1,000 sessions | 10,000 sessions |
|---|---|---|---|
| **(a) P2P + Cloudflare TURN** ($0.05/GB after 1 TB free) | 315 GB, **$0** | 3.2 TB, **~$110** | 32 TB, **~$1,550** |
| (a) P2P + Twilio TURN ($0.40/GB) | ~$130 | ~$1,300 | ~$12,600 |
| (a) P2P + self-hosted coturn (Hetzner EU) | 1 box, **~$10** | 1–2 boxes, **~$20** | 3–4 boxes, **~$60–100** |
| **(a) WSS relay on VPS** (Node, about 300 sessions per 4-vCPU box **[my estimate, needs load testing]**, EU traffic inside the 20 TB allowance) | 1 box, **~$15–30** | 4 boxes, **~$80–150** | ~35 boxes, **~$700–1,300** |
| (a) WSS relay on Durable Objects (180 msgs/s in, always active: about $3.55 requests + $4.11 duration per session) | ~$770 | ~$7,700 | ~$77,000 |
| **(b) P2P + Cloudflare TURN** | 4.3 TB, **~$165** | 43 TB, **~$2,100** | 431 TB, **~$21,500** |
| (b) P2P + Twilio TURN | ~$1,700 | ~$17,000 | ~$172,000 |
| (b) Relay on Hetzner EU (bandwidth-bound; roughly 1 Gbit/s per 1,000 sessions) | ~$50 | ~$350 | ~$3,500 |
| (b) Relay on hyperscaler egress (~$0.09/GB) | ~$2,900 | ~$29,000 | ~$290,000 |
| **(b) Dedicated server per session, Edgegap** (0.25 vCPU at $12.60/mo + 318 GB at $0.10/GB, about $44 per session) | ~$4,400 | ~$44,000 | ~$440,000 |
| (b) Dedicated sessions packed on GameLift c6a.large (about 40 sessions per instance **[my estimate]**, $72/month, bandwidth stated free) | ~$180 | ~$1,800 | ~$18,000 |
| (b) Dedicated sessions packed on a Hetzner VPS (about 20 sessions per vCPU **[estimate]**, bandwidth as in the relay row) | ~$60 | ~$450 | ~$4,500 |

### What the worksheet shows

1. **Input relay plus P2P plus Cloudflare TURN costs almost nothing.** It is $0 at friend-group scale and about $110 a month at 1,000 always-on sessions.
2. **Snapshots cost about 13 times more bandwidth** (an estimate; see the per-session traffic table). Snapshots that travel P2P mostly cost the host's home upload, and 120 KB/s, about 1 Mbit/s, is fine on most broadband. Snapshots that travel through any metered relay or cloud become the main cost.
3. **Managed per-session dedicated servers are by far the most expensive option.** Only consider them for a later competitive or public mode, and pack many sessions per process.
4. **Durable Objects are excellent for signalling and poor for 60 Hz relay at scale**, because of the incoming-message and duration billing. Use them as a last-resort relay only, with input batching at 20–30 Hz. At 30 Hz the request cost roughly halves.

---

## 4. Electron and browser specifics

### 4.1 Where the authority runs: Electron

- Run the host simulation in a **`utilityProcess`**. It is a Node child process launched through Chromium's services, talking to the main process over `MessagePortMain`, with its own pid and lifecycle.
- It is not tied to any window, so a renderer stall, a minimised window or a focus change does not stop it. Node timers there are not subject to the browser's background throttling.
- Pass a `MessagePort` to the renderer so the UI talks to the sim directly. Electron supports transferring ports between processes.
- **Caveat: a utilityProcess has no `RTCPeerConnection`.** v1 has two choices:
  - **(i)** The renderer owns the WebRTC connection and forwards frames to the utilityProcess over a MessagePort. This is simplest. Its weakness is that a renderer hang also stalls the network I/O.
  - **(ii)** `node-datachannel` in the utilityProcess owns the connection. This is the most robust and still interoperates with browser peers, but it is a native addon to package.
  - **Recommendation:** start with (i) and move to (ii) when Electron hosting gets hardened.

### 4.2 Background throttling: Electron

- Set **`webPreferences.backgroundThrottling: false`** on the game window. Electron's documentation says it controls "whether to throttle animations and timers when the page becomes background" and that it also affects the Page Visibility API. It defaults to true.
- Optionally hold `powerSaveBlocker.start('prevent-app-suspension')` while hosting, so the OS does not suspend the app. This is the standard Electron API **[not re-verified this session]**.
- Do not drive the simulation from `requestAnimationFrame`. rAF stops in hidden or minimised windows whatever the throttling setting.

### 4.3 What a browser host means

- **A browser tab can be the authority.** WebRTC lets it accept peers with no listening socket: it runs as the "answerer" through signalling. **There are no listening sockets in a browser**, so it is WebRTC or a relay, nothing else.
- **Throttling is the main risk.** Chrome's rules (Chrome 88 timer-throttling post):
  - A **hidden** page (another tab active, or the window minimised) gets **standard throttling**: timers wake **once per second**.
  - After 5 minutes hidden, chained timers drop to **once per minute** (*intensive throttling*). **That does not happen while an `RTCPeerConnection` has an open data channel**, so a hosting tab avoids the 1-minute case but is still held to 1-second timer wakes.
  - Pages that played audible sound within 30 seconds get only minimal throttling. A silent track does not count.
  - In 2018 Chrome announced throttling for **dedicated workers** in background tabs too. Current worker behaviour is not documented clearly **[unverified; test it]**.
- **Mitigations:**
  - Step the sim from **timestamps (catch-up)**, not timer counts.
  - Also step on data-channel `message` events. Network events still arrive while the page is hidden; how fast they are delivered there should be tested **[unverified]**.
  - Run the sim in a Worker.
  - Show a clear "You are hosting — keep this tab visible" banner, and on `visibilitychange` warn peers or auto-pause.
  - **Recommend Electron as the preferred host.** Allow a browser host, but label it "best effort."
  - Firefox and Safari have their own throttling policies **[not researched in detail]**.

### 4.4 Saves and "another player with the save"

- The host broadcasts a **save checkpoint** over the reliable channel to every seat at each safe point (sector jump, end of a fight, pause). The payload is about 5–10 KB, compressed.
- Each checkpoint carries a run id, a checkpoint sequence number, the seat map (seat → player token), the sim version, and a content hash.
- Every client stores the latest checkpoint locally: IndexedDB in the browser, the userData folder in Electron. Anyone holding it can re-host the run. On rejoin, the room compares sequence and hash, and the newest checkpoint wins. If saves disagree, the clients show it.
- **Optional:** also put the checkpoint in the room's Durable Object SQLite storage, keyed by run id and encrypted with a key held only by the seat holders. A player who lost their local copy can then still re-host. At 10 KB per run this is effectively free inside the 5 GB included.
- **Seat rejoin:** each install generates a random player token (later, a keypair) stored locally. Seats are bound to tokens in the save, and a rejoining client proves its token. The token is secret, so treat it like a password.

### 4.5 Packaging native addons (later Steam, EOS, node-datachannel)

- In electron-builder, put `*.node` files, koffi, and the Steam or EOS redistributables in `asarUnpack`. steamworks-ffi-node warns that "ASAR packaging will break the library."
- N-API or FFI addons avoid rebuilding for each Electron ABI. Otherwise use `@electron/rebuild`.
- Ship per-OS binaries, and for macOS universal builds fetch universal koffi.

### 4.6 Signing, firewalls and other platforms

- **Windows signing:** Azure **Artifact Signing** (formerly Trusted Signing). Basic is about **$9.99/month for 5,000 signatures**, and Electron's docs reportedly call it the cheapest Windows option. The official page renders the price as a placeholder **[price via DevClass, January 2026]**.
  - Unsigned builds trigger SmartScreen warnings.
  - Code-signing certificates now need hardware or HSM key storage (an industry rule since 2023) **[from knowledge]**.
- **macOS later:** Apple Developer Program at $99/year, plus Developer ID signing, notarisation and hardened runtime **[from knowledge]**. Also note:
  - App Nap can suspend background apps (`powerSaveBlocker` helps).
  - The local-network permission prompt applies to LAN discovery.
- **Linux:** AppImage or deb. Steam Runtime issues only matter for a Steam build.
- **Firewall prompts:** Windows Defender Firewall prompts the first time an app *listens* for inbound connections (Node `dgram.bind`, a WebSocket server). Outbound WebRTC through ICE usually does not prompt, but some setups do **[from knowledge, unverified]**.
  - Avoid listening sockets in v1. Then there is nothing to prompt about.
  - Antivirus false positives are more common on unsigned Electron apps. Signing helps.

---

## 5. Security basics for friends-only co-op

- **Encryption:** WebRTC data channels are always DTLS-encrypted, and WSS and WebTransport use TLS. Add nothing extra in v1. If you want to defeat a compromised signalling server, verify the DTLS fingerprint out of band, for example by hashing it into the join flow.
- **Join codes:**
  - Use 6–8 characters from an unambiguous alphabet (about 30^7, roughly 2×10^10 combinations).
  - Make them short-lived (they expire when the room closes or after N hours) and single-room.
  - Rate-limit lookups per IP in the Worker, and let the host approve each joiner (a "Player X wants to join" prompt).
  - Seat tokens give rejoin rights; the join code alone does not.
  - No accounts are needed in v1. Steam or EOS identity can be layered on later as an extra proof.
- **Hiding IP addresses:**
  - Plain P2P reveals each peer's IP to the others. Among friends that is usually fine, but offer a **"relay only" privacy toggle**: `iceTransportPolicy: 'relay'` forces Cloudflare TURN and hides IPs from peers, at TURN cost.
  - Streamers will want it. Use relay-only by default if public lobbies ever arrive.
  - In a star topology, non-host peers only ever see the host's address.
- **TURN credential abuse:** mint short-lived credentials (the API allows up to 48 hours; use about 2 hours plus refresh) only for valid room members. That stops people using your TURN as a free proxy and running up the bill.
- **Untrusted input:**
  - The host validates every input frame: seat ownership, rate, size, and plausibility.
  - In the deterministic input model, each client checks state hashes, so cheating is limited to your own seat and shows up as desync.
  - Cap message sizes and rates in the Durable Object as well.
- **Public lobbies (future):** these bring griefing, slur names and DDoS on exposed hosts. Before they exist, add relay-only by default, kick and ban by token, reporting, and identity from Steam, EOS or an OAuth account.

---

## 6. Recommendation

### v1 stack (cross-play browser + Electron, friends only, Steam undecided)

1. **Gameplay transport:** **WebRTC data channels in a star topology**, with the host as hub. Each link has two channels:
   - an **unreliable, unordered** channel (`ordered:false, maxRetransmits:0`) for input frames and, if used later, snapshots;
   - a **reliable, ordered** channel for control messages, chat, votes and save checkpoints.

   Prefer the **input-relay (deterministic lockstep with prediction) model**. Its bandwidth is tiny, which keeps TURN cost near zero and makes a browser host feasible.
2. **NAT traversal:** Cloudflare STUN (free) plus **Cloudflare Realtime TURN** ($0.05/GB after 1 TB free), with short-lived credentials minted by the Worker.
3. **Signalling, join codes, rooms, seat reservations and save mirror:** a **Cloudflare Worker plus one Durable Object per room**, using hibernating WebSockets. Expected cost is $5/month (the Workers Paid minimum) up to a few hundred sessions.
4. **Last-resort fallback:** the same Durable Object relays frames over WSS for the rare peer where WebRTC fails even with TURN (UDP blocked, strict proxies). Batch inputs at 20–30 Hz there. If fallback use grows, move this relay to a cheap VPS running the same Node code.
5. **Host:**
   - Electron: sim in a `utilityProcess`, `backgroundThrottling:false`, WebRTC in the renderer at first (node-datachannel later).
   - Browser: sim in a Worker, timestamp catch-up, and a "keep visible" warning.
6. **Avoid for now:** Photon (proprietary, CCU-capped), Nakama and Colyseus (bigger than needed), managed per-session servers (expensive, and Hathora shows the vendor risk), raw UDP (no browser), Steam or EOS sockets (no browser).

### Abstraction boundary

The game talks only to an interface like this. Providers plug in underneath.

```ts
type ChannelKind = 'reliable-ordered' | 'unreliable-latest';  // add 'reliable-unordered' if ever needed
interface TransportCaps { unreliable: boolean; maxDatagram: number; hidesPeerIp: boolean; p2p: boolean; }

interface Link {                       // one connection to one remote seat (or to the server)
  readonly peer: PeerId;
  readonly caps: TransportCaps;
  send(kind: ChannelKind, bytes: Uint8Array): void;   // never throws; drops on 'unreliable-latest' if congested
  onMessage(cb: (kind: ChannelKind, bytes: Uint8Array) => void): void;
  stats(): { rttMs: number; lossPct: number; relayed: boolean; bufferedBytes: number };
  close(reason: string): void;
}

interface Session {                    // provider: webrtc+cf, wss-relay, steam, eos, dedicated
  host(opts: HostOpts): Promise<{ joinCode: string }>;
  join(code: string, seatToken?: string): Promise<void>;
  onLink(cb: (l: Link) => void): void; onLinkLost(cb: (p: PeerId) => void): void;
}
```

- `unreliable-latest` means unreliable, with only the newest message mattering. It maps onto a WebRTC unordered channel with `maxRetransmits:0`, Steam `k_nSteamNetworkingSend_Unreliable(NoNagle)`, EOS unreliable packets, and WebTransport datagrams. Where no unreliable path exists (WSS), the provider sends reliably and drops stale frames by sequence number.
- **Kept outside the transport:** framing (sequence numbers, acks, input redundancy, MTU of about 1,100 bytes to stay under typical data-channel and SDR limits), clocks and tick sync, hashing and desync detection, seat and auth tokens, saves.
- **Identity and invites are separate from transport.** An `InviteProvider` (join code now; Steam overlay or EOS later) produces a join code that any `Session` provider accepts.
- **Topology** (star now, host-authoritative) lives above `Link`. A dedicated server is just a host whose `Link`s come from a server-side provider (WSS, then WebTransport, then WebRTC via node-datachannel).

### Integration order

1. **Loopback provider** (in-process, with simulated latency and loss) for tests and for the lockstep and rollback work.
2. **WebRTC + Cloudflare** (Durable Object signalling, STUN, TURN) for both builds. Includes join codes, seat tokens and save checkpoints.
3. **WSS relay fallback** through the same Durable Object, plus a "relay only" privacy toggle.
4. **Hardening:** Electron host on node-datachannel inside the utilityProcess; browser-host throttling tests; telemetry on relayed share, RTT and loss so the 20% TURN assumption gets replaced with real data.
5. **If Steam launches:** steamworks-ffi-node for **lobbies and overlay invites** (carrying the join code) first. Optionally add Steam Networking Sockets as a desktop-only `Session` provider. Since browser players can't use SDR, mixed groups keep using WebRTC.
6. **If cross-store desktop identity is wanted:** EOS Connect and lobbies via koffi. EOS P2P only if there is a clear need.
7. **Dedicated or public servers later:** the same TypeScript sim in plain Node, in a container on a VPS or GameLift-class fleet. WSS first, then WebTransport (Node bindings) or server-side WebRTC. No vendor SDK in the sim loop.

---

## Sources

- Cloudflare Realtime TURN FAQ and pricing: https://developers.cloudflare.com/realtime/turn/faq/ , https://developers.cloudflare.com/realtime/pricing/
- Cloudflare Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Twilio Network Traversal pricing: https://www.twilio.com/en-us/stun-turn/pricing
- Metered TURN pricing: https://www.metered.ca/stun-turn
- Xirsys (third-party listing): https://freetier.co/directory/products/xirsys
- Photon Realtime pricing: https://www.photonengine.com/realtime/pricing
- Colyseus pricing / cloud: https://colyseus.io/pricing/ , https://colyseus.io/cloud-managed-hosting/
- Heroic Labs pricing: https://heroiclabs.com/pricing/
- Edgegap pricing: https://edgegap.com/pricing ; Hathora migration: https://docs.edgegap.com/docs/tools-and-integrations/switch-from-hathora
- Hathora shutdown coverage: https://www.techspot.com/news/111969-stormgate-servers-go-dark-following-ai-focused-hosting.html , https://crux.supercraft.host/blog/hathora-shut-down-where-to-go-after-may-2026/ , https://gameye.com/blog/game-server-shake-up-2026/
- Rivet: https://github.com/rivet-gg/rivet
- AWS GameLift Servers pricing: https://aws.amazon.com/gamelift/servers/pricing/
- PlayFab billing: https://learn.microsoft.com/en-ca/xbox/playfab/multiplayer/servers/billing-for-thunderhead , https://developer.microsoft.com/en-us/games/products/playfab/pricing/
- Hetzner Cloud: https://www.hetzner.com/cloud/ , https://docs.hetzner.com/cloud/billing/faq/ , https://egresscost.com/hetzner
- Steam Datagram Relay: https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay ; ISteamNetworkingSockets: https://partner.steamgames.com/doc/api/ISteamNetworkingSockets ; ISteamNetworkingMessages: https://partner.steamgames.com/doc/api/ISteamNetworkingMessages
- steamworks.js: https://github.com/ceifa/steamworks.js (client.d.ts: https://raw.githubusercontent.com/ceifa/steamworks.js/main/client.d.ts)
- steamworks-ffi-node: https://raw.githubusercontent.com/ArtyProf/steamworks-ffi-node/main/README.md
- greenworks: https://github.com/greenheartgames/greenworks
- GameNetworkingSockets: https://github.com/ValveSoftware/GameNetworkingSockets
- EOS free / P2P relay: https://www.engadget.com/epic-online-services-free-voice-easy-anti-cheat-130055322.html , https://edgegap.com/blog/can-epic-online-services-eos-relays-allow-for-dedicated-server-or-authoritative-server , https://npmjs.com/package/%40skeldjs%2Feos
- node-datachannel: https://npmjs.com/package/node-datachannel , libp2p PR: https://github.com/libp2p/js-libp2p/pull/1905
- WebTransport support: https://caniuse.com/webtransport ; Node bindings: https://github.com/darrachequesne/webtransport , https://www.pkgstats.com/pkg:@moq/web-transport ; Electron 44.7: https://tech-insider.org/electron-44-7-0-chromium-152-node-24-2026/
- TURN usage data: https://webrtchacks.com/usage-stats/ , https://www.nojitter.com/know-where-turn-when-deploying-webrtc , https://medium.com/@fippo/what-kind-of-turn-server-is-being-used-d67dbfc2ff5d
- NAT traversal study (DCUtR, IMC '26): https://arxiv.org/abs/2510.27500 , https://probelab.io/publications/large-scale-measurement-of-nat-traversal-for-the-decentralized-web-a-case-study-of-dcutr-in-ipfs/
- Electron utilityProcess: https://www.electronjs.org/docs/latest/api/utility-process ; webPreferences.backgroundThrottling: https://www.electronjs.org/docs/latest/api/structures/web-preferences
- Chrome timer throttling: https://developer.chrome.com/blog/timer-throttling-in-chrome-88 , https://developer.chrome.com/blog/background_tabs ; worker throttling intent: https://groups.google.com/a/chromium.org/d/topic/blink-dev/8xpEA-iNHwg
- Azure Artifact Signing: https://azure.microsoft.com/pricing/details/artifact-signing/ , https://www.devclass.com/security/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/4079554
