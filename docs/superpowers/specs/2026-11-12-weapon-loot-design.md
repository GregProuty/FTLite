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

- [ ] Section 5 tests; golden re-blessed once; gates recorded.
- [ ] Visual check by Claude: the selector strip with a loot weapon, its charge, a shop offer, the SWAP row, an ion-disabled room.
- [ ] Manual, the user: do runs feel different depending on what you find?

## 7. Amendments

(Filled during implementation.)
