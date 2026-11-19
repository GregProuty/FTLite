# Ledger: 2026-11-18-w1-pew-pew-plan

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Task 4 changes shipModule.commands, but tests/ftlTargeting.test.ts pins the old list and no task updates it | fixed:R1 | 0 | Task 4 Step 5(c) updates ftlTargeting.test.ts:169, runs and adds it |
| R1-F2 | P1 | Clicks on the console blocks reach the canvas, so clicking the Weapons panel or the new PEW row fires a round | fixed:R1 | 0 | Task 8: onWeaponsMap(p, contactShown, statusRows) in flightPointer.ts gates pewClick; PEW-row click test |
| R1-F3 | P1 | Moving a Task 6 tuning knob breaks constants pinned in tests/pewHunter.test.ts, and Task 6 never updates that file | fixed:R1 | 0 | Task 5 asserts derive from knobs; Task 6 re-pins PD_SEED and adds pewHunter.test.ts |
| R1-F4 | P2 | Task 5's 'The imports become' block drops hunter.ts's existing ./science and ./weapons imports | fixed:R1 | 0 | hunter.ts science/weapons imports kept in the block |
| R1-F5 | P2 | Task 9's duelSounds insertion only compiles if placed before gunHit's closing brace, and the step does not say so | fixed:R1 | 0 | Task 9 gives the whole duelSounds.ts 34-37 replacement |
| R1-F6 | P2 | Task 6's tuning ladder has no stop rule for the Hound, misstates which knobs act on the Valkyrn, and re-pins only five named tests | fixed:R1 | 0 | Hound stop rule, Valkyrn knobs named, all kind (a) re-pins, duelScripted fallback |
| R1-F7 | P2 | Task 10's `npm run test:determinism` never runs a duel, so it does not prove the pew deterministic across runtimes | fixed:R1 | 0 | Task 10 and self-review: test:determinism is sector-only; duel cross-runtime reported not verified |
| R1-F8 | P3 | The Weapons help text and sit card never mention the left-click pew | fixed:R1 | 0 | Task 8 Step 8(b): L-CLICK MAP PEW in readout help and sit card, tests updated |
