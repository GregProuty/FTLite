# Ledger: helm-h0b-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Start the hunter's missile cooldown only after a successful launch | resolved | 0 | hunterThink no longer sets lastLaunch; stepDuel sets it only when the enemy's missilesLaunched rose; new test: crew knocks enemy Weapons to 2 on the launch tick, no launch, cooldown unchanged; confirmed R2 |
| R1-F2 | P1 | Give pursuit steering a deterministic turn when the target is directly behind | resolved | 0 | new exported pursuitTurn: sideOf, but dead astern (cross 0, dot < 0) turns clockwise; used for ship pursuit and missile steering; test covers ship, missile and dead ahead; confirmed R2 |
| R1-F3 | P1 | Expire missiles at the end of their 480th flight tick | resolved | 1 | expiry test now starts a frozen full charge (hold 50) and a coasting missile (vx 60): hold stays 50 on tick 479, becomes 51 on tick 480; the expiry event x is ~1 unit past the tick-479 x, proving the 480th move; confirmed R3 |
| R1-F4 | P2 | Test the resumed full-charge hold timer without a fresh press | resolved | 0 | new missiles test: full charge with hold 100 frozen by a launch for 50 ticks, resumes at 101 after the missile ends, vents at 180 with no press, no recharge; confirmed R2 |
| R2-F1 | P2 | Complete the expiry regression assertions requested in R1-F3 | resolved | 0 | expiry test now starts a frozen full charge (hold 50) and a coasting missile (vx 60): hold stays 50 on tick 479, becomes 51 on tick 480; the expiry event x is ~1 unit past the tick-479 x, proving the 480th move; confirmed R3 |
