# Round 2 response (spec revised)

Reviewed `round-2.json`. No new findings. Codex re-raised R1-F3 and R1-F6, and both re-raises are correct. Fixed again; 0 rejected, 0 deferred.

## R1-F3 [P1]: The scripted flight and firing policy needs exact rules (still open, fixed again)

Confirmed: `predictPath` returns positions only and never detects the edge (`predict.ts:L21-L31`). The avoid rule now tests each predicted position for a hazard itself:
- the planet within `planet.r + SHIP_RADIUS + AVOID_MARGIN`;
- any asteroid from `queryGrid` within `a.r + SHIP_RADIUS + AVOID_MARGIN`;
- distance from the centre beyond `rMap − AVOID_MARGIN`.

It turns directly away from the first hazard (toward the centre for the edge). The orbit band is now bounded outside the belt and inside the edge (`ORBIT_MIN ≥ BELT_OUTER + 200 = 1500`, `ORBIT_MAX ≤ R_MAP − 600 = 2200`), and `AVOID_MARGIN` joins the named constants.

## R1-F6 [P1]: The bait proxy contradicts its telemetry definition (still open, fixed again)

Confirmed: the sim records only aggregate hit counters (`contacts.ts:L43-L45`). The struck obstacle is now identified at the contact tick: the planet for a `planetHits` rise, or the asteroid nearest the enemy from `queryGrid` for an `asteroidHits` rise. The accumulator keeps the enemy's position at the stamped manoeuvre tick and compares its distance to that obstacle then and at contact.

## Also changed

- Change log entry for round 2.

## Files changed

- docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md

<!-- end -->
