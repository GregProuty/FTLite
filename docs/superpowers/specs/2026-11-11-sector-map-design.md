# Sector Map and Jumps (Run-i) — Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 8); every open choice took the recommended option; amended the same day from the Codex spec reviews (`research/codex-review-run-spec-1.md`, `-2.md`). Parent: `2026-11-09-foundation-design.md` §1 (sub-project 4, run structure), §4 (authoritative state, named RNG streams, snapshot header), §5 Stations (Navigation: "no selection"), §7 (session flow: survival time as the score), §14. Builds on everything merged through Boarders-i. Run-ii (events and shops) and Run-iii (progression and permadeath) follow.

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
| Score | `run.nodesReached` (0 at the start; equal to `column` and to `telemetry.jumps`) in the game-over headline as the node ordinal `column + 1` (`Reached node 3 of 8`), in the record (`run: { nodesReached, jumps, columns }`) and as an acceptance column | Survival time stays; nodes reached joins it. |
| HUD | the top-left clock line gains ` node 3/8`; the Navigation panel lists the reachable destinations as rows (`Node 4a`, `Node 4b`) with the cursor, and a footer `Jump 64%` / `Jump READY` | Text only, no new assets. |

## 3. Architecture

| Module | Responsibility |
|---|---|
| `sim/run.ts` (new) | `generateMap(rng, columns): { colNodes, edgeMask }`, `reachable(state): number[]` (destination node indices in the next column), `jumpStep(state)` (charge), `jumpShip(state)` (the jump, victory), `navigationInput(state, i, dir, confirm)`, `nodeLabel(column, node)`. |
| `sim/console.ts` | dispatches the Navigation console to `navigationInput` (stick edge first, then the Confirm edge, as the other consoles do). |
| `sim/crew.ts` | `EndReason.Victory = 3`; the run-end check only sets `ended` when it is still 0 (victory precedence). |
| `sim/step.ts` | `jumpStep` is the first system of the tick. |
| `sim/debris.ts` | `clearObjects(state)`: frees every slot (through `removeDebris`, so cursors retarget) for the jump. |
| `sim/enemy.ts` | `jumpShip` calls `leave(state, false)` when present and sets `nextArrivalTick = tick + ENCOUNTER_AFTER_JUMP × TICK_HZ` (no draw). |
| `sim/boarders.ts` | `jumpShip` sets `nextArrivalTick = tick + BOARDING_AFTER_JUMP × TICK_HZ` only when no boarder is aboard (no draw); boarders aboard stay. |
| `sim/director.ts` | `jumpShip` calls `enterPhase(state, Phase.BuildUp)` (its usual one director draw). |
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

For each middle column `c` in `1..RUN_COLUMNS − 2`: `colNodes[c] = 2 + nextInt(rng.map, 2)` (one draw per middle column, in column order). `colNodes[0] = colNodes[last] = 1`. Then for each column `c` in `0..last − 1`, for each node `n` in `0..colNodes[c] − 1`, in that order: `mask = 0`; for each destination `d` in `0..colNodes[c + 1] − 1`: `if (nextFloat(rng.map) < EDGE_CHANCE) mask |= 1 << d` (one draw per candidate edge, in `d` order); if `mask === 0` set the bit for `d = nextInt(rng.map, colNodes[c + 1])` (one more draw, only then). After a column's nodes are done, every destination `d` of column `c + 1` with no incoming edge gets one from `n = nextInt(rng.map, colNodes[c])` (one draw per orphan, in `d` order). The total draw count is therefore a deterministic function of the seed and is asserted in the tests by replaying the same procedure on a reference stream seeded exactly as the sim seeds it: `deriveStreams(seed).map` (the sixth master draw), **not** `createRng(seed)`. `EDGE_CHANCE = 0.5`.

## 6. Rules

**Charge** (`jumpStep`, the **first** system in `step()`, right after the scratch clear and before `interactSystem`, every tick): `jumpCharge = min(1, jumpCharge + DT / JUMP_CHARGE_TIME)`. No condition, no draw. Because it runs before the console input, a Confirm on the very tick the charge reaches 1 jumps, and after a jump the charge is exactly 0 in that tick's end-of-tick state and snapshot (it starts growing on the next tick).

**Navigation input** (`navigationInput`, from `consoleSystem` for the seated Navigation operator): `reachable(state)` lists the destinations `d` with bit `d` set in `edgeMask[column × 3 + node]`, ascending; the console's `cursor` is an index into that list (`sitDown` resets it to 0, as the Navigation cursor is 0 today); the tick's stick edge is applied first (Up/Down move the cursor with wrap, Left/Right are ignored), then Confirm: `confirmPressed` is an **edge** (a fresh press), as on every console, so a Confirm held across the ready tick does not jump until it is pressed again, and nothing is buffered; a Confirm edge with `jumpCharge >= 1` and a non-empty list calls `jumpShip(state)`; before that it does nothing (no draw).

**Jump** (`jumpShip`), in this order:

1. `run.node = reachable[cursor]`, `run.column += 1`, `run.nodesReached += 1`, `run.jumpCharge = 0`, the Navigation cursor `= 0`, `telemetry.jumps += 1`. The invariant `nodesReached === column === telemetry.jumps` holds throughout a run; the displayed node ordinal is `column + 1` (so the start reads node 1 of 8 and a victory reads node 8 of 8).
2. `clearObjects(state)`: `removeDebris` for every active slot (cursors retarget as usual, which with no objects left and no enemy gives −1), then `science.scanning = 0` (an interrupted object scan does not stay armed for a later target; the enemy scan is cleared by `leave` below).
3. If the enemy is present: `leave(state, false)` (one director draw for its cooldown, as always), then override `enemy.nextArrivalTick = tick + ENCOUNTER_AFTER_JUMP × TICK_HZ` (also when it was absent).
4. If no boarder is aboard: `boarders.nextArrivalTick = tick + BOARDING_AFTER_JUMP × TICK_HZ`. Boarders aboard are untouched (their rooms, clocks and health persist).
5. `enterPhase(state, Phase.BuildUp)` (the director's usual re-arm with one director draw); `director.stress` is kept (so a high stress may move the director on to Sustain Peak on the same tick's `directorSystem`, as the normal rules allow).
6. If `run.column === RUN_COLUMNS − 1`: `ended = 1`, `endReason = EndReason.Victory`.

Everything else persists: hull, every crew component, skills and stamps, rooms (oxygen, fire, repair progress), breaches, stations (levels, failures, repair, heat, coolant, occupants: the operators stay seated), doors, weapons (charge, selector, torpedoes), telemetry. Draws **inside the `jumpShip` call**: exactly one director draw when the enemy was absent (`enterPhase`), two when it was present (`leave` then `enterPhase`); nothing from hazards, combat or map. The rest of the tick then runs as normal (the remaining console input, hazards, the director's own step, boarders), with whatever draws those make.

**Run end and precedence:** `crewSystem` keeps its hull and crew rules but **only sets `ended` when it is still 0**: a victory set earlier in the tick by `jumpShip` is the tick's result even if a crew member is downed or bleeds out later in the same tick (their health and life state still change; the result does not). `step()` continues to the end of the tick as on any ending tick: `telemetrySystem` runs once and the tick increments; the next `step()` returns at once. The session's game-over message: `VICTORY after Ns` for `EndReason.Victory`.

## 7. HUD and record

- Top-left clock line: `HudModel` gains `run: { column: number; columns: number }` (`{ 0, RUN_COLUMNS }` without a state), and `hudModel.ts` exports the pure `clockLine(m: HudModel): string` = `` `HULL ${round(hull)}   TIME ${simSeconds}s   node ${column + 1}/${columns}` `` (today's text plus the node suffix; the start reads `node 1/8`); `hud.ts` sets `top.text = clockLine(m)`.
- Navigation panel (`NavigationPanel`): `evadeChance` as today plus `jump: { charge: number; ready: boolean }`, `here: string` (`nodeLabel(column, node)`), `destinations: string[]` (`nodeLabel(column + 1, d)` for each reachable `d`; empty in the last column), `cursor: number`, `final: boolean` (`column === RUN_COLUMNS − 1`). `nodeLabel(c, n) = \`Node ${c + 1}${String.fromCharCode(97 + n)}\`` (`Node 4a`). `hudModel.ts` exports the pure `navigationFooter(p: NavigationPanel): string` = `Evade ${round(evadeChance × 100)}%   Jump ${final ? '-' : ready ? 'READY' : \`${floor(charge × 100)}%\`}` (`Evade 35%   Jump 64%`, `Evade 35%   Jump READY`, `Evade 35%   Jump -`); `hud.ts` draws the destination rows (reusing the console rows, cursor highlight on `cursor`) and the footer from that formatter; a last-column panel shows no rows (unreachable in play since arrival there ends the run, but rendered without error).
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
- **Map (unit, `generateMap(createRng(seed), 8)` and `createSimState`):** `colNodes[0] === 1`, `colNodes[7] === 1`, every middle column 2 or 3; every node of columns 0..6 has a non-zero mask; every node of columns 1..7 has at least one incoming edge; no mask bit points past `colNodes[c + 1]`; the last column's masks are 0; seeds 1 to 50 all satisfy these; the draw count for seed 7 equals a replay of the §5 procedure in the test on `deriveStreams(7).map` (the replayed map equals `state.run`'s and `rng.map.s` after `createSimState(…, 7)` equals the replay stream's state); two states from the same seed have identical maps; seed 1 and seed 2 differ; `createSimState` with seed 1 leaves `rng.hazards.s`, `director.s`, `combat.s` exactly as before this feature (pin the three values from a pre-feature run, recorded in the test).
- **Charge:** `jumpCharge` is `DT / 60` after one tick, 1 after 3600 ticks and stays 1; it does not depend on Navigation being seated or online; a Confirm edge on tick 3600 itself (the tick the charge reaches 1) jumps; after a jump the end-of-tick charge is exactly 0 and `DT / 60` one tick later; a snapshot mid-charge continues (covered below).
- **Navigation input (through `step()` with a seated operator; the fixture sets the map by hand: `colNodes[1] = 3`, `edgeMask[0] = 0b101`, so `reachable` is `[0, 2]`):** `reachable` lists the set bits ascending (`[0, 2]`); Down from cursor 0 gives 1, Down again wraps to 0, Up from 0 wraps to 1; Left/Right do nothing; Confirm before the charge is ready does nothing (no draw, `nodesReached 0`); a Confirm **held** from before readiness across the ready tick does not jump (the dispatch provides a press edge), and a fresh press afterwards does; a stick edge and a Confirm on the same tick apply the cursor move first (Down + Confirm from cursor 0 with a ready charge lands on destination 2); Confirm with `chargeJump` and cursor 1 jumps to node 2 of column 1 (not 0); the **seating** Confirm (the press that sits the player at Navigation) never jumps even with a full charge (players who sat this tick act from the next tick); a non-Navigation seat ignores it; an unseated Confirm never jumps.
- **Precedence:** a navigator at 0.05 health in a room with a boarder who Confirms a ready jump from column 6: the tick ends with `endReason Victory`, the navigator Downed (the boarder's blow still lands later in the tick) and `telemetrySystem` having recorded the first-down on that tick; a hull of 0 reached by a shot impact on the jump tick likewise leaves `Victory`; the next `step()` is a no-op.
- **Jump effects (one fixture with everything present: enemy with a shot in flight, two debris objects, a boarder in G, a fire in A, a breach, a failed station, hull 60, pid 1 at health 40, Repair XP set, Weapons charge 0.7, a torpedo loaded, Science scanning a debris object):** after `jumpShip`: `column 1`, `node === reachable[cursor]`, `nodesReached 1`, `jumps 1`, `jumpCharge 0`, Navigation cursor 0; the debris table is empty and the Weapons and Science cursors are −1 and `science.scanning 0` (also in a variant with **no** enemy and an interrupted object scan: `scanning` is 0 after the jump); `enemy.present 0`, `enemiesDestroyed 0`, `enemy.nextArrivalTick === tick + 3600`; the boarder is still aboard with the same room and health and `boarders.nextArrivalTick` unchanged; `director.phase === BuildUp`, `phaseTick === tick`, `stress` unchanged; hull 60, pid 1 at 40, the fire, the breach, the failed station, the XP, the Weapons charge 0.7 and the loaded torpedo all unchanged; the operators are still seated; the director stream advanced exactly twice across the `jumpShip(state)` **call** (leave, enterPhase) and hazards/combat/map not at all; with the enemy absent beforehand, exactly once; with no boarder aboard, `boarders.nextArrivalTick === tick + 7200`. (Through `step()` the rest of the tick may draw more; the draw assertions are on the direct call.)
- **Victory:** a state placed at `column 6, node 0, nodesReached 6, telemetry.jumps 6` jumping gives `column 7`, `nodesReached 7`, `jumps 7`, `ended 1`, `endReason Victory`; the session shows `VICTORY after Ns` and saves exactly one record with `endReason 'victory'` and `run.nodesReached 7` (session test through the harness: place the state the same way, seat the player at Navigation, `chargeJump`, press Confirm, then frames); `telemetryRecord` maps `Victory` to `'victory'`.
- **Persistence (direct `jumpShip` on a fixture with distinct non-default values everywhere):** before the call, record and after the call compare unchanged: hull 61; pid 0 Conscious at health 37 with `Life.bleed 0`, pid 1 Downed with `bleed 12.5` and `reviveProgress 0.3` and `reviverPid 0`; Repair XP 123 and the four skill stamps set to distinct ticks; room A `o2` 0.4 of its volume, `fire` 0.6, `fireRepair 0.2`; a breach with `repair 0.5`; a failed station with `repair 0.7`; `heat` 120 and `coolant` 2 on Weapons; the door states (one Sealed with its `closeTimer` 0.5 and `sealRequested 1`); Weapons `selector 2`, `charge 0.7`, `torpedoStock 4`, `torpedoLoaded 1`, `torpedoLoad 0.3`, `torpedoRegen 0.4`; a boarder in G at health 33 with `nextMoveTick` and `aloneSince` set to distinct values; the seated operators' seats. Changed by the call: only the `run` scalars, `telemetry.jumps`, the debris table (empty), the cursors of Weapons and Science (−1), `science.scanning` (0), the enemy block (absent), `enemy.nextArrivalTick`, `boarders.nextArrivalTick` (only when none aboard), and the director's `phase`, `phaseTick`, `budgetLeft`, `nextSpawnTick` (`stress` unchanged).
- **Snapshot and hash:** round trip of the `run` block (all four scalars, the two arrays) and `telemetry.jumps` with non-default values; each alone changes the hash; the `map` stream state round-trips and changes the hash; version-12 rejection; **continuation:** a two-player run with the map set by hand so column 1 has two reachable destinations, the operator seated at Navigation with the cursor on destination **1**, saved at `jumpCharge 0.9`; the loaded copy has cursor 1 and charge 0.9; both copies are stepped with scripted intents (Confirm every tick from pid 0) through the ready tick and 10 s beyond; both land on `node 1` of column 1 (not 0), `nodesReached 1`, and the hashes are equal.
- **HUD:** `clockLine` gives `HULL 100   TIME 0s   node 1/8` for a fresh state and `node 4/8` at column 3, and `node 1/8` with no state; the Navigation panel's `here`, `destinations` labels (`Node 2a`, `Node 2b` for a two-node column), `cursor`, `final false`; `navigationFooter` gives `Evade 35%   Jump 64%` (charge 0.64), `Evade 35%   Jump READY` (charge 1) and `Evade 35%   Jump -` with `final true` (where the evade chance is `EVADE_BASE + EVADE_SCALE × output` at the starter Navigation output, which the test computes rather than assuming 35); a last-column panel has `destinations []`; the game-over headline `Survived 7:32  HULL LOST  Reached node 1 of 8` for an unjumped run and `Survived 7:32  VICTORY  Reached node 8 of 8` for a victory.
- **Telemetry and acceptance:** the exact-record fixture sets `run.nodesReached = 3, telemetry.jumps = 3` and expects `run: { nodesReached: 3, jumps: 3, columns: 8 }`; `endReason` maps hull, crew, victory and running; the acceptance `rec()` fixture gains `run: { nodesReached: 0, jumps: 0, columns: 8 }`, the header regex ends `boarders\s+nodes$`, the first row's tail gains `\s+0\/8$`, and a new third row with `endReason: 'victory'` and `run.nodesReached 3` renders `victory` in the reason column and `3\/8` at the end.
- **Jump gate (new, `tests/gate-jump.test.ts`, a quiet mechanism gate by design):** two Recruits, seed 1, `quiet(state)`, `enemy.nextArrivalTick = 1e9`, `boarders.nextArrivalTick = 1e9` at the start **and re-applied after every jump** inside the loop (the jump re-arms both clocks); pid 0's script: `moveY −1` with no Confirm until `roomAt` is A **and** the Navigation tile is the Confirm target (`confirmTarget(state, 0).kind === Console && index === Navigation`; walking straight up from the spawn `(2.5, 9.5)` passes the G–I and I–A doors at `x = 2`, and a Confirm pressed near a door would seal it, so Confirm is withheld until the console is the target), then one Confirm edge to sit (assert the seat), then `confirmPressed` every tick; pid 1 is driven by the bot. Assert: `jumps 7`, `column 7`, `endReason Victory`, both crew Conscious, and the sim time at the end below `8 × (JUMP_CHARGE_TIME + 10)` s. The gate measures the jump loop, not combat survival; it has no tuning fallback.
- **Golden replay:** re-blessed once (version 13, the `map` stream and the `run` block; the scripted replay never sits at Navigation, so the hashes change only through the new fields) with the cause recorded.

## 10. Gate

Added to `docs/gates.md` as "Run-i: sector map and jumps":

Every automated entry starts **unchecked** and is checked only once the implementer has run it, with the figures, the golden hash and the dated acceptance table recorded beside it:

- [ ] `npm test` passes (the bullets above); the golden replay re-blessed once (version 13; final hash recorded).
- [ ] `tests/gate-survival.test.ts` and `tests/gate-boarding.test.ts` pass on seeds 1-3 with figures identical to Boarders-i's (recorded; or the levers taken listed with before/after figures).
- [ ] `tests/gate-jump.test.ts` passes: a scripted navigator jumps the quiet ship through all eight columns to victory (sim time recorded).
- [ ] `npm run acceptance 5 1`, dated, three rows with the `nodes` column (`0/8`: the bot never jumps) pasted in.
- [ ] Manual, two players (`npm run dev`): the clock reads `node 1/8`; sitting at Navigation (A(2,2)) lists `Node 2a` / `Node 2b` rows and `Jump 0%` rising to `Jump READY` after a minute; Up/Down moves the cursor; Confirm jumps: the threats list empties of `Debris`/`Shot`/`Enemy` rows, fires and boarders stay, the clock reads `node 2/8`, and the enemy returns about a minute later; after seven jumps the banner reads `VICTORY` and the summary `Reached node 8 of 8`. Date and notes: pending human playtest.
- [ ] `npm run typecheck`, `npm test`, `npm run build` all pass on the final commit.

## 11. Open questions deferred

- Node types, events and shops at nodes (Run-ii); scrap; a drawn map.
- Fuel or a cost to jumping; jumping while boarders are aboard as a tactic (allowed and free in Run-i).
- Difficulty by column instead of by total time: revisit once Run-ii adds node types.
