# Netcode architecture and deterministic-simulation/replay testing for FTLite (TypeScript, bitECS 0.4, 1-4 player couch co-op, later networkable)

Method note: ~19 searches/fetches. Items marked [UNVERIFIED] came from snippets or secondary sources. Not covered by direct reading: Gambetta Part II/III content, GGPO repo itself, Overwatch talk (members-only), AoE paper full text, Colyseus/Geckos/Nakama/PartyKit/boardgame.io/Photon Quantum (only Colyseus Schema and Trystero touched).

## 1. Which architecture suits a co-op, low-action-density, 4-player TS/Electron game?

### Takeaway
Build a pure fixed-step sim `step(state, inputsPerPlayer) -> state` with serializable state. For later networking, the lowest-risk path is host-authoritative with periodic snapshots and a lockstep-style input stream (clients send intents, host steps, sends snapshots or checksums). Full rollback is feasible but needs cheap whole-state save/load every tick, and is probably over-investment for slow co-op play.

### Cited Findings
- Authoritative server: the server alone owns game state, clients send inputs and render results; this stops cheating but adds perceived latency, which prediction/reconciliation then hides (Gambetta Part I; Parts II and III named but not read here: client-side-prediction-server-reconciliation.html, entity-interpolation.html, lag-compensation.html) — [Gambetta](https://www.gabrielgambetta.com/client-server-game-architecture.html)
- Deterministic lockstep sends only inputs (example: 6 booleans, ~6 bits/frame), so bandwidth is independent of object count; redundant unacked inputs in each UDP packet avoid retransmission waits; requires a playout delay buffer (100 ms in example) and stalls when input is missing; good fit when determinism is guaranteed, inputs small, state large — [Gaffer: Deterministic Lockstep](https://gafferongames.com/post/deterministic_lockstep/)
- Snapshot sync: delta-compress each snapshot against the last acknowledged baseline, quantize values (position at ~2 mm steps, smallest-three quaternions), per-object "unchanged" bit was the biggest single win; baseline sits roughly one RTT in the past — [Gaffer: Snapshot Compression](https://gafferongames.com/post/snapshot_compression/)
- AoE used lockstep at 15 sim frames/s, targeting 8 players over 28.8k modems; the paper reports getting identical code to produce identical results across machines was hard; lockstep makes late-join of a running game practically impossible and patching harder (secondary discussion, full paper not read) — [Game Developer: 1500 Archers](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond) [UNVERIFIED details via snippets]
- Rollback (GGPO) needs: whole-state save, load, and advance-frame callbacks; deterministic same-input-same-output; optional checksum per saved state used to detect mispredictions/desync. GGRS (Rust port) saves state every frame by default — [GGRS docs via search](https://docs.rs/ggrs/latest/ggrs/) (search result; GGPO original by Tony Cannon, 2009, Game Developer Magazine article not retrieved)
- Overwatch: ECS-based, server-authoritative, leverages determinism for responsiveness; per a secondary write-up only 3 of ~46 client systems (movement, weapon, state script) carry gameplay netcode [UNVERIFIED] — [GDC Vault](https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and), [Edgegap summary](https://edgegap.com/blog/game-backend-deep-dive-overwatch-2016-netcode-architecture-rollback)
- Factorio: lockstep; per-tick heuristic CRC compared across players, desynced client is reconnected and re-downloads the map; clicks wait for round-trip, so they added a "latency state" duplicating the relevant state to hide latency — [FFF-55](https://factorio.com/blog/post/fff-55), [FFF-83](https://factorio.com/blog/post/fff-83), [FFF-76](https://www.factorio.com/blog/post/fff-76)

### Inferences
- FTLite's low action density, 1-4 players and slow ship-management pace tolerate 100-200 ms input delay, so lockstep or host-authoritative with input delay is adequate; client-side prediction/rollback is a later luxury, not a day-one need.
- Host-authoritative snapshot sync is more forgiving than pure lockstep: a float drift between host and client machines is corrected at next snapshot rather than being a fatal desync, and late-join/reconnect comes free.
- Rollback cost scales with state size; bitECS typed arrays can be copied with `.slice()`/`set()` cheaply for a few thousand entities, but this is untested for FTLite.

### Gaps
- Did not read Gambetta Parts II/III, Fiedler's "State Synchronization"/"Snapshot Interpolation" posts, Valve Source networking docs, or Rocket League GDC talk.
- No data on whether 100-200 ms delay is acceptable for FTLite specifically (design question).

## 2. Existing TS/JS libraries and frameworks

### Takeaway
netplayjs is the closest conceptual match (fixed-timestep, rollback or lockstep, JSON-serializable state) but is a framework with its own game loop and uncertain maintenance; Colyseus fits a host-authoritative snapshot model but imposes its schema/room model. For a custom bitECS sim, writing a thin transport-agnostic layer is likely better than adopting a framework.

### Cited Findings
- netplayjs: provides `RollbackWrapper`, `LockstepWrapper`, `LocalWrapper`; autoserializer or manual `serialize()/deserialize()` to JSON-compatible values; deterministic flag skips host state corrections; integer math assumed deterministic, WASM float deterministic except NaN bit patterns, JS float behavior "uncertain"; fixed timestep and fixed canvas size; not a fit for engines with their own entity state (workaround: hidden netplayjs game holds logic); repo page shows 251 commits, 18 open issues, 576 stars, README lists some packages as WIP, no last-commit date visible — [netplayjs](https://github.com/rameshvarun/netplayjs)
- Colyseus Schema: delta-encoded (only changed properties sent; reassigning same value sends nothing); max ~64 fields per Schema class; encoder/decoder schema must match, field order matters; NaN/null numbers encode as 0; arrays/maps need homogeneous item types; any `@view()` switches server to per-client encoding; self-reported benchmark 9 bytes vs 26 for msgpack+fossil-delta for one x/y update — [Colyseus schema README](https://cdn.jsdelivr.net/npm/@colyseus/schema@4.0.28/README.md), [Optimizing State](https://docs.colyseus.io/state/optimization)
- Trystero: serverless WebRTC matchmaking (Nostr default strategy, also MQTT, Supabase, Firebase, IPFS); non-browser runtimes need `rtcPolyfill` (example werift); restrictive NATs may need a TURN server via `turnConfig` — [Trystero README](https://unpkg.com/trystero@0.21.6/README.md) [version mix noted; verify current README]
- Steam: Valve says legacy ISteamNetworking is deprecated, use ISteamNetworkingSockets/Messages; Steam relay (SDR) and auth are Steam-only features. In Electron, `steamworks-ffi-node` advertises Networking Sockets P2P (34 functions); I could not confirm whether `steamworks.js` exposes Networking Sockets/relay — [Steamworks docs](https://partner.steamgames.com/doc/api/ISteamNetworking), [GameNetworkingSockets fork](https://github.com/michicc/GameNetworkingSockets), [steamworks-ffi-node](https://www.steamgifts.com/discussion/u3wHw/steamworks-ffi-node-a-typescriptjavascript-wrapper-for-the-steamworks-sdk)

### Inferences
- Because FTLite already has bitECS typed arrays, Colyseus Schema would duplicate state; bitECS's own serializers (section 4) plus a raw WebRTC/WebSocket/Steam transport avoid that.
- Electron main process (Node) can host a ws server for LAN/host mode with no external dependency.

### Gaps
- Not researched: Geckos.io, boardgame.io, Nakama, PartyKit, Photon Quantum, backroll, "Rollback in JS". No verified maintenance dates for any library.
- steamworks.js networking support unverified.

## 3. Determinism in JS

### Takeaway
Arithmetic (+ - * /, sqrt) is IEEE-754 and reproducible; the dangers are transcendental Math functions, Math.random, sort comparators, iteration-order assumptions, and engine/CPU differences. Within a single Electron build (one V8) on one platform risk is low; cross-platform or cross-build is where it bites.

### Cited Findings
- Fiedler: floating point differs across compilers, OS, instruction sets, even debug/release; hidden randomness (e.g. solver order) breaks lockstep; results must be bit-exact — [Gaffer](https://gafferongames.com/post/deterministic_lockstep/)
- Rune's "making JS deterministic": Math functions have implementation-dependent precision; they patch ~25+ Math functions to round to single precision; replace Math.random with seeded mulberry32 (seed per named loop via xmur3-style hash; seed state tracked for rollback); patch Array.sort with a well-defined default comparator; restore globals in try/finally; ESLint plugin flags global/locale use. Does not cover Map/object iteration order or desync detection — [Rune](https://developers.rune.ai/blog/making-js-deterministic-for-fun-and-glory/)
- Mozilla used fdlibm earlier then moved to platform libm (faster, but platform-varying); Bug 531915 on platform differences — [Mozilla bug](https://bugzilla.mozilla.org/show_bug.cgi?id=531915) [via search snippet, UNVERIFIED details]
- Rapier: transcendental functions not cross-platform deterministic; its WASM build is cross-platform deterministic — [Rapier determinism](https://rapier.rs/docs/user_guides/javascript/determinism)
- netplayjs README: integer math deterministic, WASM float deterministic except NaN patterns — [netplayjs](https://github.com/rameshvarun/netplayjs)

### Inferences (from general knowledge, not sourced here)
- PRNG: mulberry32 (32-bit, tiny state, one uint32 to snapshot) is sufficient for FTLite; sfc32 (4x uint32) if longer period wanted; use `Math.imul` and `>>>0`. Use named sub-streams (combat, loot, events) so adding a draw in one system does not shift others. State must be in the snapshot.
- Avoid Math.sin/cos/atan2/pow in sim; use lookup tables or a small shared implementation; if top-down movement only needs vectors, store direction as integer facing/quantized angle. Math.fround on stored Float32Array values is automatic when writing to f32 arrays.
- Consider integer/fixed-point for positions (e.g. 1/256 tile units in Int32Array) if lockstep/cross-platform is ever required; for host-authoritative snapshots float32 is fine.
- Query order: bitECS queries return entity IDs in dense-array order that changes with add/remove (swap-remove); sort IDs (or iterate by stable index) when order affects results (RNG draws, damage resolution). [UNVERIFIED for 0.4 specifically; check docs].
- Never use wall-clock, `performance.now`, `Date`, unordered object-key iteration with numeric/string mix, or locale functions inside the sim.

### Gaps
- No empirical cross-engine Math test data found; no source on bitECS 0.4 query ordering guarantees.

## 4. Snapshot serialization of bitECS typed arrays, delta, versioning

### Takeaway
bitECS 0.4 ships `bitecs/serialization` with SoA, AoS, Observer, and Snapshot serializers including diff mode and entity-id remapping, but no versioning support; add your own schema version header and test it against golden fixtures.

### Cited Findings
- Serializers: SoA (raw arrays, no bitECS dependency; options `diff`, `buffer` default 100 MB, `epsilon` default 0.0001 for float diff), AoS, Observer (tracks add/remove of entities/components for entities with a network tag; pair with SoA for data), Snapshot (`createSnapshotSerializer(world, components, buffer?)` full state for sync, save games, debugging); entity-id mapping via `Map` in deserializers; untyped arrays need `f32()`/`str()` tags; docs contain no versioning notes or entity-count limits — [bitECS 0.4.0 Serialization.md](https://cdn.jsdelivr.net/npm/bitecs@0.4.0/docs/Serialization.md), [0.4.0 release notes](https://cdn.jsdelivr.net/npm/bitecs@0.4.0/docs/RELEASE_NOTES_0.4.0.md)
- Delta against acked baseline + quantization + unchanged bits is the proven recipe — [Gaffer](https://gafferongames.com/post/snapshot_compression/)

### Inferences
- Epsilon-based diff in SoA serializer is itself a determinism hazard if used for hashing; for desync checks hash raw bytes of the typed arrays instead.
- Interest compression is largely moot for a single-ship, 1-4 player game; full snapshot at 5-10 Hz plus delta is plenty. Do not build interest management.
- Version: prefix each snapshot with {formatVersion, simVersion, tick, rngState}; keep a component-list manifest so a loader can reject mismatches.

### Gaps
- Did not verify bitECS 0.4 typed-array layout details (store vs. per-entity), the observer's wire format, or that `epsilon` diff is lossless enough for reconciliation.

## 5. Replay/regression testing harnesses

### Takeaway
Record {seed, initial config, sim version, per-tick intents} and assert a per-tick (or every-N-ticks) state hash; this is how Doom demos, Factorio, and GGPO-style desync detection work, and it maps directly onto vitest and fast-check.

### Cited Findings
- Doom demos (LMP) store only per-tic input; playback relies on determinism; need matching engine/IWAD version; cheat codes not recorded and cause desync; headless fast-run + CI regression after each PR is used by source-port developers — [Doom Wiki: Demo](https://doomwiki.org/wiki/Demo), [Headless Doom](https://olafurw.github.io/2022-12-04-headless-doom/)
- Factorio: cheap per-tick CRC across peers, desync triggers resync and desync-report files (FFF-188) — [FFF-55](https://factorio.com/blog/post/fff-55), [FFF-188](https://factorio.com/blog/post/fff-188)
- GGPO/GGRS: optional checksum in save callback, compared between peers — [GGRS](https://docs.rs/ggrs/latest/ggrs/)
- fast-check model-based testing: `commands` arbitrary with `check`/`run`/`toString`, `modelRun`; failures print seed, path, replayPath for exact replay — [fast-check docs](https://fast-check.dev/docs/advanced/model-based-testing/)

### Inferences (design suggestions)
- Golden tests: replay file in repo -> run headless -> compare final hash plus a few mid-run hashes (every 60 ticks) so failures localize. Keep a "bless" script for intentional changes.
- Property tests: (a) same seed+intents run twice gives identical hash; (b) save at tick N, load, continue == uninterrupted run; (c) intent stream split across different render frame sizes (accumulator jitter) gives same result; (d) random intent fuzz never produces NaN/out-of-range; (e) snapshot round-trip identity.
- Your prior ghost harness (record/replay) already covers most of this; add hashing and sim-version in the header.
- Dwarf Fortress: no sourced info found.

### Gaps
- No found source for Dwarf Fortress or StarCraft replay mechanics; Factorio checksum details beyond FFF posts not verified.

## 6. Design rules to keep the sim network-ready (and what not to over-engineer)

### Takeaway
Network-readiness is mostly discipline: pure step function, inputs as data, all state in one serializable place, no hidden nondeterminism. Defer transport, prediction, and rollback.

### Cited/derived rules
- Sim input is only `Intent[]` per player per tick (small, quantized, serializable); inputs, not state, are what lockstep sends — [Gaffer](https://gafferongames.com/post/deterministic_lockstep/)
- All state lives in bitECS arrays + a small plain-data "singleton" blob (rng, tick, ship resources); render reads only, never writes — consistent with netplayjs' serialize/deserialize contract and GGPO's save/load/advance model.
- Fixed timestep with accumulator and clamp (your 60 Hz, 5-tick clamp): fine for local; networked, tick number becomes the shared clock and intents get a target tick (input delay).
- Local players are just "player slots" with intents; a remote player is another slot fed from a network queue. Same code path.
- Per-tick `hashState()` available from day one (cheap FNV/xxhash over typed-array bytes) and used in tests.
- Seeded RNG with named streams held in state; no Math.random/Date in sim; lint rule for it (Rune used an ESLint plugin).
- Stable IDs for entities that cross the wire (don't rely on raw bitECS eids being equal across peers; the serializers provide id maps).
- Keep visual-only randomness/effects out of the sim and on a separate non-deterministic RNG.
- Do NOT over-engineer: rollback/prediction, custom bitpacked protocol, interest management, NAT traversal/relay, cheat prevention, fixed-point everywhere, WASM sim. Add them only if playtests show need. [Opinion/inference]

### Recommendation tailored to FTLite
1. Now: pure `step()`; `Intent` per player slot; deferred-intent queue applied at tick boundary; mulberry32 named streams in state; `snapshot()/restore()` using bitECS Snapshot serializer or plain typed-array copies; `hash()`; replay file {version, seed, config, intents[]}; vitest golden replays + fast-check properties (save/load equivalence, accumulator-jitter invariance).
2. Later (online): host-authoritative. Clients send intents with target tick; host steps and broadcasts snapshots (full ~5 Hz, optional delta vs acked baseline) plus hash; clients render with interpolation, locally predict only their own cursor/UI feedback. Transport: WebSocket (LAN/Electron host) or Steam Networking Sockets / WebRTC (Trystero) behind a `Transport` interface.
3. Upgrade to lockstep (cheaper bandwidth, requires bit determinism) only if snapshot size becomes an issue; rollback only if input latency is a problem. Both reuse the same step/snapshot/hash.

### Gaps
- Unverified: whether FTLite's state size makes per-tick snapshots cheap; all recommendations here are inference from the cited sources, not measured.
