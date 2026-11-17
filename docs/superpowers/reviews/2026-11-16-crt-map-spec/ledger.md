# Ledger: crt-map-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | React has no view value, so crtActive(view) cannot decide the look of the shared overlay components | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F2 | P1 | The readout encodes meaning only in hue, and the spec gives no way to carry it once the colours go amber | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F3 | P1 | The own-ship damage look contradicts itself and the hatch is undefined | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F4 | P1 | Missiles, their trails and the two laser arcs lose friend vs foe | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F5 | P1 | The 16 px bezel covers the readout and the edge labels, and its frame and units are undefined | fixed:R2 | 1 | bezel 3 internal px; containment test covers React rects and Pixi labels (grid, rows, ring, arrows, info, lock) |
| R1-F6 | P2 | The colour mapping misses several constants, and the 'only ramp colours' test has no stated method | fixed:R2 | 1 | text and compass roles: labels mid, compass dim, arrow labels main, info main/hot in arc, lock label inverse bar |
| R1-F7 | P2 | The screen overlay's z-order is ambiguous and would cover the end card or the menu | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F8 | P2 | A CSS glow via text-shadow does nothing on PixelText, which is a canvas | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F9 | P2 | The performance check uses a counter that does not measure frame rate | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F10 | P2 | Where the CRT setting lives, and how F10 reaches both Pixi and React, is unstated | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F11 | P2 | The blink clock, and blinking at 'off' and while paused, are unspecified | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R1-F12 | P3 | 'The selected target' does not exist, and the enemy's blinking bracket would look like the lock bracket | resolved | 0 | spec rewritten; see response-1; confirmed R2 |
| R2-F1 | P2 | Dashed, dotted and hatched lines have no Pixi primitive, and the spec gives no geometry for them | fixed:R2 | 0 | dashModel.ts dashLine/dashCircle/hatchSegments, screen-px lengths, convex clip, reused arrays, tested |
| R2-F2 | P2 | Readout emphasis targets rows that never appear in console views, and makes the positive cues dimmer than plain values | fixed:R2 | 0 | alert only own low hull under CRT; interior-only rows keep tints; good -> hot incl. enemy low hull |
| R2-F3 | P2 | 'Blinking' enemy missile and ring are undefined: if blink means on/off, the incoming missile vanishes half the time | fixed:R2 | 0 | every blink alternates two visible states; square wave floor(t*2*hz)%2; per-element pairs defined |
