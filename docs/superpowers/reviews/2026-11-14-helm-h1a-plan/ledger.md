# Ledger: helm-h1a-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The star field does not provide the required parallax | fixed:R1 | 0 | stars in own Graphics drawn once as 2x2 tile; per-frame position = starOffset(centre) - (w,h), STAR_PARALLAX 0.02 px per world unit at any zoom, wrapped; model + layer tests |
| R1-F2 | P2 | Dragging and wheeling in one frame loses cursor-anchored zoom | fixed:R1 | 0 | runtime frame pans before wheel zoom; test with drag+wheel in one frame ends free and anchored at cursor |
| R1-F3 | P2 | The browser-default test omits key release | fixed:R1 | 0 | input test dispatches keyup for Tab/Space/arrows/Backspace and asserts preventDefault, and not for other keys |
