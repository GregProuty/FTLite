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

- [ ] Section 7 tests; golden re-blessed once; gates recorded.
- [ ] Visual check by Claude: the `UPGRADES` row, the Upgrades page with prices, a purchase and its notice.
- [ ] Manual, the user: is spending scrap on upgrades a real decision between fights?

## 9. Amendments

(Filled during review and implementation.)
