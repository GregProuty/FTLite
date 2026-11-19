# Ledger: engineering-spike-i-sim-plan-v2

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 10's fog-gate test sends `designate` from the Weapons seat, so the step answers invalid-seat, not unavailable | resolved | 0 | Task 10 test: crew 3, player 2 seated at Science sends designate; positive case at 600; confirmed R2 |
| R1-F2 | P2 | Task 12 Step 5 captures telemetry lines that a skipped aggregate gate never prints | resolved | 0 | Task 12 Step 5 uses scripts/duel-telemetry.ts; false sentence removed; confirmed R2 |
| R1-F3 | P2 | Task 12 Step 1 says the re-bless is 'at 54' and diagnoses a refusal as 'an artifact is not at 54' | resolved | 0 | Task 12 Interfaces/Step 1/refusal hint now 55; remaining 54s verified as baselines or line refs; confirmed R2 |
| R1-F4 | P2 | Two spec §8 sim tests are missing: the fire-cadence damage clamp and the magazine's 2700-tick regain | resolved | 0 | Task 8 same-tick fire-cadence clamp test; Task 9b 2699/2700 magazine regain test; self-review updated; confirmed R2 |
| R1-F5 | P3 | Two test notes leave fixes to the executor ('move both ships…', 'read its heat trace before weakening') | resolved | 0 | torpedo-levels setup cleared rocks + touchesSolid assert; Task 11 never weakened; confirmed R2 |
| R1-F6 | P3 | Decision 18 gates the crew's auto-launch on sight, which spec §10.4 doesn't list, without calling it a deviation | resolved | 0 | Decision 18 marks the auto-launch gate as a plan extension with reason; missileLaunch ungated; confirmed R2 |
