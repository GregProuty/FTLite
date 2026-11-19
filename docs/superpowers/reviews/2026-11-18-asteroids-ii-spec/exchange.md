# Codex review exchange: asteroids-ii-spec

Subject: `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 1f1fdb18, effort high, 302 s, 812782 in / 725536 cached / 28675 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 §3.3 pass order breaks down when a rock wakes or a piece is born mid-pass
The spec never says whether the outer loop 'for each moving rock a in ascending slot' uses the movers captured at the start of the pass or re-reads kinds as it goes. Both readings fail. (1) With a captured list (today's code), a static rock b woken mid-pass by a lower slot is never processed as `a`. When a later mover c > b then meets b, the skip rule 'both moving and b < a' drops the pair, so (b, c) is never resolved. (2) With a live loop, pieces written into higher empty slots by a break in this pass get processed as `a`, against L99. L99 only stops born pieces being tested against each other; it does not say whether they meet older rocks this tick. It also does not say what happens to the rest of a's contact list once a itself breaks and its slot holds a new piece somewhere else. Also unstated: whether the planet/edge dust check (§3.2) runs before contacts or inside the same loop, and who takes the separation when a moving-apart pair (vc ≤ 0) involves a kind-1 rock, which L73 says is not moved. · spec L69-L71 (outer loop and skip rule), L73 (kind-1 moved only if it wakes), L80 (vc ≤ 0 only separates), L99 (born pieces); rocks.ts:L126 (movers captured once), L133-L135 (only skips broken slots), L142 (rocksNear list taken before the inner loop) · Two implementers would resolve different pairs in ordinary play: any blast or laser push wakes belt rocks mid-pass. That is hashed state, and the twin-run gate in §9.1 cannot catch it because both twins run the same wrong code. · Specify the following. Keep a per-tick transient 'born this tick' mask (not hashed, cleared at tick start). The outer loop is live: process slot a when it is kind 2 and not born this tick. Replace the skip rule with 'skip b < a when b was kind 2 and not born at the moment the loop passed slot b'; simplest is a per-tick 'processed as a' mask. Skip born slots as b. When a breaks, stop a's inner loop. Do the planet/edge check for a before its contacts. When b is kind 1 and does not wake, a takes the whole separation.

### [P1] R1-F2 Eviction can reuse the collision partner's slot before its damage lands
In a rock-rock contact, damage goes to a and then to b (L77-L78). If a breaks and the pool is full, eviction turns the smallest moving rock smaller than the new piece into dust (L102-L104). That rock can be b itself, or a rock still waiting in the blast list (L131) or in a ship's precomputed rocksNear list. b's damage then lands on a's new piece sitting in b's old slot, or the blast or ship contact meets a piece born this tick. The same thing happens in a ram, which breaks a rock inside the ship's precomputed list. · spec L77-L79 (a then b), L102-L104 (eviction: smallest moving rock, any slot), L131 (blast ascending slot, born pieces excluded only); contacts.ts:L48-L50 (ship's rocksNear list taken once); rocks.ts:L80-L81 (damageRock only checks that the slot is alive, not its identity) · A near-full pool is the expected state in the stress script (blasts every 10 s, 96 reserve slots). Damage landing on the wrong body changes hashed state in a way the spec never meant. · Rule that eviction never picks a slot born this tick, the other body of the pair or ram being resolved, or a slot still pending in the current blast list. Alternatively, work out both rocks' damage first and then apply both breaks, so b is already resolved before any eviction. State that a damage or contact on a slot born this tick is skipped.

### [P1] R1-F3 §5.1 two-body contact with an un-woken kind-1 rock is self-contradictory and changes today's bounce
L146 applies the impulse 'to both'. But a kind-1 rock at vc ≤ 40 does not wake, and a kind-1 rock never moves (L53-L56). So either the rock silently gains velocity while still kind 1, which breaks the invariant, or it is treated as infinitely heavy, which the spec does not say. If its finite mass mk = r² is used for the ship's share, a ship at 40 u/s into a static r 15 rock gets about 12 u/s back instead of today's full 1.5·vn reflection (contacts.ts:L16). With a rock that never moves, that weaker bounce turns into repeated push-outs. The hull impact formula (L148) has the same question: does it use mk for a rock that does not move? A ship at 200 into a static r 45 rock costs 3 with finite mass and 4 with infinite mass. Also unstated: whether the wake test happens before the separation choice in L143 (shared or full push-out), and the break direction u for a ram (L86, L88, L151). Finally, L53-L54 says any ram wakes a rock, which contradicts the 40 u/s rule. · spec L53-L56, L141-L151, L86; contacts.ts:L14-L16 (today: full push-out, infinite-mass reflection); physics.ts:L67-L79 (stepFlight and stepSoloFlight call the same contacts but never stepRocks, so a woken rock there keeps a velocity that is never integrated) · This writes ship and rock state in every belt scrape. Implementers would pick different effective masses and orders. It also changes existing ship-vs-static behaviour beyond a re-bless, which the duelGates and §4 flight tests rely on. · State the rule: test the wake first. If the rock stays kind 1, treat it as infinite mass (full push-out, Δv_ship = (1+e)·vc·n, impact = vc) exactly as today. Otherwise use the two-body rules with shared separation. Define the ram break direction as u = −n (from ship to rock). Fix L53-L54 to name the 40 u/s condition. Say whether stepFlight and stepSoloFlight get stepRocks or keep rocks kind 1 (for example, no waking in those paths).

### [P1] R1-F4 Rock-targeted torpedo: launch, lifetime of torpRock and fallback contradict each other
Several rules do not fit together. (a) A rock break clears torpRock (L168-L169). Homing reads the rock only 'while torpRock ≥ 0' (L191), so after a break homingTurn falls back to the enemy ship through systems.target (missiles.ts:L47). That contradicts L193's 'flies on unguided'. (b) The spec never says how a rock-targeted torpedo launches. Today, auto-launch fires on torpLock ≥ 0 (weapons.ts:L180), and launchMissile clears torpLock as a single shot (missiles.ts:L25). Does rockLock torpedo auto-launch? Is torpRock cleared at launch, which would kill the homing, or kept, which would re-launch at the same rock once the torpedo ends? (c) canLaunch and torpedoInRange read systems.target (weapons.ts:L43-L53), and step.ts validates missileLaunch with canLaunch (step.ts:L187). The spec does not say whether 'distance to the rock' (L192) means centre or surface, or whether it replaces the ship test in canLaunch. (d) It does not say what a rockLock torpedo sent while a torpedo is already flying does. · spec L162-L169, L191-L194; missiles.ts:L25, L31, L47-L48; weapons.ts:L43-L53, L180; step.ts:L187 · This is hashed missile and systems state on the main new player action. Two implementers would build different launch and homing behaviour. · Add an in-flight field such as torpRockFlying, the way torpRoom works: copy torpRock into it at launch and clear torpRock (single shot). Homing reads the in-flight field. A break of that rock sets it to −2, meaning unguided, so it does not fall back to the enemy. Missile end clears it. Specify that rockLock torpedo auto-launches when canLaunch holds, and that canLaunch with torpRock ≥ 0 tests the rock's centre distance against MISSILE_RANGE instead of the ship. A rockLock while a torpedo flies sets only the next shot's target.

### [P1] R1-F5 rockLock command: order, folding, laserTargeted and right-click are undefined
The new command is not placed in the fixed WEAPON_ORDER (step.ts:L29). The spec does not say whether it folds into ShipInput or writes systems directly (as designate does, step.ts:L217). So a same-tick laserLock(room) plus rockLock(laser) has no defined winner, even though L166-L167 makes them interact. It also does not say whether rockLock(laser) sets laserTargeted. Crew auto-fire requires laserTargeted (weapons.ts:L175), so 'the crew auto-fire when lined up' (L177) may never trigger. The right-click text (L202-L203, 'sends rockLock with −1 and the room lock as it was') contradicts 'as today'. Today the right-click sends lock(-1) (WeaponsStation.tsx:L36), which sets laserTargeted false (weapons.ts:L160) and stops auto-fire. Sending a room lock instead sets laserTargeted true (L159) and restarts auto-fire at the enemy. The 'malformed' bound is not exact (integer? −1 to rockSlots − 1?), and the codec schema (codec.ts:L117 pattern) and DUEL_KINDS (step.ts:L31) are not named as changes. · spec L164-L167, L177, L202-L203; step.ts:L29, L31, L179-L189, L217; weapons.ts:L158-L162, L175; WeaponsStation.tsx:L36; codec.ts:L117 · These are hashed systems fields and command results. Two implementers would disagree on same-tick precedence and on whether the laser auto-fires at a rock. · Place rockLock in WEAPON_ORDER right after torpLock. Fold it into ShipInput.rockLock {weapon, rock} | null, applied in applyWeaponsInput after laserLock and torpLock and before stepBurst, so a later rockLock beats a same-tick room lock. rockLock(laser, k ≥ 0) sets laserTargeted = true. rockLock(laser, −1) clears laserRock and sets laserTargeted = false, which is today's right-click. Define malformed as not an integer, or outside −1 to rockSlots − 1. List the codec, DuelEnvelope type and DUEL_KINDS additions.

### [P2] R1-F6 Rock-rock waking has no speed threshold, so gravity creep can wake the belt
Any rock-rock touch with vc > 0 wakes a kind-1 rock (L75). A woken belt rock never comes to rest under ROCK_GRAVITY 1.0 (L64-L65), so it drifts into its neighbours at a few u/s and wakes each one, and they do the same. Ships get a 40 u/s wake threshold for exactly this reason (L146-L147), but rocks get none. · spec L53-L54, L64-L65, L75, L146-L147, L279-L280 · It is a likely mechanism for belt collapse in a long round, and it raises the mover count past what the §9.5 budget assumes. · Apply ROCK_WAKE_SPEED to rock-rock contacts too: below it, the kind-1 rock is infinitely heavy and does not wake. Or name the cascade explicitly as a measured risk in §11.1 with a moving-count-over-time log.

### [P2] R1-F7 Belt rocks are always under r 45, so the 6-piece burst and 3-piece split never happen in the belt
Belt radii are 15 + u·30 with u < 1, so r < 45 (map.ts:L76). The 6-piece torpedo burst and the 3-piece laser split (r ≥ 45) only happen in the 12 to 21 cluster rocks. The §9.4 proxy ('10 largest belt rocks … at least 4 pieces') is therefore met by the direct-hit burst alone. It also leaves the ship's placement open ('300 u away' in which direction, Hunter present, hostility), so two scripts would log different numbers. · spec L89, L94, L255-L258; map.ts:L76 (belt r), L96 (cluster r 20 to 55); tuning.ts:L18-L20, L28-L29 · It weakens the owner's 'torpedoes … explode in multiple pieces' check and makes the proxy floor trivially true. · Lower the thresholds (for example 6 pieces at r ≥ 35 and 3 at r ≥ 35) or say belt rocks give 4. Make the proxy count pieces from the direct hit plus secondary breaks. Fix the setup: ship at rock centre plus 300 u along the outward radial, Hunter inactive, collisions counted only among slots descended from the blast.

### [P2] R1-F8 §9.5 states a p99 gate and also says there is no gate
§9.5 requires p99 under 0.5 ms, then says 'No pass threshold beyond the existing publication budgets'. §11.3 says the p99 'decides whether a moving-rock grid is needed', which treats a miss as a trigger to build something, not a failed acceptance. · spec L259-L262, L283-L284 · An implementer cannot tell whether a 0.6 ms p99 blocks acceptance or starts building the grid. · Say: p99 < 0.5 ms is a pass gate. If it fails, build a moving-rock grid (ascending output, same rocksNear contract) and re-measure. Remove the 'no pass threshold' wording or limit it to the image sizes.

### [P2] R1-F9 Rock shots and torpedoes turn the Hunter hostile, and rocksBroken counting is undefined
Any crew shot or launch ends the hold (science.ts:L37: crew.shots or missilesLaunched > 0). Deliberately lasering a rock during the 30 s hold therefore provokes the Hunter, and the spec does not say whether that is intended. The hashed counter rocksBroken (L227-L228, L238) is also not defined case by case. Does a torpedo direct hit count as one, plus each secondary blast break? Does dust from a small rock hit count? Do chain collisions started by a crew shot count? A ram by the crew? · spec L227-L228, L235, L238; science.ts:L34-L40; weapons.ts:L109 (shots++ for every shot, rock or not) · Hostility timing changes every round. rocksBroken is hashed, so a counting difference splits twin implementations. · State it: rock shots and launches count as hostile acts, as today, or are exempt (for example, a separate rockShots counter). Define rocksBroken as +1 per break or dust event whose `ship` field is the crew. Define `ship` as set for the crew's laser hit, its torpedo's direct hit and blast breaks, and its rams, and absent for collision-caused breaks.

### [P2] R1-F10 UI drop-on-rock needs controller interfaces that do not exist
The controller's only drop path is pick(room, lock) (contactController.ts:L56, L114-L118). pickUp always opens the enemy window armed and requests the enemy's Level 1 scan when it is unknown (L90-L91). click(contact) toggles the window (L76-L80). The spec's 'click on a rock drops the weapon; the contact window closes' (L198-L199) needs a new rock pick and highlight method. It does not say whether picking up a weapon to aim at a rock still starts an enemy scan, which wins when a rock and a contact are both under the pointer, or that a drop from the Helm map is rejected not-at-weapons by the seat rule (L165). · spec L196-L204; contactController.ts:L36-L40, L56, L76-L80, L87-L92, L114-L118 · The new interface is not named as new, and two UI builds would behave differently (scan side effect, click priority). · Name a new controller method such as pickRock(slot, lockRock), which sends rockLock, disarms and closes the window. Set contact priority over a rock under the pointer. Do not request a scan when the drop is on a rock, or say that the scan request stands. State that a Helm-seat drop is rejected not-at-weapons, or that the Helm view shows the bracket only.

### [P3] R1-F11 Numeric and wording nits
(1) L101 lists the allowed Math functions without floor, yet §5.1 uses floor. The guard does allow floor, round, sign and imul. (2) L127-L128: r 15 at fall 1 gets 60000/225 ≈ 267 u/s, which is not 'capped at 300', and the cap is applied only in the next stepRocks (L60-L61). (3) L283-L284 use 86 asteroids, but maps have 82 to 91 (70 belt plus 3 clusters of 4 to 7). (4) The blast-to-rock direction when the distance is 0 has no fallback; damageRock's north fallback could be named. · spec L101, L127-L128, L149, L283-L284, L127; tests/helpers/determinismGuard.ts:L3; tuning.ts:L18, L24-L27 · Small inaccuracies in a spec meant to be followed literally. · Correct the guard list. Fix the r 15 example and say the cap applies at the next motion step. Use '82 to 91 (seed-dependent)'. Name the zero-distance fallback (north, as in damageRock).

## Verified
- §5.1 hull-cost examples are arithmetically right: r 15 at 200 gives impact 40, cost 1; r 30 at 200 gives 100, cost 2; r 45 at 250 gives about 173, cost 4 (spec L149-L150)
- §4.1 laser push examples: 4000/225 ≈ 17.8 and 4000/2025 ≈ 2.0 (spec L116-L117). §4.2 r 45 blast push: 60000/2025 ≈ 29.6 (L127)
- Total piece area n·(0.9r/√n)² = 0.81r² ≤ r², so the §9.3 area check holds by construction (spec L90, L252)
- Fan angles (±30°, −40/0/+40°, multiples of 90° and 60°) are fixed fractions of a turn, so a literal cos/sin table plus multiply-add rotation by u fits the guard. The guard allows abs, ceil, floor, round, min, max, sign, imul and sqrt (tests/helpers/determinismGuard.ts:L3)
- Grid invariant: no rule in §3 to §5 writes kind 1. Pieces (including into seeded slots) are always kind 2 and dust is kind 0, so rocksNear's 'grid hit only while kind 1' filter (rocks.ts:L60) stays correct for reused seeded slots
- rocksNear's bounding test uses h + r (rocks.ts:L66), so querying with h = BLAST_RADIUS finds every rock whose surface is within 120 (spec L124)
- Seeded asteroids never overlap: ASTEROID_GAP = 10 (tuning.ts:L33), so no static-static contact exists at round start
- Spike i's firstBlocker, segmentEntry, damageRock and breakRock exist as the spec describes (rocks.ts:L80-L179). laserRockTarget and AUTO_DIG exist (weapons.ts:L90-L101)

## Not verified
- That master is at SIM_VERSION 51 and how the §2 merge changes step.ts, weapons.ts or the contacts code. I had read and grep tools only, no git, so I reviewed the spike i code in this worktree
- The hash, snapshot and clone wiring for the new systems fields (sim/tactical/hash.ts is not in the manifest)
- Solo seat rules: whether the single player can send Weapons commands from the Helm map view
- The codec's MAX_INDEX bound for a rock slot index (codec.ts read only by grep at L117)
- How the scene routes map clicks to contactController, and whether ContactWindow blocks map clicks under it
- gravityAccel's edge term and whether ROCK_GRAVITY 1.0 belt drift is about 1.7 u/s² (physics.ts gravity not read)
- Files read outside the manifest, for these findings: map.ts (grep, belt radii), science.ts (grep, hostility), WeaponsStation.tsx L1-L45 (right-click), physics.ts L55-L80 (stepFlight and stepSoloFlight), tests/helpers/determinismGuard.ts (grep)

---

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

---

# Round 2 (delta, reviewing 723831e8, effort medium, 161 s, 463790 in / 393722 cached / 15046 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 Ram damage still runs in the single-ship flight paths, which have no stepRocks and no born-mask reset
§3.1 says stepFlight and stepSoloFlight never wake a rock and use the kind-1 rule of §5.1. But §5.1 applies ram damage in 'any of the three cases', so a ram at 30 < vc ≤ 40 still damages a static rock in those paths and can break it if it is cracked. The break writes kind-2 pieces that never move there, because neither path calls stepRocks. It also sets born flags that are never cleared, because the mask is cleared only at the start of stepDuel. Every later ship contact then skips those slots for good. · spec L60-L64 (born mask cleared per stepDuel tick), L65-L67 (flight paths: no wake), L192-L195 (ram damage in any of the three cases); physics.ts:L67-L71 (stepFlight: resolveContacts only), L75-L79 (stepSoloFlight: hitStatics only) · It changes rock state in the dev flight view and the §4 flight tests, which the change was meant to leave as today. It also leaves pieces frozen in place and permanently uncollidable. · State that in stepFlight and stepSoloFlight a rock contact is exactly today's hitStatic: no ram damage, no break and no born-mask use. Or say that those paths clear the born mask at their start and also run stepRocks.

### [P2] R2-F2 missileLaunch admission no longer matches what happens when a rockLock(torpedo) arrives in the same tick
step.ts admits missileLaunch with canLaunch against the state before folding (step.ts:L187). §6.4 makes canLaunch test the rock's distance while torpRock ≥ 0, and a same-tick rockLock(torpedo, k) sets torpRock only later, in applyWeaponsInput. Admission therefore uses the old target (the ship, or the old rock) while applyWeaponsInput's canLaunch uses the new rock. The result can say 'applied' when nothing launches, or 'unavailable' when the auto-launch fires that same tick. The step's own comment requires every result to match what happens (step.ts:L174-L176). · spec L214-L220 (rockLock validated, then folded later), L254-L258 (range and launch by torpRock); step.ts:L174-L176, L179-L189; weapons.ts:L43-L54, L176-L180 · Command results go to clients. A mismatched result breaks the existing admission-equals-effect contract and gives the UI wrong feedback. Two implementers could also 'fix' it differently: by pre-applying the torpRock for admission, or not. · Specify that missileLaunch admission evaluates canLaunch with this tick's accepted rockLock(torpedo) already applied (the effective torpRock: the last accepted rockLock(torpedo) this tick, else the stored value). Alternatively, say that the result may differ and why.

### [P2] R2-F3 rocksBroken can count one break twice when an overflow piece turns to dust
§8 adds 1 to rocksBroken for every split or dust event of a rock's break whose ship is that ship. A crew-caused break where the pool is full and no eviction victim exists gives a split event plus a dust event for each piece that had no slot (§3.4 'otherwise the new piece is dust'). The spec does not say whether those overflow dusts carry ship, or whether they count. One break could therefore add 1, 2 or 3. · spec L129-L132 (overflow piece becomes dust, every dust emits an event), L314-L320 (ship field; rocksBroken +1 per split or dust event) · rocksBroken is hashed. A near-full pool is the expected stress state, so twin implementations would diverge. · Define rocksBroken as +1 per break, whatever the number of events. Or state that overflow-piece dust events carry no ship and do not count, as eviction dust does not.

### [P3] R2-F4 §9.4 piece floor is met by the direct hit alone
The 10 largest belt rocks are close to r 45, so all of them are above the new burst threshold of 35. The direct hit alone gives 6 pieces (rp about 16, above ROCK_MIN_R). The 'at least 6 pieces' floor therefore says nothing about secondary breaks; only the collision floor tests anything. · spec L110-L111 (belt r 15 to 45), L118-L120 (r ≥ 35: 6 pieces), L343-L347 (floor: at least 6 pieces) · The proxy was revised so that it would no longer be trivially true, and the piece floor still is. · Raise the piece floor above 6 (for example at least 8, so that one secondary break is needed). Or say plainly that the piece floor only checks the burst and the collision floor carries the chain test.

### [P3] R2-F5 A laser shot whose first blocker is a born slot, and a manual shot with an off-target rock lock, are not described
§3.4 skips damage on born slots, but it does not say whether firstBlocker skips a born slot or stops on it. An earlier ship's shot this tick can make a born piece on the later ship's line, and the answer decides whether the shot continues to the enemy line or another rock. Separately, with laserRock ≥ 0 and the rock off target, the spec does not say what a manual press hits: today's laserRockTarget uses the enemy line or the nose ray. · spec L133-L135, L232-L237; weapons.ts:L90-L97, L106-L131 · Both cases are rare and resolve to some deterministic code path, but the two rules leave room for different readings. · Say that firstBlocker skips born slots (the line passes through them). Say that a manual shot with an off-target rock lock follows today's miss path (the enemy line or the nose ray).

## Prior findings
- R1-F1: resolved — spec L81-L102: the outer loop is live, there is a processed mask, born and processed slots are skipped, the planet/edge test comes first, the turn ends on a break, and all separation goes to a when b stays kind 1. I traced b woken at a lower slot and pieces born at a higher slot: each pair is resolved exactly once.
- R1-F2: resolved — Damages are computed, then applied, then the breaks run (L100-L102). Eviction excludes born slots and both bodies of the pair (L129-L132). Born slots are skipped by every damage, push and contact (L133-L135). The blast list is taken before the pieces are written and skips born or dead slots (L163-L165).
- R1-F3: resolved — §5.1 L180-L195: wake test first, a non-woken kind 1 is today's infinite-mass contact with hull 1, two-body otherwise, and a ram break uses u = −n. L53-L55 now names the 40 u/s rule, and L65-L67 covers the flight paths. The ram-damage gap in those paths is raised as a new P2.
- R1-F4: resolved — L205-L209 and L254-L263: torpRockFlying uses −1 and −2. Launch copies and clears torpRock. Auto-launch mirrors torpLock. Range is the rock's centre distance against the class range. Homing returns 0 at −2. The missile's end resets the field, and a lock sent in flight sets the next shot only. All of this matches missiles.ts:L25, L31, L46-L48.
- R1-F5: resolved — L210-L225: WEAPON_ORDER slot, DUEL_KINDS, union and codec, validation order and malformed bounds (rockSlots exists, rocks.ts:L55), ShipInput folding after the room locks, laserTargeted set and cleared, cross-clearing with laserLock and torpLock. Right-click is at L278-L279. The admission side effect on missileLaunch is raised as a new P2.
- R1-F6: resolved — ROCK_WAKE_SPEED now applies to rock-rock contacts (L53-L55, L93). §11.1 names wake cascades and asks for the moving count every 10 s.
- R1-F7: resolved — Thresholds are lowered (L113-L122), and I checked the piece radii (12.9, 11.25, 15.9, 20.8). The §9.4 setup is fixed and counts secondary breaks. The piece floor is still met by the direct hit alone (new P3).
- R1-F8: resolved — §9.5 now makes p99 < 0.5 ms a pass gate, with the grid as the remedy and a re-measure. 'No threshold' now covers only the size and publication measures, and §11.3 is aligned.
- R1-F9: resolved — §6.3 L249-L250 keeps hostility as today. §8 L314-L320 defines ship and rocksBroken. The overflow-dust double count is raised as a new P2.
- R1-F10: resolved — §6.5 L267-L283: controller pickRock(slot), a pure pickRock hit test with a tie rule, contact priority, the scan request stands, and the seat rule.
- R1-F11: resolved — The guard list now matches determinismGuard. The r 15 figure is about 267 u/s, with the cap applied at the next motion step. The rock count is 82 to 91. The north fallback is named at L91, L121 and L158.

## Verified
- Hull-cost examples in §5.1 L188-L191 recomputed with SHIP_MASS 900: r 15 at 200 gives impact 40 and cost 1; r 30 at 200 gives 100 and cost 2; r 45 at 250 gives about 173 and cost 4; r 45 at 200 gives about 138 and cost 3.
- Fan and burst angles (±30°; −40°, 0°, +40°; 90° and 60° steps) are multiples of 15°, 20°, 30° or 60°, as L125 says.
- §9.3 piece-count tests (r 50 and r 35 give 6, r 30 gives 4, r 20 dust; laser break r 42 gives 3, r 30 gives 2, r 20 dust) agree with the thresholds at L113-L122.
- Tick order in duel.ts:L30-L36 (weapons, fly, missiles, stepRocks, resolveContacts, resolveMissiles) agrees with the born-mask and skip rules: pieces born in any phase are skipped by the later phases of the same tick.
- Today's contact (contacts.ts:L9-L21) is full push-out, a (1+e)·vn reflection and a hull cost of ASTEROID_CONTACT_HULL under the pair's grace, matching §5.1 case 2's 'exactly as today'.
- launchMissile and end in missiles.ts:L25 and L31 give the torpRoom pattern that §6.4 mirrors for torpRockFlying.
- WEAPON_ORDER and DUEL_KINDS at step.ts:L29 and L31, and the seat and stale checks at L182-L183, are the places §6.1 names.

## Not verified
- Did not open codec.ts, WeaponsStation.tsx, contactController.ts or tacticalModel.ts again in this round; I relied on round 1's citations for the UI and codec wiring.
- Did not check map.ts for the exact belt radius distribution; the claim that the 10 largest belt rocks are above r 35 rests on uniform 15 + u·30 over 70 rocks.
- Did not check the solo-seat handling for laserLock that §6.5 L281-L282 refers to.

---

# Round 2 response (spec revised)

Reviewed `round-2.json` against the subject at HEAD. 5 accepted, 0 rejected, 0 deferred; all 11 round-1 IDs confirmed resolved.

## R2-F1 [P2]: Ram damage still runs in the single-ship flight paths

Confirmed (physics.ts:L67-L79 call contacts but never stepRocks). §3.1 now says those paths keep today's hitStatic exactly: no wake, no ram damage, no break, no born mask.

## R2-F2 [P2]: missileLaunch admission vs a same-tick rockLock(torpedo)

Confirmed (step.ts:L187 admits before folding). §6.1 now has admission use the effective torpRock (the last accepted rockLock(torpedo) this tick, else the stored value).

## R2-F3 [P2]: rocksBroken can count one break twice

Confirmed. §8 counts +1 per break once, at the break; overflow-piece dust is not a break.

## R2-F4 [P3]: §9.4 piece floor is met by the direct hit alone

Confirmed (the largest belt rocks are above 35). The floor is now 8 pieces.

## R2-F5 [P3]: born-slot blocker and off-target manual shot

Confirmed. §6.2: firstBlocker skips born slots, and a manual shot with an off-target rock lock follows today's miss path.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-18-asteroids-ii-design.md

<!-- end -->

---

