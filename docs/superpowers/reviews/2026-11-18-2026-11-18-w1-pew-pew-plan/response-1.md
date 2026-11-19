# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `a3538f12`. 8 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 4 changes shipModule.commands, but tests/ftlTargeting.test.ts pins the old list and no task updates it

Confirmed: tests/ftlTargeting.test.ts:169 pins the four-command list. Task 4 Step 5(c) now appends 'pewFire' there, and the file is in Step 6's run and Step 7's git add.

## R1-F2 [P1]: Clicks on the console blocks reach the canvas, so clicking the Weapons panel or the new PEW row fires a round

Confirmed: Stage.tsx:7 is `pointerEvents: 'none'`, and flightPointer.ts:9-23 already filters the blocks for the Flight seat. Task 8 adds an exported `onWeaponsMap(p, contactShown, statusRows)` beside `onFlightMap`, covering the tab strip, side column, status table (its height from the readout rows), the Weapons block, and CONTACT while it is shown. pewClick requires it, a click over a block falls through to today's path, and a test checks that a click on the PEW row queues no pew.

## R1-F3 [P1]: Moving a Task 6 tuning knob breaks constants pinned in tests/pewHunter.test.ts, and Task 6 never updates that file

Confirmed. Task 5's assertions now derive from HUNTER_PEW_ERROR and HUNTER_PD_CHANCE, and the literal gap pin is dropped. Task 6 Step 6 re-pins PD_SEED by Task 5's rule, and the file is in its git add.

## R1-F4 [P2]: Task 5's 'The imports become' block drops hunter.ts's existing ./science and ./weapons imports

Confirmed: hunter.ts:14-15. Both imports are now in the replacement block.

## R1-F5 [P2]: Task 9's duelSounds insertion only compiles if placed before gunHit's closing brace, and the step does not say so

Confirmed: duelSounds.ts:34-37. Task 9 now gives the whole replacement for those lines.

## R1-F6 [P2]: Task 6's tuning ladder has no stop rule for the Hound, misstates which knobs act on the Valkyrn, and re-pins only five named tests

Confirmed: hunterThink is class-agnostic (hunter.ts:84-121). Task 6 now has:
- a stop-and-report rule for the Hound;
- every knob that acts on the Valkyrn named;
- a re-pin of every kind (a) test from Task 5's commit body;
- a duelScripted fallback for when no seed qualifies.

## R1-F7 [P2]: Task 10's `npm run test:determinism` never runs a duel, so it does not prove the pew deterministic across runtimes

Confirmed: there is no duel in scripts/determinism. Task 10 and the self-review now state that the run covers the sector only. The duel's cross-runtime determinism rests on the guard rules and the Node goldens, and the final report lists it as not verified across runtimes. A new cross-runtime duel harness is out of this part's scope.

## R1-F8 [P3]: The Weapons help text and sit card never mention the left-click pew

Confirmed: readoutModel.ts:168 and sitModel.ts:17. Task 8 Step 8(b) adds the L-CLICK MAP PEW wording to both and updates duelReadout.test.ts and feelPresentation.test.ts.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-w1-pew-pew.md

<!-- end -->
