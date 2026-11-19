# Ledger: 2026-11-19-w4-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | 4/5/6 and 1/2/3 cannot share today's freqTo: the keyboard maps Digit3-5 to frequencies whatever the class | resolved | 0 | §9: freqKeyTo/gunFreqKeyTo/selectTo KeySample fields, freqTo buttons only, runtime picks by class; §14 test 3 queues no laserFrequency; confirmed R2 |
| R1-F2 | P1 | The beam's leaving breaks a large set of Hound-laser tests the spec doesn't name, and §13.4's premise about manualLaser* is false | resolved | 0 | §13.4 laser fit: manualLaser* ported, laser-class Weapons-seat path kept via cls; new §14.1 port/kind-a/helper/kind-b rules and per-file inventory in W-4a's plan; confirmed R2 |
| R1-F3 | P1 | W-4a's and W-4b's intermediate states are undefined: the gates, goldens and the pew's mode before AUTO exists | resolved | 0 | new §19.1: per-part same-version bless, per-seed gates pass at every part end, W-4a no-mode rules and stand-in gunner pew, W-4b/W-4c boundaries; confirmed R2 |
| R1-F4 | P1 | Online turret prediction (§11) can't be built as written and its test is vacuous | resolved | 0 | §11 prediction defined as thrMille analogue (k=unackedFrames, replica heading, latest turretAim, MAN traverse, k=0 gates); §14 online tests made concrete; confirmed R2 |
| R1-F5 | P2 | The gates read pewShots/gunShots that the telemetry and DuelRun don't carry | resolved | 0 | §2.1: DuelRun gains pewShots, gunShots, holdEndTick, holdCause from final state/events; duel-telemetry prints them; confirmed R2 |
| R1-F6 | P2 | Scripted gunner: the 'refused shipPower' case and the every-command-admitted test | resolved | 0 | §12 gunner pre-checks sparesOf/capacityOf/autocannon bars; §14 kind (a) kinds list update; confirmed R2 |
| R1-F7 | P2 | Planet-vs-rock ties: the spec's 'as today' is the reverse of the code | resolved | 0 | §5.1 and §14: ties as stepRounds has them (ship > rock > planet, rock wins exact planet tie); confirmed R2 |
| R1-F8 | P2 | Tuning ladder has no step sizes, bounds or stop rule | resolved | 0 | §12 ladder: values per rung, one pass at W-4b end, stop rule, fallback to base and report; confirmed R2 |
| R1-F9 | P3 | Valkyrn identity 'leave out by name' and hunter.ts's ShipInput literal need stating | resolved | 0 | §13.4 digest built from TACTICAL_MODULES skipping the three names; §8 hunter.ts L143 literal named; confirmed R2 |
| R2-F1 | P2 | Moving the digit keys off freqTo drops the gun fit's 3/4/5 NO LASER cue and breaks key-path tests that §14.1's grep misses | fixed:R2 | 0 | §9: gun fit NO LASER reads freqKeyTo ?? freqTo, valkyrnRuntime test holds freqKeyTo; §14.1 grep adds freqTo¦FREQ_CODES and ports scienceInput.test.ts |
