# Ledger: helm-h1-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | The inactive solo character starts present | fixed:R1 | 0 | §4 solo start: player 1 away via presence false at tick 0 of every duel, replayable |
| R1-F2 | P1 | The tactical model has no current control axes | fixed:R1 | 0 | §7 model input gains current axes (Helm turn/thrust, gunner steer) recorded by the runtime each tick |
| R1-F3 | P1 | The flight view cannot park an inert second ship | fixed:R1 | 0 | §9 single-ship stepSoloFlight: flyShip on ship 0 + ship 0 static contacts (export hitStatics); ship 1 never stepped or drawn |
| R1-F4 | P1 | Restart does not define a new tick epoch or view reset | fixed:R1 | 0 | §4 commands use d.interior.tick; restart disposes/recreates driver and duel, resets cameras, trails, effects, prev positions, RenderMemory, interior view, input edges, sequences |
| R1-F5 | P1 | Focus can undo an Escape pause | fixed:R1 | 0 | §4 pause-reason set {user, blur, hidden, suspend}; focus clears only blur |
| R1-F6 | P1 | The interior cannot meet the stated construction-only allocation test | fixed:R1 | 0 | §10 allocation test after a 2-frame warm-up; interior view rebuilt on restart |
| R1-F7 | P1 | Missile-path prediction lacks a testable contract | fixed:R1 | 0 | §7 missile-path predictor contract: inputs, constant steering, horizon min(remaining life,240) stride 4, flyMissile rules, stops at planet/asteroid/edge/expiry, tick-for-tick test |
| R1-F8 | P1 | The Helm view omits required combat information | fixed:R1 | 0 | §7 lock marker on both consoles; readout shows crew and enemy hull (and enemy shields and rooms) |
| R1-F9 | P1 | The required planet-contact spark has no view rule | fixed:R1 | 0 | §7 render-side contact sparks from planetHits/asteroidHits/shipHits increases |
