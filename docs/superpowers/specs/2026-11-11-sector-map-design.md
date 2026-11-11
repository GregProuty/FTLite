# Sector Map and Jumps (Run-i) — Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 8); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §1 (sub-project 4, run structure), §4 (authoritative state, named RNG streams, snapshot header), §5 Stations (Navigation: "no selection"), §7 (session flow: survival time as the score), §14. Builds on everything merged through Boarders-i. Run-ii (events and shops) and Run-iii (progression and permadeath) follow.

## 1. Goal

Turn the endless survival run into a **journey**: a run is a sequence of encounters at the **nodes** of a small sector map, joined by **jumps**. The map is generated from the run seed inside the sim. At a node the existing loop runs unchanged (director hazards, the enemy ship, boarders). The ship's **jump drive charges** from the moment it arrives; once charged, the **Navigation operator** picks one of the reachable next-column nodes and Confirms the jump. A jump leaves the encounter behind (the enemy withdraws, incoming objects vanish) but **not the ship's troubles**: hull, crew health, skills, fires, breaches, power failures and any boarders aboard carry over. Reaching the last column ends the run in **victory**; hull or crew loss end it as today. **Nodes reached** becomes the score beside survival time.

**Out of scope:** node types, events, shops and scrap (Run-ii); scoring, unlocks, permadeath and the restart flow beyond today's (Run-iii); a drawn sector map in the world view (the Navigation panel lists the destinations as text); jump animations; fuel.

## 2. Decisions taken (recommended options)

| Question | Options considered | Decision |
|---|---|---|
| Where the run lives | (a) in the app session, re-creating the sim per encounter and copying hull/crew across; (b) **inside `SimState`** as a `run` block, with the jump a sim action | **(b)**: one deterministic sim, snapshots and replays cover the whole run, the gates and the acceptance soak keep working, and "what persists" is simply "everything the jump does not clear". |
| Map generation | (a) a fixed hand-written map; (b) **generated at `createSimState` from a new RNG stream `map`** (appended to `STREAM_NAMES`, so the five existing streams keep their seeds) | **(b)**: every seed is a different sector; the draw order is fixed and testable. |
| Map shape | `RUN_COLUMNS` (8) columns; column 0 and the last hold one node; each middle column holds 2 or 3 nodes (one draw per column); each node links to 1 to 3 nodes of the next column with a guarantee that every node has at least one way out and every node can be reached | Small enough to list as text, varied enough to matter. |
| Jump charge | `jumpCharge` grows `DT / JUMP_CHARGE_TIME` (60 s) per tick from arrival, independent of power or crew (FTL's drive charge); it is kept across a save | The stay-or-leave tension starts a minute in. |
| Who jumps | the seated Navigation operator: Up/Down cycle the reachable destinations (the console's cursor), Confirm jumps when `jumpCharge >= 1`; Navigation gains its first selection | Navigation is the natural seat; the bot never sits, so the soaks and gates keep measuring a single encounter. |
| What a jump clears | the enemy (it withdraws: `leave(state, false)`, no kill credit), every object in the debris table (debris and shots), the enemy's and the boarding clocks re-armed relative to the arrival, the director re-entering Build Up | The encounter is left behind. |
| What persists | hull, crew health and life state, skills and XP, fires, breaches, failed stations, heat and coolant, door states, oxygen, torpedo stock and charge, boarders aboard, telemetry | "The ship's troubles come with you"; crew health persists across jumps (no healing on a jump). |
| Victory | arriving in the last column sets `ended 1`, `endReason = Victory (3)`; the game-over banner reads `VICTORY`; the record's `endReason` gains `'victory'` | Run-i gives the run an end; Run-iii scores it. |
| Score | `run.nodesReached` (0 at the start) in the game-over headline (`Reached node 3 of 8`), in the record (`run: { nodesReached, jumps, columns }`) and as an acceptance column | Survival time stays; nodes reached joins it. |
| HUD | the top-left clock line gains ` node 3/8`; the Navigation panel lists the reachable destinations as rows (`Node 4a`, `Node 4b`) with the cursor, and a footer `Jump 64%` / `Jump READY` | Text only, no new assets. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/run.ts` (new) | `generateMap(rng, columns): { colNodes, edgeMask }`, `reachable(state): number[]` (destination node indices in the next column), `jumpStep(state)` (charge), `jumpShip(state)` (the jump, victory), `navigationInput(state, i, dir, confirm)`, `nodeLabel(column, node)`. |
| `sim/console.ts` | dispatches the Navigation console to `navigationInput`. |
| `sim/debris.ts` | `clearObjects(state)`: frees every slot (through `removeDebris`, so cursors retarget) for the jump. |
| `sim/enemy.ts` | `jumpShip` calls `leave(state, false)` when present and sets `nextArrivalTick = tick + ENCOUNTER_AFTER_JUMP × TICK_HZ` (no draw). |
| `sim/boarders.ts` | `jumpShip` sets `nextArrivalTick = tick + BOARDING_AFTER_JUMP × TICK_HZ` only when no boarder is aboard (no draw); boarders aboard stay. |
| `sim/director.ts` | `jumpShip` calls `enterPhase(state, Phase.BuildUp)` (its usual one director draw). |
| `sim/crew.ts` | `EndReason.Victory = 3`. |
| `sim/state.ts`, `flatten.ts`, `tuning.ts` | `STREAM_NAMES` gains `'map'` (last); the `run` block; `SIM_VERSION = 13`; constants in §8. |
| `sim/telemetry.ts`, `acceptance.ts` | `telemetry.jumps`; record `endReason 'victory'`, `run: { nodesReached, jumps, columns }`; column `nodes` = `nodesReached/columns`. |
| `app/session.ts` | the game-over banner's third wording, `VICTORY`. |
| `render/hudModel.ts`, `hud.ts` | the clock line suffix, the Navigation panel rows and footer, the game-over headline `Reached node N of M`. |

## 4. Authoritative state

```ts
rng.map: RngState;             // sixth stream, appended to STREAM_NAMES (header rngStates and the flatten rng section grow by one)
run: {
  column: number;              // 0..RUN_COLUMNS - 1
  node: number;                // node index within the column
  nodesReached: number;        // jumps completed so far; the score
  jumpCharge: number;          // 0..1
  colNodes: Uint8Array;        // RUN_COLUMNS: nodes per column (1 for the first and last, 2 or 3 otherwise)
  edgeMask: Uint8Array;        // RUN_COLUMNS x 3: bit d set when node n of column c links to node d of column c + 1 (the last column's masks are 0)
};
telemetry.jumps: number;
```

Flattened in a `run` manifest section after `boarders`: the four scalars in the order above, then `colNodes`, then `edgeMask` (`RUN_FIELDS = 4 + RUN_COLUMNS + 3 × RUN_COLUMNS`); `telemetry.jumps` after `boardersKilled` (`TELEMETRY_SCALARS = 16`). `SIM_VERSION` becomes 13; version-12 snapshots are rejected. The map is part of the state (not derived) so a snapshot carries it. Initial values: `column 0, node 0, nodesReached 0, jumpCharge 0`, the generated map.

## 5. Map generation (`generateMap`, at `createSimState`, from `rng.map` only)

For each middle column `c` in `1..RUN_COLUMNS − 2`: `colNodes[c] = 2 + nextInt(rng.map, 2)` (one draw per middle column, in column order). `colNodes[0] = colNodes[last] = 1`. Then for each column `c` in `0..last − 1`, for each node `n` in `0..colNodes[c] − 1`, in that order: `mask = 0`; for each destination `d` in `0..colNodes[c + 1] − 1`: `if (nextFloat(rng.map) < EDGE_CHANCE) mask |= 1 << d` (one draw per candidate edge, in `d` order); if `mask === 0` set the bit for `d = nextInt(rng.map, colNodes[c + 1])` (one more draw, only then). After a column's nodes are done, every destination `d` of column `c + 1` with no incoming edge gets one from `n = nextInt(rng.map, colNodes[c])` (one draw per orphan, in `d` order). The total draw count is therefore a deterministic function of the seed and is asserted in the tests by replaying `createRng` with the same procedure. `EDGE_CHANCE = 0.5`.

## 6. Rules

**Charge** (`jumpStep`, in `step()` right after `enemySystem` and before `debrisSystem`, every tick): `jumpCharge = min(1, jumpCharge + DT / JUMP_CHARGE_TIME)`. No condition, no draw.

**Navigation input** (`navigationInput`, from `consoleSystem` for the seated Navigation operator): `reachable(state)` lists the destinations `d` with bit `d` set in `edgeMask[column × 3 + node]`, ascending; the console's `cursor` is an index into that list (`sitDown` resets it to 0, as the Navigation cursor is 0 today); Up/Down move it with wrap (Left/Right ignored); Confirm with `jumpCharge >= 1` and a non-empty list calls `jumpShip(state)`; Confirm before that does nothing (no draw).

**Jump** (`jumpShip`), in this order:

1. `run.node = reachable[cursor]`, `run.column += 1`, `run.nodesReached += 1`, `run.jumpCharge = 0`, the Navigation cursor `= 0`, `telemetry.jumps += 1`.
2. `clearObjects(state)`: `removeDebris` for every active slot (cursors retarget as usual, which with no objects left and no enemy gives −1).
3. If the enemy is present: `leave(state, false)` (one director draw for its cooldown, as always), then override `enemy.nextArrivalTick = tick + ENCOUNTER_AFTER_JUMP × TICK_HZ` (also when it was absent). The enemy's scan state is cleared by `leave`.
4. If no boarder is aboard: `boarders.nextArrivalTick = tick + BOARDING_AFTER_JUMP × TICK_HZ`. Boarders aboard are untouched (their rooms, clocks and health persist).
5. `enterPhase(state, Phase.BuildUp)` (the director's usual re-arm with one director draw); `director.stress` is kept.
6. If `run.column === RUN_COLUMNS − 1`: `ended = 1`, `endReason = EndReason.Victory`.

Everything else persists: hull, every crew component, skills and stamps, rooms (oxygen, fire, repair progress), breaches, stations (levels, failures, repair, heat, coolant, occupants: the operators stay seated), doors, weapons (charge, selector, torpedoes), telemetry. Draws on a jump: exactly one director draw when the enemy was absent (`enterPhase`), two when it was present (`leave` then `enterPhase`); nothing from hazards, combat or map.

**Run end:** `crewSystem` is unchanged (hull and crew); the victory end is set by `jumpShip` on the jump tick. `telemetrySystem` runs on that tick as on any ending tick. The session's game-over message: `VICTORY after Ns` for `EndReason.Victory`.

## 7. HUD and record

- Top-left clock line: `${mm:ss}  node ${column + 1}/${RUN_COLUMNS}` (the current column, 1-based, so the start reads `node 1/8`).
- Navigation panel (`NavigationPanel`): `evadeChance` as today plus `jump: { charge: number; ready: boolean }`, `here: string` (`nodeLabel(column, node)`), `destinations: string[]` (`nodeLabel(column + 1, d)` for each reachable `d`), `cursor: number`. `nodeLabel(c, n) = \`Node ${c + 1}${String.fromCharCode(97 + n)}\`` (`Node 4a`). `hud.ts` draws the destination rows with the cursor highlight (reusing the console rows) and a footer `Evade 35%   Jump 64%` / `Jump READY`; a last-column panel shows no rows and `Jump -` (unreachable in practice since arrival there ends the run).
- Game-over summary: the first headline becomes `Survived 7:32  HULL LOST  Reached node 3 of 8` (`nodesReached + 1` of `RUN_COLUMNS`, so a run that never jumped reads `node 1 of 8` and a victory reads `node 8 of 8`); `VICTORY` is the third end word.
- Record: `endReason: 'hull' | 'crew' | 'victory' | 'running'`; `run: { nodesReached: number; jumps: number; columns: number }`. Acceptance table: column `nodes` = `${nodesReached}/${columns}` appended after `boarders`; `reason` shows `victory`.

## 8. Tuning (first pass)

```ts
SIM_VERSION = 13
RUN_COLUMNS = 8
EDGE_CHANCE = 0.5
JUMP_CHARGE_TIME = 60          // seconds from arrival to a ready drive
ENCOUNTER_AFTER_JUMP = 60      // seconds after a jump before the next enemy can arrive (no draw)
BOARDING_AFTER_JUMP = 120      // seconds after a jump before the next party can land, when none is aboard
```

Worked numbers: a crew that jumps the moment the drive is ready visits a node every 60 s plus the time spent, so a full run is at least 7 minutes; the enemy arrives 60 s after each jump and stays up to 120 s, so a crew that waits for it meets one enemy per node; the director's escalation keeps running on total time (`minutesOf`), so node 7 at minute 10 is harder than node 2 at minute 2.

## 9. Testing

All under node, no pixi. New `tests/run.test.ts`; extended `tests/console.test.ts` (or `run.test.ts`) for the Navigation input, `tests/snapshot.test.ts`, `tests/hud.test.ts`, `tests/telemetry.test.ts`, `tests/acceptance.test.ts`, `tests/session.test.ts`, `tests/gate-survival.test.ts` (figures re-recorded), `tests/rng.test.ts` if it pins `STREAM_NAMES`. Helpers: `chargeJump(state)` (`run.jumpCharge = 1`), `seatNavigator(state, pid)` (`sitDown` at Navigation).

- **Survival gate baseline (first, before any Run-i code):** `tests/gate-survival.test.ts` and `tests/gate-boarding.test.ts` with their figures recorded. The levers below are **re-authorised for this feature**, in order, applied only to a failing seed and before the single golden re-bless: (1) `DEBRIS_CREW_DAMAGE` 20 → 15; (2) a separate `ENEMY_SHOT_CREW_DAMAGE` 12 used by shot impacts; (3) `BOARDER_DPS` 6 → 4; (4) `BOARDER_HEALTH` 60 → 45; (5) `BOARDING_FIRST` 240 → 330 last, with `gate-boarding` still green. Note that adding the `map` stream does not change the other five streams' seeds (they are drawn from the master in order before it), so the gate figures should be identical to Boarders-i's unless a lever is taken; assert this by comparing the recorded lines.
- **Map (unit, `generateMap(createRng(seed), 8)` and `createSimState`):** `colNodes[0] === 1`, `colNodes[7] === 1`, every middle column 2 or 3; every node of columns 0..6 has a non-zero mask; every node of columns 1..7 has at least one incoming edge; no mask bit points past `colNodes[c + 1]`; the last column's masks are 0; seeds 1 to 50 all satisfy these; the draw count for seed 7 equals a replay of the §5 procedure in the test (pin `rng.map.s` after `createSimState(…, 7)` to the replayed value); two states from the same seed have identical maps; seed 1 and seed 2 differ; `createSimState` with seed 1 leaves `rng.hazards.s`, `director.s`, `combat.s` exactly as before this feature (pin the three values from a pre-feature run, recorded in the test).
- **Charge:** `jumpCharge` is `DT / 60` after one tick, 1 after 3600 ticks and stays 1; it does not depend on Navigation being seated or online; a snapshot mid-charge continues (covered below).
- **Navigation input (through `step()` with a seated operator):** `reachable` lists the set bits ascending; Up/Down cycle the cursor with wrap and Left/Right do nothing; Confirm before the charge is ready does nothing (no draw, `nodesReached 0`); Confirm with `chargeJump` jumps to `reachable[cursor]` (set the cursor to the last entry first to prove it is not always 0); a non-Navigation seat ignores it; an unseated Confirm never jumps.
- **Jump effects (one fixture with everything present: enemy with a shot in flight, two debris objects, a boarder in G, a fire in A, a breach, a failed station, hull 60, pid 1 at health 40, Repair XP set, Weapons charge 0.7, a torpedo loaded, Science scanning a debris object):** after `jumpShip`: `column 1`, `node === reachable[cursor]`, `nodesReached 1`, `jumps 1`, `jumpCharge 0`, Navigation cursor 0; the debris table is empty and the Weapons and Science cursors are −1 and `science.scanning 0`; `enemy.present 0`, `enemiesDestroyed 0`, `enemy.nextArrivalTick === tick + 3600`; the boarder is still aboard with the same room and health and `boarders.nextArrivalTick` unchanged; `director.phase === BuildUp`, `phaseTick === tick`, `stress` unchanged; hull 60, pid 1 at 40, the fire, the breach, the failed station, the XP, the Weapons charge 0.7 and the loaded torpedo all unchanged; the operators are still seated; the director stream advanced exactly twice (leave, enterPhase) and hazards/combat/map not at all; with the enemy absent beforehand, exactly once; with no boarder aboard, `boarders.nextArrivalTick === tick + 7200`.
- **Victory:** a state at `column 6` jumping gives `column 7`, `ended 1`, `endReason Victory`, `nodesReached 7`; the session shows `VICTORY after Ns` and saves a record with `endReason 'victory'` (session test through the harness: set `run.column = 6`, seat the player at Navigation, `chargeJump`, press Confirm); `telemetryRecord` maps `Victory` to `'victory'`.
- **Snapshot and hash:** round trip of the `run` block (all four scalars, the two arrays) and `telemetry.jumps` with non-default values; each alone changes the hash; the `map` stream state round-trips and changes the hash; version-12 rejection; **continuation:** a run saved mid-charge with the cursor on a destination continues through the operator's Confirm at charge 1 (scripted intents) to the jump and 10 s beyond, with hash equality and `nodesReached 1` in the continued stretch.
- **HUD:** the clock line suffix at column 0 (`node 1/8`) and column 3 (`node 4/8`); the Navigation panel's `here`, `destinations` labels (`Node 2a`, `Node 2b` for a two-node column) and cursor; `jump.charge 0.64, ready false` and `charge 1, ready true`; the game-over headline `Reached node 1 of 8` for an unjumped run, `Reached node 8 of 8  VICTORY` wording for a victory (exact string: `Survived 7:32  VICTORY  Reached node 8 of 8`).
- **Telemetry and acceptance:** the record's `run` block and `endReason 'victory'`; the table column `nodes` (`0/8`, `3/8`); fixtures updated.
- **Jump gate (new, `tests/gate-jump.test.ts`):** two players, seed 1, pid 0 scripted to walk to Navigation A(2,2), sit, and Confirm every tick once seated; the bot drives pid 1; the run reaches `column 7` and `endReason Victory` within `8 × (60 + 5)` s of sim time, with `jumps 7`, both crew alive (hull and crew loss end the run early and fail the gate; if a seed fails because the crew cannot survive seven encounters, record the figures and raise `JUMP_CHARGE_TIME` is **not** a lever: the gate is about the mechanism, so instead silence the enemy and boarders in this gate (`nextArrivalTick = 1e9` after each jump via a test hook is not available; use `quiet` and the two silencing assignments at the start and after each jump in the test loop) and record that the gate measures the jump loop, not combat survival).
- **Golden replay:** re-blessed once (version 13, the `map` stream and the `run` block; the scripted replay never sits at Navigation, so the hashes change only through the new fields) with the cause recorded.

## 10. Gate

Added to `docs/gates.md` as "Run-i: sector map and jumps":

- [x] `npm test` passes (the bullets above); the golden replay re-blessed once (version 13).
- [x] `tests/gate-survival.test.ts` and `tests/gate-boarding.test.ts` pass on seeds 1-3 with figures identical to Boarders-i's (or the levers taken listed).
- [x] `tests/gate-jump.test.ts` passes: a scripted navigator jumps the ship through all eight columns to victory.
- [x] `npm run acceptance 5 1`, dated, three rows with the `nodes` column (`0/8`: the bot never jumps).
- [ ] Manual, two players (`npm run dev`): the clock reads `node 1/8`; sitting at Navigation (A(2,2)) lists `Node 2a` / `Node 2b` rows and `Jump 0%` rising to `Jump READY` after a minute; Up/Down moves the cursor; Confirm jumps: the threats list empties of `Debris`/`Shot`/`Enemy` rows, fires and boarders stay, the clock reads `node 2/8`, and the enemy returns about a minute later; after seven jumps the banner reads `VICTORY` and the summary `Reached node 8 of 8`. Date and notes: pending human playtest.
- [x] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## 11. Open questions deferred

- Node types, events and shops at nodes (Run-ii); scrap; a drawn map.
- Fuel or a cost to jumping; jumping while boarders are aboard as a tactic (allowed and free in Run-i).
- Difficulty by column instead of by total time: revisit once Run-ii adds node types.
