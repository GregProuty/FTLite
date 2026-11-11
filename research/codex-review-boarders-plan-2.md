# Codex review: Boarders-i plan half 2 (2026-11-11)

1. **Medium — Task 2, Step 1, threat test:** Filtering to boarder rows discards placement evidence; no enemy or fire exists anyway. Fix: place an enemy and ignite a room, then assert the complete sequence: enemy → Bridge boarders → Crew Quarters boarders → fire.

2. **Medium — Task 2, Step 1, progress test:** StableIds increase with slot order, so selecting the first slot incorrectly still passes. Fix: swap the two G boarders’ StableIds, give them distinct health fractions, and assert progress follows the lower StableId, including after changing its health.

3. **Low — Task 2, Step 1, marker assertion:** Comparing `m.boarders` with `boarderMarkers(s)` checks delegation but cannot independently validate coordinates. Fix: assert explicit entries: slot 0 `(3.4, 9.5)`, slot 1 `(2.8, 2.5)`, slot 2 `(4.2, 9.5)`, with their StableIds and expected health fractions.

4. **Low — Task 2, Step 4, render verification:** The listed render/session tests never exercise `boarderLayer` or renderer wiring. Pixi **8.19.0** supports `poly(...).fill(...)`; constructing and destroying the proposed diamond also succeeds under Node. Fix: distinguish the existing suite from visual coverage and retain the spec’s pending manual gate; optionally add a Node layer test for positions, StableId reuse, and removal.