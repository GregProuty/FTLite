# Skills and XP (Increment 3-i) — Design

Status: approved 2026-11-10 under the autonomous feature loop (`docs/roadmap.md` item 1); every open choice below took the recommended option. Parent: `2026-11-09-foundation-design.md` §5 (Crew, Skill model, Stations table, Power model, Productive predicates), §7, §10, §11 item 3. Builds on everything merged through Increment 2b. Increment 3 is split in two: this half gives crew real skills; **3-ii** adds the four pre-made characters with their Asset and Complication.

## 1. Goal

Replace the `skillLevel()` stub with six real skills per crew member: **Navigation, Engineering, Weapons, Science, Combat, Repair**, each an XP total mapped to an integer level 0 to 10 by a committed threshold table. XP accrues while a crew member is **productive**: seated at a station that is doing useful work (one exact predicate per station), or repairing a hazard. Levels feed every existing formula that already calls `skillLevel` (station output, and through it beam charge and hit, evasion, Science lead and scan, injection, healing, torpedo loading), and three formulas that the earlier increments left at their baseline: cooling per coolant unit, sealed-door leakage, and repair speed. A skilled Engineering operator also brings **bonus power bars** while seated, and when they stand the ship **sheds power** in a fixed order. Combat is defined but has no XP source or effect until boarders (roadmap item 7).

**Out of scope (later features):** the four characters and their skill head starts, Assets, Complications and the game-over skill summary (3-ii); the director's use of productive predicates for idle-console routing (4-i: this increment defines the predicates in one module so 4-i only reads them); perks (sub-project 4).

## 2. Decisions taken (recommended options)

| Question | Decision |
|---|---|
| XP shape | A constant `XP_RATE` per second of productive operation, plus lump XP for the two event-shaped predicates (a Weapons shot, a Navigation evasion roll). |
| Threshold table | Cumulative seconds of productive work: `[0, 240, 600, 1080, 1680, 2400, 3240, 4200, 5280, 6480, 7800]` for levels 0..10 (steps grow by 120 s each). A fully productive 20-minute run (1200 s) reaches level 3, the foundation's "dedicated player, 2-3 levels" target; half-productive reaches level 2. Lump XP (shots, evasion rolls) sits on top and is small (a shot is worth 10 s). |
| Where XP lives | `state.skills.xp` as one `Float64Array(playerCount × 6)`; level is derived by a pure `levelFor(xp)` and never stored. |
| Repair speed | Multiplier `1 + REPAIR_SKILL_GAIN × level` (1.0 at level 0, 1.6 at level 10), so level-0 behaviour and the golden replay are unchanged by the formula itself. |
| Bonus bars | `floor(level / 4)`: 0 at levels 0-3, 1 at 4-7, 2 at 8-10, present only while an Engineering operator is seated and Engineering is online. |
| Shedding | Only when capacity drops below allocation (operator stands, is downed, or Engineering fails or is cut): remove one bar at a time from the lowest-priority station until it fits; order Doors, Medbay, Science, Weapons, Navigation, Life Support, Engineering (never below 1). |
| HUD | The player panel grows by one line showing the six levels as `N1 E0 W2 S0 C0 R3`. |
| Level-up feedback | None in this increment (3-ii's game-over summary shows gains). |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/skills.ts` (rewritten) | `Skill` constants, `STATION_SKILL` map (station kind → skill), `levelFor(xp)`, `skillLevel(state, pid, kind)` (real), `skillLevelOf(state, pid, skill)`, `skillCurve(level)`, `addXp(state, pid, skill, amount)`. |
| `sim/productive.ts` (new) | `isProductive(state, i): boolean` for every station index, per foundation §5; the two tick markers (`lastEngChangeTick`, `lastDoorToggleTick`) and `lsDeliveredTick` are read here. |
| `sim/xp.ts` (new) | `xpSystem(state)`: once per tick, for every online station with a Conscious seated operator, if `isProductive` then `addXp(pid, STATION_SKILL[kind], XP_RATE × DT)`. |
| `sim/interact.ts` | Repair progress multiplied by `repairMult(level)`; Repair XP per tick for each repairer whose target progressed. |
| `sim/weapons.ts`, `sim/debris.ts` | `fireWeapon` grants `XP_PER_SHOT` to the operator's Weapons; the evasion roll grants `XP_PER_EVADE_ROLL` to the Navigation operator. |
| `sim/console.ts`, `sim/power.ts`, `sim/heat.ts` | Successful bar moves and coolant changes stamp `lastEngChangeTick`; a remote door toggle stamps `lastDoorToggleTick`. `powerCapacity(state)` = base + bonus bars; `powerPool` uses it; `shedPower(state)`. |
| `sim/stations.ts` | `standUp` from Engineering (voluntary or forced) calls `shedPower`. |
| `sim/hazards/oxygen.ts` | After applying injection, stamps `lsDeliveredTick` when any room received injection > 0; `passageFor` applies the Doors operator's seal factor. |
| `sim/heat.ts` | `coolingPerUnit` adds `floor(HEAT_COOL_SKILL × level)` of the seated Engineering operator. |
| `sim/state.ts`, `flatten.ts` | `skills` block flattened and hashed; `SIM_VERSION = 6`. |
| `render/hudModel.ts`, `hud.ts` | `HudPlayer.skills: number[6]`; a fourth player-panel line. |

Step order: `interactSystem → consoleSystem → xpSystem → movementSystem → doorSystem → hazard tick → spawner → debrisSystem → medbayStep → crewSystem`. `xpSystem` runs right after seated input, at the **observation point** where this tick's operators are seated and the conditions they are responding to still exist: an impact later in the tick (which may remove the last warned object or down the Navigation operator) and a Medbay heal that finishes the last patient do not erase the tick's XP. The one accepted loss is a shot in `consoleSystem` destroying the last warned object: the Weapons operator gets the shot's lump XP and the Navigation and Science operators miss that single tick (1/60 s). Life Support is the exception: its XP is awarded at the delivery event inside the hazard tick (§5), because delivery is what makes it productive.

## 4. Authoritative state

```ts
skills: {
  xp: Float64Array;              // playerCount x SKILL_COUNT, index pid * SKILL_COUNT + skill
  lastEngChangeTick: number;     // tick of the last successful bar move or coolant change by a seated Engineering operator, -1 none
  lastDoorToggleTick: number;    // tick of the last remote door toggle from the Doors console, -1 none
  lsDeliveredTick: number;       // tick of the last hazard tick on which Life Support injection delivered > 0 somewhere, -1 none
  lastShotTick: number;          // tick of the last shot taken from Weapons, -1 none (director predicate only)
};
```

All flattened (a new manifest section `skills` after `science`: the xp array then the four ticks), snapshotted and hashed. `SIM_VERSION` becomes 6; version-5 snapshots are rejected. `power.capacity` stays the stored base (tests widen it) and bonus bars are derived on top.

```ts
Skill = { Navigation: 0, Engineering: 1, Weapons: 2, Science: 3, Combat: 4, Repair: 5 }; SKILL_COUNT = 6
STATION_SKILL = [Navigation, Weapons, Science, Engineering, Engineering, Science, Engineering]   // by StationKind: Nav, Wpn, Sci, Eng, LS, Med, Doors (foundation section 5)
```

## 5. Levels and XP

- `levelFor(xp)`: the largest `L` with `XP_THRESHOLDS[L] <= xp`, capped at 10. Pure, table-driven, no transcendental maths.
- `skillCurve(level) = OUTPUT_SLOW + (OUTPUT_FAST − OUTPUT_SLOW) × (level + 10) / 20` (the existing shape in `stationOutput`, moved to `skills.ts` and reused).
- `addXp(state, pid, skill, amount)`: `xp += amount`, capped at `XP_THRESHOLDS[10]` (no XP beyond level 10). XP never decreases.
- `skillLevel(state, pid, kind) = levelFor(xp[pid][STATION_SKILL[kind]])` replaces the stub; every existing caller is unchanged.
- **Continuous XP** (`xpSystem`, every tick, after `consoleSystem`): for each station `i` other than Weapons and Life Support with a Conscious occupant `pid`, online, and `isProductive(state, i)`: `addXp(pid, STATION_SKILL[kind], XP_RATE × DT)`.
- **Lump XP:** `fireWeapon` adds `XP_PER_SHOT` to the shooter's Weapons when a shot is actually taken (after the draw, hit or miss); the evasion roll in `resolveImpact` adds `XP_PER_EVADE_ROLL` to the Navigation operator's Navigation whether or not it evades.
- **Life Support XP** (event, inside `oxygenStep` on the hazard tick): when the clamped injection applied this step sums to more than 0 and Life Support has a Conscious seated operator at that moment, `addXp(operator, Engineering, XP_RATE × HAZARD_DT)`. An operator who sits after a delivery earns nothing from it; unmanned delivery earns nobody anything. The same step stamps `lsDeliveredTick` for the director's predicate.
- **Repair XP** (`interactSystem`): each repairer whose fire, breach or power repair progressed this tick gains `XP_RATE × DT` Repair XP; repairing nothing (target already repaired by an earlier holder this tick) gains nothing. Revive gives no XP.
- Combat has no source.

## 6. Productive predicates (`isProductive(state, i)`)

Evaluated for a station with a seated Conscious operator and online (callers check these first; the predicate assumes them). From foundation §5, made exact:

| Station | Productive when |
|---|---|
| Navigation | at least one active, warned debris object exists |
| Weapons | never continuously (XP comes from shots; the director reads "a shot fired in the last `PRODUCTIVE_WINDOW_TICKS`" from `lastShotTick`, stamped by `fireWeapon`) |
| Science | `science.scanning === 1` with a cursor on an active, warned, unscanned object, **or** at least one active, warned debris object exists |
| Engineering | any station `isOverdriven`, **or** `bonusBars > 0 && powerUsed > power.capacity` (bonus bars cover a shortfall), **or** `recent(lastEngChangeTick, PRODUCTIVE_WINDOW_TICKS)` |
| Life Support | `recent(lsDeliveredTick, HAZARD_EVERY + 1)` (injection delivered on the current or previous hazard tick; used by the director, not for XP, which is awarded at the delivery event) |
| Medbay | any Conscious crew member in the Medbay room with health below `HEALTH_MAX` |
| Doors | any room burning or any active breach, **or** `recent(lastDoorToggleTick, PRODUCTIVE_WINDOW_TICKS)` |

`PRODUCTIVE_WINDOW_TICKS = 5 × TICK_HZ` (300). Every stamp comparison is `stamp >= 0 && tick − stamp < window` (a stamp of −1 is never recent, including at tick 0). The "changes count at most once per 5 s" clause of the foundation is satisfied by construction: the window is a stamp, so repeated changes extend it rather than stack. Stamps: `shiftBar` returning true and `cycleCoolant` returning true inside Engineering input set `lastEngChangeTick = tick`; `doorsInput` on Confirm with a valid cursor sets `lastDoorToggleTick = tick` (local door toggles do not). `oxygenStep` sets `lsDeliveredTick = tick` when the sum of clamped injection applied this step is > 0.

## 7. Skill effects

- **Station output:** unchanged formula, now with real levels.
- **Repair speed:** progress per second becomes `repairMult(level) / REPAIR_TIME_X` with `repairMult(level) = 1 + REPAIR_SKILL_GAIN × level` (`REPAIR_SKILL_GAIN 0.06`: 1.6× at level 10). Applies to fire, breach and power repairs. Revive time is unchanged.
- **Cooling per unit:** `coolingPerUnit = HEAT_COOL_UNIT + floor(HEAT_COOL_SKILL × level)` of the seated Engineering operator's Engineering level, baseline when unseated (`HEAT_COOL_SKILL 0.2`: +1 at level 5, +2 at level 10, so a level-5 engineer holds an overdrive with one unit).
- **Sealed doors:** `passageFor` returns `PASSAGE_SEALED × (1 − SEAL_SKILL × level)` for a Sealed door, `level` the seated Doors operator's Engineering level, 0 unmanned (`SEAL_SKILL 0.05`: half the leak and half the fire spread through sealed doors at level 10). Open and Closed are unchanged.
- **Bonus bars and shedding:**
  - `bonusBars(state) = floor(level / BONUS_BAR_LEVELS)` (`BONUS_BAR_LEVELS 4`) for a seated Engineering operator at an online Engineering, else 0.
  - `powerCapacity(state) = power.capacity + bonusBars(state)`; `powerPool = powerCapacity − powerUsed`. `shiftBar(+1)` uses the pool as today, so bonus bars can be allocated.
  - `shedPower(state)`: while `powerUsed > powerCapacity`, take one bar from the first station in `SHED_ORDER = [Doors, Medbay, Science, Weapons, Navigation, LifeSupport, Engineering]` whose level is above its floor (Engineering's floor is 1, everyone else's 0), standing an occupant whose station reaches 0 (as `shiftBar(−1)` does). Shedding writes `stations.level` directly, **not** through `shiftBar`: it is the one explicit exception to the 2a-i rule that allocations are frozen while Engineering is failed, because a failed Engineering that stands a bonus-bar operator must still bring usage back under capacity. Called from `standUp` whenever the stood seat is Engineering (voluntary, downed, failed or cut, since all go through `standUp`), so it completes inside the system that caused the stand, before later systems run. Restored capacity never restores shed bars.
  - Because `shiftBar` already refuses bars past the pool, the invariant `powerUsed <= powerCapacity` holds after every input and every stand; a property test checks it.

## 8. Tuning (first pass, all hypotheses)

```ts
SKILL_COUNT = 6, SKILL_MAX = 10
XP_THRESHOLDS = [0, 240, 600, 1080, 1680, 2400, 3240, 4200, 5280, 6480, 7800]   // cumulative productive seconds
XP_RATE = 1                       // per productive second
XP_PER_SHOT = 10                  // Weapons, per shot taken
XP_PER_EVADE_ROLL = 5             // Navigation, per evasion roll
PRODUCTIVE_WINDOW_TICKS = 300     // 5 s
REPAIR_SKILL_GAIN = 0.06          // repair speed 1 + gain x level
HEAT_COOL_SKILL = 0.2             // extra cooling per unit: floor(0.2 x level)
SEAL_SKILL = 0.05                 // sealed passage x (1 - 0.05 x level)
BONUS_BAR_LEVELS = 4              // one bonus bar per 4 Engineering levels while seated
SHED_ORDER = [Doors, Medbay, Science, Weapons, Navigation, LifeSupport, Engineering]
```

`OUTPUT_SLOW 0.5` / `OUTPUT_FAST 1.0` stay. Level-0 behaviour is identical to Increment 2b in every formula, so the golden replay changes only through the new hashed fields and the XP its seated players accrue.

## 9. Input, HUD and rendering

- **Input/app:** unchanged.
- **HUD model:** `HudPlayer.skills: number[]` (six levels in `Skill` order, zeros for an unjoined slot). Nothing else changes.
- **Pixi HUD:** the player panel grows from 72 px to 90 px (four text lines plus the progress bar); the console panel above it moves up by the same 18 px. Line 4 sits at local `y = 3 × LINE` (54) and shows `N1 E0 W2 S0 C0 R3` in `DIM` for an active player, empty otherwise; the progress bar moves from local `y = 48` to `y = 4 × LINE − 6` (66) so a repair or revive bar never crosses the skills line. The panel's own `y` is `INTERNAL_H − 94`.
- **Ship view:** unchanged.

## 10. Testing

All under node, no pixi. New: `tests/skills.test.ts`, `tests/productive.test.ts`, `tests/xp.test.ts`. Extended: `tests/power.test.ts` (bonus bars, shedding), `tests/heat.test.ts` (cooling with skill), `tests/oxygen.test.ts` or `tests/doors.test.ts` (sealed passage), `tests/interact.test.ts` (repair speed and XP), `tests/weapons.test.ts` and `tests/debris.test.ts` (lump XP), `tests/snapshot.test.ts`, `tests/hud.test.ts`. Test helper `setSkill(state, pid, skill, level)` sets `xp` to `XP_THRESHOLDS[level]`.

- **Levels:** `levelFor` at every threshold and one below it; cap at 10; `addXp` caps at `XP_THRESHOLDS[10]` and never lowers XP; `skillLevel` maps Life Support and Doors to Engineering and Medbay to Science; `skillCurve(0) = 0.75`, `skillCurve(10) = 1.0`.
- **Productive predicates:** one test per row of §6 with a true and a false fixture (Navigation with and without a warned object; Science with a warned object and scanning off (true), with nothing warned and `scanning = 1` (false: the scan branch needs a valid target, so it never adds coverage beyond the warned branch, and the spec does not claim it does); Engineering by overdrive, by shortfall and by a change inside and outside the window; Life Support delivering into a drained room (true), with no sinks and every room full (false: fixture with no crew breathing in the room and no fire, since breathing alone makes room for injection), with the only drained room breached (false), and expiry exactly `HAZARD_EVERY` ticks after the last delivering hazard tick; Medbay with a hurt and a healthy crew member; Doors with a fire, with a toggle inside and outside the window, and with neither). **Stamp production**, not only consumption: a successful bar move and a successful coolant change stamp `lastEngChangeTick`, a refused one does not; a remote toggle from the Doors console stamps `lastDoorToggleTick`, a local toggle by a walking crew member does not; a hazard tick that injects stamps `lsDeliveredTick`, one whose injection is fully clamped away does not; the initial −1 stamps are not recent at tick 0; each window expires exactly at `PRODUCTIVE_WINDOW_TICKS`.
- **XP flow:** a seated Navigation operator with a warned object gains exactly `XP_RATE × DT` per tick and nothing when unwarned; a Weapons shot adds `XP_PER_SHOT` whether hit or miss and a refused shot adds nothing; an evasion roll adds `XP_PER_EVADE_ROLL`; Life Support adds `XP_RATE × HAZARD_DT` to its seated operator on each delivering hazard tick and nothing when nobody sits or nothing is delivered; a repairer gains Repair XP per tick of progress and nothing when the hazard was already repaired; an offline or unoccupied station accrues nothing; a Navigation operator downed by an impact this tick still has this tick's XP (observation precedes the impact) and accrues nothing afterwards; a Medbay operator earns the tick on which the last patient reaches full health.
- **Effects:** repair at Repair level 10 completes a fire and a power failure in `6 / 1.6 = 3.75 s` (+2 ticks) and a breach in `8 / 1.6 = 5 s` (+2 ticks), each asserted incomplete one hazard-free tick before and complete after; two level-10 holders finishing one tick leave no residue; revive duration is unchanged at level 10 and revive grants no XP; `coolingPerUnit` is `HEAT_COOL_UNIT + 1` with a level-5 engineer seated and the baseline unseated or at level 4, and an integrated overdrive with one unit and nonzero heat holds flat with the level-5 engineer seated (2 − 1 × 2 = 0 per hazard tick) and rises by 1 per hazard tick after they stand; `passageFor` of a Sealed door is halved with a level-10 Doors operator seated and the baseline unmanned, and Open/Closed are unchanged; `stationOutput` at level 10 equals `level/max × 1.0`.
- **Bonus bars and shedding:** with the starter allocation (9 of 10), a level-8 engineer seated makes the pool 3; the test first spends the original spare, then both bonus bars (usage 12, with Doors kept at one bar), then stands: two bars shed, Doors first then Medbay, leaving `powerUsed === power.capacity` (10); a shed that cuts an occupied station stands its occupant; a level-3 engineer adds nothing; failing Engineering with bonus bars allocated sheds too; a Downed engineer (through `crewSystem`) sheds too; restored capacity (re-seating) does not restore shed bars; the Engineering floor of 1 holds when everything else is at 0; property (fast-check): with the engineer's level drawn from {3, 4, 7, 8}, random Engineering inputs, sits, stands and a possible downing keep `powerUsed <= powerCapacity`, Σ coolant within the pool and every level within `maxLevel`, and every shed removes bars in `SHED_ORDER`.
- **Snapshot and hash:** round trip of `skills` with distinct non-default stamps; mutating `xp` alone, and each of the three stamps alone, changes the hash; version-5 rejection by header and by the flattened `SIM_VERSION`; a run saved inside an active productivity window (a recent Engineering change) and continued hashes equal to the uninterrupted run.
- **HUD model:** `skills` for a joined player at mixed levels and zeros for an empty slot.
- **Boundary and existing suites:** unchanged and green; survival gate seeds 1 to 3 pass with every station unmanned (the bot crew repairs hazards and earns Repair XP, the only skill effect in play).
- **Golden replay:** re-blessed once (version 6, new fields, XP accrual by the replay's seated players) with the cause recorded.

## 11. Gate

Added to `docs/gates.md` as "Increment 3-i":

- The skills, productive, xp, power, heat, oxygen/doors, interact, weapons, debris, snapshot and HUD tests pass; typecheck and build pass; survival gate seeds 1 to 3 pass unmanned.
- Manual, two players: the player panel shows six levels; sitting at Science with debris warnings in flight raises `S` from 0 to 1 after about four minutes of warnings (240 productive seconds); repairing fires raises `R`; after reaching Engineering level 4 (or setting it in a debug build) the Engineering footer shows one more pool bar while seated; allocate the original spare and the bonus bar, stand, and the strip drops one bar from Doors (shedding only happens when usage exceeds the base capacity).

## 12. Open questions deferred

- Whether XP should be shared partially across the crew (no: individual skills are the point of the character layer).
- Whether a Downed operator should lose XP (no).
- Level-up notice on the HUD: revisit with 3-ii's game-over summary.
