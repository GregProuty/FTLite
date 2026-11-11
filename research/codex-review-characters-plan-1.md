# Codex review: 3-ii plan (2026-11-10)

1. **P2 — [Plan line 311](C:/Users/djuar/FTLite/docs/superpowers/plans/2026-11-10-characters.md:311): impact assertion includes environmental damage.** Seed 1 makes this impact ignite room A. `crewSystem` then damages Lindqvist during the same tick, producing `DEBRIS_CREW_DAMAGE + FIRE_DAMAGE * TRAIT_FIRE_DAMAGE * DT` (20.075), so the assertion fails. **Fix:** call `debrisSystem(d)` directly to isolate impact damage, then assert exactly `DEBRIS_CREW_DAMAGE`.

2. **P2 — [Plan line 346](C:/Users/djuar/FTLite/docs/superpowers/plans/2026-11-10-characters.md:346): the low-oxygen fixture recovers before nine seconds.** Sealing doors leaves Life Support injection active. A read-only probe leaves Dubois Downed after 541 ticks, with roughly 5.98 seconds of bleed remaining and oxygen at 29.3%. **Fix:** disable Life Support in this fixture before running; retain the assertions around nine seconds.

3. **P2 — [Plan lines 103–108](C:/Users/djuar/FTLite/docs/superpowers/plans/2026-11-10-characters.md:103): serialization/hash tests can pass without serializing the assignment.** The round trip uses the default assignment, which the loader recreates anyway. Both hash comparisons also change head-start XP, so they cannot prove `crewCharacter` affects the hash. **Fix:** round-trip a nondefault assignment, and separately mutate only `crewCharacter` before checking that the hash changes.

4. **P2 — [Plan line 95](C:/Users/djuar/FTLite/docs/superpowers/plans/2026-11-10-characters.md:95): the required Dubois Weapons integration assertion has no step.** The XP matrix proves Weapons XP is initialized, but the spec explicitly requires `stationOutput` to use Dubois’s level 3 while seated at Weapons. **Fix:** seat pid 3 there and assert `(allocation / STATION_MAX[Weapons]) * skillCurve(3)`.

5. **P3 — [Plan line 268](C:/Users/djuar/FTLite/docs/superpowers/plans/2026-11-10-characters.md:268): the cooperative fixture substitutes Recruit for the required Lindqvist pairing.** **Fix:** use `DEFAULT_CHARACTERS` for the two-player state and retain the `m + 1` rate assertion; Lindqvist has Repair 0 and no repair trait.

Verification: static inspection and read-only execution probes; the planned suite was not executed.
