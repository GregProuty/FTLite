# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at `f543f9ab`. 3 accepted (2 reopened, 1 new), 0 rejected, 0 deferred. The reviewer resolved R1-F1, F2, F4, F5, F6, F7, F8, F9, F11 and F12.

## R1-F3 [P1]: The required laser slot (reopened)

Confirmed. The new evidence names readers outside the sim, including the bounds in the hash validator. §6.1 now says every reader of `slots.laser` guards null:
- In the hash validator, the laser maxima are taken over classes with a laser, and the gun maxima over classes with a gun.
- `consoleModel` drops the laser burst and range rows.
- `situationModel` drops the laser sentence and gives the gun's reasons instead.
- `hitModel` and telemetry count no laser hits.
- The plan greps every read of `slots.laser` and lists it.

§10 adds two null-laser tests: a Hound snapshot validates with the Valkyrn classes present, and the Flight-seat models build on the gun Valkyrn.

## R1-F10 [P2]: Room by aim (reopened)

Confirmed. A round moves about 11.7 u a tick, so on its last tick it has only just crossed the edge, and the closest point of that tick's short segment sits near the entry side.

§7.2 now uses the round's infinite line of relative motion. On a hit, its closest point to the centre is the middle of the chord the round cuts through the circle. The spec states the consequence: a shot along the enemy's axis always strikes Shields, and choosing Weapons or Engines takes a shot from the side. §10's tests are rewritten to match.

## R2-F1 [P2]: Signature collisions

Confirmed: `createTacticalState`'s second parameter is the slot count, and Sci-2 fixes the positional parameters of `createDuel`. §4.4 pins both:
- `createDuel(layout, seed, helmPlayer = 0, crew = 2, cls?)` keeps Sci-2's positional parameters and adds a fifth.
- `createTacticalState(seed, slots, crewClass)`.
- Every `opts.` reference is replaced.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-valkyrn-solo-ship-design.md

<!-- end -->
