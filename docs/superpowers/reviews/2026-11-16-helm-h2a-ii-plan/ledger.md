# Ledger: helm-h2a-ii-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The ten-seed producer sends held input only when it changes, so the 250 ms receive-time watchdog zeroes the scripted Helm and repairs | resolved | 0 | Producer sends held input every publication (gate removed); Decision 8 amended; no-watchdog-frame assertion per seed; summed crew laserReleases > 0 test after the seeds; confirmed R2 |
| R1-F2 | P2 | The content digest no longer covers the client protocol code that moves out of clientRun.ts | resolved | 0 | Task 1 Step 4b adds streamClient.ts and duelClient.ts to build/contentDigest.ts and the contentDigest.test.ts fixture; in the commit and test run; confirmed R2 |
| R1-F3 | P2 | The ten-seed rig bypasses the duel mode host from authorityModes, and the deviation is not stated | resolved | 0 | Decision 10 states the hand-composed rig and why; rig comment corrected; confirmed R2 |
| R1-F4 | P2 | The round-record check matches five fields, not the authority's summary | resolved | 0 | Both clients' round records toEqual duelRoundRecord(session summary, 0, seed, 0); confirmed R2 |
| R1-F5 | P3 | ReplicaAdapter's signatures differ from spec §4 without a stated deviation | resolved | 0 | Decision 9 records the ReplicaAdapter signature deviation and the supported option; confirmed R2 |
| R2-F1 | P2 | The no-watchdog assertion sees only the journal since the last 300-tick baseline, not the whole round | fixed:R2 | 0 | Watchdog frames counted every 250 ticks inside the loop plus the final window; Decision 8 reworded |
