# Events and Shops (Run-ii) Design

Status: approved 2026-11-11 under the autonomous feature loop (`docs/roadmap.md` item 9); every open choice took the recommended option. Parent: `2026-11-09-foundation-design.md` §1 (sub-project 4), §4 (authoritative state, named RNG streams), §5 Stations and Power, §7 (HUD), §14. Builds on Run-i (`2026-11-11-sector-map-design.md`): the node map, `sim/run.ts`, the Navigation console's cursor and the jump. Run-iii (progression and permadeath) follows.

## 1. Goal

A run gains texture between jumps: nodes have types, an **Event** node poses a short text choice with a real cost or reward, a **Shop** node sells hull, torpedoes and a permanent extra power bar for **scrap**, and scrap is earned by jumping, destroying the enemy ship and killing boarders. The Navigation operator resolves events and buys at shops from the same console and cursor they already use to jump, so the role stays one seat and one list.

**Out of scope:** a drawn map or node icons in the world view (the Navigation panel is text); events that address a specific crew member; event chains or flags across nodes; selling; fuel; scoring and unlocks (Run-iii).

## 2. Options considered

- **Who resolves an event and buys:** (a) the seated Navigation operator, from the console list **(recommended, chosen)**: one seat already owns the run's choices and the cursor; (b) any seated player: splits the UI across panels; (c) a ship-wide vote: needs new input and a timeout.
- **Where the node type comes from:** (a) drawn from `rng.map` **after** the edge draws at generation **(chosen)**: the Run-i map stays identical for every seed and the type is part of the snapshot; (b) drawn on arrival from `rng.loot`: cannot be previewed later; (c) a fixed pattern: no variety.
- **What a shop upgrade does:** (a) one permanent extra base bar for a station kind, which does not heat and raises the overdrive ceiling with it **(chosen)**: visible, lasting and cheap to model; (b) a higher output multiplier: invisible on the power HUD; (c) a skill bonus: overlaps Run-iii.
- **Scrap sources:** (a) a fixed award per jump plus the enemy kill and boarder kill bounties **(chosen)**: predictable income and a reward for fighting; (b) only events: starves shops; (c) debris evaded: rewards luck.

## 3. Node types

`NodeType = { Hazard: 0, Event: 1, Shop: 2 }` in `sim/run.ts`. Column 0 and the last column are always `Hazard`. Each middle-column node is drawn at generation, after every Run-i edge draw: for each column `c` in `1..RUN_COLUMNS − 2`, for each node `n` in `0..colNodes[c] − 1`, in that order: `u = nextFloat(rng.map)`; `Shop` if `u < SHOP_CHANCE`, else `Event` if `u < SHOP_CHANCE + EVENT_CHANCE`, else `Hazard` (one draw per middle node). Then, with no draw: if no node in the middle columns is a `Shop`, node 0 of column `floor(RUN_COLUMNS / 2)` becomes one. The loop is the exported `assignNodeTypes(rng, colNodes, nodeType, draw = nextFloat)` so a test can force every draw. Because the type draws follow the edge draws, `colNodes` and `edgeMask` for a seed equal Run-i's exactly (asserted). A `Hazard` node is the Run-i node: nothing happens there beyond the usual hazards and encounters.

## 4. Authoritative state

```ts
run.nodeType: Uint8Array;        // RUN_COLUMNS x 3, NodeType per node (0 past colNodes[c])
run.scrap: number;               // whole units, >= 0
run.event: number;               // event id at this node, -1 when none
run.eventChoice: number;         // -1 while the event is pending, else the chosen choice index (0 or 1)
run.upgrades: Uint8Array;        // STATION_COUNT, 0 or 1 extra base bar per kind (Engineering always 0)
telemetry.scrapEarned, telemetry.scrapSpent, telemetry.eventsResolved, telemetry.purchases: number;
```

Flattened in the existing `run` section after `edgeMask`: `nodeType` (`3 × RUN_COLUMNS`), then `scrap, event, eventChoice`, then `upgrades` (`STATION_COUNT`): `RUN_FIELDS = 4 + 7 × RUN_COLUMNS + 3 + STATION_COUNT`. The four telemetry scalars follow `jumps` in that order (`TELEMETRY_SCALARS = 20`). `SIM_VERSION = 14`; version-13 snapshots are rejected. Initial values: the generated `nodeType`, `scrap 0`, `event −1`, `eventChoice −1`, `upgrades` all 0. The `loot` stream (fourth in `STREAM_NAMES`, unused until now) is the only stream events draw from; the map stream is drawn only at generation; the shop draws nothing.

## 5. Scrap

`addScrap(state, n)` (`run.ts`): `run.scrap += n; telemetry.scrapEarned += n`. `spendScrap(state, n)`: `run.scrap -= n; telemetry.scrapSpent += n` (callers check affordability first; scrap never goes below 0). Sources, exact: every jump awards `SCRAP_PER_JUMP` on arrival (§6); `leave(state, true)` in `enemy.ts` awards `SCRAP_ENEMY` beside `enemiesDestroyed++`; the boarder kill path in `boarders.ts` awards `SCRAP_BOARDER` beside `boardersKilled++`; event choices as listed in §7. No other source.

## 6. Arrival and the Navigation list

**Arrival** (inside `jumpShip`, a new step 1b right after Run-i's step 1 and before `clearObjects`): `run.event = −1; run.eventChoice = −1; addScrap(state, SCRAP_PER_JUMP)`; if `nodeType[column × 3 + node] === Event`: `run.event = nextInt(rng.loot, EVENT_COUNT)` (one loot draw, only then). The last column is `Hazard`, so a victory arrival draws nothing. The Run-i director draw counts inside `jumpShip` are unchanged.

**The list** (`navRows(state): NavRow[]`, pure, in `run.ts`), `NavRow = { text: string; select: 'none' | 'choice' | 'buy' | 'jump'; index: number; enabled: boolean }`:

- Event pending (`event >= 0 && eventChoice < 0`): `[{ text: title, select: 'none' }, { text: event.text, select: 'none' }, choice 0, choice 1]` with `select 'choice'`, `index` 0/1, `enabled` per §7. Nothing else is listed: the ship cannot jump with an event pending (the drive still charges).
- Otherwise at a `Shop` node: `{ text: \`Shop   scrap ${scrap}\`, select 'none' }`, then one `buy` row per shop item in §8 order, then the destination rows.
- Otherwise: the destination rows only: `{ text: nodeLabel(column + 1, d), select: 'jump', index: d, enabled: true }` per reachable `d` (empty in the last column).

**Cursor** (`stations.cursor` of the Navigation console) indexes `navRows`; `sitDown` sets it to 0 as today, and `navigationInput` first moves it to the first selectable row if it rests on a `none` row or past the end. Up/Down move to the previous/next **selectable** row with wrap; Left/Right are ignored. Then a Confirm edge acts on the cursor's row: `choice` and `enabled` → `resolveEvent(state, index)`; `buy` and `enabled` → `buy(state, index)`; `jump` with `jumpCharge >= 1` → `jumpShip(state, index)`; anything else does nothing. After a resolve or a buy, `clampNavCursor(state)`: the cursor is kept if its row index still exists in the new list and is a selectable row (`select !== 'none'`, whether or not it is enabled); otherwise it moves to the first selectable row (0 if none). A resolve replaces the four event rows with the shop/destination list, so the cursor (2 or 3) lands on a shop item or a destination if that index exists, else on the first selectable row; a buy keeps the list, so the cursor stays on the bought item even when it is now disabled or `(owned)`. The same clamp runs at the start of every `navigationInput` call, before the stick edge.

`jumpShip(state, destination)` now takes the destination node index explicitly (Run-i read the cursor as an index into `reachable`; the mixed list makes that wrong). Policy: when `destination` is not in `reachable(state)` the call is a **no-op** (nothing changes, no draw), including the last column where the list is empty. `navigationInput` always passes a valid destination (the cursor's `jump` row); there is no console-absent fallback any more, since without a Navigation console nothing can jump. Every direct caller in the Run-i tests passes a destination from `reachable` (`reachable(s)[0]` where they relied on the cursor; the continuation fixture passes `reachable(s)[1]` through the cursor path, unchanged in behaviour).

## 7. Events (`sim/events.ts`)

`EVENTS: readonly { title: string; text: string; choices: readonly [string, string] }[]`, `EVENT_COUNT = 6`. `choiceEnabled(state, id, k)` and `resolveEvent(state, k)` (which sets `run.eventChoice = k`, `telemetry.eventsResolved++`, applies the effect) are the only logic. Effects, exact; loot draws only where stated; hull never changes except as written; "a random room/site/station" is `nextInt(rng.loot, n)` over `layout.rooms.length`, `freeSites(state).length` or `stations.level.length`:

| id | title | text | choice 0 | choice 1 |
|---|---|---|---|---|
| 0 | Derelict hulk | A drifting hulk, still warm inside. | `Salvage it (+25 scrap, fire risk)`: `addScrap 25`; one draw picks a room; `igniteRoom(state, room)` (a no-op if it already burns, the draw is still made) | `Leave it`: nothing |
| 1 | Distress call | A venting freighter offers a reward for help. | `Help them (hull -10, +30 scrap)`: enabled while `hull > 10`; `hull −= 10`; `addScrap 30` | `Ignore it`: nothing |
| 2 | Smugglers | Smugglers offer torpedoes, no questions asked. | `Buy 2 torpedoes (20 scrap)`: enabled while `scrap >= 20 && torpedoStock < TORP_CAP`; `spendScrap 20`; `torpedoStock = min(TORP_CAP, stock + 2)` | `Refuse`: nothing |
| 3 | Micrometeoroid field | A debris field lies across the lane. | `Push through (+20 scrap, breach risk)`: `addScrap 20`; if `freeSites` is non-empty, one draw picks a site and `activateBreach(state, site)`; no draw when none is free | `Go around (drive recharges)`: `jumpCharge = 0` |
| 4 | Supply cache | An unmarked cache, hard-wired to something. | `Take the scrap (+40)`: `addScrap 40` | `Strip it bare (+60 scrap, a station fails)`: `addScrap 60`; one draw `nextInt(rng.loot, stations.level.length)` over **all** station indices; `failStation(state, i)` unless `stations.failed[i]` is already 1, in which case nothing more happens (the choice may have no failure effect; the draw is always made) |
| 5 | Medical freighter | A hospital ship offers treatment. | `Treat the crew (15 scrap)`: enabled while `scrap >= 15`; `spendScrap 15`; for every crew member with `Life.state[eid] === LifeState.Conscious` at effect time (a member at zero health not yet downed by `crewSystem` counts), `Health.cur[eid] = HEALTH_MAX`; Downed and Dead members are untouched | `Decline`: nothing |

Choices not listed with a condition are always enabled. A disabled choice is listed (so the operator sees it) and Confirm on it does nothing. Row text for a choice is the label above verbatim.

## 8. Shops (`sim/shop.ts`)

`SHOP_ITEMS` in this order: `0` hull, `1` torpedoes, then one upgrade per kind in `StationKind` order **excluding Engineering**: Navigation, Weapons, Science, Life Support, Medbay, Doors (`SHOP_ITEM_COUNT = 8`). `itemLabel(state, i)` and `itemEnabled(state, i)`, exact:

| item | label | enabled | `buy` effect |
|---|---|---|---|
| hull | `Hull +25 (30 scrap)` | `scrap >= 30 && hull < HULL_MAX` | `spendScrap 30`; `hull = min(HULL_MAX, hull + 25)` |
| torpedoes | `Torpedoes +2 (20 scrap)` | `scrap >= 20 && torpedoStock < TORP_CAP` | `spendScrap 20`; `stock = min(TORP_CAP, stock + 2)` |
| upgrade kind | `${STATION_NAMES[kind]} +1 bar (50 scrap)`, or `${STATION_NAMES[kind]} +1 bar (owned)` once bought | `scrap >= 50 && upgrades[kind] === 0 && stationOfKind[kind] >= 0` | `spendScrap 50`; `upgrades[kind] = 1` |

Every `buy` adds `telemetry.purchases++`. Tuning names: `SHOP_HULL = 25`, `SHOP_HULL_COST = 30`, `SHOP_TORPEDOES = 2`, `SHOP_TORPEDOES_COST = 20`, `SHOP_UPGRADE_COST = 50`.

**The upgrade's effect** (`power.ts`). Both helpers take a station **kind**: `baseMax(state, kind) = STATION_MAX[kind] + run.upgrades[kind]`; `maxLevel(state, kind) = baseMax(state, kind) + (kind === Engineering ? 0 : STATION_OVERDRIVE)`. Callers of `maxLevel(kind)` that update to `maxLevel(state, kind)`: `shiftBar` (`power.ts`), the `overdrive` helper in `tests/helpers/sim.ts`, and the assertions in `tests/{console,heat,power}.test.ts`. `isOverdriven(state, i)` (`heat.ts`) keeps its station-**index** parameter and becomes `stationOnline(state, i) && level[i] > baseMax(state, stationKind[i])`: the bought bar is a normal bar and does not heat; the overdrive bar sits above it. **Only** the overdrive threshold and the displayed maximum use `baseMax`; `stationOutput` keeps `STATION_MAX[kind]` as its denominator (so the extra bar raises output past 1 without heat), `shedPower`'s floors, `bonusBars` and the power pool are unchanged (the bar is still allocated from the reactor). The ship schema check (`allocation <= STATION_MAX`) is unchanged. HUD: `EngineeringPanel.rows[].max` and `HudStation.max` show `baseMax`; `hud.ts` `MAX_CELLS = max(STATION_MAX) + 2` (room for the upgrade cell and the overdrive cell).

## 9. HUD, threats and record

- `NavigationPanel` gains `rows: { text: string; selectable: boolean; enabled: boolean; cursor: boolean }[]` (from `navRows`, `cursor` true on the console cursor's row) and `scrap: number`; `destinations`/`cursor` are replaced by `rows` (the Run-i tests move to `rows`). `hud.ts` draws `rows` through `targetWindow(cursor, rows.length, 7)` into the seven console rows (a `none` row in `DIM`; a disabled row with status `-`; the cursor row in `TEXT`), footer `navigationFooter(p)` = Run-i's text plus `   Scrap ${scrap}`: exactly `Evade 35%   Jump 64%   Scrap 45`, `Evade 35%   Jump READY   Scrap 45`, `Evade 35%   Jump -   Scrap 45` (the Run-i footer assertions gain the suffix).
- Threats: the event row and then the shop row come **first**, before the enemy row (today's order is enemy, boarders, fires, breaches, power, objects; it becomes event, shop, enemy, boarders, fires, breaches, power, objects): a pending event adds `{ icon: 'icon.sensors', text: \`Event: ${title}\` }`; a `Shop` node adds `{ icon: 'icon.sensors', text: 'Shop here' }` (also while an event is pending there: both rows); both `WARN`-tinted like every threat. The existing enemy-first and boarders-after-enemy tests hold on nodes with neither row.
- Record: `run` gains `scrap: { earned: number; spent: number }`, `events: number`, `purchases: number`, `upgrades: string[]` (kind names in `StationKind` order). Acceptance table: column `scrap` = `${earned}/${spent}` appended after `nodes`. Headline and session banner are unchanged.

## 10. Tuning (first pass)

`SHOP_CHANCE 0.25`, `EVENT_CHANCE 0.35`, `SCRAP_PER_JUMP 15`, `SCRAP_ENEMY 30`, `SCRAP_BOARDER 10`, `EVENT_COUNT 6`, shop numbers in §8. A seven-jump run earns 105 scrap from jumps alone: two shop buys or one upgrade and a repair.

## 11. Tests (vitest, node)

Helpers (`tests/helpers/sim.ts`): `setNodeTypes(state, types: Record<string, number>)` (fills `nodeType` with `Hazard` then sets `"c:n"` entries), `allHazard(state)` (= `setNodeTypes(state, {})`), `grantScrap(state, n)` (sets `run.scrap` directly, no telemetry), `setEvent(state, id)` (sets `run.event = id, eventChoice = −1`). The fixture map **M** is Run-i's `setMap(s, [1, 3, 2, 2, 2, 2, 2, 1], …)` with every mask `1` except `0:0 = 0b101` (reachable `[0, 2]` from the start).

- Node types: for seeds 1–50, `generateMap(createRng(seed), RUN_COLUMNS)`: column 0 and the last are `Hazard`, every middle node is `Hazard`, `Event` or `Shop`, at least one middle `Shop` exists, entries past `colNodes[c]` are 0; `colNodes`/`edgeMask` equal the Run-i test's `replayMap` output on a second `createRng(seed)`; extending `replayMap` with the §3 loop on `deriveStreams(seed).map` reproduces `makeState(2, seed).run.nodeType` and `rng.map.s` for seeds 1, 7 and 23. Fallback: `assignNodeTypes(createRng(1), colNodes, nodeType, () => 0.99)` on the seed-1 `colNodes` gives every middle node `Hazard` except column 4 node 0 = `Shop`; with `() => 0.1` every middle node is `Shop` and no fallback applies.
- Arrival: on M with `allHazard`, `jumpShip(s, 0)` adds `SCRAP_PER_JUMP` to `scrap` and `scrapEarned`, leaves `event −1`, and `rng.loot.s` is unchanged, and a `nextFloat(rng.loot)` afterwards equals the value a copy of the pre-jump stream gives. With `setNodeTypes(s, { '1:2': Event })`, `jumpShip(s, 2)` leaves `rng.loot.s` equal to a copy advanced by exactly one `nextInt(…, EVENT_COUNT)` and `event` equals that draw. Pending-event block: seat the navigator on M at column 1 node 2 with `setEvent(s, 4)`, `chargeJump`, the cursor on row 2 (a `choice`): `navRows` has four rows; a Confirm edge through `step` leaves `column 1`, `jumps 0`, `jumpCharge 1` and `eventChoice 0` (the choice resolved instead); a second Confirm edge now lands on the first destination row (cursor re-clamped to it, `navRows` lists destinations only) and jumps to column 2. The same test asserts the rows' `text`/`select`/`enabled` for event 4.
- Each event, both choices (12 cases): the exact state change, `eventsResolved`, scrap counters, and the exact `rng.loot` movement (0 or 1 draw), including: the Derelict's fire in the drawn room; Distress disabled at `hull 10`; Smugglers disabled at 19 scrap and at full stock, capped at `TORP_CAP`; the field's breach in the drawn free site and no draw with no free site; the cache's failed station and the already-failed skip; the freighter healing Conscious crew only (a Downed member untouched) and disabled at 14 scrap. A disabled choice under Confirm changes nothing.
- Shops (on M with `setNodeTypes(s, { '1:0': Shop })` at column 1 node 0, `grantScrap(s, 100)`): `navRows` is the header, eight `buy` rows in §8 order, then two `jump` rows (`Node 3a`, `Node 3b`), eleven in all; `itemEnabled` per item at `scrap 100`: hull disabled at full hull, enabled after `hull = 90`; torpedoes disabled at `TORP_CAP`, enabled at `TORP_START`; each upgrade enabled, Engineering absent from the list. Buys: hull `90 → HULL_MAX` (capped) for 30, `scrapSpent 30`, `purchases 1`; torpedoes `TORP_CAP − 1 → TORP_CAP` for 20; Weapons upgrade: `upgrades[Weapons] 1`, `baseMax(s, Weapons) = STATION_MAX[Weapons] + 1`, `maxLevel(s, Weapons)` up by one, `maxLevel` of every other kind unchanged, the row text becomes `Weapons +1 bar (owned)` with `enabled false` and a second Confirm changes nothing; `shiftBar` reaches the new `maxLevel` and refuses the next; `isOverdriven` false at `baseMax` and true one above; `heatStep` over 5 hazard ticks at `baseMax` leaves heat 0. Cursor: with the cursor on the hull row a buy keeps it on the hull row (still selectable, now disabled: it stays, Confirm does nothing); a cursor set to 0 (the header) moves to 1 on the next `navigationInput`; Up from row 1 wraps to the last destination row; Down from the last destination wraps to row 1; the HUD window at cursor 10 shows rows 4–10. A `Hazard` node lists only destinations; after an event resolves on a `Shop` node the shop list appears.
- Scrap: `leave(state, true)` adds `SCRAP_ENEMY`, `leave(state, false)` none; a boarder kill adds `SCRAP_BOARDER`; `scrapEarned`/`scrapSpent` reconcile with `scrap`.
- Snapshot: round trip of every new field; each alone changes the hash; version-13 rejection; a mid-event save resumes with the same rows and cursor.
- HUD: `rows` and `scrap` on the panel, the footer string, the window with eight shop items plus destinations, the event and shop threat rows, `max` on the Engineering panel after an upgrade; record `run` and the table's `scrap` column.
- Gates: `gate-survival` and `gate-boarding` figures identical to Run-i's (the bots never sit at Navigation and the map is identical; a Hazard arrival never touches `rng.loot`, and no jump happens in those gates). `gate-jump` calls `allHazard(s)` right after `makeState` so no arrival draws from `rng.loot`, and asserts the same end tick as Run-i (25200) and the same figures. A new `tests/gate-run.test.ts`: `makeState(2, 1, RECRUITS)`, quiet, enemy and boarders silenced, M, `setNodeTypes(s, { '1:0': Event, '2:0': Shop })`, `setEvent` is **not** used: arrival at `1:0` draws the event id from `rng.loot`, so the test overrides `run.event = 4` right after the first jump (the loot draw still happened); `hull = 90` set by hand at tick 0. The navigator script is the jump gate's with these rules once seated: a pending event → cursor on row 2, Confirm (Supply cache choice 0, `+40`); at the Shop node → move the cursor to the hull row and Confirm once (`−30`, hull `HULL_MAX`), then to the first destination and Confirm when ready; otherwise Confirm every tick as in the jump gate (always destination 0: each node's mask 1 leads to node 0; from the start, reachable `[0, 2]` and the cursor's first destination is node 0). Assert victory, `jumps 7`, `scrapEarned 7 × 15 + 40 = 145`, `scrapSpent 30`, `scrap 115`, `eventsResolved 1`, `purchases 1`, `hull HULL_MAX`, both crew Conscious.
- Golden replay re-blessed once (version 14; the new fields are hashed).

## 12. Gate (`docs/gates.md`, entries start unchecked)

- [ ] `npm test` passes with the §11 tests; golden re-blessed once.
- [ ] Survival, boarding and jump gates pass with figures identical to Run-i's (recorded).
- [ ] `gate-run` passes (scrap total recorded).
- [ ] `npm run acceptance 5 1`: three rows with the `scrap` column reading `0/0` and `nodes` still `0/8` (the bot never sits at Navigation, so it never jumps, earns or spends).
- [ ] Manual, two players: an Event node shows its text and two choices on the Navigation panel and `Event: <title>` in the threats; a choice applies and the destinations return; a Shop node lists eight items and the destinations with `Scrap N` in the footer; a bought upgrade adds a cell to that station's power row.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass on the final commit.

## 13. Known limitations

Events do not address a crew member or chain across nodes; shop stock is unlimited except by caps and the one-upgrade rule; scrap has no use beyond shops and two events until Run-iii.

## 14. Amendments from the plan
- `addScrap`/`spendScrap` live in `sim/scrap.ts` (imported by `run.ts`, `events.ts`, `shop.ts`, `enemy.ts` and `boarders.ts`) to avoid an import cycle through `run.ts`.
- `clampNavCursor` is exported from `run.ts` and runs at the start of every `navigationInput` call; on arrival the cursor is 0 (the header or title row) for one tick until the seated navigator's next tick clamps it. The disabled-row status `-` is produced in `hud.ts`.
- There is no `SHOP_ITEMS` export; the item order is `hull, torpedoes, UPGRADE_KINDS...` with `SHOP_ITEM_COUNT = 8`.
- The fixture map M reaches one node from column 1, so shop lists there have ten rows.
- The acceptance soak's scrap column reads `20/0` for crews that kill two boarders, not `0/0` as section 12 first said.
- `hud.ts`'s Engineering branch now tests `'rows' in console && !('kind' in console)` because the Navigation panel also has `rows`.
- No HUD render test exists; the Navigation window, styling and `MAX_CELLS` growth are covered by the model tests and the manual gate.
