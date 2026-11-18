# Weapons update: double laser, torpedo range ring (2026-11-17)

Owner, 2026-11-17, after the first two-PC playtest: "I found that playing weapons was a little difficult and not
intuitive." Requests:
- "I want the missile to have a medium range that is 360 and represented by a circle."
- "The laser can stay in its current range, but I want it to be a double laser, so fire two consecutive shots."
- "making the torpedo be able to lock and homing fire on the enemy regardless of direction, but it would be interesting
  if the torpedo was launched forward and then homing tracks from there."

A sim change: SIM_VERSION 46 → 47. Decisions below were taken under the standing order (take the recommendation).

## 1. Double laser (sim)

- **The crew's laser fires a burst of two shots** per full charge. The Hunter keeps a single shot, so the change makes
  the players stronger, as asked. A per-class value: `LaserDef.shots` (Cutter 2, Hunter 1).
- **Shot 1** fires on release exactly as today (`fireLaser`): charge and hold reset.
- **Shot 2** fires `LASER_BURST_GAP_TICKS = 12` ticks later (0.2 s). It is a full shot of its own: it re-checks
  `laserEligible` at that tick (arc, range, line of sight), at the lock room current at that tick, strips shields the
  same way (the weak-frequency 2-layer strip included), does `LASER_HULL` on a hit, counts in `shots`/`laserHits`, and
  pushes its own `laser` event. So a 2-layer shield takes two shots, the second of a burst can hit an unshielded room,
  and a ship that slips out of the arc in the gap dodges the second.
- **State:** a new per-ship systems field, `laserBurst` (shots still to fire) plus its countdown, in the hash and in
  every snapshot/serialisation path that carries systems.
- **Cancels:** Weapons reaching damage level 2 drops the pending shot. Nothing else cancels it (a torpedo launch in
  the gap does not). The laser does not charge while a shot is pending.
- **Render and audio:** every `laser` event already draws a beam and plays the shot; the second shot reuses that. The
  online view derives events from counters (`onlineSource.ts` `gapEvents`): it must show two beams when two shots land
  between snapshots.

## 2. Torpedo range 360 and its circle

- **Range rule:** `MissileDef.range = MISSILE_RANGE = 360`. `canLaunch` also requires the owner's target ship active
  and its centre within 360 of the owner's centre. Both ships use it; the Hunter's own `HUNTER_MISSILE_RANGE` (400)
  is replaced by its class's range.
- **Regardless of direction:** no arc. A target behind the ship can be fired on.
- **Launched forward, then homing:** the torpedo leaves the nose as today, then flies straight, unguided, for
  `MISSILE_BOOST_TICKS = 20` (1/3 s) before its guidance takes over, so the player sees it go out forward and then
  curve onto the target. Tune it if needed: the guidance gate (below) must still pass.
- **The circle:** the Weapons map draws a 360 range circle about the own ship, on the CRT amber ramp: `CRT.dim` while
  the target is out of range, `CRT.mid` while it is in range. The Helm map draws it too, `CRT.dim` only, so the pilot
  can bring the enemy inside.
- **Console:** the TORPEDO block shows `IN RANGE` / `OUT OF RANGE` next to `MAG n/4`, and LAUNCH (F) is greyed while
  out of range (it already follows `canLaunch`). The top readout gains the range state, e.g.
  `RNG 312 TORP IN RANGE`.

## 3. Tests and gates

- Unit: two laser events per crew burst 12 ticks apart; the second re-checks eligibility (target leaves the arc → miss);
  two shots strip a 2-layer shield; Weapons level 2 cancels the second; the Hunter fires one.
- Unit: `canLaunch` false beyond 360 and true within, from any bearing; the Hunter does not launch beyond 360.
- Guidance gate (`tests/torpedoGuidance.test.ts`): launches from within 360, including targets behind the ship (bearing
  90°–180° off the nose), coasting target hit rate ≥ 90% over seeds 1–20; report the hard-turn rate.
- Render: the circle at radius 360·zoom on both maps, its two brightness states; `crtColours` stays green.
- duelGates: report the median round length and wins/losses; the 3–5 minute gate must hold (re-tune the burst gap or
  the Hunter, and report, if not).
- Bless procedure (never `--fresh`): baselines at 46, version-only bless at 47, then the same-version bless after.
- Gates: `npx tsc -b`, `npx vitest run --maxWorkers=4` (after `npm run build` in a fresh worktree),
  `npm run test:duel-app-runtime`.
