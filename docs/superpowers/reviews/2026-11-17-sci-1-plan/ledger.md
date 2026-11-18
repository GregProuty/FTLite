# Ledger: sci-1-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 1 puts the three new commands in DUEL_MODULES before the codec has them, so two existing tests fail in Task 1 | resolved | 0 | scienceModule commands/reasons empty in Task 1; Task 2 Step 8 fills them and updates scienceState; Task 2 commit stages hash.ts and scienceState; confirmed R2 |
| R1-F2 | P1 | Task 4's scan progress breaks Task 2's scienceCommands expectations of progress 0 | resolved | 0 | Task 2 scan assertions use toMatchObject without progress; confirmed R2 |
| R1-F3 | P1 | Task 8's new 'science' tab key breaks the exact tabs check at duelConsoleModel.test.ts:106 | resolved | 0 | Task 8 test updates add duelConsoleModel L106 tabs with science; confirmed R2 |
| R1-F4 | P2 | The Science block contradicts spec §7.3 'no station block' but is not marked as a deviation | resolved | 0 | Decision 10 restated as a deviation from spec 7.3 with its reason; confirmed R2 |
| R1-F5 | P3 | A few cited line numbers are off by one, and one pinned comment can go stale | resolved | 0 | L75, L155; L21 comment restates the outcome word; confirmed R2 |
