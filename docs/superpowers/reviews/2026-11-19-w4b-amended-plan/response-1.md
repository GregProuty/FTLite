# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `b7ec9d22`. 4 accepted, 0 rejected, 0 deferred. Each was checked against the plan and the W-4 branch's code in `.worktrees/w4` (3b2a90c5).

## R1-F1 [P1]: Task 8 breaks tests/valkyrnRounds.test.ts:58, which Step 10 runs and expects to PASS

Confirmed. `tests/valkyrnRounds.test.ts` L58 pins the freed entry with an exact `toEqual` of seven members, and `gun.ts` L176 frees an entry with `Object.assign(r, emptyRound())`, so `emptyRound`'s new `room: 0` fails it. The file is not one of the plan's fence files. Task 8 now lists it as a kind (a) edit in Files, Step 9 gives the one-line replacement (the pin gains `room: 0`), Step 10's expectation names it, Step 12's `git add` stages it, and the Global Constraints' fences bullet says it is not a fence.

## R1-F2 [P2]: Task 9 writes two tests into tests/onlineDuelSession.test.ts but never stages that file

Confirmed (Task 9's Files and Step 6 `git add` named only `tests/w4Online.test.ts`, while Step 1 adds two cases to `tests/onlineDuelSession.test.ts` and Step 5 runs it). The file is now in Task 9's Files and in its `git add`.

## R1-F3 [P2]: Task 11 does not say where the PEW PEW tag goes in the JSX, and placed early it sits under the card's click overlay

Confirmed against `WeaponsStation.tsx` L128-L135: the `console-card-pew` div's Box takes pointer events over the row, and it comes after the label in the DOM. Task 11's Step 3 now says to render `gun-mode-pew` after that div, with the reason, and the tag click test asserts the DOM order with `compareDocumentPosition`.

## R1-F4 [P3]: Task 5 tolerates a failing duelGates seed, but the known-red window opens duelGates only at Task 7

Confirmed. The known-red window's `duelGates` entry now opens at Task 5 (the stand-in pew flies along the slewed turret), which matches Task 5 Step 7's "record it for Task 13 and go on".

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md

<!-- end -->
