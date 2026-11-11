# Codex review: Run-ii spec half 2 (2026-11-11)

1. **High — §11, line 96:** “After `resolveEvent` the destinations are listed and the jump works” skips the required cursor re-clamp and input path. A direct resolver call cannot prove navigation exits the event list or that Confirm jumps. Specify a concrete pending-event setup, then resolve through `navigationInput`, assert the new rows and cursor, and Confirm the selected destination.

2. **High — §11, line 96:** The `105 + 40 - 30` gate arithmetic only holds if the seven jumps include the Event and Shop arrivals: `7 × 15 + 40 - 30 = 115` scrap. The hull damage timing and event/shop node positions are unspecified, so the scripted navigator might not have enough scrap or hull to buy the repair. Specify the exact forced map/path, apply 10 damage before the shop purchase, and assert 115 earned/spent reconciliation and victory.

3. **High — §11, line 96:** The “jump gate’s map is forced all-Hazard through a helper” requirement is necessary to preserve Run-i’s identical gate figures: new Event arrivals consume `rng.loot`, which can change later simulation behavior. Name the helper and require asserting the same figures as Run-i.

4. **Medium — §9, line 84; `hud.ts:163–166`; `hud.test.ts:340–352`:** The spec’s footer example omits the existing dynamic evade and jump text. Run-i asserts `Evade 35%   Jump 64%` and `Evade 35%   Jump READY`; appending scrap should produce `Evade 35%   Jump 64%   Scrap 45` and, when ready, `Evade 35%   Jump READY   Scrap 45`. State both exact expected strings.

5. **Medium — §9, line 85:** “Threats (first rows, before the enemy)” is ambiguous against current HUD ordering: enemy is currently first (`hud.test.ts:239`), and boarders are ordered after it (`hud.test.ts:327`). Specify the exact order of event/shop rows relative to enemy, boarders, and other threats.

6. **Medium — §11, line 96:** The 1–50 node-type test does not name the Run-i replay oracle, the all-Hazard fixture, or how the final map-stream state is captured. “A fixture with the shop fallback (every draw a Hazard)” is under-specified and could pass without proving the fallback. Specify the existing Run-i replay setup and an explicit map-stream stub/fixture that yields Hazard for every type draw.

7. **Medium — §11, line 97:** “Each item’s buy, cost, cap and disabled state” does not name the relevant fixtures or expected values. In particular, shop rows shift the destinations and cursor, while the spec separately requires an eight-item window plus destinations in seven rows. Specify the fixture map, cursor cases, and visible row assertions (including which rows are in the window at each cursor position).

8. **Medium — §11, line 97:** Requiring tests for the `(owned)` label is not enough to ensure the label is rendered: `itemEnabled` is false after purchase, and the spec says disabled rows show status `-`. Explicitly assert the owned label is visible after buying and that the row remains non-purchasable.

9. **Medium — §11, line 96:** The pending-event jump-block test does not specify that the event is pending, the drive is ready, the selected row is a choice, or the jump counter/column must remain unchanged. A test could pass vacuously with no ready drive or no Confirm edge. Name those preconditions and assert no jump occurs.

10. **Medium — §11, line 97:** Cursor re-clamping is tested only as “list shrinks” and “stays on an item after a buy.” It omits the specified re-clamp when the cursor is on a `none` row or past the end, the post-resolution list change, and wrap across selectable rows while skipping `none`/disabled rows. Enumerate those cases and assert cursor indices.

11. **Medium — §11, line 96:** The Hazard arrival test says loot “moves by nothing,” but does not define the fixture map or compare later loot-driven behavior. Explicitly force a Hazard destination and assert both the loot stream state is unchanged and a subsequent loot draw matches the pre-arrival sequence.

12. **Low — §12, line 103; `docs/gates.md:149–162`:** The acceptance gate says “`15 x jumps / 0`” even though the required output is the `earned/spent` scrap column and bots never jump. This conflicts with its next clause (“the bot never jumps, so `0/0`”). State the expected `scrap` column as `0/0` on all three rows, with `nodes` still `0/8`.