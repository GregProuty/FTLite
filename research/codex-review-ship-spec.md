# Codex review: Demo-iii spec (2026-11-12)

1. **High — §5 map placement.** At `(240,170)` the panel spans `x=240..720, y=170..286`; it clears the enemy panel (`x=600..960, y=64..164`) and seated consoles starting at `y=286`, but its background covers the world beneath it. **Fix:** move it to an area that does not cover active ship tiles, or define a compact/transparent placement that preserves access to occupied rooms.

2. **High — §5 map placement / cutter.json rows 5–7.** Centering the `928×416` ship in `960×540` places its origin at `(16,62)`. The map covers ship tiles approximately `x=7..21, y=4..6`; it obscures Weapons, Crew Quarters, Medbay, and Door Control, among others. The Bridge at tile `(27,6)` is outside the overlay, so the navigator’s tile is not hidden. **Fix:** account for the centered world bounds and avoid overlaying occupied rooms.

3. **Medium — §4 world icon position.** “Room centre tile … snapped to the tile centre” is ambiguous for room dimensions with an even number of tiles: the mean can lie between tile centers. The one-tile-tall Bridge spans `x=27` at `y=5..7`, so its mean is `y=6`, which does snap cleanly. **Fix:** specify a deterministic rounding rule for between-tile means.

4. **Medium — §5 map drawing.** The panel is 116 px tall, but node Y positions depend on column node count and the spec does not bound that count or define clipping. With enough nodes, marks can spill beyond the panel; “EXIT under the last column’s node” may also collide with that column’s node marks. **Fix:** define a maximum node count or scaling/clipping behavior and reserve space for labels.

5. **Low — §5 map model.** “Edges … from `run.edgeMask`” does not say whether edges are included for every column or only existing nodes; later the test narrows this to columns `0..6`. **Fix:** explicitly define valid source columns and how absent/past nodes are handled.