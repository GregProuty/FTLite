# Ledger: helm-h2a-i-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | An out-of-range round index makes validateDuelCheckpoint loop without bound (roundSeed has no cap) | fixed:R1 | 0 | MAX_DUEL_ROUNDS=1024 in snapshot.ts (seeds.ts imports snapshot.ts); validator rejects round > MAX and 2*round > baseTick; roundSeed throws above MAX; four new negative/boundary cases |
| R1-F2 | P2 | Later SIM bumps re-bless duel-rematch.json on proofs that never run a rematch | deferred | 0 | Next SIM bump must add a rematch run to the duel oracle before re-blessing duel-rematch.json; recorded in memory for that bump (no bump is planned in H-2a after 39). |
| R1-F3 | P3 | The restore-equality test passes vacuously if the rematch does not start a round | fixed:R1 | 0 | Test asserts the rematch applied, d.round === 1, and 600 iterations; Task 3 Step 1 expects FAIL, 10 tests |
| R1-F4 | P3 | No test validates a paused checkpoint on a decided round, or a bad decidedTick on a decided snapshot | fixed:R1 | 0 | Re-host test pauses on round 2's decided end card, validates through bytes, restores; decided-snapshot cases decidedTick -1, base-1 (base raised to 1), tick+1 in their own block after created.mockRestore() |
| R1-F5 | P3 | restoreDuelSnapshot keeps the target's per-tick events, so it is not exactly a fresh load | fixed:R1 | 0 | restoreDuelSnapshot clears d.events and d.tactical.events after writeBack; restore test asserts both [] |
| R1-F6 | P3 | The round-start equivalence test uses a highly composite offset (T = 252) | fixed:R1 | 0 | 255 end-card steps, T = 257 (prime), with a comment |
