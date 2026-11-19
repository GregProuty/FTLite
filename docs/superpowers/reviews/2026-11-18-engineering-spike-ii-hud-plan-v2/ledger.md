# Ledger: engineering-spike-ii-hud-plan-v2

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 2's input.ts edits are quoted from before asteroids-ii and match nothing on master | fixed:R1 | 0 | Task 2 Step 4 re-quoted from master input.ts; rockTo kept |
| R1-F2 | P1 | Task 8's WeaponsStation rewrite drops asteroids-ii's rock targeting, and an existing test imports what it removes | fixed:R1 | 0 | Task 8 Step 10 rebuilt on master WeaponsStation (rock targeting kept); rockTargetUi in run |
| R1-F3 | P1 | Task 8's model edits also predate asteroids-ii: the WeaponsPanel quote doesn't match, and the laserSituation quote matches twice | fixed:R1 | 0 | WeaponsPanel tail re-quoted; both laserOffline sites quoted with context; clearRocks in test |
| R1-F4 | P1 | Task 7's pre-flight grep for THROTTLE_CAP_BY_BARS can't match Part i's declaration | fixed:R1 | 0 | exact THROTTLE_CAP_BY_BARS grep; all pre-flight greps checked |
| R1-F5 | P2 | The fog still gives away an unseen enemy: its exact range in text, the sit-down zoom, and map clicks or pings at its hidden spot | fixed:R1 | 0 | Task 9: pickShip/pickContact fog, sit-down zoom gated, laserSituation none when unseen; tests |
| R1-F6 | P2 | The refused LAUNCH reason now runs into FREE and past the Weapons block | fixed:R1 | 0 | refusals drawn from x0, FREE right-aligned; width test |
| R1-F7 | P3 | Out-of-date numbers in the plan text | fixed:R1 | 0 | 55, scene.ts:305, Decision 11 coordinates |
