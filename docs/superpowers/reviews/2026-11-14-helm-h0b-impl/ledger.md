# Ledger: helm-h0b-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Make the laser occlusion test reach the line-of-sight check | fixed:R1 | 0 | new weapons test: ships 400 apart in arc and range with the planet, then asteroid 0, between; real release misses (shots 1, hits 0, shields and hull unchanged, miss event); asserts LOS false, inArc true, distance <= range. Mutation 'drop lineOfSight' now fails |
| R1-F2 | P1 | Test shield-clock preservation with nonzero progress | fixed:R1 | 0 | new weapons test: clock to 450, Shields level 2 holds exactly 450 every tick for 600 ticks, repair to level 1 resumes at 2/tick: shields 1 clock 898 after 224 ticks, layer at 225. Mutation 'reset clock at level 2' now fails |
| R1-F3 | P1 | Exercise the hunter's temporal and RNG invariants | fixed:R1 | 0 | three new hunter tests: moving crew flips the lead turn (-1 / +1); missile steer follows the crew position from exactly 18 calls before over 72 calls (4 wraps); jitter draws exactly one nextInt (rng compared to a reference stream), none while waiting, none on cancel, one on reschedule, then releases on fireAt. Mutations no-lead, newest-slot, extra draw, draw-while-waiting all fail |
