# Ledger: engine-r0-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P0 | A failed bless can bypass the version-only guard on retry | resolved | 0 | bless stages and validates all three artifacts in memory, writes none unless all are ready; the guard runs if ANY pinned artifact's stored version differs from SIM_VERSION; tests for a mixed-version state and a failure on the third artifact; confirmed R2 |
| R1-F2 | P0 | The log cleanup can discard concurrent edits | resolved | 0 | determinism runs with --output-dir=out/r0-determinism (git-ignored); all checkout/restore steps removed; new constraint forbids checkout/restore/stash/clean; confirmed R2 |
| R2-F1 | P2 | The all-or-nothing claim excludes write failures | fixed:R2 | 0 | the claim is qualified to staging failures; a write failure can leave a mixed-version set, which the next bless guards again (decision 1 and the bless-golden.ts comment) |
