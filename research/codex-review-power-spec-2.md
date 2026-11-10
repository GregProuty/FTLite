**(A) Prior findings**

1. Resolved — layout identity includes station kinds and allocations.
2. Resolved — sitting requires online status; removing the last bar forces standing.
3. Resolved — failure forces standing immediately, including inside the spawner.
4. Resolved — seating consumes Confirm; seated stand actions have explicit precedence.
5. Resolved — Engineering’s cursor stores kinds and converts through `stationOfKind`.
6. Resolved — local and remote door commands share tick-wide deduplication.
7. Resolved — allocations require integers, with a fractional rejection fixture.
8. Resolved — doorless ships have explicit cursor, command and panel behaviour.
9. Resolved — controlled state comparisons replace whole-hash equality; stick state resets.

**(B) New findings**

1. Medium — **§4: Snapping to consoles can bypass walls and sealed doors.** Sitting checks distance and then teleports the player to the console centre, while the existing reach calculation checks distance without collision or visibility. A valid layout can place a console within `REACH` across a wall, allowing Confirm to cross a barrier that walking cannot cross. Define collision-safe admission or a collision-safe snap path, and add a blocked-console fixture. [Sitting rules](C:/Users/djuar/FTLite/docs/superpowers/specs/2026-11-10-power-and-consoles-design.md:71), [distance-only reach](C:/Users/djuar/FTLite/src/renderer/src/sim/interact.ts:19), [movement collision](C:/Users/djuar/FTLite/src/renderer/src/sim/movement.ts:32).

2. Medium — **§10: Power failures lack the required threat-list and repair-progress integration.** The HUD additions specify a repair prompt and failed-station visuals, but omit failure entries in the active-threat list and binding power repair progress to the player’s progress bar. Both are required by the parent, and the current HUD explicitly handles only fire and breach threats and their repair progress. Add these model, rendering and test changes to the implementation scope. [HUD additions](C:/Users/djuar/FTLite/docs/superpowers/specs/2026-11-10-power-and-consoles-design.md:138), [parent HUD requirements](C:/Users/djuar/FTLite/docs/superpowers/specs/2026-11-09-foundation-design.md:237), [existing repair progress](C:/Users/djuar/FTLite/src/renderer/src/render/hudModel.ts:48), [existing threat list](C:/Users/djuar/FTLite/src/renderer/src/render/hudModel.ts:65).
