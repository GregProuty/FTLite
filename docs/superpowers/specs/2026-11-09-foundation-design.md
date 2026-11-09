# FTLite Foundation — Design

**Date:** 2026-11-09
**Status:** Draft v2 (research findings folded in), pending owner review
**Sub-project:** 1 of 5 (Foundation)
**Research basis:** `research/FTLite engineering prior art.md`. Items marked *(inference)* are proposals from that research that are not yet tested in FTLite; every number in this spec is a starting value in the tuning file, not a commitment.

## 1. Vision and decomposition

FTLite is a multiplayer, roguelike, science-fiction spaceship game inspired by *FTL: Faster Than Light*. Differences from FTL:

- **Multiplayer.** 1-4 players on one shared screen (couch co-op) first. Networked play later.
- **Each player is one crew member** with RPG stats. They walk room to room on a top-down ship map and operate stations (navigation, engineering, weapons, science, life support, medbay, doors) and repair damage. Crew also have a personal combat skill, used once boarders arrive.

The full vision is too large for one spec, so it is split into sub-projects, each with its own spec, plan and build:

1. **Foundation (this spec):** engine, sim loop, local input, ship map, crew with stats and skills, stations, onboard hazards.
2. Ship-to-ship combat.
3. Boarders and crew-vs-crew combat.
4. Run structure: sector map, jumps, events, shops, progression, permadeath.
5. Networked multiplayer.

### Design inspirations

Besides FTL, the tone and character design draw on ***Firefly* / *Serenity*** (the TV show and film) and its **tabletop RPG** (Cortex-based; the ship is treated almost as a character, and crew are defined by traits with both strengths and flaws). *This section is from general knowledge and has not been researched; verify specifics before relying on them.* How it applies:

- **Tone:** a scrappy, underfunded, patched-together ship and a mismatched crew, not a military fleet. Hazards feel like "the ship is falling apart around us" rather than "enemy fire". This informs art, writing and hazard flavour.
- **Characters defined by traits with a cost:** each crew member gets an Asset and a Complication (see §5, Crew), in the spirit of the RPG's trait system. *In scope for the Foundation.*
- **The ship as a character:** quirks, history and recurring faults specific to the ship. *Deferred to sub-project 4 (run structure).*
- **Shared "luck" resource (the RPG's Plot Points):** a limited pool the crew can spend to turn a bad outcome around. *Candidate for a later sub-project, not in the Foundation.*

Inspiration only: no Firefly/Serenity names, characters, ship names, logos, text or setting details are used (see §12).

## 2. Foundation goal

A **survival sandbox on one fixed ship**. 1-4 players each control one crew member. All seven stations work at a basic level and repair is fully playable. Hazards spawn on a seeded, escalating director. The score is survival time. The run ends when hull integrity reaches 0 or all crew are dead. There is no win state. The demo answers "is this fun with friends" and validates the crew/station/skill loop.

**Out of scope:** enemy ships, boarders, sector map and events, meta-progression, audio, real networking, AI crew (including a solo-play drone), multiple ships, procedural ship generation, rollback or client prediction.

## 3. Stack

TypeScript, Vite (via electron-vite), bitECS 0.4.0, PixiJS v8, Electron, vitest, plus zod (ship data validation), fast-check (property tests) and a small seeded PRNG (mulberry32, implemented in `shared/`). Same family as the owner's previous roguelike project. Internal render resolution defined in one shared constant. Windows desktop target. Library licences are checked before adoption (see §12).

## 4. Architecture

Approach: **authoritative simulation driven by per-player input intents.** Research found no open-source TypeScript FTL-like to copy; the one multiplayer FTL-style architecture found (a GPL co-op fork) uses the same shape: every player action is a command executed on a host, clients render streamed snapshots. Local couch play and later online play share one Intent path.

| Layer | Responsibility | Depends on |
|---|---|---|
| `src/sim/` | Pure fixed-step game simulation over bitECS typed arrays. `step(state, intents)`; exposes serializable world state. | `shared/` only |
| `src/input/` | `DeviceManager` and device polling; produces one `InputFrame` per `PlayerId`. The only code aware of devices. | `shared/` |
| `src/render/` | PixiJS view. Reads sim state; never mutates it. | `shared/`, read-only sim state |
| `src/app/` | Electron shell, menus, press-to-join lobby, and the loop wiring input, sim and render. | all layers |
| `src/shared/` | `Intent` and snapshot types, constants, seeded RNG, state hashing. | nothing |

### Networking-readiness and determinism rules (enforced from day one)

1. All gameplay changes go through intents; the renderer never calls into game logic.
2. **Seeded RNG with named streams** (hazards, director, combat, loot, cosmetic), each stream's state held in the sim state. No `Math.random`, `Date` or `performance.now` in `sim/`; enforced by a lint rule and a boundary test.
3. Avoid transcendental `Math` functions (`sin`, `cos`, `atan2`, `pow`) in `sim/` — results vary across JS engines. If one is needed, use a pinned implementation in `shared/`.
4. Wherever iteration order affects RNG draws or damage, iterate entities in sorted order *(inference: bitECS 0.4 query ordering is unverified)*.
5. Players are identified by `PlayerId`, never by gamepad index. Anything crossing a future wire uses stable ids, not raw bitECS entity ids (ids are recycled immediately by default).
6. Sim state is serializable. Every snapshot begins with a header `{formatVersion, simVersion, tick, rngStates}` plus a component manifest, because bitECS serialization has no versioning of its own.
7. `hashState(state)` hashes the **raw typed-array bytes** (not through bitECS's epsilon diff path), cheap enough to run every tick in tests and every N ticks otherwise.
8. Static ship layout is immutable and shipped as data; dynamic state lives in flat typed arrays so snapshots are cheap.

### Path to online play (sub-project 5, not built now)

Host-authoritative: clients send intents tagged with a target tick; the host steps the sim and broadcasts snapshots (order of 5 Hz, optionally delta-compressed against an acknowledged baseline) plus a hash for desync detection; clients interpolate. A thin `Transport` interface keeps the choice of WebSocket, WebRTC or Steam sockets open. This avoids bit-exact lockstep, which research found fragile in JavaScript. Rollback, prediction, interest management and NAT traversal are deferred until playtests demand them. Input latency tolerance of 100-200 ms is an *inference* about this game's slow pace, to be validated.

## 5. Game model

### Ship and data format

One fixed ship on a tile grid (rooms, walls, doors), loaded from a **single versioned JSON file per ship** (not Tiled at runtime; Tiled may be used for authoring and converted at build time). Starter ship, about 9 rooms: Bridge (Navigation, Doors), Weapons Bay, Engine Room (Engineering), Science Lab, Life Support (Oxygen), Medbay, Crew Quarters, Reactor, Corridor hub.

Format: `version`, `width`/`height`, `tiles[]`, `rooms[]` (id, volume, system, station slots), `edges[]` (room a, room b or `"space"`, kind, tile, width, defaultOpen), `stations[]`. Validated at load with zod `superRefine` checks: every room id referenced exists, each edge lies on the boundary of exactly its two rooms, the room graph is connected, ids are unique, and array lengths equal width × height. (FTL's own tooling tolerates unreferenced room ids and produces stray rooms; we reject them.)

Ship-wide state: **hull integrity**; **power pool** produced by the Reactor and drawn by stations (Engineering reallocates); per-room **oxygen**, **fire intensity**, **breach** flag; **doors** with a continuous openness value (0 to 1) that open on approach and can be sealed.

### Hazard simulation: rooms as graph nodes

Hazards are simulated on the **room graph**, not tile by tile. Tile-based gas solvers (as in Space Station 14) are overkill for 8-30 rooms; hull/gap graphs (as in Barotrauma) fit. Formulation *(the research's synthesis, not a copied algorithm)*:

- Per room: oxygen mass and volume. Per edge: conductance = door openness × width. Space is a fixed-zero node; a breach is an edge to space.
- Each hazard step computes all flows from a **start-of-step snapshot** and applies them symmetrically: `flow = k · conductance · (O2_a/V_a − O2_b/V_b) · dt`, clamped so `k · conductance · dt · (1/V_a + 1/V_b) ≤ 1` (no overshoot or ping-pong). Values below a small minimum snap to zero.
- Hazards tick at 10-15 Hz using an accumulator that carries over time, separate from the 60 Hz movement tick.
- **Fire:** grows when room oxygen is above a threshold and shrinks below it (with hysteresis against the suffocation threshold, to avoid flicker), consumes oxygen, is capped per room, and on a periodic roll each open edge touched by fire may ignite the neighbouring room. Spread rolls use the seeded hazards stream (never an unsynced RNG). Closed doors slow spread.
- Starting values (e.g. 10% oxygen threshold, 15% spread chance per 5 s, 16-fire cap) are tuning data, to be re-derived and playtested. They come from reading other games, not from tests of FTLite.

### Crew

- Each `PlayerId` controls one character with **free analog movement**, colliding with walls and closed doors on the tile map. Movement is resolved **per axis against solid tiles** (Celeste/TowerFall style), which gives wall sliding and deterministic results; analog input is normalized and clamped so diagonals are not faster. Doors are tiles whose solidity is a function of door state via a single `solid(tx, ty)` query. *(Per-axis details come from recalled sources; verify with tests.)*
- **Base stats:** Health, Speed.
- **Skills:** Navigation, Engineering, Weapons, Science, Combat, Repair. Each is a level with XP.
  - Navigation, Engineering, Weapons and Science are **station skills**, trained by operating the matching station. The Life Support and Doors consoles train and use **Engineering**; the Medbay trains and uses **Science**. No new skills are added.
  - **Repair** is trained by repairing hazards (fires, breaches, power failures) anywhere on the ship. It sets repair speed.
  - **Combat** is personal fighting skill (melee/sidearm damage and defence). It is defined on the character sheet now but has no source of XP or effect in the Foundation, because there are no enemies until boarders (sub-project 3).
- Each character has one **Asset** (a strength, e.g. faster repairs, a skill head start) and one **Complication** (a drawback, e.g. slower movement, takes extra damage from fire), so crew differ in character and not only in numbers. Concrete trait lists are tuning data.
- Characters take damage from fire and low oxygen. At 0 Health they go **down**; a teammate can **revive** them by channelling Interact. Design stance *(judgement, little sourced evidence)*: short downed time, with hold-to-revive speeding the recovery.

### Skill model (hybrid)

From FTL (levelled by use) and Barotrauma (continuous effect). Skills **grow when the character successfully operates the matching station or repairs a hazard**, and the **level continuously scales station speed/output or repair speed**. Proposed shapes *(inference; constants are original and live in one tuning file)*:

- **Output:** `lerp(slow, fast, (level + 100) / 200)` for levels 0-100, so an unskilled operator still runs at about half of maximum — friendly to new and solo players.
- **XP gain:** diminishing with level, e.g. `min(base / max(level, floor)^1.5, cap)` per second of successful operation, with the floor preventing absurd low-level gains. Tune so a 20-minute session moves a player a few levels.
- Perks and talent-style layers are deferred to sub-project 4.

### Stations

A console in a room. A character in range holds Interact to operate it; output scales with their skill; they gain XP while operating. One operator per station in the Foundation. (No prior art was found for range or multi-operator rules; these are design decisions to playtest.)

| Station | Foundation behaviour |
|---|---|
| Navigation | Reduces incoming hull damage (evasion). |
| Weapons | Charges and fires at drifting debris/asteroid targets. |
| Engineering | Reallocates power between stations; skill scales how much usable power the Reactor delivers. |
| Science | Sensor warnings of upcoming hazards. |
| Life Support (Oxygen) | Injects oxygen into rooms (proportional to volume, none into breached or vented rooms). Output scales with power and operator Engineering skill. Offline = no injection, so rooms drain via the hazard model. |
| Medbay | Crew standing in the Medbay heal over time. An operator (Science skill) raises the heal rate and speeds revival of downed crew placed there. |
| Doors | Remote control: the operator can seal or unseal any door from the console. Skill (Engineering) improves how well sealed doors hold, lowering their conductance for gas and fire spread. Offline = no remote control; doors still work locally. |

**Active stations** (Navigation, Weapons, Science, Engineering's power reallocation) do nothing without an operator. **Passive stations** (Life Support, Medbay, Doors) run at a baseline when powered, and an operator adds a skill-scaled bonus, as with FTL's manning bonuses. All stations draw from the power pool and go offline on power failure.

### Hazards and the director

Hazard types:

- **Fire** and **hull breach** (as in the room-graph model above; sealing doors contains them).
- **Power failure:** knocks a station offline until repaired.
- **Debris strike:** hits a random room; may cause a breach or fire.

Repair: walk to the hazard and hold Interact; speed scales with Repair skill, and Repair XP accrues while repairing. Repair is not tied to a station, so any crew member can do it, and specialists are faster.

**Director** *(composition of two documented approaches; the specific tuning is inference)*. Design principle: the director adjusts **pacing, not difficulty**, and the core tension is **more simultaneous tasks than hands**.

- One `stress` float derived from hazard state (open breaches, fire, unattended failures, crew down), recomputed every few seconds, with **asymmetric smoothing**: rises quickly, falls slowly, and does not fall while a hazard is unattended.
- A four-phase state machine over stress: **Build Up → Sustain Peak (short) → Peak Fade → Relax (long) → Build Up**.
- New hazards may start only when stress is at or below a **threshold that starts low and rises over time**, so spawns always eventually resume and the sandbox escalates.
- Hazard selection is weighted and seeded, with recently used types down-weighted.
- The director has its own seeded RNG stream, separate from cosmetic randomness.
- **Player-count scaling:** scale hazard *concurrency* with player count, not hazard strength; solo play gets a lower concurrency cap and a slower director. The exact formula is a tuning value.

## 6. Input

`DeviceManager` (in `input/`) owns device-to-player mapping:

- Poll `navigator.getGamepads()` every frame as the source of truth; tolerate null entries; treat the gamepad `index` as ephemeral and do not parse the `id` string.
- Press-to-join assigns a device to a free `PlayerId` slot. Keyboard clusters count as virtual devices (e.g. WASD+E and arrows+Enter).
- On disconnect the player's `InputFrame` becomes neutral and the slot shows "reconnect"; any press on a free device may reclaim it (identical pads can share ids, so identity cannot be relied on).
- Radial deadzone, starting around 0.15-0.25 (conventional, tunable).
- The sim only ever sees one `InputFrame` per `PlayerId` per tick, which also makes headless tests and replays trivial.

## 7. Rendering

- PixiJS v8: async init (`await app.init()`), nearest-neighbour scaling, integer scaling with letterboxing at the fixed internal resolution. Culling is manual in v8 and probably unnecessary for one small ship.
- Ship tiles: one `CompositeTilemap` (`@pixi/tilemap`; v8 compatibility to be confirmed in a spike) inside a world render group, rebuilt only on tile change. HUD in a separate render group.
- Per-room overlays (oxygen, fire) are tinted sprites driven by sim values.
- The renderer interpolates between ticks (`alpha = accumulator / dt`) and keeps previous positions for that. It must not hold entity ids across ticks without a liveness check.

## 8. Data flow

Per frame:

1. `input/` polls devices once and produces one `InputFrame` per `PlayerId`.
2. `app/` runs a fixed-timestep accumulator at 60 Hz, frame time capped (the previous project used a 5-tick clamp), calling `sim.step(intents)` each tick.
3. `render/` reads sim state once per frame and draws with interpolation.

## 9. Error handling

- Disconnected controller: see §6; the sim keeps running.
- Invalid ship JSON: zod validation at load with a clear error; no partial load.
- The sim never throws during play; invalid intents are clamped or ignored.

## 10. Testing (vitest, TDD)

- Unit tests per system: fire spread, oxygen, XP curves, station output, revive, collision.
- **Conservation property test** for the oxygen model: total oxygen plus vented total is constant to epsilon; no value goes negative or exceeds room volume.
- **Golden replays:** record `{version, seed, config, per-tick intents}`, replay headless, compare the final hash plus hashes every 60 ticks to localize divergence; a "bless" script updates goldens deliberately.
- **fast-check properties:** same seed and intents give the same hash; save at tick N, load, continue equals an uninterrupted run; intents split across different render-frame sizes give identical results; fuzzed intents never produce NaN or out-of-range values; snapshot round-trip is identity.
- **Boundary tests:** `sim/` imports nothing from `render/`, `input/` or `app/`; a lint rule bans `Math.random`, `Date` and `performance.now` there.
- Per-task commits.

## 11. Build order and early spikes

Suggested order, matching where research found the strongest prior art:

1. **Headless harness first:** pure `step`, `InputFrame` per `PlayerId`, `hashState`, a golden replay.
2. **Room-graph oxygen/fire model** with the conservation test.
3. Movement and collision, then stations and skills.
4. **Director** last, once hazards exist to pace.

Small spikes early, to remove the largest unknowns:

- bitECS 0.4: confirm snapshot serialization (including non-numeric stores) and query ordering behaviour before relying on them.
- `@pixi/tilemap` against PixiJS v8.
- Real gamepads in a built Electron app (hot-plug, reconnect, mapping differences).
- Licence check of every library listed in §3.

## 12. Licence and sourcing rules

- Do **not** copy code from GPL projects (XFTL, its co-op fork Tachyon, FTL-Hyperspace) or from Barotrauma (source-available under an EULA). They are reference reading only. We reimplement ideas with our own formulas and constants. Reverse-engineered FTL numbers are tuning reference at most, not data to import.
- Use original art and audio only.
- Firefly/Serenity and its tabletop RPG are inspiration for tone and design ideas only. Do not use their names, characters, ship names, logos, dialogue or other protected material, and do not copy the RPG's text or rules verbatim.
- Verify the licence of any reference code (e.g. Space Station 14 is believed MIT but unverified) and of each library before shipping.

## 13. Known unknowns

From the research gaps: many FTL numbers could not be verified (the wiki was inaccessible); the FTL layout file format and event schema were not read from primary sources; vitest/ECS testing practice was not researched, so §10 rests on the architecture rather than prior art; power-network modelling advice is first-principles only; no prior art found for station range or multi-operator rules or idle-player postmortems. Treat all tuning numbers as hypotheses until playtested.

## 14. Open items for later sub-projects

- Enemy ship and weapon targeting model (sub-project 2).
- Boarding and crew combat balance (sub-project 3).
- Perk/talent layer, run progression, and a possible automatic drone for solo play (sub-project 4).
- Ship quirks and history ("the ship as a character") and a shared luck-style resource, from the Firefly/Serenity RPG inspiration. Research the source material first.
- Transport, snapshot cadence and compression, host/client model (sub-project 5).
