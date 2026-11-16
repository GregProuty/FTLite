# Ledger: engine-r1b-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | Task 1 changes the duel golden’s canonical values | fixed:R1 | 0 | baseline is post-R-0 flattenDuel (hash-completeness 2a57a48 already flattens the full interior); stated in Decisions and Task 1; Step 0 requires R-0's full-interior duel golden test |
| R1-F2 | P1 | Snapshot validation misses tactical writer constraints | fixed:R1 | 0 | validateTacticalValues checks every tactical field's bounds and slot invariants plus presence/repair before allocation; tests: 19 rehashed invalid values rejected, all states reached by seeds 1/4/7 accepted |
| R1-F3 | P1 | The utility test bypasses the registered utility | fixed:R1 | 0 | src/utility/authorityModes.ts is the registry authorityHost.ts builds from; the test drives createUtilityHost with a duel initialize/start/capture/restore round trip, checks the entry point passes that registry, and runs a sector utility; test:host-runtime passed |
| R1-F4 | P1 | The continuation proof does not establish its checkpoint conditions | fixed:R1 | 0 | split at tick 5,156, the first tick from 5,000 with a missile in flight, a damaged crew room and a repair in progress; all three asserted |
| R1-F5 | P1 | The module migration leaves tactical cloning manual | fixed:R1 | 0 | cloneTactical is a one-line wrapper over cloneTacticalFromModule, derived from the space module fields; a check mutates every clone field and confirms the original is untouched |
