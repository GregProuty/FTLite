# Power and Consoles (Increment 2a-i) — Design

Status: approved in brainstorming 2026-11-10. Parent: `2026-11-09-foundation-design.md` §5 (Stations, Power model, Hazards), §6, §7, §11 item 2. This is the first half of Increment 2a; the second half (`debris loop`: Science, Weapons with the plain beam, Navigation, debris spawn/warning/interception/evasion/impact) is a separate spec.

## 1. Goal

Replace the always-on oxygen injector stub with a real power model and seated consoles, so the ship needs crew at stations to stay alive. After this increment: a reactor with a fixed bar budget, seven stations drawing bars, a seated **control mode** with a stick cursor, four consoles that do something (Engineering, Life Support, Medbay, Doors), three that are seatable power sinks until the debris half (Navigation, Weapons, Science), and a **power failure** hazard that the timer spawner adds to fires and breaches.

**Out of scope (later increments):** overdrive, heat and coolant (2b); torpedoes, beam, scanning, debris (2a-ii); skill levels, XP, Engineering bonus bars and power shedding (3, where bonus bars give shedding a cause); the director and productive predicates (4). Decisions taken here for those: output formulas take a `skillLevel()` that returns 0 for everyone; `Confirm` at Engineering does nothing; capacity never changes, so no shedding code exists yet.

## 2. Architecture

Approach chosen: **sim-owned seated state, stations as fixed arrays.** The seven stations are a fixed set indexed in ship-data order, so they live as typed arrays in `SimState.stations`, not as entities (crew remain the only entities; see `docs/spikes.md`). A `Seated` component on crew records the station index. One new sim step, `consoleSystem`, runs between `interactSystem` and `movementSystem`. Stick edges are derived from `move` inside the sim, so recorded `Intent`s reproduce console use exactly and nothing authoritative lives in `app/`.

New and changed modules:

| Module | Responsibility |
|---|---|
| `sim/stations.ts` (new) | `StationKind` enum, station lookups from `Derived`, `stationOutput()`, `stationOnline()`, sit/stand helpers, forced stand. |
| `sim/power.ts` (new) | Power step: pool accounting, Engineering bar moves, power failure apply and repair. |
| `sim/console.ts` (new) | `consoleSystem`: Confirm-to-sit arbitration, stick-edge derivation, per-station seated dispatch. |
| `sim/hazards/lifeSupport.ts` (new) | Injection per hazard tick from Life Support level and occupancy (replaces `stub.ts` injection). |
| `sim/hazards/spawner.ts` (renamed from `stub.ts`) | Timer spawner with three hazard types. |
| `sim/medbay.ts` (new) | Per-tick healing of Conscious crew standing in the Medbay room. |
| `sim/interact.ts` | Confirm target gains consoles; power failure becomes an Interact repair target; seated crew are not actors. |
| `sim/crew.ts` | Forced stand on Downed. |
| `sim/step.ts` | Inserts the console, power, Life Support, Medbay steps in the §4 order. |
| `sim/ship/schema.ts`, `starter.json` | Station `kind` validation and starter `allocation`. |
| `sim/state.ts`, `flatten.ts`, `snapshot.ts` | New arrays snapshotted and hashed. |
| `render/hudModel.ts`, `hud.ts`, `crewSprites.ts`, `effects.ts` | Seated panels, power strip, selected-door outline, failed-station overlay. |
| `sim/tuning.ts` | New constants (§8); stub constants removed. |

Step order inside `step()` (foundation §4 rule 4a, filling the reserved slots):

1. `interactSystem` (revive and repair targets as today, **now also Confirm-to-sit**; local door Confirms are collected into the tick's door-toggle set instead of applied here, see §4 and §6)
2. `consoleSystem` (players seated before this tick: stick edges, Confirm, Interact/Cancel to stand; then applies the tick's door-toggle set once)
3. `movementSystem` (skips seated crew)
4. `doorSystem`
5. `powerStep` (applies repairs that completed this tick)
6. hazard tick (12 Hz): `lifeSupportInjection` → `oxygenStep` → `fireStep`
7. `spawner`
8. `medbayStep`
9. `crewSystem` (Downed forces a stand before the run-end check)

Forced stands are not tied to a step: `standUp(state, pid)` is called at the point of the change that makes a station unusable (inside `failStation`, inside the Engineering bar removal that takes a station to level 0, and in `crewSystem` on Downed), so an occupant never stays seated past the step that caused it, wherever in the tick that step runs (the spawner runs after the power step, so a failure spawned there stands its occupant in the spawner step).

## 3. Authoritative state

```ts
// components.ts
export const Seated = { station: [] as number[] };   // station index or -1

// state.ts
stations: {
  level: Uint8Array;      // allocated bars, 0..STATION_MAX[kind]
  failed: Uint8Array;     // 1 while a power failure is unrepaired
  repair: Float64Array;   // 0..1 repair progress of the failure
  occupant: Int8Array;    // PlayerId or -1
  cursor: Int16Array;     // Engineering: a StationKind (the list is in kind order); Doors: index into derived.doorEdges, or -1 when the ship has no doors; others unused (0)
};
power: { capacity: number };                                    // REACTOR_CAPACITY, fixed this increment
stick: { heldDir: Int8Array; repeat: Int16Array };              // per player: 0 none, 1 up, 2 down, 3 left, 4 right; ticks until next repeat
```

`Derived` gains `stationKind: Uint8Array`, `stationRoom: Int16Array`, `stationTile: Int32Array`, `stationOfKind: Int8Array` (kind → index), and `doorEdges: number[]` (edge indices that are doors, ascending). All new arrays are flattened, snapshotted and hashed; `SIM_VERSION` increments to 2 and snapshots of version 1 are rejected (existing rule). `layoutHash` gains each station's kind and allocation, so two ships that differ only in which console sits where, or in the starter budget, are different ships.

`StationKind`: `Navigation = 0, Weapons = 1, Science = 2, Engineering = 3, LifeSupport = 4, Medbay = 5, Doors = 6`. The ship's station `id` strings map onto these kinds; the kind order is also the Engineering list order and the shedding order's future home.

## 4. Control mode

**Sitting (walking mode).** `confirmTarget` now considers consoles as well as doors: the nearest console tile or door tile within `REACH`, ties by lower tile index. `ConfirmKind` gains `Console`. A console is a Confirm candidate only when, besides being within `REACH`, the crew member's centre tile is in the **same room** as the console tile (`roomOfTile` equal), so a console that is near across a wall or a sealed door can never be reached or snapped to from outside; door tiles have room `-1` and therefore never qualify. On a Confirm edge at a console: the station must be **online** (`stationOnline`, §5), unoccupied, and the player Conscious and not seated; a Confirm at an offline console does nothing. If several players Confirm the same console on one tick, the lowest `PlayerId` sits and the others' edges are consumed with no effect. Sitting sets `Seated.station[eid]`, `stations.occupant`, and snaps the crew position to the console tile centre (so the sprite sits on the console and reach rules stay simple). The Confirm edge that seats a player is **consumed**: `consoleSystem` dispatches only for players who were already seated at the start of the tick (`interactSystem` marks the newly seated in a tick-scoped scratch array), so one press can never both sit and act. The cursor resets on sit: Engineering to `StationKind.Engineering`, Doors to `0` (the first entry of `doorEdges`) or `-1` when the ship has no doors.

**Seated.** `movementSystem` ignores a seated crew member's `move`. `interactTarget` returns `None` for a seated player (they cannot repair or revive) and no one can target them for revive (they are Conscious). Standing uses the **edges** `interactPressed` or `cancelPressed` (not `interactHeld`): it clears `Seated.station`, `occupant` and the player's stick state, and leaves the player at the console tile centre. Precedence within one tick for a seated player: a stand edge wins and the tick's Confirm and stick edges are ignored; otherwise stick edges are processed before Confirm.

**Stick edges** (foundation §5 "Stick edges"), computed in `consoleSystem` for seated players only; `stick.heldDir` and `stick.repeat` are reset to 0 on sit and on stand:

- Take the dominant axis of `(moveX, moveY)`. If its magnitude is below `STICK_EDGE_THRESHOLD` (0.5), `heldDir = 0`, no edge.
- Otherwise the direction is `up/down/left/right`. If it differs from `heldDir`, fire one edge now and set `repeat = STICK_REPEAT_TICKS` (8). If it equals `heldDir`, decrement `repeat`; at 0 fire an edge and reset to 8.
- Equal magnitudes on both axes count as horizontal (a deterministic tie rule).

**Forced stand.** A station's occupant stands whenever the station stops being online: `failStation` (any step that calls it, including the spawner) and the Engineering `−1` that takes a station to level 0 both call `standUp(state, pid)` immediately; `crewSystem` stands a crew member that becomes Downed. Engineering can therefore unseat another player by cutting their console's last bar; that is intended.

**Per-station seated behaviour** (this increment):

| Station | Edges | Confirm |
|---|---|---|
| Engineering | up/down move `cursor` over the seven kinds in `StationKind` order (wrapping); the selected station is `stationOfKind[cursor]`; right: `+1` bar to it if `pool > 0`, `level < STATION_MAX[kind]`, and not failed; left: `-1` bar from it if `level > 0`, except Engineering never below 1 (a `−1` that reaches 0 stands that station's occupant) | nothing (coolant arrives in 2b) |
| Doors | any direction cycles `cursor` through `doorEdges` (up/left previous, down/right next, wrapping); no-op when `cursor` is `-1` | adds `doorEdges[cursor]` to the tick's door-toggle set (§6); no-op when `cursor` is `-1` |
| Life Support, Medbay, Navigation, Weapons, Science | ignored | ignored |

`pool = capacity − Σ level`. Engineering's own level is part of the sum and its reserved bar is simply `STATION_MAX[Engineering] = 1` plus the never-below-1 rule.

## 5. Power

- `stationOnline(i) = !failed[i] && level[i] > 0`.
- `stationOutput(i) = (level[i] / STATION_MAX[kind]) × lerp(OUTPUT_SLOW, OUTPUT_FAST, (skillLevel() + 10) / 20)`; with skill 0 this is `level/max × 0.5 × (slow+fast)`. `skillLevel(pid, skill)` is a stub returning 0, in `sim/skills.ts`, so Increment 3 replaces one function.
- **Power failure** (`failStation(state, i)`): sets `failed = 1`, `repair = 0`; for every kind except Engineering, `level` goes to 0 (bars return to the pool). Engineering keeps its `level` number while failed but is offline: `consoleSystem` refuses bar moves while Engineering is failed, so allocations freeze. The occupant is forced to stand.
- **Repair**: `interactTarget` gains `TargetKind.Power` for a failed station whose tile is within reach; priority stays revive > fire > breach > power (ties by tile index). Progress adds across repairers at `1 / REPAIR_TIME_POWER` per second each. At 1: `failed = 0`. Engineering kept its bar while failed (its level is never returned to the pool, see above), so it simply comes back online at that level, which is at least 1: this is the foundation's guarantee that recovery can never deadlock on zero bars, and the pool is never touched by a repair. Any other station returns online at `level = 0` and must be reallocated by Engineering.
- Two failures cannot target the same station; the spawner picks among non-failed stations.

## 6. Station behaviours

- **Life Support** (hazard tick): for each non-breached room `r`, `injection[r] = INJECT_FRAC × volume[r] × HAZARD_DT × stationOutput(LS) × (occupied ? 1 + LS_SEATED_BONUS : 1)`; zero everywhere when offline. `oxygenStep` keeps its clamp to `volume − mass − net inflow` and its counters, so the mass-balance tests stay valid. `stubInjection` and `STUB_INJECT_FRAC` are deleted.
- **Medbay** (every tick): for each Conscious crew member whose centre tile is in the Medbay room, `health += MEDBAY_HEAL × DT × stationOutput(Medbay) × (occupied ? 1 + MEDBAY_SEATED_BONUS : 1)`, clamped to `HEALTH_MAX`; Downed and Dead crew are untouched; nothing when offline. The occupant is in the room and heals too.
- **Doors**: local Confirms at a door (from `interactSystem`) and remote Confirms (from a seated Doors operator) both add the door edge to one **tick-scoped door-toggle set**; at the end of `consoleSystem` each edge in the set is passed to `toggleSeal` exactly once, in ascending edge order. So a local and a remote press on the same door in one tick toggle it once, like two local presses do today, and the deferred-while-occupied rule is shared. An offline Doors console cannot be sat at (§4), so there is no remote control while offline; local sealing is unaffected.
- **Navigation, Weapons, Science**: seatable, draw bars, no effect.

## 7. Spawner

`spawner.ts` replaces `stub.ts`: same jittered timer and cap, with three types drawn from `state.rng.director` by weight `SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1 }`; the target (room, site or station) is drawn from `state.rng.hazards` as today. A power failure picks a uniformly random non-failed station (Engineering included). `activeHazardCount` counts fires, breaches and failed stations; when the cap is reached the spawn is skipped. If the drawn type has no valid target the spawn is skipped (no fallback to another type, keeping the RNG draw sequence simple).

## 8. Tuning (first pass, all hypotheses)

```ts
REACTOR_CAPACITY = 10
STATION_MAX = [2, 3, 2, 1, 3, 2, 1]        // by StationKind: Nav, Wpn, Sci, Eng, LS, Med, Doors (sum 14)
starter allocation (ship data) = [1, 2, 1, 1, 2, 1, 1]   // 9 bars, one spare
OUTPUT_SLOW = 0.5, OUTPUT_FAST = 1.0
INJECT_FRAC = 0.06            // per second of room volume at full output; ×0.5 at skill 0 and level 2/3 ≈ the old stub's 0.03 at the starter allocation
LS_SEATED_BONUS = 0.5
MEDBAY_HEAL = 4               // health per second at full output
MEDBAY_SEATED_BONUS = 0.5
REPAIR_TIME_POWER = 6
STICK_EDGE_THRESHOLD = 0.5
STICK_REPEAT_TICKS = 8
SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1 }
```

`SPAWN_FIRST`, `SPAWN_INTERVAL`, `SPAWN_JITTER`, `SPAWN_CAP` stay; `SPAWN_FIRE_WEIGHT` and `STUB_INJECT_FRAC` go. The `FIRE_DAMAGE` comment "no healing exists" is updated.

## 9. Ship data and validation

`stations[]` entries keep `id`, `room`, `tile` and gain `allocation: number` (a non-negative **integer**, `z.number().int()`). Validation adds: every `id` is one of the seven kind names (`navigation, weapons, science, engineering, lifeSupport, medbay, doors`); each appears exactly once; `0 ≤ allocation ≤ STATION_MAX[kind]`; `allocation[engineering] ≥ 1`; `Σ allocation ≤ REACTOR_CAPACITY`. A ship with no door edges is valid; the Doors console then has a `-1` cursor and its panel reads `No doors`. Failures are zod messages at load like today. `layoutHash` includes station kinds and allocations (§3).

## 10. Input, HUD and rendering

- **Input/app:** unchanged. `Intent` keeps its six fields.
- **HUD model** (`hudModel.ts`, pure): `HudPlayer` gains `seated: StationKind | null` and `console: EngineeringPanel | DoorsPanel | null`, where `EngineeringPanel = { rows: { kind, level, max, failed }[]; cursor: number; pool: number }` and `DoorsPanel = { doorIndex: number; rooms: [string, string] } | { doorIndex: -1 }` (rendered as `No doors`). The ship block gains `power: { capacity: number; used: number }` and `stations: { kind; level; max; online; occupant: number | null }[]`. Prompts: Confirm at a console reads `Sit: <station>`; seated players show `Stand` on the Cancel glyph; the Interact prompt gains `Repair power` with `icon.power`, and the player's progress bar shows power-repair progress exactly as it shows fire and breach repair. The threat list gains one `HudThreat` per failed station: `{ icon: 'icon.power', text: 'Power: <station>' }`, after fires and breaches.
- **Pixi HUD:** a seated player's row expands into a panel under it (same nine-slice): Engineering draws one row per station with `max` bar cells (`ui.bar.fill` for allocated, `ui.bar.bg` for empty, `WARN` tint when failed) and a `>` cursor glyph; Doors draws `Door <A>-<B>`. A ship-wide strip at the top right lists each station's bars and `OFF` when offline. Reuses Task 11 helpers; no new art names are required (`icon.power` is already in the name contract).
- **Ship view:** seated crew use `crew.sit` when present, else the idle frame facing the console; the Doors cursor's door tile gets a tinted outline rectangle in `effects.above`; a failed station's tile shows the `fx.arc` animation when present, else a yellow 16 px square, through `featureReady`.

## 11. Testing

All under node, no pixi. New files: `tests/console.test.ts`, `tests/power.test.ts`, `tests/stick.test.ts`, `tests/lifeSupport.test.ts`, `tests/medbay.test.ts`; extensions to `tests/interact.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/ship.test.ts`.

- **Scripted-intent test per station** (the 2a gate): walk to the console (or spawn adjacent in a fixture), Confirm sits, edges/Confirm change state as §4 says, Cancel stands; Engineering: move a bar, refuse past max, refuse on empty pool, refuse Engineering below 1, cursor wraps; Doors: remote seal toggles the cursor door and defers while occupied; inert three: sit, hold a direction for 30 ticks, press Confirm, stand; then assert explicitly that `stations.level`, `stations.failed`, `doors.state`, `rooms.o2` injection counters and every other player's position equal those of a control run in which the same player walks to the console tile and waits the same ticks without sitting, and that the player's own state ends with `Seated.station = -1`, `occupant = -1`, `heldDir = repeat = 0` and position at the console tile centre (whole-hash equality is not used: sitting legitimately rewrites seating and stick state).
- **Power:** failure returns bars for non-Engineering, freezes Engineering; repair restores Engineering to 1 and others to 0; a failure produced through the real `spawner` inside `step()` stands the occupant in that same tick; Engineering cutting a station to level 0 stands its occupant; a Confirm at a failed or level-0 console does not sit; Downed occupant stands; two Confirms on one console seat the lower pid; the seating Confirm is consumed (a Doors sit does not toggle a door that tick); a local and a remote Confirm on the same door in one tick toggle it once.
- **Stick edges:** one edge on crossing, repeat every 8 ticks, none below threshold, dominant axis, immediate edge on direction change, reset on stand.
- **Life Support:** injection scales with level, zero at level 0 and when failed, seated bonus, breached rooms excluded; mass-balance tests unchanged and green.
- **Medbay:** heals only in the room, only Conscious, scales with level, clamped at max.
- **Spawner:** three types by weight (seeded), skip at cap, skip when no target.
- **Snapshot and hash:** round trip covers the new arrays; the same-seed/same-intents property holds with a script that sits, moves bars and stands.
- **Ship validation:** each new rule has a failing fixture, including a fractional allocation and an unknown station id; a fixture with no doors loads and the Doors console sits with cursor `-1`.
- **Golden replay:** re-recorded once (`npm run bless`) in its own commit, because replacing the stub injector changes oxygen history. This is the one deliberate exception to the no-rebless rule and is noted in `.superpowers/sdd/progress.md`.

## 12. Gate

Added to `docs/gates.md` as "Increment 2a-i":

- The scripted-intent, power, stick, Life Support, Medbay, spawner, snapshot and validation tests pass; typecheck and build pass.
- Manual, two players: each of the seven consoles can be sat at and left; a bar is moved in Engineering and the strip reflects it; a power failure appears, is repaired, and Engineering comes back at level 1; a door is sealed from the Doors console and the outline matches; a hurt crew member heals in the Medbay.
- Manual, solo: five minutes survived against the spawner with Life Support manned at level 2.

## 13. Open questions deferred

- Shedding order, bonus bars and the Doors skill passage bonus: Increment 3.
- Whether `Confirm` at Engineering should instead toggle a "lock" on a station is left to 2b, where Confirm takes the coolant role.
