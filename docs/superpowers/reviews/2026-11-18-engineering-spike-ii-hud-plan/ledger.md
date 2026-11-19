# Ledger: engineering-spike-ii-hud-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 8 model test expects pew pew untargeted at round start; Part i starts it targeted on Shields | resolved | 0 | Task 8 test expects pew target Room.Shields, ready true; confirmed R2 |
| R1-F2 | P1 | Widening aimWeapon to 'pew' breaks FlightStation's prop type (tsc) | resolved | 0 | Task 8 narrows aim at DuelUi.tsx call site; DuelUi staged; confirmed R2 |
| R1-F3 | P1 | Task 9 torpedo fog test moves the wrong missile pool entry | resolved | 0 | Task 9 test uses placeMissile's returned entry; confirmed R2 |
| R1-F4 | P1 | Task 11 'creates' the spike report with a literal template, overwriting Part i's report | resolved | 0 | Task 11 Step 4 modifies Part i's report, appends Part ii sections; file table modify (T11); confirmed R2 |
| R1-F5 | P2 | Task 10's measurement script duplicates Part i's, with a different workload | resolved | 0 | Task 10 duplicate measurement script dropped; Part i's measurements quoted; confirmed R2 |
| R1-F6 | P2 | New WeaponsStation calls optional ConsoleInput members without `?.` (certain TS2722), left conditional | resolved | 0 | WeaponsStation uses ?.() on optional ConsoleInput members; confirmed R2 |
| R1-F7 | P2 | The fog hides the round-start enemy, so existing tests break; the plan's fix recipe is open-ended and partly unworkable | resolved | 0 | Task 9 Step 9 grep + one recipe (move ships[1] within 600); repeated in Task 10; confirmed R2 |
| R1-F8 | P3 | Small unstated HUD deviations from spec §6, and overlapping markers in non-point rooms | resolved | 0 | heat hot above 75%; breach marker offset; Decision 16 coolant in header over reactor column; confirmed R2 |
| R2-F1 | P1 | Step 5b's weaponsOffline and LAUNCH refusal bring back `rooms[Weapons] ≥ 2` as a crew gate, which Part i removed; feelIiModels breaks and is not in any run list | fixed:R2 | 0 | weaponsOffline bars-only, rooms LAUNCH line removed; feelIiModels L213/L218 edits spelled out, in Step 6 run and Step 11 add |
| R2-F2 | P3 | Step 5b's new test leaves the seed and the hx/hy check to execution | fixed:R2 | 0 | hx/hy note and seed search removed; asteroids cleared and lineOfSight precondition at seed 5 |
