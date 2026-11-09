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

***Artemis Spaceship Bridge Simulator*** (researched; see `research/Artemis officer station mechanics.md`) contributes two mechanics, both adapted to a walk-between-consoles crew and to discrete levels instead of sliders:

- **Engineering as a heat-versus-power dial:** boosting a station above its normal maximum costs heat, and a small shared coolant pool decides how much boost is sustainable (see Power model).
- **Beams and torpedoes with a Science-to-Weapons handoff:** beams are unlimited and need the right frequency, torpedoes are limited and homing, and Science scans reveal the frequency (see Weapons and the debris lifecycle).

Everything else in Artemis (shouting across separate screens, a Captain with no controls, Comms, Helm sliders) is deliberately left out.

## 2. Foundation goal

A **survival sandbox on one fixed ship**. 1-4 players each control one crew member. All seven stations work at a basic level and repair is fully playable. Hazards spawn on a seeded, escalating director. The score is survival time. The run ends when hull integrity reaches 0 or no crew member is Conscious. There is no win state. The demo answers "is this fun with friends" and validates the crew/station/skill loop.

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
4. Wherever iteration order affects RNG draws or damage, iterate entities sorted by `StableId` *(bitECS 0.4 query ordering is unverified, and raw entity ids can be remapped on restore)*.
4a. **Fixed system order within one tick** (so same-tick conflicts have one answer): (1) input and arbitration (sit/stand, Interact targets); (2) power: Engineering inputs, then shedding computed from the post-input state; (3) stations: charging, loading and scanning progress, then fire commands resolved in `PlayerId` order, each shot resolving immediately (hit roll drawn from the combat stream); (4) hazards on their tick: cooling applied before the overheat check; (5) debris: evasion and impact, after shots, so a same-tick shot beats an impact; (6) director; (7) crew lifecycle. A debris object destroyed earlier in the tick never reaches step 5.
5. Players are identified by `PlayerId`, never by gamepad index. Every entity carries a **`StableId`** (a monotonic counter allocated by the sim and part of snapshotted state). The renderer's caches (sprites, previous positions) and anything crossing a future wire are keyed by `StableId`, never by raw bitECS entity id, because ids are recycled immediately by default and a liveness check cannot tell a recycled id from the original entity.
6. Sim state is serializable. Every snapshot begins with a header `{formatVersion, simVersion, tick, rngStates}` plus a component manifest, because bitECS serialization has no versioning of its own.
7. `hashState(state)` hashes the **canonical authoritative state** (below) as raw bytes, not through bitECS's epsilon diff path. Cost and snapshot size are measured in a spike (§11) before being called cheap.
8. Static ship layout is immutable and shipped as data; dynamic state lives in flat typed arrays so snapshots are cheap.

### Authoritative state (what snapshots and hashes cover)

The complete authoritative state is: the tick counter; every RNG stream state; the `StableId` allocator counter and the set of live entities; all component values for live entities; per-room hazard state and hazard-step accumulators; power allocations, per-station heat and coolant assignment; weapon state (beam charge and selected frequency, torpedo stock and load progress); scan progress and each debris object's frequency and revealed flag; the director (stress, phase, phase timer, recent-hazard history, concurrency counters); timers and pending/incoming threats; per-crew lifecycle state and progress (revive, repair); and the ship layout identity (id plus content hash) and config version. The canonical order for snapshots and hashes is live entities sorted by `StableId`, with unused array slots skipped (so stale data in recycled slots cannot affect the hash). Derived data (room adjacency tables, `solid()` lookup, spatial indexes) is **rebuilt from the layout on load and is never snapshotted**; the layout hash in the header guarantees both sides rebuilt from the same data.

### Path to online play (sub-project 5, not built now)

Host-authoritative: clients send intents tagged with a target tick; the host steps the sim and broadcasts snapshots (order of 5 Hz, optionally delta-compressed against an acknowledged baseline) plus a hash of the host's state at that tick for integrity checking of the snapshot (clients cannot compare an interpolated view against the host's full-sim hash; desync detection applies to replay/restore and same-tick snapshot checks); clients interpolate. A thin `Transport` interface keeps the choice of WebSocket, WebRTC or Steam sockets open. This avoids bit-exact lockstep, which research found fragile in JavaScript. Rollback, prediction, interest management and NAT traversal are deferred until playtests demand them. Input latency tolerance of 100-200 ms is an *inference* about this game's slow pace, to be validated.

## 5. Game model

### Ship and data format

One fixed ship on a tile grid (rooms, walls, doors), loaded from a **single versioned JSON file per ship** (not Tiled at runtime; Tiled may be used for authoring and converted at build time). Starter ship, about 9 rooms: Bridge (Navigation, Doors), Weapons Bay, Engine Room (Engineering), Science Lab, Life Support (Oxygen), Medbay, Crew Quarters, Reactor, Corridor hub.

Format: `version`, `width`/`height`, `tiles[]`, `rooms[]` (id, volume, system, station slots), `edges[]` (room a, room b or `"space"`, kind, tile, width, defaultOpen), `stations[]`. Validated at load with zod `superRefine` checks: every room id referenced exists, each edge lies on the boundary of exactly its two rooms, the room graph is connected, ids are unique, array lengths equal width × height, and **crew-sized reachability** holds (a breadth-first search over passable tiles, using the crew collision size, reaches every station tile and every door tile from every crew spawn). A concrete starter-ship fixture file is part of the Foundation deliverable, and tile encoding and door orientation are defined by its schema. (FTL's own tooling tolerates unreferenced room ids and produces stray rooms; we reject them.)

Ship-wide state: **hull integrity**; **power pool** produced by the Reactor and drawn by stations (Engineering reallocates); per-room **oxygen**, **fire intensity**, **breach** flag; **doors**, each in one of three states: **Open** (crew standing at it), **Closed** (resting state, auto-opens as crew approach) or **Sealed** (locked shut by a crew member at the door or remotely from the Doors console; blocks crew passage until unsealed).

### Hazard simulation: rooms as graph nodes

Hazards are simulated on the **room graph**, not tile by tile. Tile-based gas solvers (as in Space Station 14) are overkill for 8-30 rooms; hull/gap graphs (as in Barotrauma) fit. Formulation *(the research's synthesis, not a copied algorithm)*:

- Per room: oxygen mass and volume. Per edge: **passage factor** by door state, with `conductance = width × passage`. Open = 1; Closed = a small leak factor; Sealed = a smaller leak factor that **improves with the Doors operator's Engineering skill** (so there is always something for skill to reduce, and a sealed door is never perfectly airtight unless tuned so). A **breach** is an edge from a room to space (space is a fixed-zero node); a room with a breach edge is **breached**. A room is **vented** when its oxygen has fallen below the injection cutoff.
- Each hazard step computes all flows from a **start-of-step snapshot** and applies them symmetrically: `flow = k · conductance · (O2_a/V_a − O2_b/V_b) · dt`.
- **Stability and non-negativity** (a per-edge clamp is not enough on a branching graph: several edges can each pass their own bound and together overdraw a room): (1) choose `k · dt` so that for every room `k · dt · (Σ incident conductance) / V ≤ 1/2`; (2) after computing flows, any room whose total outflow exceeds its current mass has **all its outflows scaled down proportionally**, applied to both endpoints so conservation holds. A branching-graph test (one full room, several empty neighbours) is mandatory.
- **Oxygen sources and sinks** (so Life Support matters and conservation is testable): sources are Life Support injection; sinks are crew breathing (a small per-crew rate), fire consumption, and venting through breach edges. Small values snap to zero and the discarded residual is accumulated in a tracked counter.
- Hazards tick every 5th sim tick (12 Hz), driven purely by simulation ticks and not by wall-clock time.
- **Fire:** grows when room oxygen is above a threshold and shrinks below it (with hysteresis against the suffocation threshold, to avoid flicker), consumes oxygen, is capped per room, and on a periodic roll each edge touched by fire may ignite the neighbouring room with probability proportional to the edge's passage factor (so Closed and Sealed doors slow spread, Open doors do not). Spread rolls use the seeded hazards stream (never an unsynced RNG).
- Starting values (e.g. 10% oxygen threshold, 15% spread chance per 5 s, 16-fire cap) are tuning data, to be re-derived and playtested. They come from reading other games, not from tests of FTLite.

### Crew

- Each `PlayerId` controls one character with **free analog movement**, colliding with walls and closed doors on the tile map. Movement is resolved **per axis against solid tiles** (Celeste/TowerFall style), which gives wall sliding and deterministic results; analog input is normalized and clamped so diagonals are not faster. Doors are tiles whose solidity is a function of door state via a single `solid(tx, ty)` query. *(Per-axis details come from recalled sources; verify with tests.)*
- **Base stats:** Health, Speed.
- **Skills:** Navigation, Engineering, Weapons, Science, Combat, Repair. Each is a level with XP.
  - Navigation, Engineering, Weapons and Science are **station skills**, trained by operating the matching station. The Life Support and Doors consoles train and use **Engineering**; the Medbay trains and uses **Science**. No new skills are added.
  - **Repair** is trained by repairing hazards (fires, breaches, power failures) anywhere on the ship. It sets repair speed.
  - **Combat** is personal fighting skill (melee/sidearm damage and defence). It is defined on the character sheet now but has no source of XP or effect in the Foundation, because there are no enemies until boarders (sub-project 3).
- Each character has one **Asset** (a strength, e.g. faster repairs, a skill head start) and one **Complication** (a drawback, e.g. slower movement, takes extra damage from fire), so crew differ in character and not only in numbers. The Foundation ships **four fixed, pre-made characters** (one per player slot), each with one Asset and one Complication and a different skill head start; there is no character creation. The exact four are defined in the tuning data during increment 3.
- **Crew lifecycle:** each crew member is **Conscious**, **Downed** or **Dead**. Characters take damage from fire and low oxygen. At 0 Health they become **Downed**: they cannot move or act, and a **bleed-out timer** (starting value about 30 s, tuning) runs down, faster while the crew member is in fire or a low-oxygen room. A teammate **revives** them by standing adjacent and holding Interact for a revive duration (about 4 s, tuning); the revive is interrupted if the reviver moves away, is downed, or releases Interact, and progress then decays. A revived crew member returns Conscious at partial Health (about 30%, tuning). If the timer expires they become **Dead** for the rest of the run. There is no carrying of downed crew in the Foundation. The run ends when the hull reaches 0 or **no crew member is Conscious** (so a solo player going down ends the run immediately).

### Skill model (hybrid)

From FTL (levelled by use) and Barotrauma (continuous effect). Skills **grow when the character successfully operates the matching station or repairs a hazard**, and the **level continuously scales station speed/output or repair speed**. Proposed shapes *(inference; constants are original and live in one tuning file)*:

- **Output:** `lerp(slow, fast, (level + 100) / 200)` for levels 0-100, so an unskilled operator still runs at about half of maximum — friendly to new and solo players.
- **Levels and XP:** skills are **integer levels 0-100** with an XP total per skill. A committed, precomputed **threshold table** maps XP to level (diminishing returns come from growing thresholds), so no `pow`/transcendental maths runs in the sim. XP accrues at a constant rate per second of **productive operation**. Tune so a 20-minute session moves a player a few levels. "Productive" is defined per station (powered, operator in range holding Interact, and the station is actually doing useful work); those definitions are fixed together with the threat loop.
- Perks and talent-style layers are deferred to sub-project 4.

### Stations

A console in a room. A character sits at a console to operate it; output scales with their skill; they gain XP while productively operating. One operator per station in the Foundation. (No prior art was found for range or multi-operator rules; these are design decisions to playtest.)

**Action vocabulary.** The `Intent` for each player per tick is: `move` (x, y), `interactHeld`, and the edge actions `interactPressed`, `confirmPressed`, `cancelPressed`.

**Walking mode.** The stick moves the character. Interact acts on the single highest-priority target within reach: **revive a downed crew member > repair a hazard > sit at a console**. Holding Interact progresses a revive or repair; pressing it at a console sits down.

**Control mode (seated at a console).** The character is locked at the console. The stick moves a cursor or selection and **Confirm** acts; **Cancel** (or Interact) stands up. A seated operator is forced to stand if downed or if the console goes offline. A seated operator cannot repair or revive, which is the intended "more tasks than hands" tension. Per station:

- **Navigation:** no selection; being seated sustains the evasion bonus.
- **Weapons:** up/down cycles targets among warned debris objects; left/right cycles a four-slot weapon selector (Beam tuned to frequency 1, 2 or 3, or Torpedo); Confirm fires the selected weapon when it is ready.
- **Engineering:** up/down selects a station and left/right shifts power to or from it (past the station's maximum is overdrive); Confirm cycles the selected station's coolant units 0, 1, 2 and back to 0 (units drawn from or returned to the shared pool; a step the pool cannot supply wraps to 0).
- **Science:** up/down cycles warned debris objects; Confirm starts a scan of the selected one. Being seated also gives the warnings.
- **Life Support:** no selection; being seated boosts injection.
- **Medbay:** no selection; being seated raises the heal rate.
- **Doors:** the stick selects a door; Confirm toggles sealed.

**Arbitration** is deterministic and decided per tick: only one operator per console (first to sit wins; a simultaneous tie goes to the lowest `PlayerId`); only one reviver per downed crew member (same rule); several crew may repair the same hazard at once and their repair progress adds; the highest-priority target in reach wins for each player, with ties broken by `StableId`.

| Station | Foundation behaviour |
|---|---|
| Navigation | While seated, gives each incoming debris object an evasion chance on impact, scaling with skill. Productive when it makes an evasion roll against an incoming object. |
| Weapons | Two weapon types on one console. **Beam:** unlimited, instant, recharges while seated (charge time falls with Weapons power level and skill); hits a warned debris object with a high chance if its frequency matches the debris's frequency, a low chance if not. **Torpedo:** one tube; loads while seated (load time falls with power level and skill), needs stock, homing, so a high hit chance whatever the frequency; stock starts at a few (tuning) and regenerates slowly while Weapons is powered (a Foundation stand-in for resupply). A loaded torpedo and a charged beam stay ready when the operator stands up; charging and loading only progress while seated. A hit destroys the object; a miss leaves it in flight. Firing resolves immediately (no projectile). Torpedoes have two counts: **stock** (capped, e.g. 6) and the single **loaded** torpedo; loading moves one from stock to the tube, and a power failure pauses loading but keeps what is loaded. Regeneration stops at the cap. Productive when a shot is fired at a live object. |
| Engineering | While seated, shifts power bars between stations and assigns coolant units (see Power model); skill adds bonus bars and raises cooling per unit. Productive while the allocation or coolant is actually being changed, bonus bars are covering a shortfall, or an overdriven station is being kept cool. |
| Science | While seated, detects incoming debris early: a warning lead time that grows with skill. Unmanned, an object is only revealed in the last few seconds before impact. A **scan** of a selected warned object reveals its frequency (scan time falls with power level and skill; one scan at a time). Scan progress is kept per object and only advances while Science is seated and powered; standing up, going offline or changing target pauses it without losing progress, and destroying or impacting the object discards it. A revealed warning or frequency stays revealed; only detection of new objects depends on Science being seated and powered. Productive while a scan is running or at least one threat is pending or incoming. |

**Productive predicates** (used for XP and by the director's idle tracking, so they must be exact): Navigation, seated while at least one warned object is in flight (XP per second, plus each evasion roll); Weapons, a shot fired at a live object; Science, as in the table; Engineering, seated while an overdriven station exists or when an allocation or coolant change was made in the last 5 s (changes count at most once per 5 s); Life Support, seated while any room is below its target oxygen; Medbay, seated while any crew member in the Medbay is below full health; Doors, seated while any room has a fire or breach, or a door was toggled in the last 5 s.
| Life Support (Oxygen) | Injects oxygen into rooms (proportional to volume, none into breached rooms or rooms below the injection cutoff, so a vented room must be sealed and repaired before it refills). Output scales with power and operator Engineering skill. Offline = no injection, so rooms drain via the hazard model. |
| Medbay | Crew standing in the Medbay heal over time. An operator (Science skill) raises the heal rate. It does not affect revival; reviving is done by teammates anywhere (see Crew lifecycle). |
| Doors | Remote control: the operator can seal or unseal any door from the console. Skill (Engineering) improves how well sealed doors hold, lowering their sealed passage factor for gas and fire spread. Offline = no remote control; doors still work locally. |

**Active stations** (Navigation, Weapons, Science, Engineering's power reallocation) do nothing without an operator. **Passive stations** (Life Support, Medbay, Doors) run at a baseline when powered, and an operator adds a skill-scaled bonus, as with FTL's manning bonuses. All stations draw from the power pool and go offline on power failure.

### Power model

FTL-style power bars:

- The **Reactor** provides a fixed capacity of power bars (tuning, e.g. about 10). Each station has a **max level** and draws bars equal to its current allocated level; a station's effect scales with its level (level 0 = offline). The starter allocation is part of the ship data.
- A seated **Engineering** operator shifts bars between stations (see controls), and their skill adds a small number of **bonus bars while they remain seated** (a few at most, tuning). Allocations **persist when nobody is seated**.
- If available capacity falls below total allocation (the Engineering operator stands up, or the reactor is damaged), stations **shed power in a fixed priority order**, highest-priority-to-keep last: Engineering and Life Support are shed last; Doors, Medbay, Science and Weapons are shed first; Navigation sits in between (exact order is tuning data). Shedding removes bars from the lowest-priority station until the total fits, and restored capacity does not automatically restore shed bars (Engineering reallocates them).
- A **power failure** hazard sets one station to level 0 (offline) until repaired; its bars return to the pool and can be reallocated. If Engineering itself is offline, allocations stay as they were and cannot be changed until it is repaired, so there is always a recovery path (repair it). The Reactor **always reserves one bar for Engineering**: a failed Engineering is restored to level 1 on repair without drawing from the pool, so recovery can never deadlock on zero bars. Any other repaired station returns to level 0 and is reallocated by Engineering.

**Overdrive, heat and coolant** (adapted from Artemis's Engineering; all numbers are tuning):

- A station may be pushed **one level above its maximum** (overdrive) at the cost of that extra bar. Its effect scales with the higher level (faster charge, load or scan; stronger evasion; more oxygen injected). Engineering itself cannot be overdriven.
- Each station has an integer **heat** value. Heat runs on the hazard tick (12 Hz): while overdriven it rises by a fixed rate and falls by a per-unit cooling amount for each **coolant unit** assigned to the station; while not overdriven it falls at a base rate to a floor of 0. Cooling per unit has a baseline and rises with the skill of the **currently seated** Engineering operator; with nobody seated, the baseline applies. Heat and cooling are integer fixed-point and the skill bonus rounds down.
- The **coolant pool** is a small fixed number of units (e.g. 4) shared by every station. Units are never used up and can be moved at any time. With enough units, a chosen overdrive is sustainable indefinitely (e.g. two units hold one station); with too few, heat climbs.
- At maximum heat the station suffers a **power failure** (the existing hazard, so the repair loop is unchanged), its heat resets, and there is a chance of a fire in its room. This is the Foundation's stand-in for Artemis's burned-out node, and no new hazard type is added.
- The intended play is spiking: overdrive Weapons just before a shot window, Science while scanning, then drop back. Heat and coolant are part of authoritative state.
- Discrete bars, not sliders, are used because Artemis players needed saved presets to cope with slider control in real time (see the research report).

### Hazards and the director

Hazard types:

- **Fire** and **hull breach** (as in the room-graph model above; sealing doors contains them).
- **Power failure:** sets a station to level 0 (offline) until repaired; see the Power model.
- **Debris strike** (the external threat, with a full lifecycle so three stations have a job):
  1. **Spawn:** the director creates a debris object with an impact time and a target room, drawn from the hazards RNG stream. It starts hidden.
  2. **Warning:** a seated Science operator detects it a skill-scaled lead time before impact (e.g. about 20 s at low skill, longer with skill, tuning); unmanned Science reveals it only in the last few seconds. Each object also has a **frequency** (1 to 3, drawn from the hazards RNG stream at spawn) that is hidden until Science scans it.
  3. **Interception window:** while it is warned and not yet impacted, a seated Weapons operator can target it (stick cycles targets) and fire a ready beam or torpedo (Confirm). A beam tuned to the revealed frequency is the reliable shot; an unscanned object can be guessed at (about one in three of being right) or hit with a torpedo. A hit destroys it; a miss leaves it in flight.
  4. **Evasion:** at impact, a seated Navigation operator gives an evasion roll; success means the object misses.
  5. **Impact:** an unstopped, unevaded object damages the hull (tuning) and the target room, with a chance of a breach or a fire there.
  Each station's effect is deterministic given the seeded streams, and none of this requires enemy ships.

Repair: walk to the hazard and hold Interact; speed scales with Repair skill, and Repair XP accrues while repairing. Repair is not tied to a station, so any crew member can do it, and specialists are faster.

**Director** *(composition of two documented approaches; the specific tuning is inference)*. Design principle: the director adjusts **pacing, not difficulty**, and the core tension is **more simultaneous tasks than hands**.

Two separate mechanisms, so they cannot fight each other:

- **Elapsed-time escalation (difficulty):** the weights of harder hazards, the target spawn rate and the concurrency cap grow with sim time. This is what makes the sandbox escalate.
- **Stress-based pacing (rhythm):** a four-phase machine over a `stress` float decides *when* spawns are permitted.

`stress` (0 to 1) is recomputed every 5 s from active hazards (open breaches, fires, power failures, incoming debris) and downed crew, with **asymmetric smoothing**: it rises quickly and falls slowly. A hazard is **unattended** when no crew member is within reach of it or repairing it. Stress falls at a *reduced* rate (never zero) while an unattended hazard exists, so recovery phases can still occur.

| Phase | Spawns allowed | Enters when | Exits when |
|---|---|---|---|
| Build Up | Yes, subject to the concurrency cap | start, or Relax ends | stress reaches the peak level, **or** the cycle's spawn budget is used, **or** a stall timer (e.g. 60 s with no spawn, tuning) expires |
| Sustain Peak | No | Build Up exits | fixed duration (e.g. 10 s, tuning) |
| Peak Fade | No | Sustain Peak ends | stress falls to the relax level, or a timeout (e.g. 30 s) |
| Relax | No | Peak Fade exits | after a minimum duration (e.g. 30 s) once stress is at or below the relax level, **or** a hard maximum (e.g. 60 s) regardless of stress, so Relax can never last indefinitely |

The **concurrency cap** counts every unresolved hazard (each fire, breach, failure and in-flight debris object); a spawn is skipped, not queued, when the cap is reached. Because a full cap implies active hazards and therefore stress, the stall timer guarantees Build Up still advances. Phase, phase timer, stress, spawn budget and recent-hazard history are part of authoritative state.
- Hazard selection is weighted and seeded, with recently used types down-weighted.
- **Route crises to every console.** Artemis playtests found Engineering and Science idle for most of a mission, so selection also up-weights hazard types whose responding console has gone longest without a productive operator (see Productive predicates). Only real pairings are used: debris for Science, Weapons and Navigation; fire and breach for Doors (and Life Support once the breach is repaired and the room must refill); a power failure for Engineering (reallocating bars and cooling around the gap). Medbay is driven by crew injuries from impacts and fire, not by a selectable hazard. Seconds since each station was last productive is part of authoritative state. Difficulty rises through more *overlapping* crises and shorter timers, not stronger hazards.
- The director has its own seeded RNG stream, separate from cosmetic randomness.
- **Player-count scaling:** scale hazard *concurrency* with player count, not hazard strength; solo play gets a lower concurrency cap and a slower director. The exact formula is a tuning value.

## 6. Input

`DeviceManager` (in `input/`) owns device-to-player mapping:

- Poll `navigator.getGamepads()` every frame as the source of truth; tolerate null entries; treat the gamepad `index` as ephemeral and do not parse the `id` string.
- Press-to-join assigns a device to a free `PlayerId` slot. Keyboard clusters count as virtual devices (e.g. WASD+E and arrows+Enter).
- On disconnect the player's `InputFrame` becomes neutral and the slot shows "reconnect"; any press on a free device may reclaim it (identical pads can share ids, so identity cannot be relied on).
- Radial deadzone, starting around 0.15-0.25 (conventional, tunable).
- **`InputFrame` vs `Intent`:** an `InputFrame` is the device-level snapshot for one `PlayerId` from one poll (held values: move vector, interact held; plus **action edges**, i.e. button presses and releases since the last poll). An `Intent` is the per-tick input the sim consumes, derived by `app/` from the frames. Held values are copied into every tick of a catch-up batch; **each action edge is delivered on exactly one tick** (the first tick of the batch it arrived in), so edges neither repeat during catch-up nor vanish between ticks. Recorded replays store `Intent`s per tick.

## 7. Rendering

- PixiJS v8: async init (`await app.init()`), nearest-neighbour scaling, integer scaling with letterboxing at the fixed internal resolution. Culling is manual in v8 and probably unnecessary for one small ship.
- Ship tiles: one `CompositeTilemap` (`@pixi/tilemap`; v8 compatibility to be confirmed in a spike) inside a world render group, rebuilt only on tile change. HUD in a separate render group.
- Per-room overlays (oxygen, fire) are tinted sprites driven by sim values.
- The renderer interpolates between ticks (`alpha = accumulator / dt`) and keeps previous positions for that. Its caches are keyed by `StableId`, never by raw entity id, and entries are dropped when the `StableId` is no longer live (test: remove and reuse an entity slot between rendered frames).

### Minimum HUD and session flow

- **Per player:** a prompt for the current Interact target (revive, repair or console), Health, the six skill levels, and, when Downed, the bleed-out timer. While reviving or repairing, a progress bar.
- **Ship:** hull integrity, power bars per station (and total capacity), a per-room oxygen and fire overlay, a list of incoming and active threats with ETAs, and run time (sim time, used as the score).
- **Station state:** each console shows its occupant, level (offline/online) and productive state. Also shown: per-station heat and coolant units (heat visibly approaching maximum), weapon readiness (beam charge and tuned frequency; torpedo loaded flag and stock), scan progress, and each warned object's frequency once revealed (so Weapons can read the Science handoff without talking).
- **Session flow:** press-to-join lobby, start, run, a game-over screen showing survival time and per-crew skill gains, and restart with the same or a new seed.

## 8. Data flow

Per frame:

1. `input/` polls devices once and produces one `InputFrame` per `PlayerId`.
2. `app/` runs a fixed-timestep accumulator at 60 Hz, calling `sim.step(intents)` per tick. Frame time is clamped (the previous project used a 5-tick clamp) and **excess backlog is discarded, not retained**: on a slow frame the game runs in slow motion rather than catching up. Hazard timing is derived only from sim ticks, so slow-motion is consistent.
3. `render/` reads sim state once per frame and draws with interpolation.

**Process model (Electron):** the authoritative loop runs in the **renderer process** of a single window; the main process only owns the window, app lifecycle and IPC. **Focus loss, minimize and system suspend auto-pause the sim** (Chromium throttles background timers by default; pausing avoids both throttling artifacts and unfair deaths on a shared couch screen). Score uses **sim time**, so paused and slow-motion time never counts. Keyboard input state is cleared on blur to avoid stuck keys. The packaged app is tested for this behaviour.

## 9. Error handling

- Disconnected controller: see §6; the sim keeps running.
- Invalid ship JSON: zod validation at load with a clear error; no partial load.
- Invalid intents are clamped or ignored, so malformed input cannot corrupt state. The sim is not asserted to be throw-free; an unexpected fault is caught at the loop boundary, the run pauses with an error screen, and the replay/snapshot for the failing tick is saved for debugging.

## 10. Testing (vitest, TDD)

- Unit tests per system: fire spread, oxygen, XP curves, station output, revive, collision.
- **Mass-balance property test** for the oxygen model: the change in total oxygen equals production minus consumption minus vented minus the tracked discarded residual, to epsilon; no value goes negative or exceeds room volume. Includes a branching-graph case (one full room, several empty neighbours) and simultaneous venting.
- **Overdrive and weapons properties:** coolant units assigned never exceed the pool and are conserved by every Engineering input; heat stays within 0 and its maximum; power drawn never exceeds capacity after shedding; torpedo stock never goes negative and a shot only consumes stock when fired; beam hit chance is higher on a frequency match than a mismatch for every skill level.
- **Golden replays:** record `{version, seed, config, per-tick intents}`, replay headless, compare the final hash plus hashes every 60 ticks to localize divergence; a "bless" script updates goldens deliberately.
- **fast-check properties:** same seed and intents give the same hash; save at tick N, load, continue equals an uninterrupted run; intents split across different render-frame sizes give identical results; fuzzed intents never produce NaN or out-of-range values; snapshot round-trip is identity.
- **Boundary tests:** `sim/` imports nothing from `render/`, `input/` or `app/`; a lint rule bans `Math.random`, `Date` and `performance.now` there.
- Per-task commits.

### Acceptance (the "is this fun with friends" question made testable)

Automated tests prove the sim is correct and deterministic; they cannot prove it is fun. Playtest acceptance, run at 1, 2 and 4 players with the default seed set:

- **Solo viability:** a competent solo player can survive at least several minutes (target set after the first playtest) by choosing which station to man, even though most stations go idle.
- **Four-player clarity:** every player can say at any time what the most useful thing for them to do is (task clarity), and no player is idle for long stretches (travel burden is acceptable, not dominant).
- **Useful station choices:** playtesters report making real tradeoffs (e.g. seat at Weapons vs go repair), and skill differences are noticeable by the end of a 20-minute run.
- **Observable questions** recorded per session: time to first death, which stations were never manned, longest idle period per player, and how each run ended.

## 11. Build order and early spikes

Suggested order, matching where research found the strongest prior art:

The Foundation is built in **gated increments**; each is playable and testable on its own, and a later increment does not start until the earlier one's acceptance checks pass.

0. **Headless harness:** pure `step`, `InputFrame`/`Intent` per `PlayerId`, `hashState`, a golden replay.
1. **Move and survive:** ship loading and validation, movement and collision, the room-graph oxygen/fire/breach model with the mass-balance test, doors, repair, and the crew lifecycle (downed/revive).
2. **Power, stations and threats:** the power model (including overdrive, heat and coolant), all seven consoles with control mode, beams and torpedoes with frequency scanning, and the debris threat loop (warning, scan, intercept, evade, impact). If this proves too large, split it: power, consoles and the basic loop first, then overdrive/heat/coolant and the frequency/torpedo layer as their own gated step.
3. **Skills and traits:** XP and levels for the six skills, and the four pre-made characters with their Asset and Complication.
4. **Director:** the stress and pacing machine and escalation, replacing a simple timer spawner used in increments 1-3.

Small spikes early, to remove the largest unknowns:

Each spike has a pass criterion and a fallback. Pin exact library versions first.

- **bitECS 0.4 snapshots.** Pass: snapshot-restore-continue equals an uninterrupted run (hash equality) for a world with removed and recycled entities, and any non-numeric data we need; snapshot size and hash time are measured and recorded. Fallback: our own flat serializer over our own component stores.
- **bitECS query ordering.** Pass: documented or tested stable ordering; otherwise we already sort by `StableId` and the spike only records this.
- **`@pixi/tilemap` 5.x with PixiJS v8** (the README maps v5 to v8). Pass: the starter ship renders and rebuilds correctly at integer scale. Fallback: plain sprite batching or a hand-rolled tile mesh.
- **Real gamepads in a built Electron app.** Pass: hot-plug, reconnect and 4-pad join work on a test matrix (Xbox-style, PlayStation-style and at least one other pad, plus two keyboard clusters). Fallback: restrict supported devices and document them.
- **Licence check** of every library listed in §3. Pass: all compatible with distribution; otherwise replace the library.

## 12. Licence and sourcing rules

- Do **not** copy code from GPL projects (XFTL, its co-op fork Tachyon, FTL-Hyperspace) or from Barotrauma (source-available under an EULA). They are reference reading only. We reimplement ideas with our own formulas and constants. Reverse-engineered FTL numbers are tuning reference at most, not data to import.
- Use original art and audio only.
- Firefly/Serenity and its tabletop RPG are inspiration for tone and design ideas only. Do not use their names, characters, ship names, logos, dialogue or other protected material, and do not copy the RPG's text or rules verbatim.
- Verify the licence of any reference code (e.g. Space Station 14 is believed MIT but unverified) and of each library before shipping.

## 13. Known unknowns

From the research gaps: many FTL numbers could not be verified (the wiki was inaccessible); the FTL layout file format and event schema were not read from primary sources; vitest/ECS testing practice was not researched, so §10 rests on the architecture rather than prior art; power-network modelling advice is first-principles only; no prior art found for station range or multi-operator rules or idle-player postmortems. The Artemis research used the 1.x manual (v1.70) and found no primary source for heat rates, repair speeds or weapon cooldowns, so overdrive, heat, coolant, beam and torpedo numbers are first-principles tuning, and the Artemis solo-play question is unresolved. Treat all tuning numbers as hypotheses until playtested.

## 14. Open items for later sub-projects

- Enemy ship and weapon targeting model (sub-project 2).
- Boarding and crew combat balance (sub-project 3).
- Perk/talent layer, run progression, and a possible automatic drone for solo play (sub-project 4).
- Ship quirks and history ("the ship as a character") and a shared luck-style resource, from the Firefly/Serenity RPG inspiration. Research the source material first.
- Transport, snapshot cadence and compression, host/client model (sub-project 5).
