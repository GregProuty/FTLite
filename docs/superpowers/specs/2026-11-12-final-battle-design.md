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

- [ ] Section 5 tests; golden re-blessed once; gates recorded.
- [ ] Visual check by Claude: the final row, the contact notice, the Warden in the window, and the victory screen after it falls.
- [ ] Manual, the user: does the final battle feel like a climax that is hard but fair?

## 7. Amendments

(Filled during implementation.)
