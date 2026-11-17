# Sci-1: Science scans, the unidentified enemy and the derelict (design)

Date: 2026-11-17. Status: design, owner-approved in brainstorming. Builds on the enemy ship window (`2026-11-17-enemy-ship-window-design.md`), the Artemis consoles (`2026-11-17-artemis-consoles-design.md`) and the Helm demo duel (`2026-11-14-helm-demo-design.md`).

## 1. Goal

Give the duel a Science job worth a seat, inspired by the Artemis Science station: the enemy starts as an unidentified contact that turns hostile after about 20 s, a second contact (a derelict with loot) sits on the map, and the crew chooses what to scan, in what order. Scans are two-level like Artemis (Level 1 surface, Level 2 detailed). Weapons gains a laser frequency (A/B/C) that Science's Level 2 scan tells it how to tune.

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

## 3. The round, start to finish

1. The round begins (fresh duel or rematch). The enemy (slot 1) is in **Patrol**; its contact level is 0 (unknown). The derelict is placed on its orbit, contact level 0. A **hostility clock** starts: the enemy turns hostile at `HOSTILE_AFTER_TICKS` = 1200 (20 s at 60 Hz) after the round's first tick.
2. While in Patrol the enemy does not fire, charge or launch; it only flies (threat avoidance, no pursuit), and its shields start one layer below full (`SHIELD_LAYERS − 1` = 1) and do not recharge.
3. It turns **Hostile** (Hunt, today's behaviour, shields recharge normally from then on) at the first of: the hostility clock running out; a crew laser hit on it (a release that `hit`, stripped or not); a crew missile landing on it. The turn is recorded at the end of the tick that caused it and is permanent for the round.
4. Meanwhile the crew may scan either contact, salvage the derelict, and tune the laser.
5. The round ends exactly as today (hull to 0; the crew wins when every other active **ship** is gone; the derelict is not a ship and never counts).

## 4. Sim state (all new state is in the tactical modules and hashed)

All of it is reset by a new round, because a round builds a fresh tactical state.

### 4.1 Hostility

- `hunter.mode` gains `HunterMode.Patrol = 2`. `createTacticalState` sets `Patrol`.
- `TacticalState.hostileAt: number`: the tactical tick on which the enemy turned hostile, −1 while in Patrol.
- The hostility clock compares `state.tick` with `HOSTILE_AFTER_TICKS` (tactical ticks restart at 0 every round).

### 4.2 Contacts and scans

- Contact ids: `Contact.Enemy = 0`, `Contact.Derelict = 1`.
- `TacticalState.known: [number, number]`: the level known per contact. Enemy 0..2, derelict 0..1.
- `TacticalState.scan`: one ship scanner (Artemis has one): `{ contact: number (−1 idle), level: number, progress: number, rate: number, by: number }`.
  - `progress` counts up by `rate` per tick; the level completes when it reaches `SCAN_UNITS[level]`: Level 1 = 900, Level 2 = 1800.
  - `rate` is `SCAN_RATE_SCIENCE` = 5 when started from the Science console and `SCAN_RATE_OTHER` = 2 from Helm or Weapons.
  - `by`: the station index of the console that started it.
- **Times** (exact, at 60 Hz, from the values above): from Science, Level 1 takes 180 ticks (3 s) and Level 2 360 ticks (6 s); from Helm or Weapons, 450 ticks (7.5 s) and 900 ticks (15 s), i.e. 2.5× as long.
- `TacticalState.designated: number`: the contact Science has pointed out (−1 none). Shown to everyone, no rule effect.

### 4.3 The weak frequency and the laser frequency

- `TacticalState.weakFreq: number` 0..2 (A..C), drawn once per round in `createTacticalState` from the tactical rng after the map.
- `ShipSystems.freq: number` 0..2, the laser's tuned frequency; every ship starts at 0 (A). Only the crew's changes.
- `fireLaser`: a hit on a ship with shields up strips **2** layers (to a floor of 0) when the shooter is the crew and `freq === weakFreq`, else 1. `layersStripped` counts layers actually removed.

### 4.4 The derelict

- `TacticalState.derelict: { orbitR: number; phase: number; loot: number; trapped: boolean; salvage: number; salvaged: boolean }`.
- **Position** is closed form, never integrated: a clockwise circular orbit around the planet at `orbitR`, angle `phase + ω·tick`, with ω the circular-orbit angular speed for `orbitR` under the map's gravity (the same `circularSpeed` the spawns use). Velocity is the matching tangent. A pure function `derelictPos(state)` returns `{x, y, vx, vy}`.
- It does not collide with anything and is not a ship slot; missiles and lasers ignore it.
- **Placement**, drawn in `createTacticalState` after `weakFreq`: `orbitR` uniform integer in [900, 1500]; `phase` a heading index 0..255 chosen so that at tick 0 it is at least 600 from both spawns (draw, reject and redraw up to 16 times, then take the last; the draws are deterministic).
- **Loot** (`loot` 0..2), drawn next: `Hull` (+8 hull, capped at the class hull), `Missiles` (magazine to full), `Shield` (+1 shield layer above the class maximum, for this round; it is lost when stripped and never recharges above the class maximum).
- **Trapped**, drawn next: true with probability 1/3.
- **Salvage**: each tick, if not `salvaged`, the crew ship (slot 0) is within `SALVAGE_RANGE` = 60 of the derelict's position and the crew ship's speed relative to the derelict is at most `SALVAGE_SPEED` = 40 u/s, `salvage` goes up by 1; otherwise it resets to 0. At `SALVAGE_TICKS` = 300 (5 s): `salvaged = true`, the loot applies to the crew's systems, and if `trapped` the crew loses `TRAP_HULL` = 3 hull (after the loot). It fires a `salvage` event (§4.6).
- Salvage needs no scan and no seated Helm (anyone flying, or coasting into it, counts).

### 4.5 Where the new steps run in the tick

In `stepDuel`, fixed order: think → weapon commands → fly → missiles fly → contacts → missile contacts → weapon clocks → **hostility check** (laser/missile hits on the enemy this tick, or the clock) → **scan progress** → **salvage** → outcome → tick. The hunter's Patrol branch is inside `hunterThink`.

### 4.6 Events (per tick, not hashed)

New `DuelEvent` kinds: `{ kind: 'hostile'; cause: 'clock' | 'laser' | 'missile' }`, `{ kind: 'scanDone'; contact; level }`, `{ kind: 'salvage'; loot; trapped }`. Views use them for a line of text and a sound.

## 5. Commands (duel command union)

| Command | Who | Rule | Rejections |
|---|---|---|---|
| `{ kind: 'scan'; contact: number }` | A player seated at Helm, Weapons or Science | Starts the next level for that contact (`known + 1`). If the scanner is already on that contact, `noop` (Artemis: a repeat click is ignored). If it is on the other contact, that scan is aborted (progress lost) and this one starts. Rate from the seat (Science fast, Helm/Weapons slow). | `not-seated` (not at one of the three), `malformed` (contact not 0/1), `unavailable` (contact fully known, or the derelict already salvaged and scanned) |
| `{ kind: 'designate'; contact: number }` | Seated at Science | Sets `designated` (−1 clears) | `invalid-seat`, `malformed` |
| `{ kind: 'laserFrequency'; freq: number }` | Seated at Weapons | Sets the crew's `freq` | `not-at-weapons`, `malformed` (not 0..2), `noop` if unchanged |

- All three are checked for `stale-tick` like the other tactical commands.
- **Cancel by leaving:** if, at the scan-progress step, the station `by` has no present player seated at it, the scan stops (contact −1, progress 0).
- A scan whose level completes sets `known[contact] = level`, emits `scanDone`, and goes idle.
- New reason strings, if any are needed, join `COMMAND_REASONS`; the plan reuses existing reasons where they fit.

## 6. Seats

- `DuelState.science: number`: the station index of the layout's Science console, or −1 when the layout has none (the Hound has one, in Ops, in the console group shared with Engineering and Doors).
- `sit` is allowed at `nav`, `weapons` and `science`. `consoleInReach` and the solo character switch include it. `Seat` gains `'science'`.
- The Science console's group is not checked against Helm/Weapons (it is in another room).
- The scripted pair and the hunter-gate bots never scan, designate, tune or salvage on purpose (Sci-1 adds no bot logic).
- Two players still: `present` and `helmPlayer` stay two-wide in Sci-1. Sci-2 widens them.

## 7. What each screen shows

### 7.1 Every console (Helm, Weapons, Science)

- **Unknown contacts** (level 0) draw on the map as a plain `?` marker in `CRT.dim`, no silhouette, no shield ring. The enemy's window title reads `UNKNOWN CONTACT`.
- **Hostility line** in the readout while in Patrol: before enemy Level 1, `INCOMING SCAN` blinking (no number); after Level 1, `HOSTILE IN 14 s` (whole seconds, ceiling). Once hostile: `HOSTILE` for 3 s, then gone.
- **Scan ring**: a progress arc around the contact being scanned, on every console's map.
- **Designation**: a pulsing green-amber (`CRT.hot`) bracket on the designated contact, on every console's map. On Science it also marks the Weapons lock target with a slow rotating ring (Artemis).
- **Derelict** (when known level 1): a small wreck mark; label `DERELICT` with its loot (`HULL`, `MISSILES`, `SHIELD`) and `TRAPPED` in the alert colour if trapped; `SALVAGED` once done. Unknown: the `?` marker.
- **Salvage ring**: while `salvage > 0`, a ring around the crew ship filling over 5 s.

### 7.2 The contact window (grows from the enemy window)

- It opens on either contact (click on the map, or T cycles enemy → derelict → closed). Contacts are picked with `pickShip`'s radius rule extended to the derelict.
- Every window has a **SCAN** button with the next level (`SCAN 1`, `SCAN 2`) or `SCANNED`; a progress bar while scanning; on Helm and Weapons the bar notes `SLOW` (the 2.5×).
- **Enemy, level 0**: `UNKNOWN CONTACT`, no drawing. **Level 1**: the scout drawing with room outlines but room labels `?` and no damage hatching, hull bar, shield pips, the hostility time. **Level 2**: today's full window (labels, damage, lock), plus `WEAK FREQ B` and an `ENEMY LASER` charge bar and `MISSILE READY / RELOADING` (from the existing hunter state; presentation only).
- **Derelict**: level 0 `UNKNOWN CONTACT`; level 1 its loot, trap and range; a `SALVAGE` hint: `CLOSE TO 60 AND MATCH SPEED`.
- Weapons' aiming (LASER → reticle → room) works only at enemy level ≥ 1 (there is no drawing before); the WEAP/SHLD/ENG buttons on the Weapons panel work at any level as today.

### 7.3 The Science console

- The full-width CRT tactical map (no station block on the left), with the contact window as its **analysis panel** on the right, always shown (it shows `NO CONTACT SELECTED` when nothing is selected).
- Click a contact: selects it locally (opens it in the panel) **and** sends `designate`.
- **Hover readout**: under the cursor, `BRG 327 RNG 1450` from the crew ship (bearing in degrees clockwise from map up, range in world units rounded to 10). Presentation only.
- **Keys**: S scans the selected contact; T cycles the selection; Esc deselects (then pauses, as the window rule does today).

### 7.4 Weapons

- The Weapons station block gains a frequency row: three buttons `A B C` (current one lit) and keys 1, 2, 3. After enemy Level 2 the weak one is marked `◆` on every console that shows the row.

## 8. Architecture

- **Sim** (rules version change): `sim/tactical/state.ts` (fields, creation draws), `sim/tactical/hunter.ts` (Patrol), `sim/tactical/weapons.ts` (frequency strip), new `sim/tactical/science.ts` (hostility check, scan progress, salvage, `derelictPos`), `sim/tactical/duel.ts` (step order), `sim/tactical/hash.ts` (module fields), `sim/tactical/tuning.ts` (constants), `sim/duel/state.ts` and `step.ts` (science seat, command admission), `net/contracts.ts` and `net/codec.ts` (three commands).
- **Presentation**: `render/tactical` (unknown marker, scan ring, designation, derelict, salvage ring), `render/duel/consoleModel.ts` (`science` station, hostility line, frequency row), `render/duel/contactModel.ts` (contact kinds and levels), `app/duel/contactController.ts` (two contacts, the Science panel always open), input (S, 1/2/3, hover), `ui/duel/*` (SCAN button, frequency row, Science layout).
- `SIM_VERSION` 43 → 44. The goldens and gate baselines are regenerated in one marked step, as Artemis-ii did (§5.6 there): first a commit where only the version and the goldens move, with the reason.

## 9. Errors and edge cases

- A scan in progress on the enemy keeps running when it turns hostile.
- A scan of a contact already at its maximum level is rejected `unavailable`; the button shows `SCANNED`.
- The derelict at level 0 may be salvaged (a gamble).
- Salvage while the round is decided: no (the decided tick runs no physics).
- `Shield` loot on a ship at 0 layers gives 1; on a full ship gives class max + 1.
- A layout without a Science console: no Science seat; Helm/Weapons scans still work.
- Hostility from a missile the crew launched before the enemy turned hostile: counts when it lands.
- A crew laser that misses does not turn it hostile.

## 10. Tests

- **Hostility**: Patrol for 1199 ticks, hostile on tick 1200 (cause clock); a laser hit on tick 300 makes it hostile that tick (cause laser), shields one layer down; no enemy charge or launch in Patrol; shields do not recharge in Patrol.
- **Scans**: exact tick counts for L1/L2 from Science and from Helm/Weapons; repeat scan on the same contact `noop`; switching contacts aborts; leaving the seat cancels; `known` set and `scanDone` emitted; `unavailable` past the maximum; admission per seat.
- **Frequency**: matching strips 2, otherwise 1; floor at 0; command admission.
- **Derelict**: placement deterministic per seed and ≥ 600 from spawns; `derelictPos` on its orbit; salvage counts only within range and speed, resets when leaving, applies each loot, trap costs 3 hull, once only.
- **Seats**: sit at Science allowed; `consoleInReach` reaches it.
- **Determinism**: hash and flatten round trip with the new fields; online replica agrees with the authority over a run with scans, designation, tuning and salvage.
- **Views**: model tests for unknown/L1/L2 windows, the hostility line text, the frequency row, the Science panel, the hover readout.
- **Screens**: harness shots of Science (panel, hover, scan ring), an unknown enemy, a derelict with loot, Weapons frequency row, salvage ring.
- Goldens and gates regenerated (`tests/duelGolden.test.ts`, `tests/duelRematchGolden.test.ts`, `tests/duelGates.test.ts`); the gates' duel-length bands are re-checked, since the opening adds up to 20 s of Patrol.

## 11. Out of scope

- The third online player, the three-seat room and the playtest checklist (Sci-2).
- Sensor range limits, nebulae, more contact kinds, more derelicts.
- Bot scanning or salvaging.
- Comms, hailing, surrender.
