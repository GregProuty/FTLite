# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `fd6f0e0b`. 7 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Task 4 misses the replay's held schema

Confirmed: `authority/replay.ts` L17 is a strict held object without the new keys. Task 4 now edits it (Files, a Step 4 edit, a grep check that every `gunHeld` schema carries `rcsY`, and git add).

## R1-F2 [P1]: Task 10 calls takeSteer() on the shadowed ContactRequests

Confirmed: `onlineDuel.ts` L252 shadows `requests` with `contact.takeRequests()`, and L101's `requests0` is the existing workaround. Task 10 (c2) adds `takeSteer0` beside `requests0` and drains it at the top of pump as `steerTaken`, before any early return. Step 4(e) uses `steerTaken`.

## R1-F3 [P1]: Task 3 breaks tests/duelSnapshot.test.ts

Confirmed: `tests/duelSnapshot.test.ts` L109 has `at + 5 + 4 + 2`, and `crewOfFourWire.test.ts` L63 has `+ 4 + 2`. Task 3 Step 8 (c) and (d) change both to `+ 6`. Both files are run in Step 9 and staged.

## R1-F4 [P2]: Task 5 Step 8's file list is incomplete

Confirmed: the grep also matches `duelInputMerge`, `duelOnlineView` and `duelRuntime`. Step 8 now lists eleven files:
- `duelInputMerge` needs no edit (notch keys only);
- `duelRuntime`'s throttle tests use `cls: ShipClass.Valkyrn` (the runtime takes `cls`, runtime.ts L170);
- `duelOnlineView`'s L189 test builds a Valkyrn replica now, so Task 10 doesn't break it.

## R1-F5 [P2]: The known-red list K can miss pins and mask failures

Confirmed: the six named files are outside every glob. Changes:
- Task 2 Step 10 and the end of Task 8 now run the full suite after `electron-vite build`.
- A new global rule: Tasks 5 and 7 re-run every K test and confirm it fails on the same assertion with only the pinned number moved. Anything else is a bug in that task.

## R1-F6 [P2]: If the Task 8 gate cannot be tuned, the whole plan stops

Confirmed: plan L2447 stopped the plan. Changes:
- Knob 0 has the scripted crew send one `helmPower +1` on its first seated tick, for cap 1000.
- If no setting holds, the scripted-pair gate becomes `describe.skip`, with an owner-visible comment and the closest summary in the commit, and Tasks 9 to 13 continue. The spike's acceptance is the owner's playtest.

## R1-F7 [P3]: The HelmStation's bottom rows may clip the 200 px panel

Confirmed by the y arithmetic. Changes:
- The refill rate moves into the power line (`ENGINE 3  COMPRESS 1  +5%/S`).
- AUTO-FACE moves to y0 + 118.
- The hints become two rows, at y0 + 150 and y0 + 170, which matches the existing block's lowest row. RMB HEADING stays in the controls list.
- The UI test's expected text is updated.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-18-playtest2feedback.md

<!-- end -->
