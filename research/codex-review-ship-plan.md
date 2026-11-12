# Codex review: Demo-iii plan (2026-11-12)

1. **High — plan Task 1 / spec §6:** The plan calls for the A6 “Ship” test cases, but those cases aren’t in the requested spec sections. **Fix:** spell out the exact assertions in the plan or point to the section that defines them.

2. **Medium — `.system` reader:** The search finds one reader: `src/renderer/src/render/hudModel.ts:142`, which reads `t.system` to label **enemy** systems. Adding room systems `"doors"` or `"reactor"` does not break it; it uses enemy-target data, not room systems. **Fix:** clarify that this reader was checked and needs no change.

3. **Medium — spec §3 / bot gate:** `botIntent` looks up Navigation and Medbay through `stationOfKind`, not fixed room IDs or names, so those assumptions don’t break on the cutter. But the gate pins `jumpCharge = 0` every tick, preventing progression through the sector. **Fix:** describe it as a ship survival soak, and keep the separate 600-tick bot run as a smoke test; don’t present this gate as evidence of full-run survival.

4. **Medium — spec §3 / cutter realism:** The plan asks whether the layout reads as an FTL-style cruiser, but the gate only checks parsing, reachability, and survival. **Fix:** make the manual layout review explicit in the gate record; define the intended ship silhouette or checklist so reviewers can apply the criterion consistently.

5. **Low — plan Task 2 / `renderer.ts`:** The insertion point exists: `world.addChild(tiles.container, effects.below, crew.container, …)` and `draw()` updates tiles, effects, then crew. **Fix:** place the icon layer between `effects.below` and `crew.container`, and update its tint each frame as specified.

6. **Low — spec §4 / plan Task 2:** Tint behavior is underspecified when a system room is both failed and unpowered; the three tint cases don’t state precedence. Reactor is explicitly never tinted. **Fix:** state that failed takes precedence over unpowered (or define another precedence) and test that case.