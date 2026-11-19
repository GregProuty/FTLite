# Ledger: 2026-11-18-playtest2feedback-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The continuous throttle is quantised to quarters, and any reverse becomes full reverse | fixed:R1 | 0 | §3: flyShip unquantised (thousandths), proportional reverse, crewThrust defined; 'flight unchanged' removed |
| R1-F2 | P1 | The spec never says which of §2-§5 apply to the Valkyrn, though it sits in the same crew slot | fixed:R1 | 0 | §1: newtonianHelm class flag; Valkyrn keeps flight, throttle command, notches, A/D, scriptedPilot |
| R1-F3 | P1 | 'Steering clears the held heading' reverses today's aim rule, and the change isn't limited to the crew ship | fixed:R1 | 0 | §4a: held aim still becomes held heading (today's rule), for all classes; Valkyrn test |
| R1-F4 | P1 | The code has no per-slot flight tuning, and the predictions would still fly the crew with drag | fixed:R1 | 0 | §2: flightFor(state,i) in stepDuel and predict defaults; callers listed |
| R1-F5 | P1 | The top speed cap's rule is not exact | fixed:R1 | 0 | §2: exact cap algorithm max(400,s0), gravity after, uncapped; test reworded |
| R1-F6 | P1 | The boosted turn's dead band leaves out auto-face, and the boost rule depends on itself | fixed:R1 | 0 | §4a: boost only when far (¦d¦>4 or outside sin 5°), decided pre-step by helmBoost; existing bands finish; defs assertion |
| R1-F7 | P1 | The authority's held-input lists and checkpoint schemas don't know the new fields | fixed:R1 | 0 | §7: three held schemas, expiry check and pause clear; lost-release bound; tests |
| R1-F8 | P1 | Removing the `throttle` command and A/D turning breaks consumers the spec doesn't list | fixed:R1 | 0 | §3/§4a/§6/§7: onlineSource, onlineDuel, scene, telemetry, input key actions, controlsList, turn buttons, turn refusal, situationModel, uiProbe; helmVent scratch for puffs |
| R1-F9 | P2 | The stand-in budget of 4 doesn't match Engineering's start of 3 Engines bars, and the merge note leaves the engine factor open | fixed:R1 | 0 | §5 merge note (a) owner call with recommendation, (b) factor reads Engines bars, (c) SIM_VERSION; losing-bars rule exact |
| R1-F10 | P2 | Gas rules contradict each other, and the bounds and full-tank behaviour are unspecified | fixed:R1 | 0 | §4: gas >= cost, exact compressor accumulator, reset at full, runs unattended; §7 bounds |
| R1-F11 | P2 | Some acceptance tests can't be reached with the stand-in budget | fixed:R1 | 0 | §5 HELM_BARS a createDuel option; §8 test setups stated |
| R1-F12 | P2 | The scripted crew still turns with moveX, so 'the A/D branch never fires for the crew Helm' is false | fixed:R1 | 0 | §4a: sim ignores moveX turning for newtonianHelm; scripted crew moves to aim/face |
