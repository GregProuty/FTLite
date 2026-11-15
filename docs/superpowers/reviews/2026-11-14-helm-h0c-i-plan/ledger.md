# Ledger: helm-h0c-i-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Resolve the contradiction between envelope order and weapon execution order | fixed:R1 | 0 | stepDuelTick admits and applies weapon commands in a fixed order (lock, charge, launch; envelope order within a kind, last wins) matching applyWeaponsInput; decision 3 states the exception; new duel test covers launch/release and lock/release in both envelope orders (mutation reverting to envelope order is caught) |
| R1-F2 | P1 | Make the Missile key guard inspect a production-created missile | fixed:R1 | 0 | Missile key guard now inspects a missile created by launchMissile |
| R1-F3 | P2 | Dispose the interior when duel construction fails | fixed:R1 | 0 | createDuel validates the map before allocating the interior and disposes it (disposeSimState) if a later check throws; interface text updated |
