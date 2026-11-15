# Ledger: helm-h1-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | The inactive solo character starts present | resolved | 0 | §4 solo start: player 1 away via presence false at tick 0 of every duel, replayable; confirmed R2 |
| R1-F2 | P1 | The tactical model has no current control axes | resolved | 0 | §7 model input gains current axes (Helm turn/thrust, gunner steer) recorded by the runtime each tick; confirmed R2 |
| R1-F3 | P1 | The flight view cannot park an inert second ship | resolved | 0 | §9 single-ship stepSoloFlight: flyShip on ship 0 + ship 0 static contacts (export hitStatics); ship 1 never stepped or drawn; confirmed R2 |
| R1-F4 | P1 | Restart does not define a new tick epoch or view reset | resolved | 0 | §4 commands use d.interior.tick; restart disposes/recreates driver and duel, resets cameras, trails, effects, prev positions, RenderMemory, interior view, input edges, sequences; confirmed R2 |
| R1-F5 | P1 | Focus can undo an Escape pause | resolved | 0 | §4 pause-reason set {user, blur, hidden, suspend}; focus clears only blur; confirmed R2 |
| R1-F6 | P1 | The interior cannot meet the stated construction-only allocation test | resolved | 0 | §10 allocation test after a 2-frame warm-up; interior view rebuilt on restart; confirmed R2 |
| R1-F7 | P1 | Missile-path prediction lacks a testable contract | resolved | 0 | §7 missile-path predictor contract: inputs, constant steering, horizon min(remaining life,240) stride 4, flyMissile rules, stops at planet/asteroid/edge/expiry, tick-for-tick test; confirmed R2 |
| R1-F8 | P1 | The Helm view omits required combat information | resolved | 0 | §7 lock marker on both consoles; readout shows crew and enemy hull (and enemy shields and rooms); confirmed R2 |
| R1-F9 | P1 | The required planet-contact spark has no view rule | resolved | 0 | §7 render-side contact sparks from planetHits/asteroidHits/shipHits increases; confirmed R2 |
| R2-F1 | P1 | Flight step contradicts the new-code boundary | resolved | 0 | §10 now names stepSoloFlight in sim/tactical/physics.ts and the exported static-contact pass as the guarded-root exception, under the determinism rules; confirmed R3 |
