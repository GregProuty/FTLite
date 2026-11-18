# Round 1 response (plan revised)

Reviewed `round-1.json` against the plan at `5e9be125`. 5 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 2 breaks tsc -b in two test files it does not list

Confirmed: tests/helpers/scriptedDuel.ts:78 and tests/duelTelemetry.test.ts:84 index `t.players[n].` with no `!`, and tsconfig.web.json includes tests under noUncheckedIndexedAccess. Task 2 gains Step 12b (add `!`, telemetry text unchanged), and both files are in its Files list and `git add`.

## R1-F2 [P1]: Task 3 makes a crew-3 duel init valid, so duelMode.test.ts:134 fails

Confirmed: tests/duelMode.test.ts:134 expects a playerCount 3 init to be refused. Task 3 Step 7b changes it to 5 and asserts a crew-3 start succeeds; the file is in `git add`.

## R1-F3 [P1]: Task 7 removes otherStatus and ReadoutInput.other but misses four test files

Confirmed: rt.otherStatus() at tests/duelRuntime.test.ts:79,107,120,175 and tests/scienceSeat.test.ts:88; `other:` in tests/scienceConsole.test.ts and scienceSeat.test.ts. Task 7 extends the sed, rewrites the otherStatus assertions as crewStatus(rt.duel, 1) with an explicit value map, and lists the three files in Files, the test run and `git add`.

## R1-F4 [P2]: Decision 5: REPAIRING shows for anyone standing near damage, even if not repairing

Confirmed: repairInReach (controls.ts:21-27) ignores input and progress. Decision 5 and crewStatus now require started work too (d.repair[r] > 0 or the point room's fireRepair > 0), the state-only form of the old online workOf rule (onlineSource.ts:43). crewList.test.ts checks ON FOOT at a damaged point, then REPAIRING once repair progress is set.

## R1-F5 [P3]: Small citation slips in Task 2 Step 7 and Task 5

Confirmed (health.ts:50,96,103,110,120,122 and :62; menu.test.tsx:74). Fixed both.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-sci-2-crew-of-four.md

<!-- end -->
