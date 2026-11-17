# Ledger: helm-h2a-i-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | On the next SIM_VERSION bump the rematch golden is re-blessed with no proof that covers a rematch | resolved | 0 | rematch-1 oracle run (round 2 recorded per tick from the rematch step; round 1 = scripted-1); rematchGoldenRefusal ties the baseline to duel-rematch.json; bless-golden comment corrected (160bf93); confirmed R2 |
| R1-F2 | P3 | runRematch does not check that the scripted commands were applied, unlike runDuel | resolved | 0 | requireApplied helper shared by runDuel and runRematch's play() (160bf93); confirmed R2 |
| R2-F1 | P3 | No suite test ties recordRun's rematch run to runRematch or to the stored duel-rematch.json | deferred | 0 | P3: the tie is enforced by rematchGoldenRefusal on every bump; a suite test calling recordRun on the rematch spec can join H-2a-ii's gates |
