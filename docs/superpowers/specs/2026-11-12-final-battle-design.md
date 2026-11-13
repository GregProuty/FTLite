# The Final Battle (Loop-iv) Design

Status: 2026-11-12. FTL-loop item 5 of the user's direction ("match their game loop as closely as possible before play testing"). Today escaping the last sector simply wins. FTL ends with a battle against the Flagship, the run's climax. The second FTL transcript says the Flagship is the part its creators regret: it breaks the game's own rules (it keeps fighting with no crew, fires a disabled system, never varies) and is a wall most players never pass. Our final battle keeps the climax and obeys every normal rule.

## 1. Where and when

- In the last sector, `Escape: win the run` becomes `Engage the Warden` (original name: the ship guarding the way out). Jumping (1 fuel, as today) moves the crew to a **final beacon**, which is not on the sector map.
- The final beacon is never calm and never overrun. The Warden arrives after `ENCOUNTER_START` (8 s), with the contact notice `The Warden is coming about`.
- The director keeps running at the final beacon, at its usual rate during a fight (halved).
- **Winning:** destroying the Warden ends the run with Victory. No other outcome wins.
- **No escape:** the drive does not charge at the final beacon. The run ends in Victory or in defeat by the usual rules (hull 0 or the crew down).

## 2. The Warden

- A normal enemy in every rule: the same systems, shields, interior fires and breaches, ion, self-repair, the same shot types and accuracy, the same rng streams. The only differences are its numbers:
  - hull `WARDEN_HULL_MULT` (2.5) × the normal hull at the final depth;
  - shield layers: the normal maximum at the final depth + 1;
  - fire interval × `WARDEN_FIRE_MULT` (0.7);
  - it never flees or surrenders (its flee threshold is ignored);
  - it carries no scrap or fuel reward (the run ends).
- There is one phase. Disabling its weapons stops its shots, destroying its shields system drops its shields, as for any enemy.
- The enemy window title reads `THE WARDEN` and its status line follows the usual rules.

## 3. Bots and gates

- The captain bot engages the Warden when it reaches the last exit, as it escaped before. Bots never fire, so a bot crew cannot win the final battle. The run gate and the jump gate must therefore stop expecting a bot Victory. They assert that the bots reach the final beacon and that the Warden arrives. A scripted gunner test (like the existing combat gate's) proves the Warden can be destroyed and the run won, and records how many shots it takes at the starting loadout and with one loot weapon.

## 4. State and versions

New run field `finalBeacon` (0/1), flattened; `SIM_VERSION` 27; the golden re-blessed once.

## 5. Tests

- The last exit's row text and the jump to the final beacon (1 fuel); no calm, no overrun, no drive charge at the final beacon; the Warden's numbers; it never flees; destroying it wins; hull 0 or the crew down loses as usual; the notice and the window title; snapshot round trip; the gates' new expectations; the scripted gunner's shot counts recorded in the amendments.

## 6. Gate

- [x] Section 5 tests; golden re-blessed once; gates recorded.
- [x] Visual check by Claude: the final row, the contact notice, the Warden in the window, and the victory screen after it falls (2026-11-12; screenshots `C:\Users\djuar\AppData\Local\Temp\claude\86da55dbee83ee65\b0d62506-f1e2-4b2f-8539-6778ff35b15b\scratchpad\drive\warden`).
- [ ] Manual, the user: does the final battle feel like a climax that is hard but fair?

## 7. Amendments

- **F1 The final beacon's place and content.** It keeps the last exit's column, so the final depth is the last exit's, 17: the Warden has round(270 x 2.5) = 675 hull and 2 + 1 = 3 shield layers. It is not on the map, so its arrival pays no jump scrap and holds no event, shop or field (no loot draw); every other jump step is the usual one (1 fuel, the counters, the drive reset, the boarders' re-arm, Build Up). `atExit` is false there, and Navigation lists only the evade row: no exit row, no Wait for help even with no fuel (a wait is refused).
- **F2 No withdrawal.** An ordinary enemy leaves after `ENCOUNTER_MAX` (120 s). The Warden never does (its departure tick is `NEVER`; the engines-down pause does not apply), or a crew that cannot kill it in two minutes would be stranded with no drive and no enemy. Its Weapons hull row therefore drops the departure seconds: `Enemy 100% S? [###] W0%`.
- **F3 The kill.** Destroying the Warden counts as a won encounter like any kill (telemetry, +8 hull) but pays no scrap, fuel or weapon drop (no loot draws), and sets Victory in the same step; a hull or crew loss later that tick does not replace it (crewSystem's existing rule).
- **F4 The title.** The enemy window had no title row; `THE WARDEN` is drawn in gold, right-aligned on the status line. The status keeps its rules (`ENEMY`, `ENGINES DOWN`); the shield rings and the HUD threat line show the Warden's 3 layers (`Enemy ship: hull 100% shields 3/3`).
- **F5 The gates moved with the sim.** The run and jump gates failed as soon as the escape stopped winning, so their new expectations went into the first commit, not the third. Both now let the enemy arrive only at the final beacon and end when the Warden arrives: the jump gate's pinned end tick 64818 -> 65298 (480 ticks = `ENCOUNTER_START` later), six waits unchanged; the run gate's scrap, event, purchase and hull figures unchanged (the jump to the final beacon pays nothing). Other tests changed: `run.test.ts` (the last-sector victory test and the escape test now reach the final beacon, and the victory comes from the Warden's own fire; the exit row reads `Engage the Warden`), `notice.test.ts` (`Engage the Warden? (1/2)`), `bot.test.ts` (the captain bot engages the Warden: final beacon, not ended), `session.test.ts` (the two victory tests destroy the Warden after the jump).
- **F6 The scripted gunner** (`tests/gate-warden.test.ts`; seed 1, two Recruits, the gunner at Weapons level 2, no return fire, no boarders): it aims at the Warden's shields room with the Pulse Laser tuned to the current frequency (read from the state, as the combat gate does in place of the Science scan); a hit there damages the hull too, and two take the shields down. The Warden falls and the run is won with the starting loadout in **56 shots (41 hits, strips included), 653 s** after its arrival; with one loot weapon, a Heavy Laser in slot 1 fired only while no layer is up, in **47 shots (34 hits), 383 s**.
- **F7 Visual check.** Found, not changed: with an enemy's engines down the HUD threat line (`Enemy ship: hull 20% shields 3/3 engines DOWN`) runs past the threat panel's right edge. It is as long for an ordinary enemy (`2/2`), so it predates this feature.
