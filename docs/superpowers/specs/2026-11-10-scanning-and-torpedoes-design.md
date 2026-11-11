# Scanning, Frequencies and Torpedoes (Increment 2b-ii) — Design

Status: approved in brainstorming 2026-11-10. Parent: `2026-11-09-foundation-design.md` §5 (Stations: Weapons, Science; Hazards: debris lifecycle), §7, §10 ("Overdrive and weapons properties"), §11 item 2b. Builds on `2026-11-10-debris-loop-design.md` (2a-ii) and `2026-11-10-overdrive-heat-coolant-design.md` (2b-i), both merged. This is the second half of Increment 2b; with it the foundation's Increment 2b closes.

## 1. Goal

Give the Science-to-Weapons handoff its content. Every debris object carries a hidden **frequency** (1 to 3). A seated **Science** operator selects a warned object and **scans** it, revealing the frequency on the HUD for everyone. A seated **Weapons** operator picks one of four weapons with Left/Right: a beam tuned to frequency 1, 2 or 3, or the **torpedo**. A beam on the matching frequency is the reliable shot, a mismatch the long shot, and the homing torpedo hits almost regardless but is limited by a small stock that regenerates slowly. The 2a-ii plain beam becomes "a beam whose tuning you have not checked".

**Out of scope (later increments):** skill terms in scan, load and hit formulas (3: every formula takes `stationOutput`, which already carries the skill curve stub); the Weapons and Science productive predicates (4); torpedo resupply beyond regeneration; any projectile or exterior view. Decisions taken here for those: hit thresholds stay pure functions of `(u, output, match)` so increment 3 changes inputs only.

## 2. Architecture

Approach chosen: **extend `debris.ts` and `weapons.ts`; add `sim/science.ts` (scanning) and `sim/torpedoes.ts` (loading and regeneration)**. Each module has one job; `fireBeam` becomes `fireWeapon`, dispatching on the selector.

| Module | Responsibility |
|---|---|
| `sim/debris.ts` | `spawnDebris` draws `frequency`; `removeDebris` retargets every station whose cursor is a debris slot (Weapons and Science). |
| `sim/debrisTargets.ts` | unchanged (`warnedTargets`, `nextTarget`). |
| `sim/science.ts` (new) | `scienceInput` (Up/Down cycle, Confirm starts scanning), `scanStep` (per-tick progress). |
| `sim/weapons.ts` | `weaponsInput` gains Left/Right selector cycling; `beamHits(u, output, match)`, `torpedoHits(u, output)`; `fireWeapon` dispatches beam or torpedo. |
| `sim/torpedoes.ts` (new) | `loadTorpedo` (per tick, seated), `regenTorpedo` (per tick, powered). |
| `sim/console.ts` | calls `regenTorpedo`, `loadTorpedo`, `scanStep` next to `chargeBeam`; Science dispatch to `scienceInput`. |
| `sim/stations.ts` | `sitDown` at Science initialises the cursor like Weapons; `standUp` clears `science.scanning` when the stood player was at Science (one place for voluntary and forced stands). |
| `sim/state.ts`, `flatten.ts` | new fields hashed; `SIM_VERSION = 5`. |
| `sim/tuning.ts` | constants (§7). |
| `render/hudModel.ts`, `hud.ts` | frequency in threats, Weapons selector and torpedo readout, Science target list with scan bars. |

Step order is unchanged from 2b-i. Inside `consoleSystem`, per tick and before the per-player loop: `chargeBeam`, `regenTorpedo`, `loadTorpedo`, then `scanStep` (so a Confirm that starts scanning this tick first progresses next tick, like the beam). Seated input then runs per player.

## 3. Authoritative state

```ts
debris: {
  ...existing,                 // active, stableId, room, impactTick, warned
  frequency: Uint8Array;       // 1..FREQ_COUNT while active, 0 inactive
  scanned:   Uint8Array;       // 1 once a scan completed
  scan:      Float64Array;     // scan progress 0..1 for the slot's object
};
weapons: {
  charge: number;              // as today
  selector: number;            // 0..2 beam tuned to frequency selector + 1; 3 torpedo
  torpedoStock: number;        // 0..TORP_CAP
  torpedoLoaded: number;       // 0 | 1
  torpedoLoad: number;         // 0..1 load progress of the tube
  torpedoRegen: number;        // 0..1 progress toward the next stock unit
};
science: { scanning: number }; // 0 | 1
```

`stations.cursor[science]` is a debris slot index or −1, exactly like Weapons. All new fields are flattened (debris arrays after `warned`; the `weapons` block grows to 6 fields; a new `science` manifest section with 1 field), snapshotted and hashed; `SIM_VERSION` becomes 5 and version-4 snapshots are rejected. `layoutHash` is unchanged. Starting values: `selector 0`, `torpedoStock TORP_START`, everything else 0. `removeDebris` clears `frequency`, `scanned`, `scan` with the slot.

## 4. Frequency and scanning

- **Spawn:** after the room and flight draws, `frequency = 1 + nextInt(rng.hazards, FREQ_COUNT)`. This adds one hazards draw per debris spawn, so the golden replay is re-blessed once (Task 1).
- **Science cursor:** `sitDown` at Science sets `cursor = warnedTargets(state)[0] ?? -1`; `debrisSystem`'s first-warning auto-select applies to a seated Science operator at −1 as it does to Weapons; `removeDebris` retargets both consoles' cursors by `nextTarget` before clearing the slot. Up/Down cycle `warnedTargets` in `StableId` order with wrap (shared helper with Weapons).
- **Confirm:** if the cursor's object is active, warned and unscanned, `science.scanning = 1`. Confirm on a scanned object or with cursor −1 does nothing. Confirm never stops a scan.
- **Progress (`scanStep`, every tick):** if `scanning` and Science is online and occupied and the cursor is active, warned and unscanned: `scan[c] = min(1, scan[c] + DT × stationOutput(science) / SCAN_TIME)`; when it reaches 1, `scanned[c] = 1`, `scanning = 0`. Otherwise nothing changes (progress is per object, so switching targets pauses the old one and resumes whatever the new one had; selecting an already scanned object while scanning simply makes no progress).
- **Pauses and stops:** a stand at Science, voluntary or forced (`standUp` detects the kind), sets `scanning = 0`; progress stays per object. A Science power failure pauses by the online check and also stands the operator. Destroying or impacting an object clears its slot and with it its progress. Scanned and frequency are permanent for the object's life; standing never hides a revealed frequency.
- Worked numbers: `SCAN_TIME 6` gives 16 s at Science level 1 (output 0.375), 8 s at level 2 (0.75), 5.3 s overdriven (1.125). Against the 18 s / 24 s leads of 2a-ii, level 1 scans finish with about 2 s to spare on the shortest flights; level 2 leaves 16 s for Weapons to retune and fire.

## 5. Weapons selector, torpedoes and firing

- **Selector:** `weapons.selector` starts at 0 (beam F1) and persists across sits. Left: `(selector + 3) % 4`; Right: `(selector + 1) % 4`. Up/Down keep cycling targets. The beam charge is unaffected by the selector.
- **Torpedo loading (`loadTorpedo`, every tick):** while Weapons is online and occupied, `torpedoLoaded = 0` and `torpedoStock > 0`: `torpedoLoad = min(1, torpedoLoad + DT × stationOutput(weapons) / TORP_LOAD_TIME)`; at 1: `torpedoLoaded = 1`, `torpedoStock -= 1`, `torpedoLoad = 0`. Loading pauses (progress kept) when the operator stands or the station fails; a loaded torpedo stays loaded through both. Stock is consumed when the load completes, never earlier, so a stand mid-load costs nothing.
- **Regeneration (`regenTorpedo`, every tick):** while Weapons is online (seated or not) and `torpedoStock < TORP_CAP`: `torpedoRegen = min(1, torpedoRegen + DT / TORP_REGEN_TIME)`; at 1: `torpedoStock += 1`, `torpedoRegen = 0`. At the cap, regen progress holds at its value and does not advance. Offline pauses.
- **Firing (`fireWeapon`, Confirm, seated and online, target `c = cursor` must be active and warned):**
  - selector 0..2 (beam tuned to `k = selector + 1`): requires `charge ≥ 1`; one `rng.combat` draw `u`; `hit = beamHits(u, output, k === frequency[c])` with `beamHits(u, output, match) = u < (match ? BEAM_MATCH_BASE + BEAM_MATCH_SCALE × output : BEAM_MISS_BASE + BEAM_MISS_SCALE × output)`; `charge = 0` either way.
  - selector 3 (torpedo): requires `torpedoLoaded = 1`; one `rng.combat` draw; `hit = torpedoHits(u, output) = u < TORP_HIT_BASE + TORP_HIT_SCALE × output`; `torpedoLoaded = 0` either way (the stock was spent at load time).
  - A hit calls `removeDebris(c)`. Not ready, or no valid target: nothing happens and nothing is drawn.
  - The frequency check uses the object's true frequency whether or not it has been scanned: an unscanned guess is right one time in three.
- Worked numbers at the starter Weapons level 2 (output 0.75): match 0.875, mismatch 0.225, torpedo 0.925; at level 1 (0.5): 0.80 / 0.20 / 0.90; overdriven (1.0): 0.95 / 0.25 / 0.95. Load 13.3 s at level 2, 10 s overdriven, 20 s at level 1. One torpedo regenerates every 90 s while powered; with the 2a-ii spawn mix (about one debris object per 90 s on average) torpedoes stay a choice, not the default.

## 6. Debris lifecycle changes

Only §4's spawn draw and §3's slot clearing change; detection, evasion and impact are as in 2a-ii. `removeDebris` retarget order: Weapons cursor, then Science cursor, each via `nextTarget(state, stableId[slot], slot)` before the identity is cleared.

## 7. Tuning (first pass, all hypotheses)

```ts
FREQ_COUNT = 3
SCAN_TIME = 6                                   // seconds at output 1
BEAM_MATCH_BASE = 0.65, BEAM_MATCH_SCALE = 0.30 // replaces BEAM_HIT_BASE / BEAM_HIT_SCALE
BEAM_MISS_BASE = 0.15, BEAM_MISS_SCALE = 0.10
TORP_HIT_BASE = 0.85, TORP_HIT_SCALE = 0.10
TORP_START = 3, TORP_CAP = 6
TORP_LOAD_TIME = 10                             // seconds at output 1
TORP_REGEN_TIME = 90                            // seconds per stock unit while Weapons is online
```

`BEAM_CHARGE_TIME 6` and everything from 2a-ii and 2b-i stay. `BEAM_HIT_BASE` / `BEAM_HIT_SCALE` are removed (the matched case replaces them).

## 8. Input, HUD and rendering

- **Input/app:** unchanged.
- **HUD model** (`hudModel.ts`, pure): a debris threat reads `Debris: <room> <eta>s F<k>` once scanned, `Debris: <room> <eta>s` otherwise. `WeaponsPanel` gains `selector: number`, `torpedo: { stock: number; cap: number; loaded: boolean; load: number }`, and each target gains `frequency: number | null` (null until scanned). `SciencePanel` becomes `{ kind: 'science'; leadSeconds: number; targets: { stableId: number; room: string; eta: number; frequency: number | null; scan: number }[]; cursor: number; scanning: boolean }` (cursor an index into `targets` or −1). `HudModel.weapons` gains `torpedoLoaded: boolean`, `torpedoStock: number`.
- **Pixi HUD:** Weapons panel: row 0 is the selector line `Beam F1  F2  F3  Torp` with the selected entry in `TEXT` and the rest `DIM`; target rows `> <room> <eta>s F2` (or `F?`); footer `Beam READY | Torp LOADED  Stock 3/6` style: beam state as today, then `Torp LOADED`, or `Torp 40%` while loading, or `Torp EMPTY` with no stock and nothing loaded, then `Stock <n>/<cap>`; the charge bar stays. Science panel: target rows `> <room> <eta>s F2` for scanned objects, or the room and eta with a small scan bar (`bar()` at 60 px) for unscanned ones; footer `Lead <n>s   Scanning` or `Lead <n>s`. Threat rows show the frequency suffix.
- **Ship view:** unchanged.

## 9. Testing

All under node, no pixi. New: `tests/science.test.ts`, `tests/torpedoes.test.ts`. Extended: `tests/debris.test.ts`, `tests/weapons.test.ts`, `tests/console.test.ts`, `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/helpers/sim.ts` (`placeDebris(state, room, ticksOut, warned = 0, stableId?, frequency = 1)`).

- **Debris:** spawn draws a frequency in 1..3 (pinned seeds give each value at least once across three fixtures) and exactly three hazards draws per spawn (room, flight, frequency); `removeDebris` clears frequency, scanned and scan, and retargets the Science cursor like the Weapons cursor (`[10, 20, 30]` fixture with both consoles seated).
- **Science:** sit selects the smallest warned `StableId` or −1; first warning auto-selects; Up/Down cycle and wrap; Confirm on an unscanned target starts scanning and on a scanned target or −1 does nothing; progress per tick equals `DT × output / SCAN_TIME` (level 1 completes within 16 s + 2 ticks, level 2 within 8 s + 2 ticks); completion sets `scanned` and clears `scanning`; switching targets pauses the first object's progress and resumes the second's own; standing (Cancel) clears `scanning` and a re-seat plus Confirm resumes from the kept progress; a Science power failure pauses and stands; impact or destruction of the scanned-in-progress object discards its progress and retargets; an unmanned or offline Science never progresses.
- **Weapons:** Left/Right cycle the selector 0 → 1 → 2 → 3 → 0 and backwards, Up/Down still cycle targets, the selector survives standing; `beamHits` thresholds at match and mismatch for outputs 0.5 / 0.75 / 1.0, probed clear of float boundaries (match 0.80 / 0.875 / 0.95, mismatch 0.20 / 0.225 / 0.25), and `beamHits(u, o, true) ≥ beamHits(u, o, false)` for every probe; `torpedoHits` at 0.90 / 0.925 / 0.95; a matched beam shot with a pinned hit destroys and resets charge, a mismatched one with the same draw misses (both one draw); an unscanned object is still resolved by its true frequency.
- **Torpedoes:** loading progresses only seated and online with stock > 0 and the tube empty; completes at `TORP_LOAD_TIME / output` (+2 ticks) with `stock − 1`, `loaded = 1`, `load = 0`; standing mid-load keeps progress and stock; failure mid-load keeps both; a loaded torpedo survives stand and failure; regeneration advances while online whether seated or not, adds one unit every 90 s, holds at the cap, pauses offline; firing a torpedo requires `loaded`, draws once, clears `loaded`, destroys on a pinned hit, leaves the object on a pinned miss; Confirm on the torpedo slot with nothing loaded draws nothing even with a full beam charge, and on a beam slot with no charge draws nothing even with a torpedo loaded.
- **Properties (fast-check, foundation §10):** over random seated Weapons scripts with debris placed, `torpedoStock` stays in `0..TORP_CAP`, `torpedoLoaded ∈ {0, 1}`, stock only decreases by exactly one at a load completion, and the number of combat draws equals the number of shots (ready weapon + valid target + Confirm); for every output in `{0.25, 0.5, 0.75, 1.0, 1.125}` and `u` on a grid, a match never loses to a mismatch.
- **Scripted-intent gate (replaces the 2a-ii Weapons gate):** two players; a 30 s object with frequency 3 is placed warned; Science (level 2) sits, Confirm, scans within 8 s + 2 ticks (threat text gains `F3`); Weapons sits, Right twice to F3, waits for `charge ≥ 1` (12 s + 2 ticks), Confirm with `rng.combat` pinned to a hit: the object is gone, one combat draw; a second object is placed, Weapons Right to Torpedo, waits for `loaded` (13.3 s + 2 ticks), Confirm with a pinned hit: gone, stock 2; both stand.
- **Snapshot and hash:** round trip covers every new field; mutating each new field alone changes the hash; a scan-in-progress run saved mid-scan and continued hashes equal to the uninterrupted run; version-4 snapshots are rejected.
- **HUD model:** threat suffix only when scanned; Weapons panel selector, torpedo block and target frequencies; Science panel targets, cursor, scan progress and `scanning`; null-state fields.
- **Boundary and existing suites:** unchanged and green. Survival gate seeds 1 to 3 pass unmanned (the frequency draw changes the hazards stream order; if a seed now fails, record the new hull figures and keep the gate's intent, since nothing about unmanned survival changed by design).
- **Golden replay:** re-blessed once, in the task that bumps `SIM_VERSION` and adds the spawn draw, with the cause in the commit message and ledger.

## 10. Gate

Added to `docs/gates.md` as "Increment 2b-ii" (closing the foundation's Increment 2b):

- The debris, science, weapons, torpedoes, console gate, property, snapshot and HUD-model tests pass; typecheck and build pass; survival gate seeds 1 to 3 pass unmanned.
- Manual, two players: Science (D(12,2)) selects a `Debris` threat and Confirm fills a scan bar, after which the threat row shows `F<k>`; Weapons (B(7,2)) uses Left/Right to pick `F<k>` and Confirm removes the object more often than not over a few tries (chance); switching to `Torp` shows `Stock 3/6`, a load bar fills in about 13 s, Confirm removes the object and the stock reads 2/6; after about 90 s with Weapons powered the stock reads 3/6 again.

## 11. Open questions deferred

- Whether a mismatched beam should be barred (no shot) rather than a long shot: no; guessing is a real decision for an unscanned object.
- Whether the scan should reveal the target room's impact time more precisely or anything else: no; one reveal per object keeps the handoff legible.
- Whether torpedoes should also have an evasion interaction or splash: no.
