# Ledger: 2026-11-19-w4c-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 5 redeclares the online `lastGunSel` that W-4a already declares, so tsc fails | fixed:R1 | 0 | Decision 8 corrected (W-4a keeps online lastGunSel); Step 5.2 adds only flight/triggerLive; Step 5.3 replaces both W-4a lines |
| R1-F2 | P1 | Task 6's controls-list test finds the Helm's 'Hold left mouse' row first, so it can never pass | fixed:R1 | 0 | controls test filters the 'Hold left mouse' rows and matches the Weapons one; the Helm row stays first |
| R1-F3 | P1 | Task 7's `canonical-trace.ts golden` has no basic.json copy to compare, because no task records the canonical baseline before it | fixed:R1 | 0 | Task 1 records canonical-trace baseline; Task 7 runs canonical-trace same; lost-baseline fallback covers golden |
| R1-F4 | P1 | Task 5 anchors the Single player edits on W-4a's code, which W-4b changes; read literally, the edit drops W-4b's MAN gate on the held trigger | fixed:R1 | 0 | Task 5 quotes W-4b's text: merge keeps && gunModeBase(), pew click keeps && gunsManual, dead-trigger line kept |
| R1-F5 | P1 | Task 5's online test cases name a rig that has no session, and case 3 cannot pass as described | fixed:R1 | 0 | online flight case written in full in onlineDuelSession's rig, pew turret, republish after removeMissile |
| R1-F6 | P2 | Resolve the other placeholders: Task 4's right-drag pan, Task 5's Single player cases and Task 6's w4Ui case | fixed:R1 | 0 | pan case, Single player flight cases (in w4Runtime) and the w4Ui STEER LMB case written in full |
| R1-F7 | P2 | Task 2 misses the `torpTurn` uses in manualTorpedoFlight's 'keeps the mode it launched with' case | fixed:R1 | 0 | Task 2 covers 'keeps the mode' torpTurn literals and both file headers |
| R1-F8 | P2 | The 'git grep … no output' checks contradict the plan's own tests | fixed:R1 | 0 | greps limited to src; contracts.ts torpMode and HeldInput docs edited in Task 2 |
| R1-F9 | P3 | The import-cycle guard in Task 3 checks the wrong edge | fixed:R1 | 0 | MAN guard always inline missileOf(...)?.manual; cycle explained |
| R1-F10 | P3 | Decision 8 returns the selection when the torpedo is selected at the flight's end; the spec says 'selected at launch' | fixed:R1 | 0 | Decision 8 states the end-of-flight selection as a deviation with its reason |
