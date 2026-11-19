# Ledger: 2026-11-18-playtest2feedback-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The continuous throttle is quantised to quarters, and any reverse becomes full reverse | resolved | 0 | §3: flyShip unquantised (thousandths), proportional reverse, crewThrust defined; 'flight unchanged' removed; confirmed R2 |
| R1-F2 | P1 | The spec never says which of §2-§5 apply to the Valkyrn, though it sits in the same crew slot | resolved | 0 | §1: newtonianHelm class flag; Valkyrn keeps flight, throttle command, notches, A/D, scriptedPilot; confirmed R2 |
| R1-F3 | P1 | 'Steering clears the held heading' reverses today's aim rule, and the change isn't limited to the crew ship | resolved | 0 | §4a: held aim still becomes held heading (today's rule), for all classes; Valkyrn test; confirmed R2 |
| R1-F4 | P1 | The code has no per-slot flight tuning, and the predictions would still fly the crew with drag | resolved | 0 | §2: flightFor(state,i) in stepDuel and predict defaults; callers listed; confirmed R2 |
| R1-F5 | P1 | The top speed cap's rule is not exact | resolved | 0 | §2: exact cap algorithm max(400,s0), gravity after, uncapped; test reworded; confirmed R2 |
| R1-F6 | P1 | The boosted turn's dead band leaves out auto-face, and the boost rule depends on itself | resolved | 0 | §4a: boost only when far (¦d¦>4 or outside sin 5°), decided pre-step by helmBoost; existing bands finish; defs assertion; confirmed R2 |
| R1-F7 | P1 | The authority's held-input lists and checkpoint schemas don't know the new fields | resolved | 0 | §7: three held schemas, expiry check and pause clear; lost-release bound; tests; confirmed R2 |
| R1-F8 | P1 | Removing the `throttle` command and A/D turning breaks consumers the spec doesn't list | resolved | 0 | §3/§4a/§6/§7: onlineSource, onlineDuel, scene, telemetry, input key actions, controlsList, turn buttons, turn refusal, situationModel, uiProbe; helmVent scratch for puffs; confirmed R2 |
| R1-F9 | P2 | The stand-in budget of 4 doesn't match Engineering's start of 3 Engines bars, and the merge note leaves the engine factor open | resolved | 1 | §5 losing bars: compressor = max(0, min(3, compressor - lost, HELM_BARS)), COMPRESSOR first; confirmed R3 |
| R1-F10 | P2 | Gas rules contradict each other, and the bounds and full-tank behaviour are unspecified | resolved | 0 | §4: gas >= cost, exact compressor accumulator, reset at full, runs unattended; §7 bounds; confirmed R2 |
| R1-F11 | P2 | Some acceptance tests can't be reached with the stand-in budget | resolved | 0 | §5 HELM_BARS a createDuel option; §8 test setups stated; confirmed R2 |
| R1-F12 | P2 | The scripted crew still turns with moveX, so 'the A/D branch never fires for the crew Helm' is false | resolved | 0 | §4a: sim ignores moveX turning for newtonianHelm; scripted crew moves to aim/face; confirmed R2 |
| R2-F1 | P1 | The unattended crew Helm's rule assumes a flight branch the Hound layout doesn't have | resolved | 0 | §3 unattended newtonianHelm sets crew.helm true and flies heading turn, boost, crewThrust; mirrored in stateAxes/sentAxes; §7 step order; §8 test; confirmed R3 |
| R2-F2 | P2 | HELM_BARS as a createDuel option, helmVent and helmPower aren't fitted to the module contract or the rematch | resolved | 0 | §5 createDuel opts {helmBars}, startRound passes it; §7 module contract: DUEL_NOT_SNAPSHOTTED, helmPower command, unavailable reason, duelModules test; confirmed R3 |
| R2-F3 | P3 | The auto-face boost band isn't wider than the boosted step, and the settle test names the wrong function | resolved | 0 | §4a BOOST_FACE_SIN sin 6°; §8 test names helmTurn; confirmed R3 |
| R3-F1 | P3 | §8 says tests set compressor through createDuel options, but the named opts object only carries helmBars, and a snapshot restore drops helmBars | fixed:R3 | 0 | §8 lead-in: helmBars via opts, compressor written after createDuel or via helmPower; §5 snapshot restore uses default |
