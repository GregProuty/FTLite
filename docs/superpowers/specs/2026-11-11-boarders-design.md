# Boarders (Boarders-i) — Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 7); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §1 (sub-project 3, boarders and crew-vs-crew combat), §5 Crew (the Combat skill "has no source of XP or effect in the Foundation, because there are no enemies until boarders"), §5 Crew lifecycle, §5 Stations (Doors, Medbay). Builds on 3-i (skills and XP), 4-i (director stress and attendance), 4-ii (telemetry), Combat-i/ii (the enemy; its tuning fallbacks). This is the first and, for the ten-feature run, the only boarders feature.

## 1. Goal

Put enemies **inside the ship**. A **boarding party** of two boarders arrives in a room on a schedule. Boarders are room-level agents: each occupies a room, fights any Conscious crew member there, hunts through unsealed doors toward crew when a room is empty, and sabotages a console when left alone. Crew fight back by **holding Interact** in the boarder's room (a new, highest-priority Interact target), with damage dealt and damage taken scaled by the **Combat** skill, which finally earns XP. **Doors** become a containment tool: a sealed door stops a boarder; the Doors console and local seals already exist. The **Medbay** is the recovery loop: it heals the survivors, unchanged. A dead boarder vanishes; a downed crew member is revived as today. No RNG is drawn in a fight (damage is deterministic per tick), so a melee is reproducible from the replay without new streams.

**Out of scope:** boarders as tile-walking sprites (they are drawn as a room marker), boarders breaking sealed doors, boarders affected by fire or oxygen, boarder weapons or ranged fire, a crew sidearm, boarders tied to the enemy ship's presence, loot, more than one party aboard at a time.

## 2. Decisions taken (recommended options)

| Question | Options considered | Decision |
|---|---|---|
| Where a boarder is | (a) a tile-walking entity with pathing; (b) a **room index** with a move timer; (c) attached to a crew member | **(b)**: the room graph (`derived.edgeA/edgeB`, `edgeIsDoor`, `doors.state`) already exists, movement is one deterministic choice every `BOARDER_MOVE` seconds, and sealing a door blocks it for free. |
| Combat resolution | (a) hit rolls from `rng.combat`; (b) **deterministic damage per tick** | **(b)**: no new draws, melee replays exactly, skill shows as a rate. |
| Who a boarder attacks | the Conscious crew member in its room with the **lowest pid** (deterministic focus), `BOARDER_DPS` per second reduced by the target's Combat defence | A focused boarder is dangerous and legible; two crew in the room split nothing but both can hit it. |
| How crew fight | a new Interact target `Fight` (the boarder in the player's room with the lowest `StableId`), **above Revive** in priority; holding Interact deals `CREW_MELEE_DPS × (1 + COMBAT_GAIN × level)` per second; seated crew do not fight | A boarder in the room is the most urgent thing in it. |
| Combat XP | `XP_RATE` per second of fighting (the Repair pattern) plus `XP_PER_KILL` to the crew member whose damage killed the boarder | Combat gets its source of XP. |
| Hunting | every `BOARDER_MOVE` (8 s) a boarder whose room has no Conscious crew moves through an **unsealed door** (closed or open) to the adjacent room with Conscious crew (lowest room index among them), else to a uniform random adjacent unsealed room (`rng.hazards`), else stays; a boarder in a room with Conscious crew stays and fights (its move clock re-arms) | Sealed doors contain; the crew can fort up. |
| Sabotage | a boarder alone in a room (no Conscious crew) with an **online** console for `BOARDER_SABOTAGE` (15 s) continuous fails that station once (`failStation`, the existing power-failure hazard, repaired as today); the timer resets when it moves | A contained or ignored boarder still costs something. |
| Arrival | `BOARDING_FIRST` (240 s) then `BOARDING_COOLDOWN` (180 s) × jitter after the last boarder dies, only while **no** boarder is aboard; the party of `BOARDING_PARTY` (2) lands in one uniform random room (`rng.hazards`); the jitter is one `rng.director` draw | One party at a time; thematically a boarding pod, independent of the enemy ship so it can be tested alone. |
| Director | `STRESS_WEIGHTS.boarder` (0.35) per boarder aboard; a boarder with no Conscious crew in its room is **unattended**; boarders do not count toward the spawn cap (`activeHazardCount` unchanged) | Boarders are pressure, not a spawn. |
| HUD | threat row `Boarders: <room> x2` (`icon.sensors`); player prompt `Fight boarder` with the boarder's health fraction as the progress bar (it drains); a hostile **marker** drawn at the boarder's room centre in the world view (a Graphics diamond, no new asset) | No new panel, no new art. |
| Bot | the bot already holds Interact when it has a target, so it fights a boarder in its room; it also walks toward rooms with boarders after downed teammates and before fires | The survival gate's crew must respond or it cannot pass. |
| Survival gate levers (pre-authorised, per the Combat-ii review) | before the single golden re-bless, in order: (1) `DEBRIS_CREW_DAMAGE` 20 → 15 (shared by debris and enemy shots today); (2) a separate `ENEMY_SHOT_CREW_DAMAGE` 12 (shots stop sharing the debris value); (3) `BOARDING_FIRST` 240 → 330 (past the five-minute window); (4) `BOARDER_DPS` 6 → 4 | Seed 2's crew margin is 0.1 health going in; boarders add crew damage; the levers are ordered from "fix the known thin margin" to "soften the new feature". |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/boarders.ts` (new) | `BOARDER_SLOTS` table helpers (`activeBoarderCount`, `boardersInRoom`, `boarderTarget(state, pid)`), `arriveParty`, `moveBoarder`, `boarderSystem(state)` (arrival, per-boarder fight/sabotage/move), `damageBoarder(state, slot, amount, pid)` (kill handling, XP, telemetry), `roomCentre(state, room)` (for the marker), `combatDps(level)`, `combatDefence(level)`. |
| `sim/interact.ts` | `TargetKind.Fight` (above Revive); the fight branch adds crew damage to the boarder and sets `activeThisTick`; Combat XP. |
| `sim/director.ts` | `rawStress += w.boarder × activeBoarderCount`; `anyUnattended` adds boarders with no Conscious crew in their room. |
| `sim/step.ts` | `boarderSystem` runs after `debrisSystem` and before `medbayStep` (so a boarder's damage this tick is healed by the Medbay this tick like fire damage is, and the crew lifecycle sees the final health). |
| `sim/bot.ts` | goal tiles of rooms with boarders, after downed teammates and before fires. |
| `sim/telemetry.ts`, `acceptance.ts` | `telemetry.boardings`, `telemetry.boardersKilled`; record `boarders: { parties, killed }`; column `boarders` = `parties/killed`. |
| `sim/state.ts`, `flatten.ts`, `tuning.ts` | the `boarders` block, `SIM_VERSION = 12`, the constants in §8. |
| `render/hudModel.ts`, `hud.ts` | threat row, `Fight boarder` prompt and progress; `HudModel.boarders: { stableId: number; x: number; y: number; health: number }[]` for the marker. |
| `render/crewSprites.ts` (or a sibling `boarderMarkers.ts`) | draws one diamond per `HudModel.boarders` entry at world position; pixi only, covered by the manual gate; the positions come from the pure `roomCentre`. |

## 4. Authoritative state

```ts
boarders: {
  active: Uint8Array;        // BOARDER_SLOTS
  stableId: Int32Array;      // 0 while inactive
  room: Int16Array;          // room index
  health: Float64Array;      // 0..BOARDER_HEALTH
  nextMoveTick: Int32Array;  // when the boarder may move if its room is empty of Conscious crew
  aloneSince: Int32Array;    // tick the boarder was last seen alone in its current room, -1 while not alone or already sabotaged here
  nextArrivalTick: number;   // BOARDING_FIRST x TICK_HZ at creation; re-armed when the last boarder dies
};
telemetry.boardings: number; telemetry.boardersKilled: number;
```

Flattened in a `boarders` manifest section after `enemy`: `nextArrivalTick`, then the six arrays in the order above (`BOARDERS_FIELDS = 1 + 6 × BOARDER_SLOTS`); the two telemetry scalars after `enemyDisables` (`TELEMETRY_SCALARS = 15`). `SIM_VERSION` becomes 12; version-11 snapshots are rejected. Initial values: all 0, `aloneSince` all −1, `nextArrivalTick = BOARDING_FIRST × TICK_HZ`.

## 5. Rules

**Per tick** (`boarderSystem`, after `debrisSystem`, before `medbayStep`):

1. **Arrival.** If `activeBoarderCount === 0` and `tick >= nextArrivalTick`: draw the room `nextInt(rng.hazards, roomCount)` (one draw); for each of `BOARDING_PARTY` free slots in ascending slot order: `active 1`, `stableId = nextStableId++`, `room`, `health = BOARDER_HEALTH`, `nextMoveTick = tick + BOARDER_MOVE × TICK_HZ`, `aloneSince = -1`; `telemetry.boardings += 1`. `nextArrivalTick` is left as is (it is re-armed on the last death). The party lands in one room, including a room with crew: the fight starts at once. Return after an arrival (no move or sabotage on the arrival tick).
2. **For each active boarder in ascending slot order:**
   - Let `targets` be the Conscious crew members whose `roomAt` equals the boarder's room.
   - If `targets` is non-empty: **fight**: the lowest-pid target loses `BOARDER_DPS × DT × (1 − combatDefence(level))` health (clamped at 0; at 0 `downCrew` as debris does); `nextMoveTick = tick + BOARDER_MOVE × TICK_HZ`; `aloneSince = -1`.
   - Else: if `aloneSince < 0` set `aloneSince = tick`; if the room has an **online** station (`stationRoom === room && stationOnline`) and `tick − aloneSince >= BOARDER_SABOTAGE × TICK_HZ`: `failStation(that station)` (the lowest station index in the room) and `aloneSince = -1` (one sabotage per visit; it becomes eligible again after it moves and returns). Then if `tick >= nextMoveTick`: **move** (below) and `nextMoveTick = tick + BOARDER_MOVE × TICK_HZ`.
3. **Move:** candidates are the rooms adjacent through a door edge (`edgeIsDoor`) whose `doors.state !== Sealed`, in ascending edge index with duplicates removed, excluding the current room. If any candidate contains a Conscious crew member, move to the lowest such room index (no draw). Else if candidates are non-empty, move to `candidates[nextInt(rng.hazards, candidates.length)]` (one draw). Else stay (no draw). Moving sets `aloneSince = -1`.

**Crew fighting** (`interactSystem`, step 1 of the tick): `interactTarget` returns `{ kind: Fight, index: slot }` for the active boarder in the player's room with the lowest `StableId`, **before** the Revive check; everything else is unchanged. A holder with a Fight target deals `combatDps(skillLevelOf(pid, Combat)) × DT` to that boarder through `damageBoarder(state, slot, amount, pid)`, gains `XP_RATE × DT` Combat XP and sets `scratch.activeThisTick[pid] = 1` (fighting is activity for telemetry). Several holders add their damage in pid order; once the boarder is dead later holders in the same tick see `active 0` and `continue` (as repairs do). A seated or non-Conscious player has no target (as today).

`damageBoarder(state, slot, amount, pid)`: `health = max(0, health − amount)`; at 0: `active 0`, `stableId 0`, `telemetry.boardersKilled += 1`, `addXp(pid, Combat, XP_PER_KILL)`; if no boarder remains, one `rng.director` draw arms `nextArrivalTick = tick + round(BOARDING_COOLDOWN × TICK_HZ × (1 + BOARDING_JITTER × (2u − 1)))`.

`combatDps(level) = CREW_MELEE_DPS × (1 + COMBAT_GAIN × level)`; `combatDefence(level) = COMBAT_DEFENCE × level` (0.4 at level 10).

**Director:** `rawStress` gains `w.boarder × activeBoarderCount`; `anyUnattended` returns true for an active boarder whose room has no Conscious crew member. `activeHazardCount` is unchanged.

**Interactions kept simple:** boarders ignore fire, oxygen, breaches and debris; they are not healed; they do not open or close doors (a closed door is passable to them as it is to crew; a sealed one is not); they never attack Downed or Dead crew (they move on); a boarder in the Medbay room fights crew there like anywhere else. The run-end rules are unchanged (a boarder downing the last Conscious crew member ends the run through `crewSystem`).

## 6. Bot

`goalTiles`: after the downed-teammate goals and before the fire goals, add every tile of every room that holds an active boarder. The bot already holds Interact whenever `interactTarget` is not `None`, so on arrival it fights. (It will also walk into a boarder's room on purpose; that is the intended "crew defends the ship" behaviour and what the survival gate measures.)

## 7. HUD and render

- Threat rows (after the enemy row, before fires): one per room with boarders, `Boarders: <room> x<n>` with `icon.sensors`, rooms in ascending index.
- Player panel: with a Fight target, `interactPrompt = 'Fight boarder'`, `interactIcon = null`, `progress = boarder health / BOARDER_HEALTH` (the bar drains as the boarder weakens). The Combat skill line already shows `C<level>`.
- `HudModel.boarders: { stableId: number; x: number; y: number; health: number }[]` built from `roomCentre(state, room)` (the mean of the room's tile centres, `floor`-free: `Σ(tx + 0.5) / n`, `Σ(ty + 0.5) / n`) plus a slot offset `(slot − 1.5) × 0.4` on x so two boarders in one room do not overlap; `health` is the fraction.
- Render: the crew layer draws one red diamond (Graphics, 10 px) per entry at the world position; no asset, no animation (manual gate).

## 8. Tuning (first pass, all hypotheses)

```ts
SIM_VERSION = 12
BOARDER_SLOTS = 4
BOARDING_FIRST = 240, BOARDING_COOLDOWN = 180, BOARDING_JITTER = 0.2   // seconds
BOARDING_PARTY = 2
BOARDER_HEALTH = 60
BOARDER_DPS = 6                 // to the focused crew member, before Combat defence
CREW_MELEE_DPS = 8              // at Combat level 0
COMBAT_GAIN = 0.06              // dps x (1 + gain x level): x1.6 at level 10
COMBAT_DEFENCE = 0.04           // damage taken x (1 - defence x level): x0.6 at level 10
BOARDER_MOVE = 8                // seconds between moves while the room is empty
BOARDER_SABOTAGE = 15           // seconds alone with an online console before it fails
XP_PER_KILL = 20                // Combat XP to the killer
STRESS_WEIGHTS.boarder = 0.35
```

Worked numbers (level 0): one crew member kills a boarder in 60 / 8 = 7.5 s (450 ticks) and takes 6 × 7.5 = 45 health doing it; two crew members kill it in 3.75 s and the focused one takes 22.5; a party of two costs a lone fighter 90 health, so a solo fight is a near-death and a pair fight is the design. A crew member who stands in a room with two boarders and does nothing loses 12 health per second and is Downed in about 8 s. The Medbay (4 health per second at full output) restores a 45-health loss in about 11 s. Sealing a door costs nothing and buys as long as the seal holds. In the five-minute survival gate the first party lands at 4:00 with the crew already worn by the enemy; the pre-authorised levers (§2) exist for that.

## 9. Testing

All under node, no pixi. New `tests/boarders.test.ts`; extended `tests/interact.test.ts` (or the new file), `tests/director.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/gate-survival.test.ts` (figures re-recorded, a `boardings >= 1` assertion when the first party falls inside the window). Helpers: `placeBoarder(state, room, health = BOARDER_HEALTH): slot` (no draw; fresh `StableId`; `nextMoveTick = tick + BOARDER_MOVE × TICK_HZ`, `aloneSince −1`); crew placement with `teleport` into a room's tile centre (room A: `(2.5, 2.5)`, room G: `(2.5, 9.5)`, as the existing tests use).

- **Arrival (unit, `boarderSystem` called directly):** nothing at `BOARDING_FIRST × TICK_HZ − 1`; at `BOARDING_FIRST × TICK_HZ` with `rng.hazards.s = 7`: two boarders in slots 0 and 1, both in `nextInt(createRng(7), roomCount)`, consecutive `StableId`s, `health 60`, `nextMoveTick = tick + 480`, `aloneSince −1`, `boardings 1`, hazards advanced exactly once, director unchanged; with a boarder already aboard no arrival happens even past `nextArrivalTick`; after the last boarder dies `nextArrivalTick = tick + round(180 × 60 × jitter(u))` for a pinned director float, and the next party arrives then with new ids and `boardings 2`.
- **Fight (through `step()`, `quiet`, enemy silenced with `enemy.nextArrivalTick = 1e9`, boarding silenced with `boarders.nextArrivalTick = 1e9` where the fixture places its own boarder):** a Recruit standing in room G with `placeBoarder(G)` and `interactHeld` for 450 ticks: the boarder is dead on tick 450 (`active 0`, `boardersKilled 1`), the crew member's health is `100 − 6 × 7.5 = 55` (to one decimal), Combat XP is `7.5 × XP_RATE + XP_PER_KILL` (to one decimal); without `interactHeld` the crew member loses 6 per second and the boarder keeps 60; two crew members holding Interact kill it in 225 ticks and only pid 0 loses health (22.5); a Combat level-10 crew member (`setSkill`) kills it in `ceil(60 / 12.8 / DT)` ticks and loses `6 × 0.6` per second; `interactTarget` with a boarder and a Downed teammate in the room returns Fight (priority), and Revive once the boarder is dead; a seated crew member in the boarder's room is attacked but has no Fight target (and is **not** stood up by the attack; standing is only for Downed); the focused target is the lowest pid; a Downed crew member in the room is ignored (a Conscious teammate elsewhere is not attacked either: the boarder moves on); `scratch.activeThisTick` is set for a fighter (telemetry `idleRun 0`); the boarder's damage happens in `boarderSystem` after the crew's blow, so a boarder killed this tick deals no damage this tick (assert the health on the killing tick).
- **Movement (unit, `boarderSystem` at chosen ticks):** a boarder alone in room A with the crew in an adjacent room moves to that room exactly at `nextMoveTick` (not before), with no draw, and `nextMoveTick` advances by 480; with no crew adjacent and two unsealed candidates it draws once from hazards and lands on `candidates[nextInt]` (pin hazards 7 and compute); with every door of its room Sealed (`toggleSeal` or `doors.state[e] = Sealed`) it stays, draws nothing, and `nextMoveTick` still advances; a closed (unsealed) door is passable; the crew in the room keeps it there (`nextMoveTick` re-armed every tick).
- **Sabotage:** a boarder alone in room A (Navigation online, Doors online) for 15 s fails the lowest station index in A at exactly `aloneSince + 900` (not one tick before), once (`aloneSince −1` afterwards, the second station in the room is untouched after 60 more seconds); a boarder alone in a room with no online station never sabotages; a Conscious crew member entering the room resets `aloneSince` (−1) and leaving restarts it from the current tick; after moving out and back the boarder can sabotage the room again (the repaired station).
- **Director:** `rawStress` with two boarders alone is 0.70; `anyUnattended` true with a boarder in an empty room, false with a Conscious crew member in it; `activeHazardCount` unchanged by boarders.
- **Snapshot and hash:** round trip of every boarder field and the two counters with non-default values; each alone changes the hash; version-11 rejection; **continuation:** a run saved mid-fight (crew holding Interact via the bot, boarder at 30 health, `nextMoveTick` ahead) continues to the kill and the cooldown re-arm with hash equality, asserting the kill happened in the continued stretch.
- **Bot:** with a boarder in room G and the bot in room A, `botIntent` moves toward G (the first step is toward G's door); in the room it returns `interactHeld`.
- **HUD:** the threat row text and icon for one room with two boarders and for two rooms; the player prompt `Fight boarder`, `interactIcon null`, `progress 0.5` for a boarder at 30; `HudModel.boarders` entries with `roomCentre` positions and the slot offsets; empty when none.
- **Telemetry and acceptance:** `boardings`/`boardersKilled` into `boarders: { parties, killed }`; the column `boarders` (`1/2`); fixtures updated (`rec()`, regexes, the exact record).
- **Survival gate (seeds 1 to 3, two bots):** run first as a baseline before any boarder code (record it); after the feature, the same assertions plus `boardings >= 1` when `BOARDING_FIRST < 300`; record min hull, min crew health, boardings and `boardersKilled` per seed; if a seed fails apply the §2 levers in order before the single golden re-bless, re-running after each; treat min crew health below 5 on any seed as a recorded tuning item for the next feature.
- **Combat gate (new, in `tests/boarders.test.ts`):** two Recruits in room G, `placeBoarder(G)` twice, both holding Interact via `step()`: both boarders dead within 15 s (`boardersKilled 2`), both crew Conscious, pid 0's health above 0 (it took the focus); record the final health.
- **Golden replay:** re-blessed once (version 12; the two-minute replay has no boarding at 240 s, so only the new fields change the hashes) with the cause recorded.

## 10. Gate

Added to `docs/gates.md` as "Boarders-i":

- [x] `npm test` passes (the bullets above); the golden replay re-blessed once (version 12).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 (baseline before the feature and figures after, recorded; levers taken listed).
- [x] Combat gate: two Recruits kill a party of two inside 15 s with no one Downed.
- [x] `npm run acceptance 5 1`, dated, three rows with the `boarders` column.
- [ ] Manual, two players (`npm run dev`): at 4:00 `Boarders: <room> x2` appears and two red diamonds sit in that room; walking in shows `Fight boarder` with a draining bar and the crew member's health falls; sealing the room's doors from the Doors console keeps the party in; after 15 s alone in a room with a console that console reads `Power: ...` in the threats; the Medbay heals the fighters afterwards; `C` on the panel rises after a few fights. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## 11. Open questions deferred

- Boarders breaking sealed doors, taking fire or oxygen damage, or being affected by Medbay rooms: Boarders-ii, if the playtest asks.
- Boarders tied to the enemy ship (teleport-ins during an encounter) and a crew sidearm: later.
- Carrying or dragging a Downed crew member out of a fight: deferred since the foundation.
