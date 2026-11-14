# Ledger: helm-h0b-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Start the hunter's missile cooldown only after a successful launch | fixed:R1 | 0 | hunterThink no longer sets lastLaunch; stepDuel sets it only when the enemy's missilesLaunched rose; new test: crew knocks enemy Weapons to 2 on the launch tick, no launch, cooldown unchanged |
| R1-F2 | P1 | Give pursuit steering a deterministic turn when the target is directly behind | fixed:R1 | 0 | new exported pursuitTurn: sideOf, but dead astern (cross 0, dot < 0) turns clockwise; used for ship pursuit and missile steering; test covers ship, missile and dead ahead |
| R1-F3 | P1 | Expire missiles at the end of their 480th flight tick | fixed:R1 | 0 | flyMissile no longer expires before moving; resolveMissiles ends any survivor with age >= 480 after contacts, before weapon clocks; tests: thrust on tick 360 not 361, expiry at end of tick 480 with event and missilesLost |
| R1-F4 | P2 | Test the resumed full-charge hold timer without a fresh press | fixed:R1 | 0 | new missiles test: full charge with hold 100 frozen by a launch for 50 ticks, resumes at 101 after the missile ends, vents at 180 with no press, no recharge |
