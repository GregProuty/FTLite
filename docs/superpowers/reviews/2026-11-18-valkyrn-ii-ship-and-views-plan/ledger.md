# Ledger: valkyrn-ii-ship-and-views-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 3 rewrites fleet.ts in full and deletes Part i's HULL_IDS, which schema.ts imports | fixed:R1 | 0 | Task 3 Step 5 fleet.ts listing keeps Part i's HULL_IDS; hullModel HullId = (typeof HULL_IDS)[number]; Decision 6 restated |
| R1-F2 | P1 | Inserting the Valkyrn controls section at index 1 breaks settingsAndControls.test.ts:39 (sections[1] is the sector list) | fixed:R1 | 0 | Task 8 Step 8 also rewrites settingsAndControls.test.ts:39 to find the Multiplayer section; Files line :36,39 |
| R1-F3 | P2 | pushGunHits infers the shield pop from gunWear instead of Part i's gunHit.stripped | fixed:R1 | 0 | pushGunHits pops on e.stripped; -1 heuristic documented; test events typed ViewEvent with stripped, no as never |
| R1-F4 | P2 | Task 7 Step 5 repeats Part i's type-only null-laser guards; its quoted find-texts no longer exist | fixed:R1 | 0 | Task 7 Steps 4-5 no longer repeat Part i's guards; only chargeRow remains; Files/git add/table trimmed |
| R1-F5 | P2 | leadPip's nine-number signature disagrees with Part iii's adapter leadPip(st, 0) | fixed:R1 | 0 | Task 6 pins leadPip's nine-number signature and adds leadPipFor(state, i) with a test, for Part iii's adapter |
| R1-F6 | P2 | The gun's left-button state can stick on when the button is released off the canvas or the window loses focus | fixed:R1 | 0 | createPointerSource gains release (window): pointerup and blur clear left; duelMode passes window; duelInput test |
| R1-F7 | P3 | Three conditional branches are already decided by the sibling plans | fixed:R1 | 0 | Decision 6 conditional, gunLocked 0/1 note removed; Decision 21 / Step 13 unconditional .min(1) edit in duelRecord.ts |
| R1-F8 | P3 | In the Tab ship view the seated pilot's keys still fly the ship (A/D turn and clear the held bearing) | fixed:R1 | 0 | Decision 11: ship view drops moveX and face; runtime look flag; ship-view test asserts moveX 0 and no face |
