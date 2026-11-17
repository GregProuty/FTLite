# Ledger: enemy-window-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P3 | Screenshot harness reports a failed page as an 'ok' shot | fixed:R1 | 0 | Task 9: page catch logs console.error and sets shotFailed; shot.cjs exits 1 with 'failed page' |
| R1-F2 | P3 | The single player keyboard intercept wiring is untested | fixed:R1 | 0 | Task 7: duelModeDispose mock records keyboard opts; new test asserts the intercept takes Escape on a shown window |
| R1-F3 | P3 | `?mode=duel` gets the window, against the wording of spec §6.5 | fixed:R1 | 0 | Self-review: ?mode=duel stated as a deviation from spec 6.5 with the reason |
