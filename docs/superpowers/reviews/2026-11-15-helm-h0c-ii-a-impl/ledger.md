# Ledger: helm-h0c-ii-a-impl

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | Re-bless does not enforce the per-tick check | resolved | 1 | marker removed; scripts/golden/versionOnly.ts verifyVersionOnly() re-traces every tick against the pre-bump baseline immediately before any version-bump bless or re-bless writes; refuses with no baseline or a stale one; confirmed R3 |
| R1-F2 | P1 | The aggregate gate can mask a skipped seed test | resolved | 0 | aggregate gate asserts recorded seeds equal 1..10 and no longer recomputes; confirmed R2 |
| R1-F3 | P1 | Gate duels ignore rejected scripted commands | resolved | 0 | runDuel throws on any scripted command result not 'applied' (seed, tick, command, reason); all ten gate seeds pass, none rejected; confirmed R2 |
