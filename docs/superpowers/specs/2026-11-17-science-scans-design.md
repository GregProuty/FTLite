# Sci-1: Science scans, the unidentified enemy and the derelict (design)

Date: 2026-11-17. Status: design, owner-approved in brainstorming. Builds on the enemy ship window (`2026-11-17-enemy-ship-window-design.md`), the Artemis consoles (`2026-11-17-artemis-consoles-design.md`) and the Helm demo duel (`2026-11-14-helm-demo-design.md`).

## 1. Goal

Give the duel a Science job worth a seat, inspired by the Artemis Science station: the enemy starts as an unidentified contact that turns hostile after 30 s (owner decision 2026-11-17 below), a second contact (a derelict with loot) sits on the map, and the crew chooses what to scan, in what order. Scans are two-level like Artemis (Level 1 surface, Level 2 detailed). Weapons gains a laser frequency (A/B/C) that Science's Level 2 scan tells it how to tune.

This is **Sci-1**: the world, the scans and a Science console a character can walk to and sit at. It still plays with one or two players. **Sci-2** (separate spec) adds the third online player (three-seat room, lobby, seat notice) and the three-player playtest checklist.

## 2. Owner decisions (fixed)

1. The enemy starts unidentified and turns hostile about 20 s into the round (it "scans the player ship").
2. Ambush: the crew may fire first; a hit turns it hostile at once.
3. Science chooses both which contact to scan and how deep (Level 1, then Level 2 for the enemy).
4. A second contact type: a derelict with loot. Getting the loot: Science scans to reveal the cargo and any trap; Helm flies close and slow for a few seconds to salvage. Loot helps this round.
5. Enemy Level 2 gives: room labels and damage in the window (rooms), the enemy's weapon state (weapons), and its weak shield frequency (shields). There is no "identify delays hostility" effect.
6. Weapons tunes the laser to A, B or C; matching the enemy's weak frequency strips 2 shield layers per hit instead of 1.
7. Science is a third console. Helm and Weapons can also scan from their consoles; the scans are the same, only slower.
8. Artemis inspiration: big map, click a contact to select (reticle + analysis panel), SCAN button, unidentified contacts shown as plain markers, the Science selection shown to Helm and Weapons, hover for bearing and range.
9. Presentation stays CRT amber.

**Owner decision 2026-11-17 (merge with Hunter grace).** The merged game has one hostility rule: the Hunter grace's (`2026-11-17-hunter-grace-design.md`), carried by Sci-1's state and presentation. It replaces decisions 1 and 2 and the old Patrol: each round the enemy holds still for **30 s** (`HOSTILE_AFTER_TICKS` 1800 from `startTick`): no thrust and no turn (it keeps its spawn drift), no laser charge, no missile launch; it still records its trail and runs its repair timers. The hold ends early **as soon as the crew fires** this round: a laser release (hit or miss) or a missile launch. **Shields stay full** (no layer-down start, no shield hold). The battle music follows `hostileAt`. Everything else in this spec stands. SIM_VERSION: the merged sim is 47 (master's Hunter grace was 45, homing torpedoes 46).

## 3. The round, start to finish

1. The round begins (fresh duel or rematch). The enemy is **holding** (`hostileAt` −1); both contacts are at level 0 (unknown). The derelict is on its orbit. The **hostility clock** runs on the round-relative tick `rt = state.tick − state.startTick` (§4.1).
2. While holding the enemy holds still: no thrust, no turn, no charge, no launch (§4.2). Its shields are full and recharge as usual.
3. It turns **Hostile** (today's behaviour) at the first of: the clock, 30 s (§4.1); the crew's first shot this round, a laser release (hit or miss) or a missile launch. Permanent for the round.
4. Meanwhile the crew may scan either contact, salvage the derelict, and tune the laser.
5. The round ends exactly as today (hull to 0; the crew wins when every other active **ship** is gone). The derelict is not a ship slot and never counts.

## 4. Sim rules

Contact ids are **not** ship slots: `Contact.Enemy = 0`, `Contact.Derelict = 1`. The enemy contact is drawn and aimed through the hunter's ship slot (`hunterSlot(state)`, slot 1 in the duel); the derelict has no slot.

### 4.1 Round-relative time and hostility

- `TacticalState.startTick`: the tactical tick the round began on. `createTacticalState` sets 0; `startRound` (sim/duel/step.ts) sets it to `tick` beside `hunter.lastLaunch += tick`. Every round-relative rule below uses `rt = state.tick − state.startTick`, evaluated before `state.tick++`.
- `TacticalState.hostileAt`: the round-relative tick the enemy turned hostile, −1 while it holds. `createTacticalState` sets −1 (full shields; there is no Patrol mode, `hunter.mode` keeps Hunt and Repair). `startRound` needs no shift for it (it is round-relative and the new round starts at −1). `enemyHostile(t)` (`hostileAt >= 0`, science.ts) is the one predicate the hold, the views and the battle music read.
- **Hostility step** (§4.6 position): if `hostileAt < 0` and (`rt >= HOSTILE_AFTER_TICKS − 1`, or the round's crew counters show a shot: `systems[CREW_SLOT].shots > 0` or `missilesLaunched > 0`, which includes this tick's release or launch), then `hostileAt = rt` and a `hostile` event is pushed with cause `laser` (shots), `missile` (a launch) or `clock`, in that precedence. `HOSTILE_AFTER_TICKS` = 1800: with no shot the step on `rt` = 1799 turns it, so it has held for exactly 1800 steps (30 s) and the first hostile think is on `rt` = 1800 (the Hunter grace's `tick − baseTick >= 1800`, read before the think).

### 4.2 The hold (hunter.ts)

- `hunterThink` while `hostileAt < 0`: updates the trail ring buffer and runs `updateRepair` as today, then returns its input with `axes { turn: 0, thrust: 0 }`, no lock, no charge and no launch, and clears `fireAt` (the Hunter grace's hold). So it keeps only its spawn drift, the laser charge does not build and Fire is not held.
- `tickWeapons` is unchanged: no shield hold.

### 4.3 Scans

- `TacticalState.known: [number, number]`: level known per contact. Enemy 0..2, derelict 0..1.
- One ship scanner (Artemis has one): `TacticalState.scan = { contact, level, progress, rate, by }`; idle is `contact = −1` with the other four 0. `by` is the station index of the console the scan runs from.
- Units: Level 1 completes at 900, Level 2 at 1800 (`SCAN_UNITS = [0, 900, 1800]`). Rates: `SCAN_RATE_SCIENCE = 5` from the Science console, `SCAN_RATE_OTHER = 2` from Helm or Weapons.
- **Progress step** (§4.6 position), when `contact ≥ 0`: if `crew.scanner` is false (§4.6), the scan goes idle. Otherwise `progress += rate`; if `progress >= SCAN_UNITS[level]`, `known[contact] = level`, a `scanDone` event is pushed and the scan goes idle.
- **Exact times**: a scan started by a command admitted at tick t gets its first progress step in tick t, so it completes in the step of tick `t + ceil(units / rate) − 1`: from Science, Level 1 after 180 steps (3 s), Level 2 after 360 (6 s); from Helm or Weapons 450 (7.5 s) and 900 (15 s).
- A scan of the enemy keeps running when it turns hostile.
- `TacticalState.designated`: the contact Science has pointed out, −1 none. No rule reads it; it is shared so every screen shows it.

### 4.4 Frequencies

- `TacticalState.weakFreq` 0..2 (A..C), drawn in `createTacticalState` (§4.5 draws).
- `ShipSystems.freq` 0..2, the laser's tuned frequency; every ship starts at 0; only the crew's changes.
- `fireLaser`: when the shooter is `CREW_SLOT`, the target's shields are up and `freq === state.weakFreq`, a hit strips `min(2, shields)` layers; otherwise 1 as today. `layersStripped` adds the layers actually removed. The hunter's laser is unchanged.

### 4.5 The derelict

- `TacticalState.derelict = { orbitR, phase, loot, trapped, salvage, salvaged }` (salvaged as 0/1 in the module).
- **Draws**, in `createTacticalState`, after `generateMap` and before anything else uses the rng, in this order, with `shared/rng.ts`:
  1. `weakFreq = nextInt(rng, 3)`.
  2. `u = nextInt(rng, 501)`; `orbitR = u <= 300 ? 700 + u : 1400 + (u − 301)`, so `orbitR` ∈ [700, 1000] ∪ [1400, 1599], clear of the asteroid belt (`BELT_INNER` 1100 to `BELT_OUTER` 1300). Drawn once.
  3. `phase = nextInt(rng, 256)`, redrawn while the position at `rt = 0` is within 600 of either spawn, at most 16 draws in all; the last draw stands.
  4. `loot = nextInt(rng, 3)`: 0 `Hull`, 1 `Missiles`, 2 `Shield`.
  5. `trapped = nextInt(rng, 3) === 0`.
- **Position** (pure `derelictPos(state)` in the new `sim/tactical/science.ts`), with the sim's table trig only (no `Math.sin`/`Math.cos`):
  - `ωh = circularSpeed(orbitR) / orbitR · DT · HEADING_COUNT / (2π)` heading units per tick (clockwise, like the spawn orbits).
  - `a = phase + ωh · rt`; `i = floor(a)`, `f = a − i`; `[ux, uy] = dirBetween(wrapHeading(i), f)`; position `(ux · orbitR, uy · orbitR)` about the planet at the origin.
  - velocity: `[vx, vy] = dirBetween(wrapHeading(i + HEADING_COUNT / 4), f)` times `circularSpeed(orbitR)` (prograde, as `spawnAt` uses heading + 64).
- It does not collide with anything; missiles and lasers ignore it.
- **Loot effects**: `Hull` +8 hull capped at the class hull; `Missiles` magazine to the class magazine; `Shield` +1 layer, allowed to reach `layers + 1` once; it is never regained above `layers` (tickWeapons already holds the clock at `shields >= layers`).
- **Salvage step** (§4.6 position), while `salvaged` is 0 and the round runs: if the crew ship (slot 0) is within `SALVAGE_RANGE` = 60 of `derelictPos` and its speed relative to the derelict's velocity is at most `SALVAGE_SPEED` = 40 u/s, `salvage += 1`, else `salvage = 0`. When `salvage` reaches `SALVAGE_TICKS` = 300 (5 s): `salvaged = 1`, the loot applies to the crew's systems, then, if trapped, the crew loses `TRAP_HULL` = 3 hull (floor 0, so a trap can decide the round in the outcome check that follows); a `salvage` event is pushed. It needs no scan and no seated Helm.

### 4.6 The tactical step

- `ShipInput` gains `scanner: boolean`: whether the station running the ship's scan is attended. step.ts sets it to `scan.contact < 0 || attendant(d, scan.by) >= 0` after the `contactScan` admission loop (§5), from the scan as it stands after admission (so a same-tick takeover by an attended seat keeps the scan alive). Every other constructor of a crew `ShipInput` (the hunter's, `UNCREWED_INPUT`, the gate and test bots) sets `true`.
- `stepDuel` order, fixed: think → weapon commands → fly → missiles fly → contacts → missile contacts → weapon clocks → **hostility** → **scan progress** (crew input's `scanner`) → **salvage** → outcome → tick. Hostility, scan and salvage live in the new `sim/tactical/science.ts`, called from `stepDuel`, so the headless gates (which call `stepDuel` directly) get Patrol and hostility too.
- New per-tick `DuelEvent` kinds (not hashed): `{ kind: 'hostile'; cause: 'clock' | 'laser' | 'missile' }`, `{ kind: 'scanDone'; contact: number; level: number }`, `{ kind: 'salvage'; loot: number; trapped: boolean }`.

## 5. Commands

Three new `DuelCommand` kinds. `contactScan` is named so it does not collide with the sector's `scan` in the shared `Command` union.

| Command (wire) | Who | Rule | Results |
|---|---|---|---|
| `{ kind: 'contactScan'; contact: number }` (`z.number().int()`) | Seated at Helm, Weapons or Science (`attendant` of that station is the sender) | Next level for that contact: `level = known[contact] + 1`. If the scanner is idle, start it (`progress 0`, `rate` and `by` from the sender's station). If it is already on that contact and level: keep the progress; if the sender's rate is higher, take it and its `by` (applied), else `noop` (Artemis ignores a repeat click). If it is on the other contact, abort that one (progress lost) and start this one. | `invalid-seat` (not seated at one of the three); `malformed` (contact not 0 or 1); `unavailable` (that contact fully known) |
| `{ kind: 'designate'; contact: number }` (`z.number().int()`) | Seated at Science | Sets `designated` | `invalid-seat`; `malformed` (not −1, 0 or 1); `noop` if unchanged |
| `{ kind: 'laserFrequency'; freq: number }` (`z.number().int()`) | Seated at Weapons | Sets the crew's `freq`; applies to a release in the same tick | `not-at-weapons`; `malformed` (not 0..2); `noop` if unchanged |

- All three are checked first for `stale-tick`, like the other tactical commands. No new reason strings.
- **Admission phase**, in step.ts after the throttle loop: every `laserFrequency` in envelope order, then every `designate`, then every `contactScan`, each against the seats as they stand after the seat phase; within a kind the last applied wins.
- They join `DUEL_KINDS`, `duelWire.commands` (net/codec.ts) and the new science module's `commands` list (§6.2).

## 6. Seats, state and snapshots

### 6.1 Seats

- `DuelState.science`: the station index of the layout's Science console (`stationOfKind[StationKind.Science]`), or −1 when the layout has none. The Hound has one in Ops, in the console group shared with Engineering and Doors; no group check against Helm/Weapons is needed (other room). Added to `DUEL_NOT_SNAPSHOTTED` ("the Science station index, from the layout").
- `sit` is allowed at `nav`, `weapons` and `science` (when ≥ 0). `consoleInReach` includes it. `Seat` gains `'science'` (`seatOf`).
- Two players still: `present` and `helmPlayer` stay two-wide (Sci-2 widens them). The scripted pair and the gate bots never scan, designate, tune or salvage on purpose.

### 6.2 Module fields and validation

- New tactical module **`science`** (sim/tactical/hash.ts), in `TACTICAL_MODULES` after `ship` and in `DUEL_MODULES` after `ship` (path `tactical`). Fields in this order: `startTick`, `hostileAt`, `known.0`, `known.1`, `scan.contact`, `scan.level`, `scan.progress`, `scan.rate`, `scan.by`, `designated`, `weakFreq`, `derelict.orbitR`, `derelict.phase`, `derelict.loot`, `derelict.trapped`, `derelict.salvage`, `derelict.salvaged`. Its `commands` are the three kinds; its `reasons` `stale-tick`, `invalid-seat`, `not-at-weapons`, `malformed`, `unavailable`.
- `ship` module: `freq` joins the systems record's canonical fields right after `lock`.
- `cloneTacticalFromModule` builds fresh `known`, `scan` and `derelict` containers (no sharing with the original).
- Validation: `hunter.mode` within Hunt..Patrol; `shields` within 0..(largest class layers + 1); `freq` 0..2; `startTick`, `scan.progress`, `derelict.salvage` counts; `hostileAt` ≥ −1; `known.0` 0..2, `known.1` 0..1; `scan.contact`, `designated` −1..1; `scan.level` 0..2; `scan.rate` 0, 2 or 5; `scan.by` ≥ 0; `weakFreq`, `derelict.loot`, `derelict.trapped` and `derelict.salvaged` in range; `derelict.orbitR` in the drawn bands; `derelict.phase` 0..255.

### 6.3 SIM_VERSION and the goldens (two steps, as Artemis-ii §5.6)

1. **Step 1**: `SIM_VERSION` 44 → 45 (master is at 44 after start-aboard); every new field at a neutral value (no Patrol: `hostileAt` 0 and mode Hunt from the start, no new rng draws, scan idle, `freq` 0, derelict at `orbitR` 700, `phase` 0, `loot` 0, `trapped` 0, `salvage` 0 and `salvaged` 1, which passes §6.2 validation and does nothing), the three commands and their admission, and `MIGRATIONS[44] = { change: 'Sci-1: science scans', rename: () => undefined, derived: [], added: [/^science\./, /^ship\.systems\.\d+\.freq$/] }`. Bless; the oracle proves every existing run unchanged.
2. **Step 2**: Patrol, the draws, the scans' effects, salvage and the frequency strip; bless the goldens again at 45 with the reason.

## 7. What each screen shows

### 7.1 Every console (Helm, Weapons, Science)

- **Unknown contacts** (level 0) draw on the map as a plain `?` marker in `CRT.dim`: no silhouette, no shield ring. The enemy's window title reads `UNKNOWN CONTACT`.
- **Hostility line** in the readout while the enemy holds: before enemy Level 1, `INCOMING SCAN` blinking (no number); after Level 1, `HOSTILE IN n s` with `n = ceil((1800 − rt) / 60)` (30 at the round start). Once hostile: `HOSTILE` for 3 s, then gone.
- **Battle music** follows `hostileAt`: calm while the enemy holds, engaged once it is hostile.
- **Scan ring**: a progress arc around the contact being scanned, on every map.
- **Designation**: a pulsing `CRT.hot` bracket on the designated contact, on every map. On Science the Weapons lock target also gets a slow rotating ring (Artemis).
- **Derelict** at level 1: a small wreck mark, label `DERELICT` with its loot (`HULL`, `MISSILES`, `SHIELD`), `TRAPPED` in the alert colour if trapped, `SALVAGED` once done. At level 0: the `?` marker.
- **Salvage ring**: while `salvage > 0`, a ring round the crew ship filling over 5 s.

### 7.2 The contact window (replaces the enemy window's opening rules)

- The controller is re-keyed on a contact id: `ContactState { contact: 0 | 1; aim: boolean }`. A new pure `pickContact(input, p): 0 | 1 | null` uses `pickShip` for the enemy and `derelictPos` with the same `pickRadius` for the derelict; nearest wins.
- Shown on Helm, Weapons and Science. The sync's "ship inactive" close applies to the enemy contact through the hunter slot; the derelict is always there. A change of contact disarms the aim.
- **T** (supersedes enemy-window §3's T rule): cycles enemy → derelict → closed on Helm and Weapons; on Science it cycles enemy → derelict → none and sends `designate` each time.
- Every window has a **SCAN** button with the next level (`SCAN 1`, `SCAN 2`) or `SCANNED`; a progress bar while the scanner is on this contact; on Helm and Weapons the button reads `SCAN 1 (SLOW)`.
- **Enemy, level 0**: `UNKNOWN CONTACT`, no drawing. **Level 1**: the scout drawing with room outlines, labels `?`, no damage hatching; hull bar, shield pips, the hostility line. **Level 2**: today's full window (labels, damage, lock mark), plus `WEAK FREQ B`, an `ENEMY LASER` charge bar and `MISSILE READY` / `RELOADING` (existing hunter state, presentation only).
- **Derelict**: level 0 `UNKNOWN CONTACT`; level 1 its loot, trap and range, and the hint `CLOSE TO 60, MATCH SPEED`.
- Weapons' aim (LASER → reticle → room) needs the enemy contact at level ≥ 1 (there is no drawing before) and is enemy-only (`arm` is a no-op on the derelict). The WEAP/SHLD/ENG buttons on the Weapons panel work at any level, as today. Science never aims.

### 7.3 The Science console

- `ConsoleStation`, `consoleTabs`' reach and the layout gain `'science'`. Layout: no station block; the map is full width less `CONTACT_RESERVE`, and the contact window at `CONTACT` is always shown (`NO CONTACT SELECTED` when none).
- Click a contact: selects it (opens it in the panel) **and** sends `designate`.
- **Hover readout**: `BRG 327 RNG 1450` from the crew ship to the cursor (bearing in whole degrees clockwise from map up, range in world units rounded to 10). Presentation only.
- **Keys on Science only**: S scans the selected contact (S is the throttle key only at the Helm, so there is no clash); T as in §7.2; Esc deselects, then pauses (the window's Esc rule).

### 7.4 Weapons

- The Weapons station block gains a frequency row: buttons `A B C` (current one lit) and keys 1, 2, 3. After enemy Level 2 the weak one is marked `◆` on every console that shows the row.

## 8. Architecture (files)

- **Sim**: `sim/tactical/state.ts` (fields, `HunterMode.Patrol`, creation draws), `hunter.ts` (Patrol), `weapons.ts` (`scanner` in ShipInput, Patrol shield hold, frequency strip), new `science.ts` (hostility, scan progress, salvage, `derelictPos`), `duel.ts` (step order), `hash.ts` (science module, `freq`, clone, validation), `tuning.ts` (constants), `sim/duel/state.ts` (`science`), `step.ts` (sit, admission, `scanner`, `startTick`), `modules.ts` (DUEL_MODULES, DUEL_NOT_SNAPSHOTTED), `net/contracts.ts` and `net/codec.ts` (three commands), `scripts/golden/duelOracle.ts` (MIGRATIONS[44]).
- **Presentation**: `render/tactical` (unknown marker, scan ring, designation, derelict, salvage ring, `pickContact`), `render/duel/consoleModel.ts` and `consoleLayout.ts` (science station, hostility line, frequency row), `render/duel/contactModel.ts` (contact kinds and levels), `app/duel/contactController.ts` (contact ids, Science), `app/duel/controls.ts` (`seatOf`, `consoleInReach`), input (S and 1/2/3 by station, hover), `ui/duel/*` (SCAN button, frequency row, Science layout).

## 9. Edge cases

- A scan of a contact already at its maximum is rejected `unavailable`; the button shows `SCANNED`.
- The derelict at level 0 may be salvaged (a gamble).
- A decided round runs no physics, so no salvage or scan progress.
- `Shield` loot at 0 layers gives 1; at full gives class layers + 1.
- A layout without a Science console: no Science seat; Helm/Weapons scans still work.
- A crew missile launched in Patrol that lands after hostility changes nothing; one that lands in Patrol turns it hostile.
- A crew laser that misses does not turn it hostile.

## 10. Tests

- **Hostility**: hostile in the step of `rt` 1199 (cause clock) and in Patrol for every earlier step; a laser hit at `rt` 300 turns it that tick (cause laser) with shields one below; no enemy charge or launch in Patrol; no shield regain in Patrol; **rematch**: in round 2 Patrol again lasts 1200 steps.
- **Scans**: 180/360/450/900 steps; repeat on the same contact `noop`; a faster seat takes over the rate; the Helm player stands while Science takes over the Helm's scan in the same tick, and the scan continues at Science's rate; switching contacts aborts; leaving the seat cancels; `known` and `scanDone`; `unavailable`; admission per seat with the exact reasons.
- **Frequency**: a match strips 2 (1 when only 1 is up), otherwise 1; same-tick tuning applies; admission.
- **Derelict**: the draw order and values per seed; orbitR outside the belt; ≥ 600 from spawns at `rt` 0 when any of the 16 draws allows it; `derelictPos` moves along the orbit at the expected speed; salvage counts only within range and speed, resets when leaving, applies each loot, the trap costs 3 hull, once only.
- **Seats**: sit at Science; `consoleInReach` reaches it.
- **Snapshots**: hash and flatten round trip with every new field; a step-1 snapshot (neutral values) validates and restores; a snapshot during Patrol (`rt` 600) and one after `Shield` loot both validate and restore; the clone shares no container; online replica agrees with the authority over a run with scans, designation, tuning and salvage.
- **Views**: model tests for unknown/L1/L2 windows, the hostility line, the frequency row, the Science panel, the hover readout, T cycling, `pickContact`.
- **Screens**: harness shots of Science (panel, hover, scan ring), an unknown enemy, a derelict with loot, the Weapons frequency row, the salvage ring.
- **Goldens and gates**: the two steps of §6.3. `tests/duelGates.test.ts` keeps its bands unchanged (median 180 to 300 s; the crew both wins and loses). Patrol is expected to lengthen duels by up to 20 s. If a band fails after step 2, the implementer reports the numbers and stops; the owner decides (no band edits and no retuning without the owner).

## 11. Out of scope

- The third online player, the three-seat room and the playtest checklist (Sci-2).
- Sensor range limits, nebulae, more contact kinds, more derelicts.
- Bot scanning or salvaging.
- Comms, hailing, surrender.
