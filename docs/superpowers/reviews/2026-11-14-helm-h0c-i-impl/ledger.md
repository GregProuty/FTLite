# Ledger: helm-h0c-i-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Reject weapon commands when the gunner is the empty-seat sentinel | resolved | 0 | step.ts: weapon commands rejected not-at-weapons when gunner < 0 (the empty-seat value) as well as when the player differs; new duel test sends lock/charge/launch from player -1 with Weapons vacated by stand and by away: all rejected, no effect. Mutation removing the guard is caught; confirmed R2 |
| R1-F2 | P1 | Exercise populated missiles and events in the clone regression | resolved | 0 | new tacticalDeterminism test: both missile slots launched and laser + missileEnd events pushed before cloneTactical; asserts equal contents, distinct references, and that mutating/pushing on the copy leaves the originals unchanged. Shallow-missile and shared-events mutations are caught; confirmed R2 |
