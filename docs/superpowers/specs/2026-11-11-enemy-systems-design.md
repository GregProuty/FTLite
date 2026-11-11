# Enemy Systems and Shields (Combat-ii) — Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 6); every open choice took the recommended option; amended the same day from the Codex spec reviews (`research/codex-review-systems-spec-1.md`, `-2.md`). Parent: `2026-11-09-foundation-design.md` §1 (sub-project 2), §5 Stations (Weapons, Science); `2026-11-11-enemy-ship-design.md` (Combat-i: the enemy, its shots, the `ENEMY_SLOT` pseudo-slot, `enemyBeamHits`, `damageEnemy`, `fireInterval`). This closes sub-project 2 for the ten-feature run; boarders (sub-project 3) follow.

## 1. Goal

Give the Weapons operator **choices about the enemy**, and give Science a reason to scan it. The enemy gains three **subsystems**, each a target row of its own: **weapons** (disabled: it stops firing), **engines** (disabled: it cannot withdraw and loses its evasion against our shots) and **shields** (up: beams on the wrong frequency are absorbed; down: everything passes). Shields have a **frequency** drawn on arrival; Science can scan the ship to reveal it, exactly as it scans debris; torpedoes ignore shields but are scarce. A disabled subsystem is repaired by the enemy's (abstract) crew after a fixed time, so the operator has to keep the pressure on. Hull damage still ends the encounter; a subsystem hit also damages the hull, so targeting a subsystem is a choice of effect, not a sacrifice of progress.

**Out of scope:** an enemy map or crew, boarding, loot, more than one enemy, enemy evasion rolls as separate draws, a new HUD panel or new art (rows and text only), changes to the enemy's shots beyond the weapons subsystem gating them.

## 2. Decisions taken (recommended options)

| Question | Options considered | Decision |
|---|---|---|
| How subsystems appear to the operator | (a) a sub-cursor on the enemy row; (b) **four pseudo-slots** in the shared target list (hull, weapons, engines, shields), all carrying the enemy's `StableId`, ordered hull first; (c) a separate enemy panel | **(b)**: cycling, retargeting, the window and the row text all reuse Combat-i's machinery; the enemy is simply four rows. |
| Subsystem health | each subsystem has `ENEMY_SYS_HP` (30): two beam hits or one torpedo disables it; a hit on a subsystem row deals its damage to the subsystem **and** to the hull | FTL's "system damage is also hull damage"; the hull row is for pure damage. |
| Repair | a subsystem at 0 is repaired to full after `ENEMY_SYS_REPAIR` (45 s), abstractly; no RNG | Keeps pressure on without simulating enemy crew. |
| Weapons disabled | the enemy fires no shots while its weapons are at 0 (the re-arm clock keeps running and draws as usual); on repair `nextShotTick` is set to exactly `tick + ENEMY_FIRST_SHOT × TICK_HZ` | One rule, no `max`: the first shot after a repair always comes five seconds later. |
| Engines disabled | the departure clock **pauses** (`departTick` advances one tick per tick) and the enemy's **evasion** against our shots drops to 0 | Engines are the escape and the dodge, as in FTL. |
| Enemy evasion | `ENEMY_EVADE` (0.15) is subtracted from the **beam** hit threshold while engines are up; torpedoes are homing and unaffected; `ENEMY_BEAM_BASE` rises 0.55 → 0.70 so the engines-up chance equals Combat-i's (0.70 at output 0.5) and engines-down gives 0.85 | No new draw: one combat float per shot, as today. |
| Shields | `ENEMY_SHIELD_FREQ` is drawn on arrival (`1 + nextInt(rng.hazards, FREQ_COUNT)`, one draw); while shields are up (hp > 0) a beam whose selector frequency differs from it is **absorbed**: the readiness resets, `shots` counts, `lastShotTick` stamps, XP accrues, but no roll is made, no `hits`, no damage; a matched beam rolls normally; with shields at 0 every beam rolls normally; torpedoes always roll normally | "Beams must pierce by frequency, torpedoes bypass." An absorbed beam is still a shot taken. |
| Scanning the enemy | Science Confirm on the **hull row** starts a scan of the ship (`enemy.scan` 0..1 at `SCAN_TIME / output`, like an object); completion sets `enemy.scanned = 1` and the HUD shows `S2` instead of `S?`; subsystem rows are not scannable; the scan state is discarded on leave | Same loop as debris, same Science-to-Weapons handoff. |
| Telemetry | `telemetry.enemyDisables` (times a subsystem reached 0); the record's `enemy` block gains `disables`; the acceptance column reads `met/destroyed/disables` | Cheap and answers "did anyone ever take a system down". |
| HUD | hull row `Enemy 64% 87s S?` (S? → S2 once scanned; `S-` when shields are down); subsystem rows `Enemy weapons 100%`, `Enemy weapons DOWN 31s` (seconds to repair), likewise `engines`, `shields`; threat row `Enemy ship: hull 64%` gains ` weapons DOWN` / ` engines DOWN` / ` shields DOWN` suffixes | No new assets. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/debrisTargets.ts` | `ENEMY_SLOT` (hull, = `DEBRIS_SLOTS`), `ENEMY_WEAPONS_SLOT = DEBRIS_SLOTS + 1`, `ENEMY_ENGINES_SLOT = +2`, `ENEMY_SHIELDS_SLOT = +3`, `ENEMY_SLOTS = [hull, weapons, engines, shields]`, `isEnemySlot(slot)` (`slot >= DEBRIS_SLOTS`); `targetStableId` returns the enemy's id for every enemy slot; `warnedTargets` appends all four while present and sorts by `(targetStableId, slot)`; `isTarget` true for every enemy slot while present; `nextTarget(state, afterStableId, exclude: number \| readonly number[] = -1)` accepts one slot (existing callers such as `removeDebris` are unchanged) or a list (used by `leave` to exclude all four enemy slots while `present` is still 1). |
| `sim/enemy.ts` | `EnemySystem = { Weapons: 0, Engines: 1, Shields: 2 }`, `ENEMY_SYSTEM_NAMES`; `arrive` draws the shield frequency and fills `sysHp`; `leave` retargets every enemy slot and clears the scan; `enemyBeamThreshold(state, output)`; `beamAbsorbed(state, selector)`; `damageEnemy(state, slot, amount)` (hull always, subsystem when `slot` is a subsystem slot; a subsystem reaching 0 arms its repair and counts a disable); `repairStep` and the engines pause inside `enemySystem`; the fire step skips while weapons are down. |
| `sim/weapons.ts` | `fireWeapon` against any enemy slot: shields absorb mismatched beams before the roll; the beam threshold comes from `enemyBeamThreshold`; `damageEnemy(state, c, amount)`. |
| `sim/science.ts` | Confirm on `ENEMY_SLOT` starts the enemy scan when unscanned; `scanStep` advances `enemy.scan` when the cursor is `ENEMY_SLOT`; subsystem slots are ignored. |
| `sim/productive.ts` | the scan-validity check accepts the enemy hull scan (`c === ENEMY_SLOT && enemy.present && !enemy.scanned`); `anyWarned` becomes `warnedTargets(state).some((k) => k < DEBRIS_SLOTS)` (today it is `k !== ENEMY_SLOT`, which would let slots 9 to 11 count as incoming work). |
| `sim/telemetry.ts`, `acceptance.ts` | `enemyDisables`; record `enemy.disables`; column `met/destroyed/disables`. |
| `sim/state.ts`, `flatten.ts`, `tuning.ts` | the new enemy fields, `SIM_VERSION = 11`, the constants in §8. |
| `render/hudModel.ts`, `hud.ts` | the three subsystem rows, the hull row's `S` marker, the threat suffixes; `DebrisTarget` gains `system`, `status` and `shieldsUp` (§7); **three readers migrate from `k === ENEMY_SLOT` to `isEnemySlot(k)` before any debris read**: `target()`, the Science row builder (`scan` is `enemy.scan` for the hull row and 0 for subsystem rows), and the threat loop (every enemy slot is skipped); `targetRowText` renders the new strings. |

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
2. **Repairs:** for each system in `EnemySystem` order with `sysRepairTick >= 0 && tick >= sysRepairTick`: `sysHp = ENEMY_SYS_HP`, `sysRepairTick = -1`; if it is Weapons, `nextShotTick = tick + ENEMY_FIRST_SHOT × TICK_HZ` (unconditionally). Repairs run before the withdrawal check, so a system repaired on the departure tick is repaired in the saved state; our shots resolve in the console step, before this system, so a lethal shot skips the repair.
3. **Engines pause:** if `sysHp[Engines] === 0`, `departTick += 1` (the clock stands still while the engines are down).
4. Withdrawal if `tick >= departTick` (`leave(state, false)`); return.
5. **Fire** if `tick >= nextShotTick`: re-arm first with one director draw as today; then spawn a shot only if `sysHp[Weapons] > 0` **and** the in-flight cap allows (weapons down: the re-arm still happens, nothing spawns, no hazards draw).

**Shooting the enemy** (`fireWeapon`, cursor on any enemy slot `c`; readiness checks unchanged):

- Torpedo: `hit = torpedoHits(u, output)` as today (homing: no evasion, no shield); damage `ENEMY_TORP_DAMAGE` to `c`.
- Beam: if `sysHp[Shields] > 0 && selector + 1 !== shieldFreq` → **absorbed**: `charge = 0`, `lastShotTick`, `shots++`, XP, **no combat draw**, return false. Otherwise one combat draw: `hit = u < enemyBeamThreshold(state, output)` with `enemyBeamThreshold = ENEMY_BEAM_BASE + ENEMY_BEAM_SCALE × output − (sysHp[Engines] > 0 ? ENEMY_EVADE : 0)`; damage `ENEMY_BEAM_DAMAGE` to `c`.
- `damageEnemy(state, slot, amount)`: `hull = max(0, hull − amount)`; if `slot` is a subsystem slot and that system's `sysHp > 0`: `sysHp = max(0, sysHp − amount)`, and when it reaches 0: `sysRepairTick = tick + ENEMY_SYS_REPAIR × TICK_HZ`, `telemetry.enemyDisables += 1`; then if `hull === 0` → `leave(state, true)`. Damage to an already-down subsystem is hull damage only. `telemetry.hits` counts every damaging hit (hull or subsystem).
- Against **objects** nothing changes.

**Leave** (amending Combat-i): first records whether the Science cursor is on any enemy slot; then retargets every console whose cursor is in `ENEMY_SLOTS` with `nextTarget(state, stableId, ENEMY_SLOTS)` (all four excluded while `present` is still 1, so the fallback can never land on another enemy row); then `present 0`, `hull 0`, `stableId 0`, clocks −1, `sysHp` all 0, `sysRepairTick` all −1, `shieldFreq 0`, `scanned 0`, `scan 0`; `science.scanning = 0` if the Science cursor was on an enemy slot; the destroyed counter and the one cooldown draw as in Combat-i.

**Scanning the enemy** (`science.ts`): Confirm with the cursor on `ENEMY_SLOT`, the enemy present and `scanned === 0` sets `science.scanning = 1`; `scanStep` with the cursor on `ENEMY_SLOT` (and `scanned === 0`) sets `enemy.scan = min(1, enemy.scan + DT × output / SCAN_TIME)` and when `scan >= 1` sets `scanned = 1`, `scanning = 0`. Cursor on a subsystem slot: no scan starts and a running scan does not progress (same as today's "not a valid object"); moving back to the hull row resumes it. Standing, going offline or retargeting pauses as for objects. `productive.ts` treats a running enemy scan (`scanning === 1 && c === ENEMY_SLOT && present && !scanned`) as productive.

**Director:** unchanged (the enemy's presence weight and its shots as objects).

## 6. Targets

`ENEMY_SLOTS = [DEBRIS_SLOTS, DEBRIS_SLOTS + 1, DEBRIS_SLOTS + 2, DEBRIS_SLOTS + 3]` (hull, weapons, engines, shields). `isEnemySlot(k) = k >= DEBRIS_SLOTS`. `warnedTargets` sorts by `targetStableId`, ties by slot index, so the four enemy rows are contiguous and hull-first wherever the enemy's `StableId` falls among the objects. Every reader that branched on `k === ENEMY_SLOT` for "is this the enemy" now branches on `isEnemySlot(k)`: `isTarget`, `targetStableId`, `hudModel.target()`, the Science row builder and the threat loop in `hudModel.ts`, `productive`'s `anyWarned` (`k < DEBRIS_SLOTS`) and the `science.ts` guards (`scienceInput` Confirm: `isEnemySlot(c) ? c === ENEMY_SLOT && present && !scanned : <object rule>`; `scanStep`: enemy path for `ENEMY_SLOT`, early return for the other three). Readers that mean "the hull row specifically" (the enemy scan, the auto-select on arrival) keep `ENEMY_SLOT`. `console.ts`, `cycleTarget`, `removeDebris` and `sitDown` need no change (they compare, assign or walk the list). The HUD window formula is unchanged; the list can now hold 12 entries.

## 7. HUD

- `DebrisTarget` (every field present on every row): `stableId`, `kind: 'debris' | 'shot' | 'enemy'`, `room`, `eta`, `frequency: number | null`, `hull: number | null`, `system: number | null` (`EnemySystem` index for a subsystem row, `null` for objects and the hull row), `status: { hp: number; repairIn: number | null } | null` (subsystem rows only: raw `sysHp`, and `repairIn = ceil((sysRepairTick − tick) / TICK_HZ)` seconds while down, `null` while intact), `shieldsUp: boolean | null` (`sysHp[Shields] > 0` on all four enemy rows, `null` for objects). The hull row's `frequency` is `shieldFreq` when `scanned` else `null`; subsystem rows have `frequency null`, `hull null`. The Science panel's `scan` is `enemy.scan` on the hull row and 0 on subsystem rows.
- Row strings (`targetRowText(t, scan = 0)`), exact: hull row `Enemy ${round(hull × 100)}% ${eta}s ${marker}` with `marker` = `S-` when `shieldsUp === false` (takes priority over a revealed frequency), else `S${frequency}` when `frequency !== null`, else `S?`; Science appends ` ${floor(scan × 100)}%` to the hull row only while `frequency === null && scan > 0` (so `Enemy 64% 87s S? 40%` and `Enemy 64% 87s S- 40%` while unscanned; never once scanned). Subsystem rows: `Enemy ${name} ${round(hp / ENEMY_SYS_HP × 100)}%` while intact (`Enemy weapons 100%`, `Enemy weapons 50%`), `Enemy ${name} DOWN ${repairIn}s` while down; no frequency, no scan suffix. Object rows unchanged.
- Threat row: `Enemy ship: hull 64%` + for each system at 0, in `EnemySystem` order, ` ${name} DOWN` (`Enemy ship: hull 64% weapons DOWN shields DOWN`).

## 8. Tuning (first pass, all hypotheses)

```ts
SIM_VERSION = 11
ENEMY_SYS_HP = 30               // two beams or one torpedo
ENEMY_SYS_REPAIR = 45           // seconds from 0 back to full
ENEMY_EVADE = 0.15              // subtracted from the beam threshold while engines are up
ENEMY_BEAM_BASE = 0.70          // was 0.55: engines-up chance equals Combat-i's 0.70 at output 0.5; engines-down 0.85
```

Everything else from Combat-i stays (`ENEMY_HULL 100`, `ENEMY_BEAM_DAMAGE 15`, `ENEMY_TORP_DAMAGE 35`, `ENEMY_SHOT_HULL_DAMAGE 4`, `ENCOUNTER_FIRST 210`, `ENEMY_SHOTS_MAX 1`). The beam threshold is **not clamped**: `0.70 + 0.30 × output − evade` can reach 1.0 at output 1 with the engines down, and since `u < 1` every beam then hits. Worked numbers (two players, output 0.5, shields up, frequency unknown): a blind beam has a 1-in-3 chance of the right frequency; a seated Science scans the ship in 12 s and the operator then lands 70 % of beams; two **successful** beam hits (24 s of charging is the all-hit minimum) drop the shields and every beam passes; two more drop the weapons and new shots stop; or two on the engines keep it from leaving and raise the hit chance to 85 %. A torpedo takes any one system down at once. Hull: 100 means seven beam **hits** anywhere, since subsystem hits also count.

## 9. Testing

All under node, no pixi. Extended: `tests/enemy.test.ts`, `tests/productive.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/gate-survival.test.ts` (figures re-recorded). Helpers (`tests/helpers/sim.ts`): `placeEnemy(state, hull = ENEMY_HULL, shieldFreq = 1)` also fills `sysHp` with `ENEMY_SYS_HP`, `sysRepairTick` with −1, sets `shieldFreq`, `scanned 0`, `scan 0`; `disableSystem(state, system)` sets `sysHp[system] = 0` and `sysRepairTick[system] = tick + ENEMY_SYS_REPAIR × TICK_HZ`. **Pinned rolls:** combat state 7 (first float 0.012) hits at every threshold; combat state 4 (0.924) misses at 0.70 and 0.85; a fixture that fires several beams **resets `rng.combat.s` before each shot** (the pin covers one draw) and recharges with `charge = 1`. Hazards state 7 gives `shieldFreq = 1 + nextInt(createRng(7), FREQ_COUNT)` (the implementer computes and records the value; Codex's reading is frequency 1 with final state 1831565820, to be verified in the test). The debris read trap (`guardDebris`) traps reads at **every** enemy slot 8 to 11.

- **Arrival (`enemySystem` called directly):** with hazards state 7 the enemy arrives with `shieldFreq` equal to the computed value, `sysHp` all 30, `sysRepairTick` all −1, `scanned 0`, `scan 0`; the director stream is unchanged and the hazards stream advanced exactly once (final state asserted). Combat-i's "arrival draws nothing" assertion becomes "no director draw, one hazards draw".
- **Targets:** `warnedTargets` with an object `a` before and `b` after the enemy gives `[a, 8, 9, 10, 11, b]`; `isTarget` is true for 8, 9, 10, 11 while present and false for all four when absent; cycling Down from `a` visits `8, 9, 10, 11, b, a`; the Combat-i `nextTarget` fixture (ids 5, enemy 6, 7) gives `nextTarget(s, 5) === 8`, `nextTarget(s, 6) === b`, `nextTarget(s, 7) === a`, and `nextTarget(s, 6, ENEMY_SLOTS) === b` while present; `leave` with the Weapons cursor on 11 (shields) and the Science cursor on 9 retargets both to `b`, and with the enemy alone to −1; `leave` with a running enemy scan sets `scanning 0`.
- **Threshold and shields (`armed()` fixture: Recruit at Weapons allocation 2, output 0.5, `placeEnemy(s, 100, 1)`, charge 1, cursor on the hull row):** `enemyBeamThreshold` with engines up is 0.70 at output 0.5 and 0.85 at output 1 (the Combat-i `enemyBeamHits` assertions become `u < enemyBeamThreshold`: `0.69/0.71 at 0.5 → true/false`, `0.84/0.86 at 1 → true/false`); with engines down 0.85 at 0.5 (`0.84/0.86 → true/false`) and 1.0 at output 1 (`0.999 → true`); **absorbed:** selector `BeamF2` against `shieldFreq 1` returns false, hull 100, every `sysHp` 30, charge 0, `shots 1`, `hits 0`, Weapons XP `XP_PER_SHOT`, `lastShotTick === tick`, combat state **unchanged**; **matched:** `BeamF1`, combat 7 → true, hull 85, combat advanced once; the Combat-i "every selector" loop becomes: with shields up only the matched selector rolls (the other two are absorbed with combat unchanged), and with `disableSystem(Shields)` all three selectors roll and hit at combat 6 (first float 0.526); a torpedo (`torpedoLoaded 1`, combat 7) ignores the selector and the shields: hull 65.
- **Subsystem damage (cursor on the named row, combat 7 before each beam, charge reset to 1):** weapons row: hull 85 and `sysHp[Weapons] 15` after one beam; after a second, `sysHp[Weapons] 0`, `sysRepairTick[Weapons] === tick + 2700`, `enemyDisables 1`, hull 70; a third beam on the same row: hull 55, `sysHp` still 0, `sysRepairTick` **unchanged**, `enemyDisables` still 1; a torpedo on the engines row: `sysHp[Engines] 0` at once, hull 65, `enemyDisables` +1; a beam on the hull row leaves every `sysHp` at 30; the kill through a subsystem row (`placeEnemy(s, 15)`, beam on the shields row) gives `present 0`, `enemiesDestroyed 1`, `enemyDisables 1` (the shields reached 0 on the same hit), `sysHp` all 0 and `sysRepairTick` all −1 afterwards.
- **Effects (`enemySystem` called directly at chosen ticks):** weapons down (`disableSystem`): at a due `nextShotTick` the enemy re-arms (director advanced once, `nextShotTick` as computed from the draw) and spawns nothing (hazards unchanged, `shotsInFlight 0`); at `sysRepairTick[Weapons] − 1` nothing; at `sysRepairTick[Weapons]` the system is 30, `sysRepairTick −1`, and `nextShotTick === tick + 300` **whether the old value was earlier or later**; engines down: over 100 calls `departTick` grows by exactly 100, and at the original `departTick` the enemy is still present; `disableSystem(Engines)` raises the threshold to 0.85 at output 0.5; repaired engines: `departTick` stops moving; a repair due on the same tick as the departure happens first (the saved state after the tick has the system at 30 and the enemy absent); shields down then repaired at `sysRepairTick`: a mismatched beam is absorbed again.
- **Scan:** Confirm on the hull row (`present`, `scanned 0`) sets `scanning 1`; `scanStep` with output 0.5 adds `DT × 0.5 / SCAN_TIME` per call and reaches `scan 1`, `scanned 1`, `scanning 0` after `ceil(SCAN_TIME / 0.5 / DT)` calls; `scan` never exceeds 1; Confirm on a subsystem row, on a scanned enemy, or with the enemy absent sets nothing; a running scan does not progress while the cursor is on a subsystem row and resumes on the hull row from the same value; standing (`standUp`) or `failStation` pauses it; Confirm on the hull row after a pause resumes with the kept progress; `leave` clears `scan`/`scanned` and `scanning`; Science is productive during a running enemy scan and not productive with the enemy present, scanned, and no object in flight; Navigation is not productive with only the enemy present (all four slots); `guardDebris` on slots 8 to 11 throws nothing across Confirm, `scanStep`, `isProductive`, `fireWeapon` and `buildHudModel` with the cursor on each enemy slot in turn.
- **Snapshot:** round trip of `sysHp[3]`, `sysRepairTick[3]`, `shieldFreq`, `scanned`, `scan` and `enemyDisables` with non-default values; each of the ten fields alone changes the hash; version-10 rejection (both existing fixtures move from 9 to 10); **continuation:** a quiet two-player state (`makeState(2, 31)`) with `placeEnemy`, `disableSystem(Weapons)` with `sysRepairTick = tick + 10`, `nextShotTick = tick + 15`, Science (pid 1) seated with the cursor on the hull row and `scanning 1`, is saved; both copies step 40 ticks with neutral intents; the test asserts in the continued run that the repair happened (`sysHp[Weapons] 30`), that the shot after it spawned (`shotsInFlight 1`), that `enemy.scan` grew; then every enemy field and the hash equal the uninterrupted run's.
- **HUD:** `targetRowText` for the hull row: `Enemy 64% 87s S?`, `Enemy 64% 87s S2` (frequency 2), `Enemy 64% 87s S-` (shields down, frequency 2 revealed: `S-` wins), `Enemy 64% 87s S? 40%` and `Enemy 64% 87s S- 40%` (scan 0.4, unscanned), no suffix once scanned (`Enemy 64% 87s S2` with scan 1); subsystem rows `Enemy weapons 100%`, `Enemy weapons 50%`, `Enemy weapons DOWN 31s`, `Enemy engines DOWN 1s`, `Enemy shields 100%`, and no scan suffix even with `scan > 0`; the model gives four enemy rows with `system` `null, 0, 1, 2`, `status` `null` then `{ hp: 30, repairIn: null }`, and for a disabled system `{ hp: 0, repairIn: 45 }` at the moment of disabling; `shieldsUp` true on all four, `null` on an object row; the Combat-i nine-entry window fixtures become twelve entries: cursor on the hull row (index 8) keeps `first 3` (Weapons) and `2` (Science); cursor on the shields row (index 11) gives `first 6` and `5`; the threat row with no suffix, ` weapons DOWN`, and ` weapons DOWN shields DOWN`.
- **Telemetry and acceptance:** the record's `enemy` block is `{ met, destroyed, disables }`; the exact-record fixture sets `enemyDisables = 3` and expects `{ met: 2, destroyed: 1, disables: 3 }`; default fixtures gain `disables: 0`; the acceptance `rec()` fixture gains `disables`; the row regex tails change from `0\/0$` to `0\/0\/0$` and from `2\/1$` to `2\/1\/3$` with the matching fixture values; the header keeps `enemy`.
- **Combat gate (extend the Combat-i one):** `makeState(2, 1)`, `quiet`, the Recruit (pid 0) at Weapons, `placeEnemy(s, 100, 2)` with `nextShotTick = 1e9` and the original `departTick`, charge 0, cursor on the hull row, selector `BeamF1`; the first full charge is fired on `F1` (absorbed: `shots 1`, `hits 0`, combat unchanged); the test then sets `selector = BeamF2` and, before every later Confirm, `rng.combat.s = 7`; the enemy is destroyed after exactly 8 shots (`shots 8`, `hits 7`, `enemiesDestroyed 1`), `present 0`, before the original `departTick`.
- **Survival gate:** the assertions are unchanged (`ended 0`, both crew Conscious, `encounters >= 1`); the figures **will differ** from Combat-i's because arrival now draws once from `rng.hazards`, shifting every later hazards draw; rerun seeds 1 to 3 and record the new min hull, encounter impacts and min health in `docs/gates.md`. If a seed fails: `ENEMY_FIRE_INTERVAL` 15 → 20 (Combat-i's fallback 4), applied before the single golden re-bless and recorded in `docs/gates.md` and the plan's amendments section; do not weaken the assertions.
- **Golden replay:** re-blessed once (version 11, the new fields; no enemy in the two-minute replay, so the hashes change only through the new fields) with the cause recorded.

## 10. Gate

Added to `docs/gates.md` as "Combat-ii: enemy systems and shields (closes sub-project 2 for this run)", with separate entries:

- [x] `npm test` passes: enemy (arrival with one hazards draw, four target rows, threshold with engines up and down, absorbed and matched beams, subsystem damage and the repair timer, weapons/engines/shields effects, the enemy scan incl. pause and resume, the four-slot read trap), snapshot (ten new fields round-trip and hash, version-10 rejection, continuation through a repair, a shot and a scan), HUD (row strings in every state, four enemy rows, twelve-entry window, threat suffixes), telemetry record and acceptance column; the golden replay re-blessed once (version 11).
- [x] `tests/gate-survival.test.ts` passes on seeds 1-3 (figures re-recorded; any tuning change listed).
- [x] Combat gate: one absorbed `F1` beam, then seven `F2` hits destroy the enemy inside the window.
- [x] `npm run acceptance 5 1`, dated, three rows whose `enemy` column reads `1/0/0`.
- [ ] Manual, two players (`npm run dev`): from Weapons the enemy shows four rows (`Enemy 100% 118s S?`, `Enemy weapons 100%`, `Enemy engines 100%`, `Enemy shields 100%`); a beam on a non-matching `F` changes no percentage; Science scanning the hull row turns `S?` into `S<k>`, and beams on that `F` land about two times in three (the engines still make some miss); two hits on `Enemy shields` show `Enemy shields DOWN 45s` and `S-`, after which beams on any `F` roll; two hits on `Enemy weapons` stop **new** `Shot:` rows (a shot already in flight still lands or is shot down) until `DOWN` counts down and the row reads `Enemy weapons 100%` again. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## 11. Amendments to Combat-i made by this spec

- Arrival draws once from `rng.hazards` (the shield frequency); Combat-i §5 step 1 said "no RNG draw".
- `ENEMY_BEAM_BASE` 0.55 → 0.70 with `ENEMY_EVADE` 0.15 subtracted while the engines are up, so the engines-up chance is unchanged.
- `telemetry.hits` counts every damaging hit on the enemy, hull or subsystem; absorbed beams count as shots only.
- `nextTarget` accepts a list of excluded slots.

## 12. Open questions deferred

- Enemy evasion as a function of our Navigation (a dogfight model): later, with run structure.
- Rewards for a kill or a disable: roadmap item 9.
- Enemy "repair" flavour and a visible enemy crew: never for this scope.
