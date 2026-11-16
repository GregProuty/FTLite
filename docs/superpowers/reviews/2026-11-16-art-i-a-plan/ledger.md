# Ledger: art-i-a-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | The plan never states two of the spec deviations the planner reported: vent puffs stay rotated and the shake stays on whole internal pixels | fixed:R1 | 0 | Decision 18 states (f) shake and (g) vent quarter-turn rotation left for Art-i-b; bible pixel rule reworded to allow quarter turns |
| R1-F2 | P2 | The bible drops the spec's 'dark' from the value hierarchy to fit the light placeholder floor | fixed:R1 | 0 | bible keeps 'calm, dark mid-tones'; Decision 19 and bible note the lighter placeholder floor |
| R1-F3 | P2 | Step 0 skips the services/signalling node_modules junction and tells implementers the onlineAppRuntime failure is an environment flake | fixed:R1 | 0 | Step 0.1 adds the services/signalling node_modules junction and its removal; Step 0.3 and Task 7 expect 0 failed, no flake wording |
| R1-F4 | P3 | The tileLayer rebuild assertion compares the live children array with itself | fixed:R1 | 0 | tileLayer test copies children and records n before rebuild; frame check replaced by <= 32 |
| R1-F5 | P3 | No guard enforces 'pngjs and scripts/ never reach the renderer' | fixed:R1 | 0 | artGuards adds a pngjs/scripts import guard over render/ and app/; test counts updated (+190) |
