# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `77064aa0`. 8 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: Task 3 rewrites fleet.ts in full and deletes Part i's HULL_IDS, which schema.ts imports

Confirmed. Part i plan L870-888 appends `HULL_IDS` to `fleet.ts` and makes `schema.ts` import it for `z.enum(HULL_IDS)`; the Task 3 Step 5 listing omitted it. The listing now ends with Part i's `HULL_IDS` export, unchanged, with a line saying `schema.ts` imports it. `hullModel.ts` line 5 becomes `export type HullId = (typeof HULL_IDS)[number]` with a type-only import, so the lists cannot drift. Decision 6 now states Part i's layout as a fact, and the Step 5 fallback to `z.string()` and the schema `git add` note are removed. The `isHullId` doc comment no longer calls the field a plain string.

## R1-F2 [P1]: Inserting the Valkyrn controls section at index 1 breaks settingsAndControls.test.ts:39

Confirmed. `.worktrees/sci-2/tests/settingsAndControls.test.ts:39` reads `sections[1]` for the SECTOR_KEYS. Task 8 Step 8 now also changes that line to `sections.find(s => s.title === 'Multiplayer')!`, and the Files line lists `:36,39`.

## R1-F3 [P2]: pushGunHits infers the shield pop from gunWear instead of Part i's gunHit.stripped

Confirmed. Part i Decision 2 and L1422 give `gunHit` a `stripped` flag. `pushGunHits` now pops on `e.room < 0 && e.stripped`. The `-1` keeps the frame-end `gunHull === 0` test because the event carries no hull flag. Its doc comment states the limit: two room hits in one frame, the first stepping the hull, float no `-1`, which needs a frame hitch since rounds leave 6 ticks apart. The test events are typed `ViewEvent[]` with `stripped`, the `as never` is gone, and a non-stripping shield hit (spark only) is added.

## R1-F4 [P2]: Task 7 Step 5 repeats Part i's type-only null-laser guards

Confirmed. Part i plan L579-582 (Task 2 Step 9) already makes the `hitModel`, `contactModel:180`, `consoleModel` burst and `laserSituation` edits. Task 7 Step 4's `laserSituation` bullet now says to leave Part i's guard, since it already returns `none`. Step 5 drops the three repeated bullets, and only `chargeRow` is left. `hitModel.ts`, `contactModel.ts` and `consoleModel.ts` are removed from Task 7's Files, `git add`, title and commit message, and from the file table row. Part i's contact-line ternary stays: the enemy is always the Hunter.

## R1-F5 [P2]: leadPip's nine-number signature disagrees with Part iii's adapter leadPip(st, 0)

Confirmed. Part iii plan L178-182 calls `leadPip(st, 0)`. Task 6 now pins the nine-number `leadPip` in its Interfaces as the contract and adds `leadPipFor(state, i)`. That function reads ship `i`, `targetOf` and the class's `gun.speed`, and returns null without a gun or an active target. A pure test checks it against the nine-number form and against the Cutter (null). Part iii's adapter must call `leadPipFor(st, 0)`: that is a cross-plan item for the coordinator.

## R1-F6 [P2]: The gun's left-button state can stick on when released off the canvas or on blur

Confirmed. `.worktrees/sci-2/src/renderer/src/app/duel/input.ts:240-244` listens on the canvas only. `createPointerSource` gains an optional `release` source (the window): its `pointerup` (button 0) and `blur` clear `left`, and `destroy` removes them. `duelMode.ts` passes `window`. A new `tests/duelInput.test.ts` case covers a release on the window, a blur, a canvas release and listener cleanup. Decision 12 now states the rule.

## R1-F7 [P3]: Three conditional branches are already decided by the sibling plans

Confirmed. `.worktrees/sci-2/src/renderer/src/net/duelRecord.ts:26` is `const crew = z.array(uint).min(2).max(4);`, and Part i types `gunLocked: boolean` (L28). Decision 6's conditional and the `gunLocked` 0/1 note are removed. Decision 21 and Task 4 Step 13 are now an unconditional `.min(1)` edit, and `net/duelRecord.ts` is in Task 4's Files and `git add`. The self-review "Placeholders" line is updated.

## R1-F8 [P3]: In the Tab ship view the seated pilot's keys still fly the ship

Confirmed: the plan's `activeHeld` sent `moveX`/`face` regardless of `shipView`. Chosen rule (Decision 11): the ship view keeps the course. The runtime's `look` flag zeroes `moveX` and drops `face` while the Flight seat is in the ship view, and the pointer bearing and gun were already dropped there. Throttle, launch and Q/E still work because they do not turn the ship. The ship-view runtime test now holds A and Space and asserts `moveX: 0` with no `face`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-valkyrn-ii-ship-and-views.md

<!-- end -->
