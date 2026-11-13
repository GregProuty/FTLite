# Upgrades from the Engineering Console (Loop-ii) Design

Status: 2026-11-12. FTL-loop item 2 of the user's direction ("match their game loop as closely as possible before play testing"). In FTL, scrap's main use is upgrading systems and reactor power, at any time, with prices that rise per level. FTLite today sells one `+1 bar` per system, only at shops.

## 1. What can be bought

- **System levels.** Each station kind can be raised up to `UPGRADE_MAX` (3) levels above its starting maximum. The price of the next level is `UPGRADE_BASE + UPGRADE_STEP × current` (30, 45, 60 scrap). `run.upgrades[kind]` becomes a level count (0 to 3) instead of a 0/1 flag; `baseMax` already adds it.
- **Reactor power.** New run field `reactorBonus` (0 to `REACTOR_BONUS_MAX`, 5) adds bars to `REACTOR_CAPACITY`. Price `REACTOR_BASE + REACTOR_STEP × current` (25, 35, 45, 55, 65).
- A bought level or bar takes effect at once, as in FTL; the new bar starts unpowered (the Engineering officer routes it).

## 2. Where: the Engineering console's Upgrades page

- The Engineering card gains one row at the bottom, `UPGRADES`. Confirm on it switches the card to the **Upgrades page**: one row per station kind (`Weapons  lvl 3/6  45`) and a `Reactor  +1 bar  35` row, then `BACK`.
- On the Upgrades page, Up/Down moves; Confirm on a row buys it if the crew has the scrap and it is not maxed; Confirm on `BACK` returns to the power page. Left/Right do nothing there.
- New station field `page` (0 power, 1 upgrades), per station, flattened; it resets to 0 when the officer stands up.
- The power page is unchanged: Left/Right route power, Confirm cycles coolant (today's behaviour) on station rows, and Confirm on `UPGRADES` opens the page.
- The scrap shown on the card is the crew's shared scrap. The card footer reads `Scrap 120` on the Upgrades page.
- Buying makes a short audio cue and a notice line for 3 s: `Weapons upgraded to 4` / `Reactor +1 (11 bars)`.

## 3. Shops

- Shops stop selling `+1 bar` upgrades. They keep hull, torpedoes and fuel; weapons come in Loop-iii. Shop rows and their tests change accordingly.

## 4. Progression and telemetry

- Any unlock or start bonus that grants an upgrade grants one level of it.
- Telemetry `run.upgrades` becomes `{ station: level }` for levels above 0, plus `reactorBonus`.

## 5. Bots

- Bots never buy upgrades. Gates should be unchanged apart from the shop change; record any difference.

## 6. State and versions

`run.upgrades` (levels), `run.reactorBonus`, `stations.page`. All flattened. `SIM_VERSION` 25. The golden is re-blessed once.

## 7. Tests

- Prices for each level; the max; not enough scrap; the effect on `baseMax`, `maxLevel` and the reactor capacity; the new bar unpowered.
- The page: opening and leaving, Up/Down wrap over the page's rows, Confirm buys, Left/Right inert, reset on standing up; the power page unchanged including coolant.
- Shops without upgrade rows; unlocks granting levels; telemetry.
- Snapshot round trip; version 24 rejected.
- Gates re-recorded; no floor lowered; the golden re-blessed once.

## 8. Gate

- [x] Section 7 tests; golden re-blessed once; gates recorded (2026-11-12, 959 tests, golden dca013d4 -> 880db95d).
- [x] Visual check by Claude: the `UPGRADES` row, the Upgrades page with prices, a purchase and its notice (2026-11-12, see `docs/gates.md`).
- [ ] Manual, the user: is spending scrap on upgrades a real decision between fights?

## 9. Amendments

(Filled during review and implementation.)

### Claude's review (the Codex spec review timed out), 2026-11-12. These rules override earlier text where they differ.

- **U1. Reactor.** `state.power.capacity` already holds the reactor size (state.ts:97, flattened). A reactor upgrade raises it by 1 and increments `run.reactorBonus`, which only prices the next bar. The ship schema's allocation check against `REACTOR_CAPACITY` (schema.ts:42) is about the starting layout and stays.
- **U2. The Engineering cursor.** Today the cursor value is the station kind (`0..STATION_COUNT-1`, console.ts:34–43). On the power page the rows become `0..STATION_COUNT` with `STATION_COUNT` meaning `UPGRADES`; Left/Right and coolant do nothing on that row. On the Upgrades page the rows are the station kinds, then `STATION_COUNT` = Reactor, then `STATION_COUNT + 1` = `BACK`. Every reader of the Engineering cursor (the HUD model, the bot if it reads it, the skill productivity checks) must handle the extra rows.
- **U3. Upgrade flags become levels.** `run.upgrades[k]` is read at power.ts:28 (`baseMax`, already additive), shop.ts:16–31 (removed with the shop rows) and telemetry.ts:78 (becomes levels). Heat and overdrive use `baseMax` and `maxLevel` unchanged, so they follow the new levels automatically.
- **U4. Purchases.** Only the seated Engineering officer buys, at an online Engineering station. The crew's scrap pays.

### Implementation, 2026-11-12. These amendments record where the code differs from the text above.

- **A1. Engineering is not upgradeable.** Its level drives no output (`stationOutput` is never read for Engineering, and `maxLevel` gives it no overdrive), so a bought Engineering level would be a trap. The six kinds of Run-ii section 8 (`UPGRADE_KINDS`, now in `power.ts`) are the upgradeable ones. The Upgrades page lists those present on the ship, then `Reactor`, then `BACK`; the cursor values keep rule U2 (the kind number, `STATION_COUNT` for Reactor, `STATION_COUNT + 1` for BACK) and Up/Down step over that list with wrap, skipping Engineering.
- **A2. Unlocks.** No unlock or start bonus grants an upgrade, so section 4's conversion has nothing to convert; a progression test pins that a full set of start bonuses leaves every level, `reactorBonus` and the capacity at their starts.
- **A3. The notice and the cue need state.** Two flattened run fields hold the last purchase: `run.boughtTick` (-1 none) and `run.boughtKind` (a kind, or `REACTOR_ROW` = `STATION_COUNT`). The notice reads them for `PURCHASE_NOTICE_SECONDS` (3); its priority is after a pending jump and an open event and before everything else. The `upgrade` cue fires when the sum of levels and reactor bars rises (`cueCounters.upgrades`), after `jump` in the cue order.
- **A4. Row text.** The level reads `lvl <baseMax>/<STATION_MAX + UPGRADE_MAX>`; a maxed kind reads `Weapons  lvl 6/6  MAX`, a maxed reactor `Reactor  MAX`. Rows the crew cannot buy (maxed or short of scrap) are drawn faint. Every purchase counts in `telemetry.purchases` and `scrapSpent`.
- **A5. Cursor moves.** Confirm on `UPGRADES` puts the cursor on the page's first row; `BACK` returns to the `UPGRADES` row. Sitting down also resets the page (with the cursor), as standing does.
- **A6. Layout.** The Engineering card has eight rows (`UPGRADES` or the page's eight) and grows one line upward; the other cards keep seven. Up to seven cells now share a power row (3 + 3 levels + overdrive), so cells are 7 px on a 9 px step and the status and coolant columns moved right (x 179 and 213 from the row); the page's level and price columns sit at x 124 and 212.
- **A7. Shops.** `SHOP_ITEM_COUNT` is 3 (hull, torpedoes, fuel), `SHOP_UPGRADE_COST` is gone, and the shop notice's price line drops `Upgrade (50)`.
- **A8. Gates.** Every gate passes and no floor was lowered. Only `gate-duo` moved: seed 1 min health 50.9 -> 88.0, seed 3 38.6 -> 44.7 (seed 2 and every hull figure unchanged). Cause: both seeds route through a shop at column 2, and the captain bot scrolls past three shop rows instead of nine, so it leaves 12 ticks sooner and later fights land at other moments (traced: column 3 arrival 11039 -> 11027 on seed 1, 11519 -> 11507 on seed 3). No bot buys anything.
