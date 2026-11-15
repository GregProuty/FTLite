# Ledger: helm-h1b-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Rapid Tab followed by X or E loses the seat command | fixed:R1 | 0 | runtime defers sit/stand queued after Tab until the Tab presence tick has run, then sends next tick (decision 12); tests Tab-then-X and Tab-then-E in separate frames before one tick |
| R1-F2 | P1 | Shared arrow spreading changes the H-1a flight view | fixed:R1 | 0 | spreadArrows is an opt-in model option set only by the duel boot (decision 18); test: flight input keeps H-1a arrow positions |
| R1-F3 | P1 | The repair acceptance test teleports to the target | fixed:R1 | 0 | runtime test stands with X, walks with scripted A through the one-tile doors into Engines, holds E; repair progress rises |
| R1-F4 | P2 | Restart retains the previous seed's star field | fixed:R1 | 0 | tacticalLayer.reseed(seed) redraws stars once; duel boot reseeds on epoch change; test: no new display objects |
