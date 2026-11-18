# Ledger: valkyrn-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | Mouse aim follows the cursor over the console blocks, so using a side tool turns the ship toward it | fixed:R1 | 0 | new app/duel/flightPointer.ts onFlightMap/flightPointer: steer only over open map (excludes tabs, side column, Helm, FLIGHT, shown CONTACT); scene.ts uses it after contact.sync; tests/flightPointer.test.ts |
| R1-F2 | P3 | Spec §6.1's 'NO LASER' refusal flash is not implemented and no plan records the deviation | fixed:R1 | 0 | RefusedControl 'laser' + NO_LASER; Digit1 and 3/4/5 on gun-fit Flight seat refuse('laser','NO LASER') in runtime.ts:407; FlightStation reason line; tests valkyrnRuntime, flightConsole |
| R1-F3 | P3 | A right-click while the torpedo is picked up both cancels the targeting and launches a torpedo | fixed:R1 | 0 | flightPointer launch = press && !aimed; scene tracks lastAimed across TargetingLine's cancel; spec §5.1 sentence; flightPointer test |
| R1-F4 | P3 | Gun hits give no struck-room flash or ROOM HIT/OFFLINE callout in the enemy window | fixed:R1 | 0 | gunHit gains event-only level flag (gun.ts); hitModel flashes struck room on any enemy gun room hit, callout GUN: <ROOM> HIT / OFFLINE only on level change; oracle and trace same at 53 |
