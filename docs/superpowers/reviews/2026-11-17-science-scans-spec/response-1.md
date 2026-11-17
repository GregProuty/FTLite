# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `f0b422de`. 12 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: Tactical ticks do not restart at 0 on a rematch
Confirmed: step.ts startRound sets `next.tactical.tick = tick`. Added `TacticalState.startTick` (science module), set by startRound beside lastLaunch; every round-relative rule uses `rt = tick - startTick` (spec 4.1, 4.5); rematch test added (spec 10).

## R1-F2 [P1]: `scan` collides with the sector's `scan`
Confirmed: contracts.ts:57. Renamed to `contactScan` (spec 5).

## R1-F3 [P1]: Scan progress in stepDuel cannot see seats
Confirmed: stepDuel takes only TacticalState and ShipInput. Added `ShipInput.scanner`, set in step.ts from `attendant(d, scan.by)`; other constructors set true; the science steps stay in stepDuel so the headless gates get hostility (spec 4.6).

## R1-F4 [P1]: Hash and snapshot under-specified
Confirmed: hash.ts validation bounds hunter.mode to Hunt..Repair and shields to max layers; the clone rebuilds named containers only. New spec 6.2: the `science` module with its ordered field list, `freq` after `lock`, fresh containers in the clone, widened validation, `science` in DUEL_NOT_SNAPSHOTTED.

## R1-F5 [P1]: Derelict trig and draws ambiguous
Confirmed: the sim uses table trig only (direction.ts). Spec 4.5 now defines the angle in heading units with dirBetween, the exact draw order with nextInt, and orbitR bands clear of the belt (700-1000, 1400-1599).

## R1-F6 [P1]: SIM_VERSION two-step misdescribed
Confirmed against the Artemis spec 5.6 and duelOracle MIGRATIONS[42]. Spec 6.3 restated: step 1 neutral fields plus MIGRATIONS[43] with added regexes; step 2 the behaviour.

## R1-F7 [P1]: Contact ids clash with ship slots
Confirmed: contactController keys on a ship slot. Spec 4 and 7.2: contact ids are separate, ContactState.contact, new pickContact, the enemy drawn through hunterSlot, arm a no-op on the derelict.

## R1-F8 [P1]: Patrol not mapped onto ShipInput/tickWeapons
Confirmed: tickWeapons recharges unconditionally. Spec 4.2 gives the exact Patrol ShipInput, trail kept, repair skipped, shield clock held while hostileAt < 0; the start uses the class layers.

## R1-F9 [P2]: Reasons and wire shapes
Confirmed: `not-seated` does not exist. Spec 5 uses existing reasons, int wire with the sim answering malformed, designate noop, the science module's lists.

## R1-F10 [P2]: Same-tick ordering and exact counts
Confirmed. Spec 5 admission order after throttle; same-tick freq applies; a faster seat takes over the rate; spec 4.3 exact completion tick; spec 4.1 hostility in the step of rt 1199.

## R1-F11 [P2]: View rules conflict
Confirmed: input.ts maps S to throttle; types have no science. Spec 7.2/7.3: T supersedes the enemy-window rule, S scans on Science only, science added to the console types, layout and shown set; no aim on Science.

## R1-F12 [P2]: Gates have fixed bands
Confirmed: duelGates.test.ts asserts 180-300 s. Spec 10: bands unchanged; a failure is reported to the owner, no band edits or retuning.

## Also changed

- Section 9 edge cases updated for missiles and the trap deciding a round.

## Files changed

- docs/superpowers/specs/2026-11-17-science-scans-design.md

<!-- end -->
