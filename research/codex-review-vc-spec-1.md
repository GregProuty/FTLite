# Codex review: Demo-ii spec sections 3-4 (2026-11-12)

1. **High — spec §3, line 19:** The pool read order matches `repairStation`: it clears `failed` before reading `powerPool`, and non-Engineering failures have already returned their bar. The one-bar return is capacity-safe when `powerPool >= 1`; Engineering keeps its frozen level. No defect found.

2. **High — spec §4, line 27:** The shown `buildHudModel` return does not include an `enemy` property, so the proposed `HudModel.enemy` block is not wired into the model described by these lines. Add it to the returned model, including the absent-state `null` case.

3. **Medium — spec §4, line 27:** The target-row model already exposes some enemy values—hull, shield layers, weapon charge, and flee time—but its `enemy` target is a separate shape and does not supply the full proposed panel block. Define how the new block is populated from the state/model. `lastHitTick` ownership and update paths cannot be assessed from the permitted files.

4. **Medium — spec §4, line 29:** The outer ring reaches y=88 in a 100px panel, overlapping the weapon bar at y=82–88; it may also crowd the hull bar at y=90. Move the bars or reduce the ring radii.

5. **Low — spec §4, line 29:** “120 × 100” and placement at `(INTERNAL_W - 232 - 8 - 120, 4)` leave an 8px gap before the threat panel at `INTERNAL_W - 232`, but the spec does not define whether the threat panel’s position is its left edge or another anchor. State the anchor explicitly.