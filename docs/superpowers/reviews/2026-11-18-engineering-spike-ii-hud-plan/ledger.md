# Ledger: engineering-spike-ii-hud-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 8 model test expects pew pew untargeted at round start; Part i starts it targeted on Shields | fixed:R1 | 0 | Task 8 test expects pew target Room.Shields, ready true |
| R1-F2 | P1 | Widening aimWeapon to 'pew' breaks FlightStation's prop type (tsc) | fixed:R1 | 0 | Task 8 narrows aim at DuelUi.tsx call site; DuelUi staged |
| R1-F3 | P1 | Task 9 torpedo fog test moves the wrong missile pool entry | fixed:R1 | 0 | Task 9 test uses placeMissile's returned entry |
| R1-F4 | P1 | Task 11 'creates' the spike report with a literal template, overwriting Part i's report | fixed:R1 | 0 | Task 11 Step 4 modifies Part i's report, appends Part ii sections; file table modify (T11) |
| R1-F5 | P2 | Task 10's measurement script duplicates Part i's, with a different workload | fixed:R1 | 0 | Task 10 duplicate measurement script dropped; Part i's measurements quoted |
| R1-F6 | P2 | New WeaponsStation calls optional ConsoleInput members without `?.` (certain TS2722), left conditional | fixed:R1 | 0 | WeaponsStation uses ?.() on optional ConsoleInput members |
| R1-F7 | P2 | The fog hides the round-start enemy, so existing tests break; the plan's fix recipe is open-ended and partly unworkable | fixed:R1 | 0 | Task 9 Step 9 grep + one recipe (move ships[1] within 600); repeated in Task 10 |
| R1-F8 | P3 | Small unstated HUD deviations from spec §6, and overlapping markers in non-point rooms | fixed:R1 | 0 | heat hot above 75%; breach marker offset; Decision 16 coolant in header over reactor column |
