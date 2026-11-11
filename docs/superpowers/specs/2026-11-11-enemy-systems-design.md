# Enemy Systems and Shields (Combat-ii) — Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 6); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §1 (sub-project 2), §5 Stations (Weapons, Science); `2026-11-11-enemy-ship-design.md` (Combat-i: the enemy, its shots, the `ENEMY_SLOT` pseudo-slot, `enemyBeamHits`, `damageEnemy`, `fireInterval`). This closes sub-project 2 for the ten-feature run; boarders (sub-project 3) follow.

## 1. Goal

Give the Weapons operator **choices about the enemy**, and give Science a reason to scan it. The enemy gains three **subsystems**, each a target row of its own: **weapons** (disabled: it stops firing), **engines** (disabled: it cannot withdraw and loses its evasion against our shots) and **shields** (up: beams on the wrong frequency are absorbed; down: everything passes). Shields have a **frequency** drawn on arrival; Science can scan the ship to reveal it, exactly as it scans debris; torpedoes ignore shields but are scarce. A disabled subsystem is repaired by the enemy's (abstract) crew after a fixed time, so the operator has to keep the pressure on. Hull damage still ends the encounter; a subsystem hit also damages the hull, so targeting a subsystem is a choice of effect, not a sacrifice of progress.

**Out of scope:** an enemy map or crew, boarding, loot, more than one enemy, enemy evasion rolls as separate draws, a new HUD panel or new art (rows and text only), changes to the enemy's shots beyond the weapons subsystem gating them.

## 2. Decisions taken (recommended options)

| Question | Options considered | Decision |
|---|---|---|
| How subsystems appear to the operator | (a) a sub-cursor on the enemy row; (b) **four pseudo-slots** in the shared target list (hull, weapons, engines, shields), all carrying the enemy's `StableId`, ordered hull first; (c) a separate enemy panel | **(b)**: cycling, retargeting, the window and the row text all reuse Combat-i's machinery; the enemy is simply four rows. |
| Subsystem health | each subsystem has `ENEMY_SYS_HP` (30): two beam hits or one torpedo disables it; a hit on a subsystem row deals its damage to the subsystem **and** to the hull | FTL's "system damage is also hull damage"; the hull row is for pure damage. |
| Repair | a subsystem at 0 is repaired to full after `ENEMY_SYS_REPAIR` (45 s), abstractly; no RNG | Keeps pressure on without simulating enemy crew. |
| Weapons disabled | the enemy fires no shots while its weapons are at 0; on repair its next shot comes `ENEMY_FIRST_SHOT` later | The re-arm clock keeps running underneath so timing stays deterministic. |
| Engines disabled | the departure clock **pauses** (`departTick` advances one tick per tick) and the enemy's **evasion** against our shots drops to 0 | Engines are the escape and the dodge, as in FTL. |
| Enemy evasion | `ENEMY_EVADE` (0.15) is subtracted from the **beam** hit threshold while engines are up; torpedoes are homing and unaffected; `ENEMY_BEAM_BASE` rises 0.55 → 0.70 so the engines-up chance equals Combat-i's (0.70 at output 0.5) and engines-down gives 0.85 | No new draw: one combat float per shot, as today. |
| Shields | `ENEMY_SHIELD_FREQ` is drawn on arrival (`1 + nextInt(rng.hazards, FREQ_COUNT)`, one draw); while shields are up (hp > 0) a beam whose selector frequency differs from it is **absorbed**: the readiness resets, `shots` counts, `lastShotTick` stamps, XP accrues, but no roll is made, no `hits`, no damage; a matched beam rolls normally; with shields at 0 every beam rolls normally; torpedoes always roll normally | "Beams must pierce by frequency, torpedoes bypass." An absorbed beam is still a shot taken. |
| Scanning the enemy | Science Confirm on the **hull row** starts a scan of the ship (`enemy.scan` 0..1 at `SCAN_TIME / output`, like an object); completion sets `enemy.scanned = 1` and the HUD shows `S2` instead of `S?`; subsystem rows are not scannable; the scan state is discarded on leave | Same loop as debris, same Science-to-Weapons handoff. |
| Telemetry | `telemetry.enemyDisables` (times a subsystem reached 0); the record's `enemy` block gains `disables`; the acceptance column reads `met/destroyed/disables` | Cheap and answers "did anyone ever take a system down". |
| HUD | hull row `Enemy 64% 87s S?` (S? → S2 once scanned; `S-` when shields are down); subsystem rows `Enemy weapons 100%`, `Enemy weapons DOWN 31s` (seconds to repair), likewise `engines`, `shields`; threat row `Enemy ship: hull 64%` gains ` weapons DOWN` / ` engines DOWN` / ` shields DOWN` suffixes | No new assets. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/debrisTargets.ts` | `ENEMY_SLOT` (hull, = `DEBRIS_SLOTS`), `ENEMY_WEAPONS_SLOT = DEBRIS_SLOTS + 1`, `ENEMY_ENGINES_SLOT = +2`, `ENEMY_SHIELDS_SLOT = +3`, `ENEMY_SLOTS = [hull, weapons, engines, shields]`, `isEnemySlot(slot)`; `targetStableId` returns the enemy's id for every enemy slot; `warnedTargets` appends all four while present and sorts by `(targetStableId, slot)`; `isTarget` true for every enemy slot while present; `nextTarget` unchanged (it walks the list). |
| `sim/enemy.ts` | `EnemySystem = { Weapons: 0, Engines: 1, Shields: 2 }`, `ENEMY_SYSTEM_NAMES`; `arrive` draws the shield frequency and fills `sysHp`; `leave` retargets every enemy slot and clears the scan; `enemyBeamThreshold(state, output)`; `beamAbsorbed(state, selector)`; `damageEnemy(state, slot, amount)` (hull always, subsystem when `slot` is a subsystem slot; a subsystem reaching 0 arms its repair and counts a disable); `repairStep` and the engines pause inside `enemySystem`; the fire step skips while weapons are down. |
| `sim/weapons.ts` | `fireWeapon` against any enemy slot: shields absorb mismatched beams before the roll; the beam threshold comes from `enemyBeamThreshold`; `damageEnemy(state, c, amount)`. |
| `sim/science.ts` | Confirm on `ENEMY_SLOT` starts the enemy scan when unscanned; `scanStep` advances `enemy.scan` when the cursor is `ENEMY_SLOT`; subsystem slots are ignored. |
| `sim/productive.ts` | the scan-validity check accepts the enemy hull scan (`c === ENEMY_SLOT && enemy.present && !enemy.scanned`); `anyWarned` counts objects only (unchanged: `k < DEBRIS_SLOTS`). |
| `sim/telemetry.ts`, `acceptance.ts` | `enemyDisables`; record `enemy.disables`; column `met/destroyed/disables`. |
| `sim/state.ts`, `flatten.ts`, `tuning.ts` | the new enemy fields, `SIM_VERSION = 11`, the constants in §8. |
| `render/hudModel.ts`, `hud.ts` | the three subsystem rows, the hull row's `S` marker, the threat suffixes; `DebrisTarget` gains `system: number | null` (0..2 for a subsystem row) and `status: { hp: number; repairIn: number | null } | null`; `targetRowText` renders the new strings. |

## 4. Authoritative state

```ts
enemy: {
  present, hull, stableId, nextArrivalTick, nextShotTick, departTick;   // Combat-i
  sysHp: Int32Array;         // per EnemySystem: 0..ENEMY_SYS_HP; all ENEMY_SYS_HP on arrival, 0 while absent
  sysRepairTick: Int32Array; // per EnemySystem: tick the system comes back, -1 while intact or absent
  shieldFreq: number;        // 1..FREQ_COUNT while present, 0 while absent
  scanned: number;           // 0 or 1: the shield frequency is revealed
  scan: number;              // 0..1 scan progress
};
telemetry.enemyDisables: number;
```

Flattened in the `enemy` section after `departTick`: `sysHp[3]`, `sysRepairTick[3]`, `shieldFreq`, `scanned`, `scan` (`ENEMY_FIELDS = 6 + 3 + 3 + 3 = 15`); `enemyDisables` after `enemiesDestroyed` (`TELEMETRY_SCALARS = 13`). `SIM_VERSION` becomes 11; version-10 snapshots are rejected. Initial values: `sysHp` all 0, `sysRepairTick` all −1, `shieldFreq 0`, `scanned 0`, `scan 0`, `enemyDisables 0`.

## 5. Rules

**Arrival** (`arrive`, amending Combat-i §5 step 1): as before, plus `sysHp.fill(ENEMY_SYS_HP)`, `sysRepairTick.fill(-1)`, `shieldFreq = 1 + nextInt(rng.hazards, FREQ_COUNT)` (**one `rng.hazards` draw**; Combat-i's "no draw on arrival" becomes "no director draw, one hazards draw"), `scanned = 0`, `scan = 0`. The auto-select still puts `ENEMY_SLOT` (the hull row) under an empty cursor.

**Per tick** (`enemySystem`, after the director, before debris), in order:

1. Absent: arrive if due; return.
2. **Repairs:** for each system with `sysRepairTick >= 0 && tick >= sysRepairTick`: `sysHp = ENEMY_SYS_HP`, `sysRepairTick = -1`; if it is Weapons, `nextShotTick = max(nextShotTick, tick + ENEMY_FIRST_SHOT × TICK_HZ)`.
3. **Engines pause:** if `sysHp[Engines] === 0`, `departTick += 1` (the clock stands still while the engines are down).
4. Withdrawal if `tick >= departTick` (`leave(state, false)`); return.
5. **Fire** if `tick >= nextShotTick`: re-arm first with one director draw as today; then spawn a shot only if `sysHp[Weapons] > 0` **and** the in-flight cap allows (weapons down: the re-arm still happens, nothing spawns, no hazards draw).

**Shooting the enemy** (`fireWeapon`, cursor on any enemy slot `c`; readiness checks unchanged):

- Torpedo: `hit = torpedoHits(u, output)` as today (homing: no evasion, no shield); damage `ENEMY_TORP_DAMAGE` to `c`.
- Beam: if `sysHp[Shields] > 0 && selector + 1 !== shieldFreq` → **absorbed**: `charge = 0`, `lastShotTick`, `shots++`, XP, **no combat draw**, return false. Otherwise one combat draw: `hit = u < enemyBeamThreshold(state, output)` with `enemyBeamThreshold = ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE × output − (sysHp[Engines] > 0 ? ENEMY_EVADE : 0)`; damage `ENEMY_BEAM_DAMAGE` to `c`.
- `damageEnemy(state, slot, amount)`: `hull = max(0, hull − amount)`; if `slot` is a subsystem slot and that system's `sysHp > 0`: `sysHp = max(0, sysHp − amount)`, and when it reaches 0: `sysRepairTick = tick + ENEMY_SYS_REPAIR × TICK_HZ`, `telemetry.enemyDisables += 1`; then if `hull === 0` → `leave(state, true)`. Damage to an already-down subsystem is hull damage only. `telemetry.hits` counts every damaging hit (hull or subsystem).
- Against **objects** nothing changes.

**Leave** (amending Combat-i): retargets any cursor in `ENEMY_SLOTS` with `nextTarget(state, stableId, …)` excluding **all four** enemy slots (so `nextTarget` gains an `excludeSlots: readonly number[]` form, or the caller filters), then clears `sysHp` (0), `sysRepairTick` (−1), `shieldFreq 0`, `scanned 0`, `scan 0`, and `science.scanning = 0` if the Science cursor was on the enemy.

**Scanning the enemy** (`science.ts`): Confirm with the cursor on `ENEMY_SLOT`, the enemy present and `scanned === 0` sets `science.scanning = 1`; `scanStep` with the cursor on `ENEMY_SLOT` advances `enemy.scan += DT × output / SCAN_TIME`, and at 1 sets `scanned = 1`, `scanning = 0`. Cursor on a subsystem slot: no scan starts and a running scan does not progress (same as today's "not a valid object"). Standing, going offline or retargeting pauses as for objects. `productive.ts` treats a running enemy scan as productive.

**Director:** unchanged (the enemy's presence weight and its shots as objects).

## 6. Targets

`ENEMY_SLOTS = [DEBRIS_SLOTS, DEBRIS_SLOTS + 1, DEBRIS_SLOTS + 2, DEBRIS_SLOTS + 3]` (hull, weapons, engines, shields). `isEnemySlot(k) = k >= DEBRIS_SLOTS`. `warnedTargets` sorts by `targetStableId`, ties by slot index, so the four enemy rows are contiguous and hull-first wherever the enemy's `StableId` falls among the objects. Every reader that branched on `k === ENEMY_SLOT` for "is this the enemy" now branches on `isEnemySlot(k)` (`isTarget`, `targetStableId`, `hudModel.target`, `productive`'s `anyWarned` filter, `science` guards); readers that mean "the hull row specifically" (the enemy scan, the auto-select) keep `ENEMY_SLOT`. The HUD window formula is unchanged; the list can now hold 12 entries.

## 7. HUD

- Row strings (`targetRowText`): hull row `Enemy 64% 87s S?` / `Enemy 64% 87s S2` (scanned) / `Enemy 64% 87s S-` (shields at 0, whatever the scan); subsystem rows `Enemy weapons 100%` (`round(hp / ENEMY_SYS_HP × 100)`), `Enemy weapons DOWN 31s` (`ceil` seconds to `sysRepairTick`), same for `engines` and `shields`; Science adds the scan suffix ` 40%` to the hull row only while unscanned and `scan > 0`, never to subsystem rows. Object rows unchanged.
- `DebrisTarget` gains `system: number | null` and `status: { hp: number; repairIn: number | null } | null`; the hull row has `frequency` = `shieldFreq` when scanned else `null`, plus `shieldsUp: boolean`.
- Threat row: `Enemy ship: hull 64%` + for each system at 0, in `EnemySystem` order, ` ${name} DOWN` (`Enemy ship: hull 64% weapons DOWN shields DOWN`).
- Science panel: the hull row's `scan` is `enemy.scan`; subsystem rows `scan 0`.

## 8. Tuning (first pass, all hypotheses)

```ts
SIM_VERSION = 11
ENEMY_SYS_HP = 30               // two beams or one torpedo
ENEMY_SYS_REPAIR = 45           // seconds from 0 back to full
ENEMY_EVADE = 0.15              // subtracted from the beam threshold while engines are up
ENEMY_BEAM_BASE = 0.70          // was 0.55: engines-up chance equals Combat-i's 0.70 at output 0.5; engines-down 0.85
```

Everything else from Combat-i stays (`ENEMY_HULL 100`, `ENEMY_BEAM_DAMAGE 15`, `ENEMY_TORP_DAMAGE 35`, `ENEMY_SHOT_HULL_DAMAGE 4`, `ENCOUNTER_FIRST 210`, `ENEMY_SHOTS_MAX 1`). Worked numbers (two players, output 0.5, shields up, frequency unknown): a blind beam has a 1-in-3 chance of the right frequency; a seated Science scans the ship in 12 s and the operator then lands 70 % of beams; two beams (24 s of charging) drop the shields and every beam passes; two more drop the weapons and the shots stop; or two on the engines keep it from leaving and raise the hit chance to 85 %. A torpedo takes any one system down at once. Hull: 100 means seven beam hits anywhere, since subsystem hits also count.

## 9. Testing

All under node, no pixi. Extended: `tests/enemy.test.ts`, `tests/weapons.test.ts` (none expected), `tests/science.test.ts` or `tests/enemy.test.ts` for the scan, `tests/productive.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`. Helpers: `placeEnemy(state, hull?, shieldFreq = 1)` also fills `sysHp` and sets `shieldFreq`; `disableSystem(state, system)` sets `sysHp 0` and `sysRepairTick = tick + ENEMY_SYS_REPAIR × TICK_HZ`.

- **Arrival:** `shieldFreq` from one hazards draw (hazards state 7 → the implementer computes `1 + nextInt(createRng(7), FREQ_COUNT)`), `sysHp` all 30, `sysRepairTick` all −1, `scanned 0`, `scan 0`; the director stream unchanged and the hazards stream advanced exactly once.
- **Targets:** `warnedTargets` with an object before and after the enemy gives `[a, 8, 9, 10, 11, b]`; `isTarget` true for all four while present, false when absent; cycling Down from the hull row visits weapons, engines, shields, then the next object; `leave` with a cursor on the shields row retargets to the next `StableId`; the Combat-i `nextTarget` fixture still holds with four enemy slots (`nextTarget(s, 5)` returns 8, `nextTarget(s, 6)` returns the next object).
- **Shields and beams (combat state 7 hits, 4 misses at output 0.5; thresholds: engines up 0.70, down 0.85):** a mismatched beam with shields up is absorbed (charge 0, `shots 1`, `hits 0`, XP `XP_PER_SHOT`, combat stream **unchanged**, hull and all `sysHp` unchanged, returns false); a matched beam rolls (combat advanced once) and damages; with shields at 0 a mismatched beam rolls and damages; a torpedo with shields up and the wrong selector frequency is irrelevant (torpedo has no frequency) and damages; `enemyBeamThreshold` 0.70 at output 0.5 with engines up, 0.85 with engines down, 1.0 clamped at output 1 with engines down (`0.70 + 0.30 − 0` → 1.0: every beam hits).
- **Subsystem damage:** a beam on the weapons row takes hull 100 → 85 and `sysHp[Weapons]` 30 → 15; a second takes it to 0, arms `sysRepairTick = tick + 45 × 60`, counts `enemyDisables 1`; a third beam on the same row takes hull only (`sysHp` stays 0, `enemyDisables` stays 1); a torpedo on the engines row takes `sysHp[Engines]` to 0 in one hit and hull 100 → 65; a beam on the hull row leaves every `sysHp` at 30; the kill through a subsystem row (hull 15, beam on shields row) leaves normally.
- **Effects:** weapons down: at a due `nextShotTick` the enemy re-arms (one director draw) and spawns nothing (hazards unchanged); at `sysRepairTick` the system returns to 30, `sysRepairTick −1`, and `nextShotTick` becomes `tick + 300` if it was earlier (and stays if later); engines down: over 100 ticks `departTick` grows by 100 (and the enemy does not withdraw at the original `departTick`), the threshold drops to 0.85; repaired engines resume the clock (`departTick` fixed again); shields down then repaired: a mismatched beam is absorbed again.
- **Scan:** Confirm on the hull row starts the scan; `scanStep` advances `enemy.scan` at `DT × output / SCAN_TIME` and completes at 1 with `scanned 1`, `scanning 0`; Confirm on a subsystem row starts nothing; a running scan does not progress while the cursor is on a subsystem row and resumes on the hull row; `leave` clears `scan`/`scanned` and stops a running scan; the productive predicate is true for Science during an enemy scan and false once scanned with no objects in flight.
- **Snapshot:** round trip of the nine new fields with non-default values; each alone changes the hash; version-10 rejection; continuation through a repair and a shielded miss.
- **HUD:** `targetRowText` for the hull row in the three `S` states, each subsystem row intact and DOWN with the seconds, the Science scan suffix only on the hull row; the model gives four enemy rows with `system` 0..2 and `status`; the threat row with no, one and two suffixes.
- **Telemetry and acceptance:** `enemyDisables` in the record (`enemy: { met, destroyed, disables }`) and the column `2/1/3`; existing fixtures updated.
- **Combat gate (extend the Combat-i one):** the same operator first scans nothing and fires one beam on `F1` against `shieldFreq 2` (absorbed), then switches to `F2` and destroys the enemy in seven hits; `shots 8, hits 7`.
- **Survival gate:** unchanged assertions; the unmanned bots never shoot, so the figures must be identical to Combat-i's (hull 56/60/68, impacts 6/6/6, health 19.1/46.4/2.2); if they differ, a rule leaked into the enemy's fire. Record them again. The seed-3 margin stays on watch; no tuning change is planned here.
- **Golden replay:** re-blessed once (version 11, the new fields; no enemy in the two-minute replay).

## 10. Gate

Added to `docs/gates.md` as "Combat-ii: enemy systems and shields (closes sub-project 2 for this run)":

- `npm test` passes (the bullets above); the survival gate figures equal Combat-i's; `npm run typecheck`, `npm test`, `npm run build` pass on the final commit.
- Manual, two players (`npm run dev`): from Weapons the enemy shows four rows (`Enemy 100% 118s S?`, `Enemy weapons 100%`, `Enemy engines 100%`, `Enemy shields 100%`); a beam on the wrong `F` does nothing to the percentages; Science scanning the hull row turns `S?` into `S<k>`, and beams on that `F` land; two hits on `Enemy shields` show `Enemy shields DOWN 45s` and `S-`, after which any `F` lands; two hits on `Enemy weapons` stop the `Shot:` rows until `DOWN` counts to 0. Date and notes: pending human playtest.

## 11. Open questions deferred

- Enemy evasion as a function of our Navigation (a dogfight model): later, with run structure.
- Rewards for a kill or a disable: roadmap item 9.
- Enemy "repair" flavour and a visible enemy crew: never for this scope.
