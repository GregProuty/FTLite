# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `86fafcec`. 6 accepted (5 new, 1 reopened), 0 rejected, 0 deferred. R1-F2 to R1-F12 are confirmed resolved.

## R1-F1 [P1]: No step order or hazard cadence (reopened)

Confirmed. duel/fire.ts:L45-L54 applies the damage cadence before igniteFromHits. §7 step 8 now keeps today's firePhase order (the damage cadence, then the per-hit fire roll) and adds the breach roll after the fire roll. The steps are renumbered 1 to 10.

## R2-F1 [P1]: Bars in a DuelState module, but the gates take TacticalState

Confirmed (weapons.ts:L51, L61, L154-L159; physics.ts:L63; predict.ts:L31). The bars now live in `ShipSystems.bars`, a canonical `ship` module field, so the tactical readers get them from the state they already take. §2 lists every ship-0 reader, including predictFlight and predictPath, and says the step-1 admission reads the bars as they stood at the start of the tick. The `power` module keeps heat, coolant and failed (§7).

## R2-F2 [P1]: The capacity update runs before fire damage

Confirmed. §7 defines `clampToCapacity`, which runs at the end of step 8 (after the damage cadence and the hit rolls) and inline at each overheat. Repair only raises capacity. §8 has a same-tick clamp test.

## R2-F3 [P2]: Scan rate fixed at the scan's start

Confirmed (science.ts:L12-L20 stores the rate, and L49 adds it). §2 now has a Scans rule: progress is read from the table each tick at the current Sensors bars, using the Science row or the other row by `by`. The scan pauses at 0 bars, and contactScan at 0 bars is `unavailable`. §8 has a test.

## R2-F4 [P2]: New fire and breach cases have no event shape

Confirmed. The spike adds no events for them. §4 Events says the HUD reads the interior state each frame, and the only new event is crewHurt 'air'.

## R2-F5 [P3]: Overheat draw consumption and order

Confirmed (heat.ts:L40). §3 says the draw is always consumed, in ascending system index, and that a second roll in room O is a no-op once the room is lit.

## Also changed

- §8 gains three tests: the prediction matches the flight, scan bars, and the same-tick clamp.

## Files changed

- docs/superpowers/specs/2026-11-18-engineering-spike-design.md

<!-- end -->
