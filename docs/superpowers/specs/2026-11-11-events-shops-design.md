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

`NodeType = { Hazard: 0, Event: 1, Shop: 2 }` in `sim/run.ts`. Column 0 and the last column are always `Hazard`. Each middle-column node is drawn at generation, after every Run-i edge draw: for each column `c` in `1..RUN_COLUMNS − 2`, for each node `n` in `0..colNodes[c] − 1`, in that order: `u = nextFloat(rng.map)`; `Shop` if `u < SHOP_CHANCE`, else `Event` if `u < SHOP_CHANCE + EVENT_CHANCE`, else `Hazard` (one draw per middle node). Then, with no draw: if no node in the middle columns is a `Shop`, node 0 of column `floor(RUN_COLUMNS / 2)` becomes one. Because the type draws follow the edge draws, `colNodes` and `edgeMask` for a seed equal Run-i's exactly (asserted). A `Hazard` node is the Run-i node: nothing happens there beyond the usual hazards and encounters.

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

**Cursor** (`stations.cursor` of the Navigation console) indexes `navRows`; `sitDown` sets it to 0 as today, and `navigationInput` first moves it to the first selectable row if it rests on a `none` row or past the end. Up/Down move to the previous/next **selectable** row with wrap; Left/Right are ignored. Then a Confirm edge acts on the cursor's row: `choice` and `enabled` → `resolveEvent(state, index)`; `buy` and `enabled` → `buy(state, index)`; `jump` with `jumpCharge >= 1` → `jumpShip(state, index)`; anything else does nothing. After a resolve or a buy the cursor is re-clamped to the first selectable row of the new list (a resolve changes the list; a buy keeps it, so the cursor stays put when still selectable).

`jumpShip(state, destination)` now takes the destination node index explicitly (Run-i read the cursor as an index into `reachable`; the mixed list makes that wrong); it ignores `destination` when it is not in `reachable` (no-op). The jump gate and the Run-i tests pass the destination.

## 7. Events (`sim/events.ts`)

`EVENTS: readonly { title: string; text: string; choices: readonly [string, string] }[]`, `EVENT_COUNT = 6`. `choiceEnabled(state, id, k)` and `resolveEvent(state, k)` (which sets `run.eventChoice = k`, `telemetry.eventsResolved++`, applies the effect) are the only logic. Effects, exact; loot draws only where stated; hull never changes except as written; "a random room/site/station" is `nextInt(rng.loot, n)` over `layout.rooms.length`, `freeSites(state).length` or `stations.level.length`:

| id | title | text | choice 0 | choice 1 |
|---|---|---|---|---|
| 0 | Derelict hulk | A drifting hulk, still warm inside. | `Salvage it (+25 scrap, fire risk)`: `addScrap 25`; one draw picks a room; `igniteRoom(state, room)` (a no-op if it already burns, the draw is still made) | `Leave it`: nothing |
| 1 | Distress call | A venting freighter offers a reward for help. | `Help them (hull -10, +30 scrap)`: enabled while `hull > 10`; `hull −= 10`; `addScrap 30` | `Ignore it`: nothing |
| 2 | Smugglers | Smugglers offer torpedoes, no questions asked. | `Buy 2 torpedoes (20 scrap)`: enabled while `scrap >= 20 && torpedoStock < TORP_CAP`; `spendScrap 20`; `torpedoStock = min(TORP_CAP, stock + 2)` | `Refuse`: nothing |
| 3 | Micrometeoroid field | A debris field lies across the lane. | `Push through (+20 scrap, breach risk)`: `addScrap 20`; if `freeSites` is non-empty, one draw picks a site and `activateBreach(state, site)`; no draw when none is free | `Go around (drive recharges)`: `jumpCharge = 0` |
| 4 | Supply cache | An unmarked cache, hard-wired to something. | `Take the scrap (+40)`: `addScrap 40` | `Strip it bare (+60 scrap, a station fails)`: `addScrap 60`; one draw picks a station index; `failStation(state, i)` (if already failed, the call is skipped; the draw is still made) |
| 5 | Medical freighter | A hospital ship offers treatment. | `Treat the crew (15 scrap)`: enabled while `scrap >= 15`; `spendScrap 15`; every **Conscious** crew member's `Health.cur = HEALTH_MAX` | `Decline`: nothing |

Choices not listed with a condition are always enabled. A disabled choice is listed (so the operator sees it) and Confirm on it does nothing. Row text for a choice is the label above verbatim.

## 8. Shops (`sim/shop.ts`)

`SHOP_ITEMS` in this order: `0` hull, `1` torpedoes, then one upgrade per kind in `StationKind` order **excluding Engineering**: Navigation, Weapons, Science, Life Support, Medbay, Doors (`SHOP_ITEM_COUNT = 8`). `itemLabel(state, i)` and `itemEnabled(state, i)`, exact:

| item | label | enabled | `buy` effect |
|---|---|---|---|
| hull | `Hull +25 (30 scrap)` | `scrap >= 30 && hull < HULL_MAX` | `spendScrap 30`; `hull = min(HULL_MAX, hull + 25)` |
| torpedoes | `Torpedoes +2 (20 scrap)` | `scrap >= 20 && torpedoStock < TORP_CAP` | `spendScrap 20`; `stock = min(TORP_CAP, stock + 2)` |
| upgrade kind | `${STATION_NAMES[kind]} +1 bar (50 scrap)`, or `${STATION_NAMES[kind]} +1 bar (owned)` once bought | `scrap >= 50 && upgrades[kind] === 0 && stationOfKind[kind] >= 0` | `spendScrap 50`; `upgrades[kind] = 1` |

Every `buy` adds `telemetry.purchases++`. Tuning names: `SHOP_HULL = 25`, `SHOP_HULL_COST = 30`, `SHOP_TORPEDOES = 2`, `SHOP_TORPEDOES_COST = 20`, `SHOP_UPGRADE_COST = 50`.

**The upgrade's effect** (`power.ts`): `baseMax(state, kind) = STATION_MAX[kind] + run.upgrades[kind]`; `maxLevel(state, kind) = baseMax(state, kind) + (kind === Engineering ? 0 : STATION_OVERDRIVE)` (the signature gains `state`; every caller updates). `isOverdriven` (`heat.ts`) becomes `level > baseMax(state, kind)`: the bought bar is a normal bar and does not heat; the overdrive bar sits above it. `stationOutput` keeps `STATION_MAX[kind]` as its denominator, so the extra bar raises output past 1 like an overdrive bar without the heat. `shiftBar` and `shedPower` use the new `maxLevel`; the power pool is unchanged (the bar still has to be allocated from the reactor). The ship schema check (`allocation <= STATION_MAX`) is unchanged. HUD: `EngineeringPanel.rows[].max` and `HudStation.max` show `baseMax`; `hud.ts` `MAX_CELLS = max(STATION_MAX) + 2` (room for the upgrade cell and the overdrive cell).

## 9. HUD, threats and record

- `NavigationPanel` gains `rows: { text: string; selectable: boolean; enabled: boolean; cursor: boolean }[]` (from `navRows`, `cursor` true on the console cursor's row) and `scrap: number`; `destinations`/`cursor` are replaced by `rows` (the Run-i tests move to `rows`). `hud.ts` draws `rows` through `targetWindow(cursor, rows.length, 7)` into the seven console rows (a `none` row in `DIM`; a disabled row with status `-`; the cursor row in `TEXT`), footer `navigationFooter(p)` = Run-i's text plus `   Scrap ${scrap}` (`Evade 35%   Jump 64%   Scrap 45`).
- Threats (first rows, before the enemy): a pending event adds `{ icon: 'icon.sensors', text: \`Event: ${title}\` }`; a `Shop` node adds `{ icon: 'icon.sensors', text: 'Shop here' }`; both `WARN`-tinted like every threat.
- Record: `run` gains `scrap: { earned: number; spent: number }`, `events: number`, `purchases: number`, `upgrades: string[]` (kind names in `StationKind` order). Acceptance table: column `scrap` = `${earned}/${spent}` appended after `nodes`. Headline and session banner are unchanged.

## 10. Tuning (first pass)

`SHOP_CHANCE 0.25`, `EVENT_CHANCE 0.35`, `SCRAP_PER_JUMP 15`, `SCRAP_ENEMY 30`, `SCRAP_BOARDER 10`, `EVENT_COUNT 6`, shop numbers in §8. A seven-jump run earns 105 scrap from jumps alone: two shop buys or one upgrade and a repair.

## 11. Tests (vitest, node)

- Node types: for seeds 1–50, column 0 and the last are `Hazard`, every middle node is one of the three, at least one `Shop` exists, and `colNodes`/`edgeMask` equal the Run-i replay's; a replay of §3 on `deriveStreams(seed).map` after the Run-i replay reproduces `nodeType` and the final stream state; a fixture with the shop fallback (every draw a `Hazard`) places the shop at column 4 node 0.
- Arrival: a jump to a `Hazard` node adds `SCRAP_PER_JUMP`, leaves `event −1` and moves `rng.loot` by nothing; a jump to an `Event` node moves `rng.loot` by exactly one draw and sets `event` to that draw; a pending event lists four rows with the cursor on row 2 and `navigationInput` Confirm with a ready drive does **not** jump; after `resolveEvent` the destinations are listed and the jump works.
- Each event, both choices (12 cases): the exact state change, `eventsResolved`, scrap counters, and the exact `rng.loot` movement (0 or 1 draw), including: the Derelict's fire in the drawn room; Distress disabled at `hull 10`; Smugglers disabled at 19 scrap and at full stock, capped at `TORP_CAP`; the field's breach in the drawn free site and no draw with no free site; the cache's failed station and the already-failed skip; the freighter healing Conscious crew only (a Downed member untouched) and disabled at 14 scrap. A disabled choice under Confirm changes nothing.
- Shops: each item's buy, cost, cap and disabled state; an upgrade raises `baseMax` and `maxLevel` by one for that kind only, `shiftBar` reaches the new maximum, `isOverdriven` is false at `baseMax` and true one above, heat does not rise at `baseMax`; the `(owned)` label; a non-shop node lists no items; the cursor stays on an item after a buy and moves to the first selectable row when the list shrinks.
- Scrap: `leave(state, true)` adds `SCRAP_ENEMY`, `leave(state, false)` none; a boarder kill adds `SCRAP_BOARDER`; `scrapEarned`/`scrapSpent` reconcile with `scrap`.
- Snapshot: round trip of every new field; each alone changes the hash; version-13 rejection; a mid-event save resumes with the same rows and cursor.
- HUD: `rows` and `scrap` on the panel, the footer string, the window with eight shop items plus destinations, the event and shop threat rows, `max` on the Engineering panel after an upgrade; record `run` and the table's `scrap` column.
- Gates: `gate-survival`, `gate-boarding` and `gate-jump` figures identical to Run-i's (the bots never sit at Navigation; the map is identical; the jump gate's map is forced all-`Hazard` through a helper). A new `gate-run` test: a scripted navigator on a forced map with an Event node (Supply cache, choice 0) and a Shop node buys the hull repair after taking 10 hull damage by hand, and reaches victory with `scrap` reconciling: `105 + 40 − 30`.
- Golden replay re-blessed once (version 14; the new fields are hashed).

## 12. Gate (`docs/gates.md`, entries start unchecked)

- [ ] `npm test` passes with the §11 tests; golden re-blessed once.
- [ ] Survival, boarding and jump gates pass with figures identical to Run-i's (recorded).
- [ ] `gate-run` passes (scrap total recorded).
- [ ] `npm run acceptance 5 1`: three rows with the `scrap` column (`15 × jumps / 0` for bots that never buy; the bot never jumps, so `0/0`).
- [ ] Manual, two players: an Event node shows its text and two choices on the Navigation panel and `Event: <title>` in the threats; a choice applies and the destinations return; a Shop node lists eight items and the destinations with `Scrap N` in the footer; a bought upgrade adds a cell to that station's power row.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass on the final commit.

## 13. Known limitations

Events do not address a crew member or chain across nodes; shop stock is unlimited except by caps and the one-upgrade rule; scrap has no use beyond shops and two events until Run-iii.
