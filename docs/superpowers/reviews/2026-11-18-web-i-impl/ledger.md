# Ledger: web-i-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | An Electron build from master cannot host against the deployed signalling service, and nothing a candidate builder reads says so | fixed:R1 | 0 | docs/gates.md Web-i section: redeploy service before any Electron candidate from master (backward compatible); plan D-2 reworded. Not deployed (owner's login step) |
| R1-F2 | P2 | No check starts the module host Worker from a packaged (asar) build | fixed:R1 | 0 | packaged check: package:candidate + scripts/network/worker-boot-packaged.cjs PASS on Electron 37.10.3, module Worker boots from app.asar; recorded in plan |
| R1-F3 | P2 | The duel host's leave→idle assertion was dropped without a recorded deviation | fixed:R1 | 0 | plan deviation D-10 records host duel leave→idle gap, current cover and how to restore |
| R1-F4 | P3 | No test covers the clock-jump path's un-awaited suspend() then resume() on an active host | fixed:R1 | 0 | tests/onlineRecovery.test.ts un-awaited suspend+resume case: invalidateLease ['suspended','service-fenced'], dispose once, one join |
