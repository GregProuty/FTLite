# FTLite Foundation — Design

**Date:** 2026-11-09
**Status:** Draft, pending owner review
**Sub-project:** 1 of 5 (Foundation)

## 1. Vision and decomposition

FTLite is a multiplayer, roguelike, science-fiction spaceship game inspired by *FTL: Faster Than Light*. Differences from FTL:

- **Multiplayer.** 1-4 players on one shared screen (couch co-op) first. Networked play later.
- **Each player is one crew member** with RPG stats. They walk room to room on a top-down ship map and operate stations (navigation, engineering, weapons, science, communications).

The full vision is too large for one spec, so it is split into sub-projects, each with its own spec, plan and build:

1. **Foundation (this spec):** engine, sim loop, local input, ship map, crew with stats and skills, stations, onboard hazards.
2. Ship-to-ship combat.
3. Boarders and crew-vs-crew combat.
4. Run structure: sector map, jumps, events, shops, progression, permadeath.
5. Networked multiplayer.

## 2. Foundation goal

A **survival sandbox on one fixed ship**. 1-4 players each control one crew member. All five stations work at a basic level. Hazards spawn on a seeded timer and escalate. The score is survival time. The run ends when hull integrity reaches 0 or all crew are dead. There is no win state. The demo answers "is this fun with friends" and validates the crew/station/skill loop.

**Out of scope:** enemy ships, boarders, sector map and events, meta-progression, audio, real networking, AI crew, multiple ships, procedural ship generation.

## 3. Stack

TypeScript, Vite (via electron-vite), bitECS 0.4.0, PixiJS v8, Electron, vitest. Same family as the owner's previous roguelike project. Internal render resolution defined in one shared constant. Windows desktop target.

## 4. Architecture

Approach: **authoritative simulation driven by per-player input intents.**

| Layer | Responsibility | Depends on |
|---|---|---|
| `src/sim/` | Pure fixed-step game simulation over bitECS typed arrays. Consumes `Intent[]` per tick; exposes serializable world state. | `shared/` only |
| `src/input/` | Reads gamepads and keyboard; produces one `Intent` per `PlayerId`. The only code aware of devices. | `shared/` |
| `src/render/` | PixiJS view. Reads sim state; never mutates it. | `shared/`, read-only sim state |
| `src/app/` | Electron shell, menus, press-to-join lobby, and the loop wiring input, sim and render. | all layers |
| `src/shared/` | `Intent` and snapshot types, constants, seeded RNG. | nothing |

### Networking-readiness rules (enforced from day one)

1. All gameplay changes go through intents; the renderer never calls into game logic.
2. The sim uses a seeded RNG; no `Math.random`, no wall-clock time.
3. Players are identified by `PlayerId`, never by gamepad index.
4. Sim state is serializable (snapshots, replays).

Later networking adds a transport: clients send intents to a host, the host steps the sim, snapshots return. `render/` and `sim/` do not change. Lockstep determinism is not required.

## 5. Game model

### Ship

One fixed ship on a tile grid (rooms, walls, doors), loaded from validated JSON so later ships and generation reuse the format. Starter ship, about 8 rooms: Bridge (Navigation), Weapons Bay, Engine Room (Engineering), Science Lab, Comms Room, Reactor, Corridor hub, Medbay/storage.

Ship-wide state: **hull integrity**; **power pool** produced by the Reactor and drawn by stations (Engineering reallocates); per-room **oxygen**, **fire intensity**, **breach** flag; **doors** that open on approach and can be sealed.

### Crew

- Each `PlayerId` controls one character with **free analog movement**, colliding with walls and doors on the tile map.
- **Base stats:** Health, Speed.
- **Skills:** Navigation, Engineering, Weapons, Science, Communications. Each is a level with XP.
- A **starting trait** gives each character a different strength.
- Characters take damage from fire and low oxygen. At 0 Health they go **down**; a teammate can **revive** them by channelling Interact.

### Skill model (hybrid)

Researched from FTL (levelled by use) and Barotrauma (percentage skills with continuous effect). Skills **grow when the character successfully operates the matching station or repair**, and the **level continuously scales station speed/output** rather than gating discrete bonuses. Perks and talent-style layers are deferred to sub-project 4. Exact XP curves and scaling constants are tuning values defined in one data file.

### Stations

A console in a room. A character in range holds Interact to operate it; output scales with their skill; they gain XP while operating.

| Station | Foundation behaviour |
|---|---|
| Navigation | Reduces incoming hull damage (evasion). |
| Weapons | Charges and fires at drifting debris/asteroid targets. |
| Engineering | Speeds repairs; reallocates power. |
| Science | Sensor warnings of upcoming hazards. |
| Communications | Placeholder pulse reducing hazard frequency. |

A station with no operator is idle; stations draw from the power pool and go offline on power failure.

### Hazards

A **director** spawns hazards on a seeded timer, escalating over time:

- **Fire:** spreads to adjacent rooms, burns characters, consumes oxygen.
- **Hull breach:** vents oxygen until repaired; sealing doors contains it.
- **Power failure:** knocks a station offline until repaired.
- **Debris strike:** hits a random room; may cause a breach or fire.

Repair: walk to the hazard and hold Interact; speed scales with Engineering skill.

## 6. Data flow

Per frame:

1. `input/` polls devices once and produces one `Intent` per `PlayerId`: `move` (x, y), `interact` (held), `action` buttons.
2. `app/` runs a fixed-timestep accumulator at 60 Hz, clamped to 5 ticks per frame, calling `sim.step(intents)` each tick.
3. `render/` reads sim state once per frame and draws, with optional interpolation between ticks.

## 7. Error handling

- Disconnected controller: the character stops, the slot shows "reconnect", the sim keeps running.
- Invalid ship JSON: validated at load with a clear error; no partial load.
- The sim never throws during play; invalid intents are clamped or ignored.

## 8. Testing (vitest, TDD)

- Unit tests per system: fire spread, oxygen, XP curves, station output, revive.
- **Replay tests:** a recorded intent stream plus a seed must reproduce the same final state, guarding the sim/network boundary.
- **Boundary test:** `sim/` imports nothing from `render/`, `input/` or `app/`.
- Per-task commits.

## 9. Open items for later sub-projects

- Enemy ship and weapon targeting model (sub-project 2).
- Boarding and crew combat balance (sub-project 3).
- Perk/talent layer and run progression (sub-project 4).
- Transport, snapshot format, and host/client model (sub-project 5).
