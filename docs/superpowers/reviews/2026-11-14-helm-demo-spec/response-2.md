# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `97cd5cb`. 5 new findings accepted, 0 rejected, 0 deferred. Codex confirmed R1-F3, R1-F5, R1-F8, R1-F9 and R1-F10 resolved. R1-F1, R1-F2, R1-F4, R1-F6 and R1-F7 were reopened; each pairs with one new finding and is fixed together with it.

## R2-F1 [P1]: Disconnect presence changes still lack a journaled transition (with R1-F2)

Confirmed. Detach only zeroes held input (`authority/core.ts:L195-L202`), and the journal records commands and lifecycle controls (`core.ts:L18`, `JournalControl` with `source: 'lifecycle'`). §8 now routes detach and attach through that existing lifecycle path as a lifecycle presence control. It is journaled in the tick's `controls` with its ordinal, applied at the next tick boundary, and applied before player commands in the seat phase. Replay reproduces it from the journal.

## R2-F2 [P1]: Hunter firing schedules releases before charge is ready (with R1-F6)

Confirmed. The old rule could release a partial charge, which §7a discards. §9 now holds Fire whenever the laser isn't frozen. It defines eligibility (arc, range, line of sight) and draws the jitter only on the first tick where a full charge and eligibility both hold. It cancels and redraws if either lapses before the release, and notes that a release resets the charge, so repeat shots wait a full charge. The 18-tick pursuit buffer is seeded with the crew ship's spawn position.

## R2-F3 [P1]: The missile collision matrix does not exempt its launching ship (with R1-F4)

Confirmed. "Anything solid" included the launching ship. The §4 matrix now separates missile against planet, asteroid or edge (destroyed); against the other ship (lands, then destroyed); against its own ship (ignored entirely for 60 ticks, then lands); and missile against missile (both destroyed, no damage). §7b gives the spawn point: centre + heading × 25 (ship radius 20, missile radius 4, 1 clear).

## R2-F4 [P1]: The replacement skid-stop gate lacks a feasible initial condition (with R1-F1)

Confirmed. An 80 u/s² assist cannot remove an 800 u/s skid in 1 s. §4's flight test now starts at 300 u/s forward and 60 u/s sideways, heading north, gravity and edge off, and requires sideways speed below 5 u/s within 60 ticks. A Node check with the stated drag and assist gives 0.00. The terminal-speed test now has a 30 s window, since the drag time constant is about 6.7 s; the check gives 789.2 u/s, within 5% of 800. §6's feel target is restated as a skid of up to 60 u/s stopping within 1 s.

## R2-F5 [P1]: Weapons repair requires no walk from the Weapons console (with R1-F7)

Confirmed. A seated character sits on the console tile (`stations.ts:L38-L39`), and `REACH` 1.5 is measured to the tile's square (`interact.ts:L28-L36`), so 8,7 is in reach from 8,6. §8 now accepts this explicitly: the gunner's own-room repair needs no walk by design, and standing up still empties the console for the whole repair. The table says "none", and walks are now defined as the path to the first in-reach position.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-14-helm-demo-design.md

<!-- end -->
