# Debris Loop (Increment 2a-ii) — Design

Status: approved in brainstorming 2026-11-10. Parent: `2026-11-09-foundation-design.md` §5 (Stations, Hazards), §7, §11 item 2. Builds on `2026-11-10-power-and-consoles-design.md` (2a-i, merged). This is the second half of Increment 2a; with it the foundation's Increment 2a gate ("each console has a scripted-intent test showing its effect") closes.

## 1. Goal

Give the ship an external threat and the three inert consoles their job. A **debris** object spawns hidden with a target room and an impact time; a seated **Science** operator warns of it early; a seated **Weapons** operator shoots it with a plain beam; a seated **Navigation** operator can evade it at the last moment; an unstopped impact damages the hull, hurts crew in the room and starts a breach or a fire there. Hull damage exists for the first time, so the `HULL LOST` run end becomes reachable.

**Out of scope (later increments):** debris frequency, Science scanning, the beam frequency selector and torpedoes (2b: the beam here has one flat hit chance and no selector); skill levels (`skillLevel()` stays the level-0 stub); the director and productive predicates (4). Decisions taken here for those: hit and evasion rolls take `stationOutput`, so 2b and 3 change inputs, not formulas; the Weapons cursor is a debris slot index so the 2b weapon selector can add a second cursor dimension without touching targeting.

## 2. Architecture

Approach chosen: **fixed debris slots in `SimState`** (mirrors stations-as-arrays, `docs/spikes.md`). Debris objects live in `DEBRIS_SLOTS` typed arrays; crew remain the only entities. Each live object takes a `StableId` from `state.nextStableId`, which keys target order and HUD caches, so slot reuse never reorders anything. There is no position: an object is only a time to impact and a target room; nothing is drawn in space.

New and changed modules:

| Module | Responsibility |
|---|---|
| `sim/debris.ts` (new) | `spawnDebris`, `removeDebris`, `warnedTargets` (slots sorted by `stableId`), `nextTarget`, `debrisSystem` (detection, then impacts). |
| `sim/weapons.ts` (new) | `chargeBeam` (per-tick progress), `fireBeam` (roll, destroy or miss, reset charge), `validateWeaponsCursor`. |
| `sim/console.ts` | Weapons seated dispatch (up/down cycle, Confirm fire) and the per-tick charge call; Science and Navigation stay input-free. |
| `sim/hazards/spawner.ts` | Fourth type `debris` in `pickSpawnType` and `activeHazardCount`. |
| `sim/step.ts` | Inserts `debrisSystem` after `spawner`, before `medbayStep`. |
| `sim/state.ts`, `flatten.ts` | `debris`, `weapons`, `lastImpact` snapshotted and hashed; `SIM_VERSION = 3`. |
| `sim/tuning.ts` | New constants (§7); `SPAWN_WEIGHTS` gains `debris`. |
| `render/hudModel.ts`, `hud.ts`, `fallback.ts`, `effects.ts` | Debris threats, Weapons/Science/Navigation panels, impact flash, three fallback icons. |

Step order inside `step()`:

1. `interactSystem`
2. `consoleSystem` (seated input; **Weapons charge progresses and shots resolve here**)
3. `movementSystem`
4. `doorSystem`
5. hazard tick (12 Hz): `lifeSupportInjection` → `oxygenStep` → `fireStep`
6. `spawner` (may spawn debris)
7. **`debrisSystem`** (detection for every active object, then impacts for every object whose `impactTick ≤ tick`, ascending slot)
8. `medbayStep`
9. `crewSystem` (Downed from impact damage is handled here; hull 0 ends the run here, as today)

Detection runs after the spawner, so an object is never warned on its spawn tick unless the lead exceeds its flight time, which the §8 numbers never allow.

## 3. Authoritative state

```ts
// state.ts
debris: {
  active:     Uint8Array;    // DEBRIS_SLOTS
  stableId:   Int32Array;    // from nextStableId when spawned; 0 when inactive
  room:       Int16Array;    // target room index
  impactTick: Int32Array;
  warned:     Uint8Array;    // 1 once detected; never cleared while active
};
weapons: { charge: number };                 // 0..1; survives standing and power failure
lastImpact: { tick: number; room: number };  // -1, -1 until the first impact; render flash only, but hashed like everything else
```

`stations.cursor[weapons]` is a **debris slot index** or -1 (as Doors uses an edge index). Science and Navigation have no cursor (stays 0). All new fields are flattened, snapshotted and hashed; `SIM_VERSION` becomes 3 and version-2 snapshots are rejected (existing rule). `layoutHash` is unchanged (no ship data changes).

`DEBRIS_SLOTS` (8) is never reached: the spawner cap (`SPAWN_CAP = 3`) counts in-flight debris, so at most 3 objects exist. `spawnDebris` still guards a full table by skipping the spawn (no throw).

## 4. Lifecycle

1. **Spawn** (`spawner`, type `debris`): `room` uniform over rooms (`rng.hazards`), flight time `DEBRIS_FLIGHT + u × 2 × DEBRIS_FLIGHT_JITTER − DEBRIS_FLIGHT_JITTER` seconds with `u` from `rng.hazards`, rounded to ticks; `impactTick = tick + flightTicks`; `stableId = nextStableId++`; `warned = 0`; lowest free slot. Debris has no target-validity failure, so a `debris` roll never skips (unlike breach and power).
2. **Warning** (`debrisSystem`, every tick): for each active unwarned object, `remaining = (impactTick − tick) × DT`. The lead is `SCIENCE_LEAD_UNMANNED` when Science is offline or unoccupied, else `SCIENCE_LEAD_BASE + SCIENCE_LEAD_SCALE × stationOutput(science)`. If `remaining ≤ lead`, `warned = 1`. Warned is permanent for that object; standing up or a Science failure never hides it.
3. **Interception** (`consoleSystem`, seated Weapons operator, see §5): a shot at the cursor's object destroys it (`removeDebris`) on a hit; a miss leaves it in flight.
4. **Evasion** (`debrisSystem`, at `impactTick ≤ tick`): if Navigation is seated and online, one `rng.combat` roll `< EVADE_BASE + EVADE_SCALE × stationOutput(navigation)` removes the object with no effect. Otherwise no roll is drawn.
5. **Impact** (same place, not evaded), in this order:
   1. `hull = max(0, hull − DEBRIS_HULL_DAMAGE)`.
   2. One room effect from `rng.hazards`: with equal weight, **breach** (activate the lowest-index inactive breach site whose `siteRoom` is the target room) or **fire** (`igniteRoom`). If the drawn effect is impossible (no inactive site in the room, or the room is already burning), the other is applied; if both are impossible, none, and the roll is still consumed.
   3. Every **Conscious** crew member whose centre tile (`roomAt`, as Medbay uses) is in the target room loses `DEBRIS_CREW_DAMAGE` health (clamped at 0; `crewSystem` downs them this tick). Downed and Dead crew are untouched.
   4. `lastImpact = { tick, room }`; `removeDebris`.

`removeDebris(slot)` clears `active`, `warned`, `stableId = 0`. Every player's Weapons cursor pointing at that slot is revalidated next tick (§5), so a destroyed, evaded or impacted target never leaves a dangling cursor past one tick, and `fireBeam` checks `active && warned` on its own tick anyway.

## 5. Station behaviours

- **Science**: no seated input; the stick and Confirm do nothing. Its effect is the longer detection lead in §4 step 2. At level 1 of 2 and skill 0, `stationOutput = 0.375`, so the lead is 18 s; at level 2 it is 24 s; unmanned or offline, 4 s.
- **Weapons** (seated, online operator; dispatch in `consoleSystem`):
  - `chargeBeam`: `charge = min(1, charge + DT × stationOutput(weapons) / BEAM_CHARGE_TIME)` every tick the operator is seated and the station online. Charge is kept when standing (voluntary or forced) and while Weapons is failed; it only progresses while seated and online.
  - Cursor: `validateWeaponsCursor` runs first each tick: if the cursor slot is not `active && warned`, it becomes `nextTarget(afterStableId)`, the warned object with the smallest `stableId` greater than the old target's (or the smallest overall), else -1. Up/Down cycle through `warnedTargets` (ascending `stableId`) with wrap; Left/Right do nothing this increment (2b's selector). With no warned object the cursor is -1 and the stick does nothing.
  - Confirm: if `charge ≥ 1` and the cursor is valid, `fireBeam`: a `rng.combat` roll `< BEAM_HIT_BASE + BEAM_HIT_SCALE × stationOutput(weapons)` destroys the object; otherwise it stays in flight; `charge = 0` either way. Confirm with no charge or no target does nothing and draws no roll.
  - The seating Confirm is consumed by `satThisTick` as in 2a-i, so sitting never fires.
- **Navigation**: no seated input. Its effect is the evasion roll in §4 step 4. At level 1 of 2 and skill 0 the chance is 0.35; at level 2, 0.50.
- Forced stands are unchanged from 2a-i (`failStation`, Engineering cut to 0, Downed). Warnings and beam charge survive them.

## 6. Spawner

`pickSpawnType(roll)` returns `'fire' | 'breach' | 'power' | 'debris'` by `SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1, debris: 2 }` (intervals in that order over the total 6). `activeHazardCount` adds active debris to fires, breaches and failed stations, so `SPAWN_CAP` bounds all four. Target draws stay on `rng.hazards`, type on `rng.director`, as today.

## 7. Tuning (first pass, all hypotheses)

```ts
DEBRIS_SLOTS = 8
DEBRIS_FLIGHT = 30, DEBRIS_FLIGHT_JITTER = 6          // seconds
SCIENCE_LEAD_UNMANNED = 4, SCIENCE_LEAD_BASE = 12, SCIENCE_LEAD_SCALE = 16   // seconds
BEAM_CHARGE_TIME = 6                                  // seconds at output 1 (about 12 s at level 3, skill 0)
BEAM_HIT_BASE = 0.55, BEAM_HIT_SCALE = 0.30
EVADE_BASE = 0.20, EVADE_SCALE = 0.40
DEBRIS_HULL_DAMAGE = 8                                 // of HULL_MAX 100
DEBRIS_CREW_DAMAGE = 20                                // of HEALTH_MAX
IMPACT_FLASH_TICKS = 18                                // render only
SPAWN_WEIGHTS = { fire: 2, breach: 1, power: 1, debris: 2 }
```

Everything from 2a-i stays. `SPAWN_CAP` stays 3.

## 8. Input, HUD and rendering

- **Input/app:** unchanged.
- **HUD model** (`hudModel.ts`, pure): `HudThreat.icon` widens to include `'icon.sensors'`; one threat per **warned** object, `{ icon: 'icon.sensors', text: 'Debris: <room> <ceil(remaining s)>s' }`, in ascending `stableId`, after fires, breaches and power failures. Unwarned objects are not listed anywhere. The ship block gains `weapons: { charge: number; ready: boolean }` and `lastImpact: { tick, room }` (passed through for the flash). `HudPlayer.console` gains three panel shapes: `WeaponsPanel = { charge: number; targets: { stableId: number; room: string; eta: number }[]; cursor: number }` (cursor is an index into `targets`, -1 when none), `SciencePanel = { leadSeconds: number; warnedCount: number }`, `NavigationPanel = { evadeChance: number }`. Each panel carries a discriminant `kind` field so `hud.ts` narrows with a property check (Codex plan finding from 2a-i).
- **Pixi HUD:** Weapons panel draws a 10-cell charge bar (`ui.bar.fill`/`ui.bar.bg`, `READY` label when full) and one row per target `> <room> <eta>s` with the `>` cursor glyph on the selected row; Science draws `Lead <n>s   Warned <k>`; Navigation draws `Evade <pct>%`. The `HULL` figure at the top left already exists. Icons `icon.sensors`, `icon.weapons`, `icon.navigation` exist in the manifest; `fallback.ts` gains the three so the no-art path draws them.
- **Ship view:** when `tick − lastImpact.tick < IMPACT_FLASH_TICKS`, the target room's floor tiles are tinted `WARN` with alpha fading linearly to 0 over the window, in `effects.above` (the renderer derives this from the model each frame and keeps no state). No other visual; the ship has no exterior.

## 9. Testing

All under node, no pixi. New files: `tests/debris.test.ts`, `tests/weapons.test.ts`; extensions to `tests/spawner.test.ts`, `tests/console.test.ts`, `tests/hud.test.ts`, `tests/snapshot.test.ts`.

- **Debris:** spawn fills the lowest free slot with a fresh `stableId` and `warned = 0`; flight time within `DEBRIS_FLIGHT ± JITTER`; detection with Science unmanned happens at 4 s remaining and not before; seated at level 1 happens at 18 s; warned stays warned after the operator stands and after a Science failure; impact lowers hull by 8, applies exactly one room effect, falls back to the other when the drawn effect is impossible, applies none when both are, damages only Conscious crew in the room, sets `lastImpact`, frees the slot; a freed slot is reused with a new, larger `stableId`; evasion rolls only when Navigation is seated and online (RNG `combat` state unchanged otherwise) and removes the object with no hull change on success; hull reaching 0 ends the run with `EndReason.Hull`.
- **Weapons:** charge progresses only while seated and online, scales with level, stops on stand and on failure and is kept; cursor -1 with nothing warned; up/down cycle in `stableId` order and wrap; cursor advances to the next warned object when its target is destroyed or impacts, else -1; a hit destroys and resets charge; a miss keeps the object and resets charge; Confirm with charge below 1 or cursor -1 does nothing and does not touch `rng.combat`; over 400 seeded rolls the hit rate at level 3 exceeds the rate at level 1.
- **Spawner:** `pickSpawnType` fourth interval; a debris spawn through `step()` lands in slot 0; active debris counts toward the cap (three in flight block a fire spawn).
- **Scripted-intent gate tests** (replace the three inert-console tests in `console.test.ts`): Science: a debris object 16 s out is unwarned (unmanned lead 4 s), the player sits at the starter level 1 (lead 18 s), it becomes warned on the next tick, Cancel stands and it stays warned; Weapons: sit with a warned object, hold for the charge time, Confirm, assert either destroyed or still active with `charge = 0` and `rng.combat` advanced, Cancel stands; Navigation: sit, force an impact tick, assert `rng.combat` advanced exactly one roll.
- **Snapshot and hash:** round trip covers `debris`, `weapons`, `lastImpact`; the same-seed/same-intents property holds with a sit-fire-stand script; version-2 snapshots are rejected.
- **HUD model:** warned debris threat text and order, no entry for an unwarned object, the three panels (including `cursor = -1` and empty targets), `weapons.ready`.
- **Boundary and existing suites:** unchanged and green. Survival gate seeds 1 to 3 still pass with nobody at Science, Weapons or Navigation (debris must be survivable unmanned at this spawn rate; if a seed fails, lower `SPAWN_WEIGHTS.debris` to 1 and record it).
- **Golden replay:** re-blessed once, in the task that bumps `SIM_VERSION` and changes the spawner weights, with the cause in the commit message and in `.superpowers/sdd/progress.md`. Later tasks leave it unchanged unless a task's commit message states otherwise.

## 10. Gate

Added to `docs/gates.md` as "Increment 2a-ii" (closing the foundation's Increment 2a):

- The debris, weapons, spawner, scripted-intent, snapshot and HUD-model tests pass; typecheck and build pass; survival gate seeds 1 to 3 pass unmanned.
- Manual, two players: a `Debris` warning appears in the threat list only after Science is seated (or in the last 4 s unmanned); a beam shot from Weapons removes a target; an unstopped impact flashes the target room, lowers `HULL` and leaves a breach or fire; Navigation seated produces at least one evasion over a run.

## 11. Open questions deferred

- Frequency, scanning, the beam selector and torpedoes: 2b (the Weapons cursor stays the target dimension; the selector becomes Left/Right).
- Whether impacts should also knock crew prone or interrupt repairs: foundation does not say; playtest first.
- Whether sitting at Science should reveal already-flying objects **beyond** the lead (an "active sweep"): no. Detection is evaluated every tick against the current lead, so a late Science seat immediately warns any object already inside the seated lead, but nothing further out. Revisit if playtests show Science feels useless mid-run.
