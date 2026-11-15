# Round 3 response (spec revised)

Reviewed `round-3.json`. No new findings. Codex re-raised R1-F3 and R1-F6 a second time, and both re-raises name concrete gaps that I confirmed. Fixed again; 0 rejected, 0 deferred.

## R1-F3 [P1]: The scripted flight and firing policy needs exact rules (still open, fixed again)

Confirmed: there was no selection rule when several hazards qualify, and no radius correction.
- *Hazard choice:* at the first point with any hazard, the planet wins, then the edge, then the asteroid with the smallest clearance (distance minus radius), ties to the lower index.
- *Orbit:* a desired velocity direction is the prograde tangent rotated toward the planet by `clamp(ORBIT_GAIN · (r − ORBIT_R), −30°, +30°)`. The Helm turns its nose toward it. It thrusts +1 when the nose is within 45° and either the speed is below the circular speed minus slack or the velocity is more than 10° off, −1 when aligned and too fast, and 0 otherwise. Thrust is what bends the velocity, and so corrects the radius (`physics.ts:L25-L54`). `ORBIT_GAIN` joins the named constants.

## R1-F6 [P1]: The bait proxy contradicts its telemetry definition (still open, fixed again)

Confirmed: one tick can strike several asteroids, and the aggregate counter cannot say which. The struck bodies now come from the enemy's per-body `graceUntil`:
- each damaging contact sets `graceUntil[body] = tick + CONTACT_GRACE_TICKS` (`contacts.ts:L18`), with body 0 the planet and body `k + 1` asteroid `k`;
- every body whose entry changed to that value during the tick was struck.

This is exact for several contacts in a tick and needs no sim change. The bait's distance test then runs per struck body.

## Also changed

- Change log entry for round 3.

## Files changed

- docs/superpowers/specs/2026-11-15-helm-h0c-ii-a-headless-gates-design.md

<!-- end -->
