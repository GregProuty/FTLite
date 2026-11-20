# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `24d3c28e`. 4 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F12 resolved.

## R2-F1 [P1]: G5 at a 150 ms round trip has no margin under the cap

Confirmed by the arithmetic: 9 ticks of lead, 18 of outage and up to 3 of cadence is 30, the cap, before any random loss beside the outage. §3.5's "seven lost updates" was also wrong: 21 ticks is 350 ms, which is six lost updates and the seventh arriving. G5 is now four cases. (a) 50 ms round trip with a 300 ms outage of publications, (b) 150 ms with 200 ms, (c) 50 ms with both directions out for 200 ms: in each `tick` never returns false, and the publications just before and just after the outage are delivered so the seed cannot push it over. (d) 150 ms with a 500 ms outage checks the over-cap behaviour directly: `tick` is false only while `P` stands at the cap, and stepping resumes at the next publication. §3.5 states the bound.

## R2-F2 [P1]: G1(a) cannot pass at 50 ms round trip or more

Confirmed: after a reset the lead is 0 and the first anchored publication moves the target by the whole lead, past the 2-tick allowance, so step 5 runs by design. G1(a) now requires the property itself (the hash recorded for `P` at every confirmed tick equals the publication's) and allows a re-simulation only when the measured target moved more than 2 ticks from where `P` stood; the verified and re-simulated counts are reported.

## R2-F3 [P2]: Step 1 drops commands that have not run yet when their entry is at or before the anchor

Confirmed against `streamClient.ts:L208-L214`: held frames go out on `unreliable-latest`, commands through the receive-time outbox on `reliable-ordered`, so a held frame can be acknowledged before the command sent beside it has run. Step 1 now removes commands only by `c`: those above `c` on entries about to be dropped move to the first entry after the anchor, or are kept for tick `T + 1`, and step 2 runs them there. The estimate paragraph says a pending command stays in `P`, so a toggle does not flicker.

## R2-F4 [P3]: The log and the per-tick records are never trimmed while this seat is not producing

Confirmed. Step 1's trim now runs whether or not an anchor was found: entries at or before local tick `T - offset` are dropped, with the records of ticks before `T`.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-net-4a-duel-prediction-design.md

<!-- end -->
