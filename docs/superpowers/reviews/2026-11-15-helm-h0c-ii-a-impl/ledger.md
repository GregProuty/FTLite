# Ledger: helm-h0c-ii-a-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | Re-bless does not enforce the per-tick check | fixed:R1 | 0 | scripts/golden/blessGuard.ts: canonical-trace check writes a verified marker only on pass (clears it first); bless-golden refuses a version-bump bless without a marker matching SIM_VERSION; rebless-version always requires it; tests/blessGuard.test.ts |
| R1-F2 | P1 | The aggregate gate can mask a skipped seed test | fixed:R1 | 0 | aggregate gate asserts recorded seeds equal 1..10 and no longer recomputes |
| R1-F3 | P1 | Gate duels ignore rejected scripted commands | fixed:R1 | 0 | runDuel throws on any scripted command result not 'applied' (seed, tick, command, reason); all ten gate seeds pass, none rejected |
