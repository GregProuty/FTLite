# Ledger: sensors-blip-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The ping clock keeps running while paused or frozen, so re-rolled pings around a still enemy close in on its position | resolved | 0 | spec 2.3: pings timed on TacticalState.tick, BLIP_PING_TICKS 120; confirmed R2 |
| R1-F2 | P1 | `age` is undefined for a ping made partway through a period | resolved | 0 | spec 2.3, 2.4: madeAt stored, age formula; confirmed R2 |
| R1-F3 | P1 | An off-screen blip gives no direction on the map, and it is off-screen at the default zoom | resolved | 0 | spec 3: a blip edge arrow as its own ArrowTarget; confirmed R2 |
| R1-F4 | P2 | The on-screen test for the blip is not stated; the ghosts' rule would drop a visible large circle | resolved | 0 | spec 3: TacticalDraw.blip, ring-crosses-view test; confirmed R2 |
| R1-F5 | P2 | The readout's fog input: the behaviour when it is absent, and the other callers, are not stated | resolved | 0 | spec 3: optional fog on readoutRows, exact text, callers; confirmed R2 |
| R1-F6 | P2 | Existing fog tests that the change breaks are not listed | resolved | 0 | spec 2.4 optional blip; spec 4 lists the rewritten tests; confirmed R2 |
| R1-F7 | P2 | The hash is not defined | resolved | 0 | spec 2.3: the hash formula; spec 4 pins values; confirmed R2 |
| R1-F8 | P3 | The sit card's placement still reveals which half of the map an unseen enemy is in | resolved | 0 | spec 3: sit card uses the ping centre while unseen; confirmed R2 |
| R2-F1 | P2 | The 'blip' edge arrow's label and distance do not fit the existing arrow() helper as the spec says they do | fixed:R2 | 0 | spec 3: ARROW_NAMES blip, rounded distance and label for the blip arrow, its own arrowGlyph case, one off-screen test |
