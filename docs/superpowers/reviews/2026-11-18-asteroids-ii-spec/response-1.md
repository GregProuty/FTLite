# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `cff7d494`. 11 accepted, 0 rejected, 0 deferred.

## R1-F1 [P1]: §3.3 pass order breaks down when a rock wakes or a piece is born mid-pass

Confirmed. rocks.ts:L126 captures movers once and L142 takes the contact list once, so both readings the reviewer lists are reachable. §3.1 now defines a transient born mask; §3.3 defines a live outer loop over kind-2, not-born slots, a transient processed mask, the planet/edge test first in each turn, the skip rule (no longer alive, born or processed), the end of a's turn on a break, and all separation to a when b stays kind 1.

## R1-F2 [P1]: Eviction can reuse the collision partner's slot before its damage lands

Confirmed (rocks.ts:L80-L81 checks only liveness). §3.3 now computes both damages, applies both, then breaks. §3.4 eviction excludes born slots and both bodies of the contact being resolved, and any damage, push or contact on a born slot is skipped. §4.2 takes the blast list before the direct hit's pieces and skips born or dead slots.

## R1-F3 [P1]: §5.1 two-body contact with an un-woken kind-1 rock is self-contradictory and changes today's bounce

Confirmed against contacts.ts:L14-L16. §5.1 now runs the wake test first. A rock that does not wake is today's infinite-mass contact with today's hull cost of 1 (I chose to keep the Helm's terrain tuning; the speed-scaled cost applies to moving rocks). A woken or kind-2 rock is two-body. The ram break direction is u = −n. §3.1's wake wording names the 40 u/s condition, and the stepFlight and stepSoloFlight paths never wake a rock.

## R1-F4 [P1]: Rock-targeted torpedo: launch, lifetime of torpRock and fallback contradict each other

Confirmed (missiles.ts:L25, L47; weapons.ts:L43-L53, L180). Adopted the fix: `torpRockFlying` (−1 today's rules, −2 unguided), launch copies it and clears `torpRock`, auto-launch mirrors `torpLock`, range is the rock's centre against the class torpedo range, missile end resets it, and a lock while flying sets the next shot only (§6.1, §6.4).

## R1-F5 [P1]: rockLock command: order, folding, laserTargeted and right-click are undefined

Confirmed (step.ts:L29, L31, L183; weapons.ts:L158-L162, L175; WeaponsStation.tsx:L36). §6.1 places rockLock after torpLock in WEAPON_ORDER, folds it into `ShipInput.rockLock`, applies it after the room locks, and sets laserTargeted. It also defines the malformed bounds and names the DUEL_KINDS, codec and union changes. §6.5 right-click sends rockLock −1 only when a rock target is set, otherwise today's lock(−1).

## R1-F6 [P2]: Rock-rock waking has no speed threshold

Confirmed. ROCK_WAKE_SPEED now applies to rock-rock contacts (§3.1, §3.3), and §11.1 names the cascade risk with a moving-count-every-10-s log.

## R1-F7 [P2]: Belt rocks are always under r 45

Confirmed (map.ts:L76). Thresholds lowered: fan 3 at r ≥ 40 and 2 at r ≥ 25; burst 6 at r ≥ 35 and 4 at r ≥ 25. §9.4 setup is fixed (seed, Hunter inactive, placement on the outward radial, torpedo rock lock), counts pieces from the direct hit plus secondary breaks, and the floor is raised to 6 pieces.

## R1-F8 [P2]: §9.5 states a p99 gate and also says there is no gate

Confirmed. p99 < 0.5 ms is now a pass gate, with the moving-rock grid as the remedy; the no-threshold wording is limited to the size and publication measures, and §11.3 matches.

## R1-F9 [P2]: Rock shots and torpedoes turn the Hunter hostile; rocksBroken undefined

Confirmed (science.ts:L37). Decision: hostility unchanged (§6.3), since gunfire is gunfire. §8 defines the event's `ship` field and `rocksBroken`.

## R1-F10 [P2]: UI drop-on-rock needs controller interfaces that do not exist

Confirmed (contactController.ts:L56, L114-L118). §6.5 names `pickRock(slot)` on the controller and a pure `pickRock` hit test beside `pickContact`. A ship contact wins over a rock, the scan request made at pick-up stands, and the seat rule applies.

## R1-F11 [P3]: Numeric and wording nits

Confirmed (determinismGuard.ts allows floor). Fixed the guard list, the r 15 example and the cap timing, the 82 to 91 rock count, and the zero-distance north fallback.

## Also changed

- §9.3 adds tests for the new thresholds, non-waking contacts, the born mask and once-per-pair resolution.

## Files changed

- docs/superpowers/specs/2026-11-18-asteroids-ii-design.md

<!-- end -->
