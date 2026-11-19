# Ledger: asteroids-ii-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | §3.3 pass order breaks down when a rock wakes or a piece is born mid-pass | resolved | 0 | §3.3 rewritten: live outer loop, born + processed transient masks, planet/edge first, stop on break, kind-1 takes no separation; confirmed R2 |
| R1-F2 | P1 | Eviction can reuse the collision partner's slot before its damage lands | resolved | 0 | §3.3 damages computed then applied then breaks; §3.4 eviction excludes born + pair bodies; born slots skipped by every damage/contact; confirmed R2 |
| R1-F3 | P1 | §5.1 two-body contact with an un-woken kind-1 rock is self-contradictory and changes today's bounce | resolved | 0 | §5.1 wake test first; non-woken kind 1 = today's infinite-mass contact and cost 1; ram break u=-n; §3.1 flight paths never wake; confirmed R2 |
| R1-F4 | P1 | Rock-targeted torpedo: launch, lifetime of torpRock and fallback contradict each other | resolved | 0 | §6.1/§6.4 torpRockFlying (-1/-2), launch copies+clears torpRock, auto-launch, range = rock centre vs torpedo range; confirmed R2 |
| R1-F5 | P1 | rockLock command: order, folding, laserTargeted and right-click are undefined | resolved | 0 | §6.1 WEAPON_ORDER slot, ShipInput.rockLock folding, laserTargeted effects, malformed bounds, codec/DUEL_KINDS; §6.5 right-click; confirmed R2 |
| R1-F6 | P2 | Rock-rock waking has no speed threshold, so gravity creep can wake the belt | resolved | 0 | §3.1/§3.3 ROCK_WAKE_SPEED applies to rock-rock too; §11.1 names wake cascades with moving-count log; confirmed R2 |
| R1-F7 | P2 | Belt rocks are always under r 45, so the 6-piece burst and 3-piece split never happen in the belt | resolved | 0 | §3.4 thresholds lowered (fan 40/25, burst 35/25); §9.4 setup fixed and counts pieces+secondary breaks; confirmed R2 |
| R1-F8 | P2 | §9.5 states a p99 gate and also says there is no gate | resolved | 0 | §9.5 p99 is a pass gate with moving-rock grid fallback; §11.3 aligned; confirmed R2 |
| R1-F9 | P2 | Rock shots and torpedoes turn the Hunter hostile, and rocksBroken counting is undefined | resolved | 0 | §6.3 hostility unchanged (rock shots count); §8 ship field and rocksBroken defined; confirmed R2 |
| R1-F10 | P2 | UI drop-on-rock needs controller interfaces that do not exist | resolved | 0 | §6.5 pickRock controller method + pure hit test, contact wins, scan request stands, seat rule; confirmed R2 |
| R1-F11 | P3 | Numeric and wording nits | resolved | 0 | guard list corrected, r15 example + cap timing, 82-91 rocks, zero-distance north fallback; confirmed R2 |
| R2-F1 | P2 | Ram damage still runs in the single-ship flight paths, which have no stepRocks and no born-mask reset | fixed:R2 | 0 | §3.1 flight paths keep today's hitStatic exactly: no wake, ram damage, break or born mask |
| R2-F2 | P2 | missileLaunch admission no longer matches what happens when a rockLock(torpedo) arrives in the same tick | fixed:R2 | 0 | §6.1 missileLaunch admission uses the effective torpRock |
| R2-F3 | P2 | rocksBroken can count one break twice when an overflow piece turns to dust | fixed:R2 | 0 | §8 rocksBroken +1 per break, once; overflow dust is not a break |
| R2-F4 | P3 | §9.4 piece floor is met by the direct hit alone | fixed:R2 | 0 | §9.4 floor raised to 8 pieces |
| R2-F5 | P3 | A laser shot whose first blocker is a born slot, and a manual shot with an off-target rock lock, are not described | fixed:R2 | 0 | §6.2 firstBlocker skips born slots; off-target manual shot follows the miss path |
