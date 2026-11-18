# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `77064aa0`. 5 accepted, 0 rejected, 0 deferred; no prior IDs.

## R1-F1 [P1]: The throttle sent on the stand tick is always rejected 'invalid-seat', so requireApplied throws and the repair test fails

Confirmed. `.worktrees/sci-2/src/renderer/src/sim/duel/step.ts` applies every `stand` in the seat phase (the `for ... 'stand'` loop) before `const helm = attendant(d, d.nav)`, and the throttle loop rejects `invalid-seat` when `helm < 0`; envelope order cannot help. Chose option (b), made stateless: while seated with a task, if `d.throttle !== PILOT_AWAY_THROTTLE` the pilot sends only `throttle` 0 (holding its last aim, gun off); the next tick it sends only `stand`. Updated Decision 7 (with the reason), the pilot's stand branch, and the repair test (it now flies up to 3 ticks to stand, asserts 1–2 ticks, throttle 0 and `holdHeading === p.aim`; imports `PILOT_AWAY_THROTTLE`). Deleted the swap-order fallback in Task 2 Step 2.

## R1-F2 [P1]: Part i freezes GUN, the class and its slots, so the in-process sweep throws and Task 1 Step 3's expected 'frozen false false' is wrong

Confirmed at valkyrn-i plan L429 (`GUN = Object.freeze`), L441-445 (`shipClass` freezes the class and `slots`), L455 (`SHIP_CLASSES` frozen). Took the recommended mechanism: Decision 10 rewritten; `scripts/valkyrn-telemetry.ts` gains `--json` (gate over seeds 1–10 as one JSON line) and `sweep` now rewrites the four `export const NAME = <int>;` lines in `tuning.ts` (exactly-one-match check), runs the child via `process.execPath node_modules/tsx/dist/cli.mjs` (no shell needed on Windows; checked tsx's bin is `dist/cli.mjs`), restores in `finally` and on SIGINT and verifies the text. Removed the frozen pre-flight and the gun.ts-reads paragraph from Task 1 Steps 2–3 (Step 2 now checks the four declarations are single-line integers; Step 3 keeps the validator check, pointed at `sim/tactical/hash.ts`, where Part i L1804-1805 already derives the bounds). Task 4 Step 3 adds the `git diff --quiet` check. Architecture, file table and self-review updated.

## R1-F3 [P1]: The lead agreement test calls Part ii's leadPip as (state, 0), but Part ii's signature is nine numbers

Confirmed at valkyrn-ii plan L1484 and the body at L1607-1619 (returns `tx + (tvx − svx)·t`, a world point). `viewOffset` now calls `leadPip(s.x, s.y, s.vx, s.vy, e.x, e.y, e.vx, e.vy, GUN.speed)` with `e` the locked target and subtracts ship 0; `GUN` imported from defs. Removed the "if the signature differs" text in Task 1 Step 5 and the self-review.

## R1-F4 [P1]: Tuning the counters breaks Part i's tests/valkyrnRounds.test.ts, which Step 6's grep does not find and Task 4 never runs

Confirmed at valkyrn-i plan L2081-2090 and L2129-2139 (literal loop counts and arrays), and found two more literal pins: valkyrnClasses.test.ts L255 (`toEqual([30, 160, 200])`) and L256/L258 `hull: 30`, and valkyrnGun.test.ts L1585-1587 (`bad(... gunWear, 0, 8)`, `gunHull 3`, `gunRoomWear 6`). Task 4 Step 6 now runs `tests/valkyrn*.test.ts` plus the grep list and says how each named pin is rewritten in terms of `GUN.hitsPer*` / `VALKYRN_HULL`; Step 8 runs `tests/valkyrn*.test.ts`; Step 10 stages those files by name; the Files list names them.

## R1-F5 [P2]: Stage B's 'best Stage A pair' is undefined when Stage A has no PASS line

Confirmed: Step 4's rule covered only PASS lines. Task 4 Step 3 now defines the Stage A pick: the Step 4 PASS pick; else hunter ≥ 1 and cap 0 with median closest to 240 s; else lowest vhull then median closest to 240 s; ties by normalised distance from start (3/30), then the earlier line.

## Also changed

- Task 1 Step 7's conditional `git add` list now names `sim/tactical/hash.ts` instead of `gun.ts`.

## Files changed

- docs/superpowers/plans/2026-11-18-valkyrn-iii-pilot-gate.md

<!-- end -->
