# Ledger: art-i-b-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The white flash stays on for good when the sim tick stops (duel loss by a hit, a pause, sector game over) | fixed:R1 | 0 | 5b3c1ff interiorFeel.draw(frame, dt, realDt): flashLeft = FLASH_TICKS/TICK_HZ drained by realDt; flash only while ticksSince < FLASH_TICKS && flashLeft > 0; test holds state.tick 10 frames -> hidden |
| R1-F2 | P3 | A pause freezes the shake offset (and any running hitstop) on screen | fixed:R1 | 0 | 5b3c1ff while paused (pdt 0, realDt > 0) shake offset {0,0} and drains on real time; PresentClock.drain ends a running hitstop on real time without advancing t; test |
| R1-F3 | P3 | Per-frame rebuilds and allocations in interiorFeel | deferred | 0 | per-frame allocations are a perf follow-up (cache stars, reuse sources and seen buffers); measured sizes are small; not needed before merge |
