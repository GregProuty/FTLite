# Weapon Loot (Loop-iii) Design

Status: 2026-11-12. FTL-loop item 3 of the user's direction ("match their game loop as closely as possible before play testing"). In FTL each run's build comes from the weapons you find and buy. FTLite has one pulse laser (beam with a frequency selector) and one torpedo tube, the same every run.

## 1. Weapons (original names and numbers)

Today's two weapons stay exactly as they are: the **Pulse Laser** (the beam, frequency selector F1–F3, charge `BEAM_CHARGE_TIME`) and the **Torpedo Tube** (stock, load, ignores shields). Loot adds four types for two extra slots:

| Weapon | Charge at output 1 | Shots | Damage | Rules |
|---|---|---|---|---|
| Burst Laser | 9 s | 2 | 10 each | Each shot is its own hit roll (one combat draw each) and follows the beam's tuning rules: tuned when locked (Coop-i), when shields are down or no layer is up; an untuned hit strips a layer, so the first shot can open the shield for the second |
| Heavy Laser | 12 s | 1 | 30 | One roll, the beam's tuning rules |
| Ion Cannon | 7 s | 1 | 0 | One roll at the torpedo's hit chance; a hit strips one layer if any is up; with no layer up, a hit on a system row disables it for `ION_SECONDS` (10 s): the system acts as down without losing health (new enemy field `ionUntil` per system) |
| Missile Pod | 8 s | 1 | 25 | Spends one torpedo from stock when it fires (none, no fire); ignores shields; one roll at the torpedo's hit chance |

Against asteroids and rocks: the lasers roll as an untuned beam against debris; the ion cannon cannot target them; the missile pod hits like a torpedo.

## 2. Slots and power

- Two extra slots, `weapons.slot[0..1]` (weapon id, 0 empty) with their own `charge[0..1]`.
- A slot charges only while the Weapons station's power level is high enough: extra slot 0 needs level 2 or more, extra slot 1 needs level 4 or more. The base maximum is 3, so the second slot needs a Weapons upgrade (Loop-ii). Charge is kept when power drops, as the beam's is today.
- The selector cycles a flat list: Pulse F1, F2, F3, then each filled extra slot, then the Torpedo. Confirm fires the selected weapon at the targeted row if it is charged (and, for the missile pod, has stock).

## 3. Finding weapons

- **Shops** offer one weapon each, drawn with `rng.loot` when the crew arrives at the shop, at its price: Burst 60, Heavy 70, Ion 55, Missile 65 scrap.
- **Kills** drop a weapon with `WEAPON_DROP_CHANCE` (0.25): one `rng.loot` draw for the chance, one for the type.
- A new weapon fills the first empty extra slot. If both are full it goes to **cargo** (`weapons.cargo`, one weapon). If cargo is full too, it is sold for half its price in scrap.
- **Swapping.** While cargo holds a weapon and no enemy is present, the Weapons card shows a `SWAP` row: Confirm on it swaps cargo with the extra slot the selector is on (or with slot 0 when the selector is elsewhere).

## 4. HUD

- The selector strip: `Pulse F1 F2 F3  Burst  Ion  Torp` (filled slots only), the selected one lit.
- The footer: one charge figure per weapon (`Pulse 80%  Burst READY  Torp LOADED  Stock 3/6`), within the card.
- The enemy window draws an ion-disabled system's room in blue with its seconds.
- Notices: `Found: Ion Cannon (slot 2)`, `Bought: Heavy Laser`, `Cargo full: sold for 30`.

## 5. Bots, state, tests

- Bots never fire, buy or swap; gates should be unchanged apart from rng.loot draws at shops and kills (record any change).
- State: `weapons.slot`, `weapons.charge2` (extra charges), `weapons.cargo`, `enemy.ionUntil`, the shop's offered weapon. All flattened; `SIM_VERSION` 26; golden re-blessed once.
- Tests: each weapon's rolls, draws and effects; tuning rules for the lasers; ion strip and disable; missile stock; slot power thresholds; the selector list; shop offers and purchases; kill drops; cargo and selling; the SWAP row; HUD strings and widths; snapshot round trip; gates re-recorded.

## 6. Gate

- [x] Section 5 tests; golden re-blessed once; gates recorded (docs/gates.md, Loop-iii).
- [x] Visual check by Claude: the selector strip with a loot weapon, its charge, a shop offer, the SWAP row, an ion-disabled room.
- [ ] Manual, the user: do runs feel different depending on what you find?

## 7. Amendments

- **W1 Selector values.** The selector keeps its values (0..2 Pulse F1..F3, 3 Torpedo) and adds 4 and 5 for the extra slots, so today's Pulse Laser and Torpedo code and tests are untouched; Left/Right walk the flat list of section 2 (`selectorList`). A selector on a slot that empties falls back to F1 on the next Left/Right.
- **W2 Firing details.** A loot weapon needs the Weapons console online and seated, as the Pulse Laser. A Burst volley stops once its target is gone (a killed enemy or a cleared rock): no second draw. Each shot counts in `telemetry.shots`; the XP and `skills.lastShotTick` are per Confirm. Like the Pulse Laser, `fireWeapon` returns true on a strip. The renderer's last shot records the volley's last result; the missile pod draws as a torpedo (`lastShotKind` 1), the lasers and the ion cannon as the beam. An ion hit on the hull row with no layer up does nothing; an ion disable does not void a surrender or flash the hull. A missile pod with no stock refuses to fire and keeps its charge; on a magazine ship it spends the magazine's stock.
- **W3 Ion "acts as down".** One helper, `enemySysUp`, replaces the health checks for the shields (layers count as down, no recharge, no re-tune: the re-tune clock stands still while ionised, so it does not fire the moment the ion ends), the weapons (no charge, a due shot is skipped as with the weapons down) and the engines (no evasion, no flee start, the departure clock stands still). Health is untouched and nothing changes while no ion runs (`ionUntil` -1).
- **W4 Drops and the shop.** The kill drop follows the fuel draw and, like the scrap and fuel, the Pursuit's elite pays none (its existing test pins that a kill of the elite draws nothing from `rng.loot`). The offer row reads `Heavy Laser (70 scrap)` after the fuel; buying is disabled while both slots and the cargo are full (it would only sell back for half). The offer draw replaces any old one on every arrival (0 away from a shop). The shop notice adds `  Ion (55)` to its price line (within the 64-character budget).
- **W5 Notices.** `Found: Ion Cannon (slot 2)` / `(cargo)`, `Bought: Heavy Laser`, `Cargo full: sold for 35`, each for 4 s after the purchase notice in priority; a drop on the killing shot takes the second line of `ENEMY DEFEATED`. The notice state is four flattened weapons fields (`lootTick`, `lootId`, `lootPlace`, `lootBought`).
- **W6 The Weapons card.** All of section 4's figures do not fit one 40-character footer (two Missile Pods, the Torpedo and the stock run to about 60), so the footer keeps the Pulse Laser, the tube, the stock and LOCKED (`Pulse 80%  Torp LOADED  Stock 3/6`), and a loot line above it gives one figure per extra slot (`Burst READY  Ion 40%`, `OFF` below its Weapons level, `EMPTY` for a missile pod without a torpedo). The loot line takes the last target row, so five target rows show while a slot is filled. `Beam` reads `Pulse` on the strip and the footer.
- **W7 The SWAP row.** A Weapons cursor value (`SWAP_SLOT`, -2) after the targets in the Up/Down cycle while it shows: `SWAP: cargo Missile for Heavy`, in the callout colour. The incoming weapon starts uncharged. The row goes when an enemy arrives (the cursor moves to the first target); a new warning can take the cursor from it, as it takes an empty cursor.
- **W8 Ion in the target rows.** The visual check showed the Weapons row `Enemy shields 100%` while the room was blue: an ionised system row now reads `Enemy shields 100% ION 9s`.
- **W9 Slot power.** The second slot charges at Weapons level 4 or more, which overdrive alone reaches on today's ship (base 3 + 1): the slot is also reachable through heat, not only through an upgrade. Left as the spec says; noted for the user.
- **W10 Gate change.** Only `gate-duo` seeds 1 and 3 and the four-player acceptance row moved, and only by the shop's extra row (the captain bot scrolls past one more row at a shop): with the row hidden and the draw kept the figures are exactly the old ones; with the draw removed and the row kept they are the new ones.
- **W11. Claude, 2026-11-12:** slot 2 reachable through Weapons overdrive (level 4 with heat) is kept: overdriving to power a second gun is a risky trade, and the heat is its cost.
