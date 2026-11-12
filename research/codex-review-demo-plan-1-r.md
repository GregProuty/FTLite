# Codex review: Demo-i plan Task 1 code, retry (2026-11-12)

1. **High — `weapons.ts`, beam branch:** Enemy beams against live shields still call `beamAbsorbed` and skip the combat RNG draw, contrary to the plan’s one combat draw per enemy beam. **Fix:** remove the absorption check and always roll once; apply the tuned/untuned shield rules after the roll.

2. **High — `weapons.ts`, beam bookkeeping:** The requested restructuring is absent: every successful beam shot should stamp, increment `shots`, and award XP exactly once, including misses and untuned hits; hits should increment once per hit. **Fix:** perform shot bookkeeping once after resolving the beam result, then count and apply a hit once.

3. **High — `debris.ts`, `spawnObject` / `spawnShot`:** Shots still choose a uniformly random room and consume only the existing three hazards draws. **Fix:** add the aimed branch: draw aim chance, choose among de-duplicated rooms of online stations in station-index order when aimed, otherwise choose any room; then draw flight and frequency. Have only `spawnShot` set `aimed`.

4. **High — `debris.ts`, `resolveImpact`:** Shot impacts never attempt to fail online stations in the impact room. **Fix:** after incrementing impacts, iterate stations by index; for each online station in that room, draw once and call `failStation` when the draw is below `ENEMY_SHOT_SYSTEM_CHANCE`.

5. **Low — `power.ts` import-cycle check:** `power.ts` does not import `debris.ts`, so importing `failStation` into `debris.ts` does not create a direct cycle. `spawnObject` should obtain a station room as `roomOfTile(state.derived.stationTile[i]!)`, de-duplicating room IDs while preserving station-index order.