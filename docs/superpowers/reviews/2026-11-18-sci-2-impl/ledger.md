# Ledger: sci-2-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P2 | The real-app duel smoke (npm run test:duel-app-runtime) still expects a two-seat room, and the menu now defaults to a crew of 3 | fixed:R1 | 0 | duel-app-smoke and internet-app-smoke click crew-2 before create-room; observer codec at DUEL_CREW_MAX; test:duel-app-runtime PASS |
