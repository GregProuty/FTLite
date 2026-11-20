# Ledger: sensors-blip-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The ping clock keeps running while paused or frozen, so re-rolled pings around a still enemy close in on its position | fixed:R1 | 0 | spec 2.3: pings timed on TacticalState.tick, BLIP_PING_TICKS 120 |
| R1-F2 | P1 | `age` is undefined for a ping made partway through a period | fixed:R1 | 0 | spec 2.3, 2.4: madeAt stored, age formula |
| R1-F3 | P1 | An off-screen blip gives no direction on the map, and it is off-screen at the default zoom | fixed:R1 | 0 | spec 3: a blip edge arrow as its own ArrowTarget |
| R1-F4 | P2 | The on-screen test for the blip is not stated; the ghosts' rule would drop a visible large circle | fixed:R1 | 0 | spec 3: TacticalDraw.blip, ring-crosses-view test |
| R1-F5 | P2 | The readout's fog input: the behaviour when it is absent, and the other callers, are not stated | fixed:R1 | 0 | spec 3: optional fog on readoutRows, exact text, callers |
| R1-F6 | P2 | Existing fog tests that the change breaks are not listed | fixed:R1 | 0 | spec 2.4 optional blip; spec 4 lists the rewritten tests |
| R1-F7 | P2 | The hash is not defined | fixed:R1 | 0 | spec 2.3: the hash formula; spec 4 pins values |
| R1-F8 | P3 | The sit card's placement still reveals which half of the map an unseen enemy is in | fixed:R1 | 0 | spec 3: sit card uses the ping centre while unseen |
