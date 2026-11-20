# Ledger: helm-round2-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | throttleCut's seat refusal 'not-at-helm' is not a reason the codebase has | resolved | 0 | spec 2.3: invalid-seat, module reasons unchanged; confirmed R2 |
| R1-F2 | P1 | The latch's clear rule and the cut's place in the tick are ambiguous; one reading jams the scripted Helm's throttle | resolved | 0 | spec 2.3: the cut's loop after heading; crewHelm order clear, ramp, clamp; the cut's tick counts; confirmed R2 |
| R1-F3 | P1 | The scripted Helm stands up with its throttle set, and it cannot cut on the tick it stands | resolved | 0 | spec 5: the scripted Helm cuts and stays seated before it stands; spec 6.1 THRUST readout; test added; confirmed R2 |
| R1-F4 | P2 | Placing the new command and fields is incomplete: the helm module's command list, isConsoleCommand, field order | resolved | 0 | spec 8: HELM order, snapshot offsets, helm commands list, isConsoleCommand; confirmed R2 |
| R1-F5 | P2 | The app's throttle predictions ignore the latch | resolved | 0 | spec 7: both predictions honour the latch; refused cut clears cutSent; confirmed R2 |
| R1-F6 | P2 | The tap needs a clock and a settings path that input.ts does not have; the down-time record's lifetime is unstated | resolved | 0 | spec 2.3: now and tapMs options, down times and their lifetime, throttleDown edge; confirmed R2 |
| R1-F7 | P2 | Several readers of Space and the right button at the crew Helm are unlisted, and the goal-glow rule drops A/D | resolved | 0 | spec 4: each code site listed for the crew Helm seat; goal glow rule keeps A/D; confirmed R2 |
| R1-F8 | P2 | The NO GAS refusal has no control type, no hint line, and no press edge for the up and down arrow thrusters | resolved | 0 | spec 3.3: RefusedControl gas, the press edge from rcsX or rcsY; confirmed R2 |
| R1-F9 | P2 | Unlisted readers of the removed boost constants and of FlightTuning | resolved | 0 | spec 3.2 names the defs.ts guard; spec 3.1 optional flag, the cap branch stays, crewFlight pins rewritten; confirmed R2 |
| R1-F10 | P2 | The crew console's layout changes cannot be built from the spec as written | resolved | 0 | spec 6.1: REV at -500, THR readout, GAS bar position; confirmed R2 |
| R1-F11 | P3 | The gas rules are written in key terms the sim cannot see; gasIdle's start value and the refill tick are unstated | resolved | 0 | spec 3.3 rewritten in axis terms with a tick order and gasIdle 30 at start; confirmed R2 |
| R1-F12 | P3 | Two stated numbers hold only at the defaults | resolved | 0 | spec 2.3 and 3.2 wording; confirmed R2 |
| R2-F1 | P3 | The power module's snapshot offset moves with the three new helm values, and the spec does not say so | fixed:R2 | 0 | spec 8: powerAt becomes helmAt + 6 |
| R2-F2 | P3 | NO GAS replaces the first hint line, but the new hint layout moves Q/E GAS to the second | fixed:R2 | 0 | spec 3.3 and 6.1: NO GAS on the second hint line; each line's control set stated |
| R2-F3 | P3 | The predicted latch's 'until throttleHeld has been 0 on a sample' has no start point | fixed:R2 | 0 | spec 7: the start point of the predicted latch's release |
