# Homing torpedoes (2026-11-17)

Owner, 2026-11-17: "i want to change the way torpedos work. I want them to be represented by dot on the screen, and I
want them to be fairly accurate homing torpedos. so if you select and lock onto the enemy you can aim the torpedo at the
enemy and it will autonomously home into the ship and hit it."

Today the duel's missile is launched along the nose and steered by hand: the gunner's held A/D, and for the Hunter a
pursuit turn toward where the crew was 30 ticks ago. This change replaces both with one autonomous guidance law, draws
every torpedo as a dot, and has a torpedo hit strike the owner's locked room. It is a sim change (SIM_VERSION 45 → 46).

## 1. Guidance (sim)

- **Steering.** Every torpedo, the crew's and the Hunter's, steers itself every tick toward its owner's target ship,
  `systems[owner].target`. The target is the ship the crew locks in the enemy window (today always the Hunter, slot 1),
  and the crew for the Hunter.
- **Target gone.** If the target is inactive, the torpedo flies straight, as an unattended missile coasts today.
- **The law** is velocity-correcting lead pursuit, in `sim/tactical/missiles.ts`, deterministic and float-safe like the
  rest of the tactical sim:
  - Time to go is `t = distance / max(closing speed, MIN_CLOSING)`, capped at `LEAD_CAP_S`.
  - The aim point is the target's position plus its velocity times `t`.
  - The desired velocity points at the aim point, at the torpedo's current speed or `CRUISE_SPEED`, whichever is
    greater.
  - The wanted thrust direction is `desired velocity − current velocity`. With no drag, aiming the thrust at the
    velocity error is what stops the orbiting and overshoot that plain pursuit gives.
  - The torpedo turns its heading toward that direction at its existing turn rate (`MISSILE_TURN_STEPS_PER_TICK`,
    120°/s), with the same integer heading-step accumulator used today.
- **Thrust, fuel and life.** It thrusts along its heading while it has fuel (`MISSILE_FUEL_TICKS`), then coasts with
  no further steering until it expires (`MISSILE_LIFE_TICKS`), as today. Gravity, the planet, asteroids, the map edge,
  arming and other torpedoes behave as today.
- **Accuracy.** "Fairly accurate": against a ship that holds its course it should hit nearly always within range. A
  hard turn, a burn, or an asteroid or the planet between them can still beat it, and so can its fuel running out at
  long range. Tuning constants (start values, the builder may tune them for that goal and must report the final
  values): `CRUISE_SPEED`, `MIN_CLOSING`, `LEAD_CAP_S`. Gate: a headless check over seeds 1–20, launching at a coasting
  target 300–600 units away, hits at least 90% of the time. Against a target doing a hard full-thrust turn the hit
  rate is reported, with no threshold.
- **Launch.** Unchanged: from the nose, at launch speed, needing a full magazine slot and the Weapons console manned
  for the crew. The Hunter keeps its launch rules, its range and its cooldown, and stops steering its missile itself.
- **Steering input removed.** The gunner's held A/D no longer steers anything. `crew.steer` and `ShipInput.steer`
  stop affecting the sim. The builder removes them where that is clean; the wire format stays, so held `moveX` from the
  Weapons seat is simply ignored.

## 2. The locked room

- A torpedo that lands on a ship strikes its owner's lock room, `systems[owner].lock` at impact, instead of the room
  under the impact point (`roomAtImpact`).
- The rest of a hit is unchanged: that room +1 level (capped at 2), `MISSILE_HULL` to hull, shields bypassed, the
  `missileEnd` event carrying that room.
- A self-hit (the owner's own ship) still uses the impact room, because a lock names a room on the target.

## 3. The dot (render)

- **On the Helm and Weapons maps**, every torpedo in flight is drawn as a filled dot, radius 4 screen px (never
  smaller at any zoom), with the existing short fading trail behind it, faint. Colours stay on the CRT amber ramp:
  - the crew's torpedo is `CRT.main` (bright);
  - the Hunter's is `CRT.hot`.
- **Removed:** the missile's chevron or shape, and the predicted steering path (`render/tactical/missilePath.ts` and
  its use).
- **The Weapons console** loses its STEER A/D controls and help text. Its MISSILE block reads TORPEDO; `MAG n/4` and
  LAUNCH (F) stay.
- **Words.** On-screen text that says MISSILE for this weapon says TORPEDO:
  - the off-screen arrow label;
  - the hit callouts (`TORPEDO: ENGINES HIT`);
  - the Weapons block;
  - the readout and help text.
  
  Code identifiers stay `missile`.
- **The camera.** C on the Weapons console still toggles the camera between the ship and the torpedo.

## 4. Tests and gates

- **Unit:**
  - the guidance turns toward a lead point;
  - a straight-flying target is hit, and the headless accuracy gate holds;
  - a torpedo with no target flies straight;
  - after its fuel runs out it no longer steers;
  - a landed torpedo strikes the owner's lock room, and a self-hit strikes the impact room;
  - held A/D at Weapons changes nothing.
- **Render:** a torpedo draws as a dot of radius at least 4, and nothing draws the old shape or the path.
- **Bless procedure:**
  - record the baselines at 45;
  - bump to 46 alone and bless;
  - make this change, then do a same-version bless.

  Tests pinned to scripted-duel moments are re-pinned with notes, as before. Never weaken an assertion.
- **Gates:** `npx tsc -b`, `npx vitest run`, `npm run test:duel-app-runtime`. The telemetry gate
  (`tests/duelGates.test.ts`: median duel 3–5 minutes, the crew both wins and loses) must still hold, or the builder
  reports how far off it is.
