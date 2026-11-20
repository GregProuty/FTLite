# Ledger: sensors-blip-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P3 | Task 1's anchor pre-check covers 8 of the plan's ~27 quoted anchors, though the constraints say it checks every one | fixed:R1 | 0 | plan L34 now says Task 1 spot-checks one+ anchor per source file (eight greps); the rest were confirmed once on master in review; a missing Edit anchor fails loudly |
| R1-F2 | P3 | The scene's sit-card wiring is checked only by grep, not by behaviour | deferred | 0 | sitCardBelow is unit-tested; the scene call's two args have distinct types (swap fails tsc) and fogView is the only fog in scope; a seated-crew scene test adds unverified runtime assumptions |
