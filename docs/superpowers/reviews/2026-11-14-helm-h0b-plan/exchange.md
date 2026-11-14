# Codex review exchange: helm-h0b-plan

Subject: `docs/superpowers/plans/2026-11-14-helm-h0b-combat.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 8cfe5be, effort high, 219 s, 630594 in / 565632 cached / 6215 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Start the hunter's missile cooldown only after a successful launch
hunterThink updates lastLaunch before the requested launch is applied. A crew laser hit can raise enemy Weapons from level 1 to 2 between those operations, causing the launch to be refused while still consuming its cooldown. · plan L1188–1189 updates lastLaunch when constructing input; plan L1217–1218 thinks first, then applies crew commands before enemy commands; plan L892 and L913 allow the crew hit to invalidate the launch. Spec L202 defines the missile launch rule. · After repairing Weapons, the hunter can remain unable to launch until 30 seconds after a missile it never launched. The isolated hunterThink test at plan L1025–1031 misses this ordering failure. · Update lastLaunch only when an enemy missile actually launches. Add a stepDuel regression where the crew damages enemy Weapons from 1 to 2 on its proposed launch tick; assert that no missile launches and lastLaunch remains unchanged.

### [P1] R1-F2 Give pursuit steering a deterministic turn when the target is directly behind
The cross-product-only steering returns zero for both directly ahead and directly astern. With a lead point directly behind, the hunter neither turns nor thrusts. Missile pursuit has the same blind spot. · plan L403–404 defines sideOf as the cross-product sign; plan L1171–1173 uses it directly for ship pursuit, and plan L1180 uses it for missile pursuit. Spec L201 requires steering toward the lead point; spec L202 requires missile pursuit toward the delayed position. · For heading north and target displacement (0, 300), the cross product is zero and the dot product is negative, yielding turn=0 and thrust=0 despite needing a half-turn. Only avoidance has a tie-break, at plan L1169. · For pursuit, distinguish zero-cross-product ahead from astern using the dot product. Choose a fixed turn direction when the target is astern, preserving zero turn ahead. Test this for both ship and missile steering.

### [P1] R1-F3 Expire missiles at the end of their 480th flight tick
A missile survives all 480 flight ticks and is destroyed only on call 481, leaving the laser frozen one extra tick. · plan L192–193 defines 360 fuel ticks and 480 total lifetime ticks; plan L789–790 increments age and expires only when age > MISSILE_LIFE_TICKS. Plan L1220–1223 advances weapon clocks after missile processing. Spec L147 requires six seconds of thrust followed by two seconds of coasting and self-destruction. · After eight seconds, the missile remains present with age=480, so laserFrozen still returns true. The proposed lifetime test at plan L659–668 permits this and does not assert the ending cause or exact tick. · Perform all 480 movement/contact ticks, then expire any surviving missile before that tick's weapon clocks. Do not merely change the pre-movement comparison to >=, which would omit the final movement tick. Add exact lifetime, fuel-boundary, expiry-cause, and laser-unfreeze assertions.

### [P2] R1-F4 Test the resumed full-charge hold timer without a fresh press
The tests do not establish Decision 4's central behavior: a frozen full charge resumes its remaining hold timer even while fireHeld is false. · plan L41 states this decision and plan L924 implements it. The missile-end test at plan L727–739 immediately proceeds to a fresh press/release; the unattended test at plan L536–548 uses only a partial charge. Spec L160 explicitly requires the frozen full charge to resume its hold timer. · These tests would still pass if the hold timer incorrectly required Fire to remain held, allowing a preserved full charge to last indefinitely. · Freeze a full charge with a nonzero hold timer, verify that both clocks remain unchanged while frozen, then end the missile or re-attend without pressing Fire. Assert venting after exactly the remaining attended, unfrozen ticks and no automatic recharge.

## Verified
- The checkout is master at 8cfe5be, one brief-only commit after f5da2df. Git diffs showed no changes to the reviewed plan, spec, tactical source, RNG, hashing helper, or determinism guard between those revisions.
- Consumed interfaces match the branch: gravityAccel and flyShip (physics.ts:L9,L26), resolveContacts (contacts.ts:L49), heading helpers (direction.ts:L5–7), grid helpers (grid.ts:L12,L24), map schemas/generator (map.ts:L11–22,L70), nextInt(r,n) (src/shared/rng.ts:L20), and hashF64(Float64Array) (src/shared/hash.ts:L3).
- Task dependencies are ordered correctly: state/tuning/geometry precede weapons/missiles, which precede hunter/duel (plan L75–77,L434–438,L959–961). No missing imported interface was found by static inspection.
- Integer-clock arithmetic matches the specified timings: laser 240/384/600 ticks and shields 300/450 ticks, with level-2 shields stopped (plan L174–182; spec L101,L110–111,L139). These divisions were checked with node.
- Decision 4 is consistent with the transition table. Press/release, missile freezing, unattended clearing without firing, and fresh-press requirements follow spec L156–162 in plan L901–929.
- Missile contact traversal follows the requested per-missile priority; ages 1–60 exempt the owner; room damage uses the impact position; missile–missile contact ends both once (plan L805–832; spec L82–85,L103).
- Hunter lookahead uses distance from the velocity segment to body radius + 30; the trail reads before overwriting its 18-slot ring; repair prioritizes damage then Engines/Weapons/Shields, preserves visits across hits, and applies the correct console absence (plan L1124–1180; spec L201–203).
- Static inspection found no banned sim constructs. Flattening includes all currently proposed ship, missile, and hunter fields affecting future ticks, with matching scalar counts and zero normalization (plan L329–350; tests/helpers/determinismGuard.ts:L3,L20–41).

## Not verified
- No test suite, TypeScript compiler, or AST guard was executed. Compilation and test compatibility were reviewed statically; node was used only for focused arithmetic checks.
- The review directory and ledger are absent from this checkout, and no awaited finding IDs were supplied. Prior-round reconciliation was therefore unavailable.
- H-0c's ordered command adapter remains unverified. A single ShipInput cannot represent multiple same-tick press/release commands or preserve launch-versus-release envelope order (plan L859–864,L905–915; spec L279). Its future integration must explicitly preserve that ordering.
- Supplemental reads beyond the narrow manifest included src/shared/hash.ts to verify the consumed hash signature, spec §§8/13 and acceptance passages to assess the split, and the tracked review brief to check review context. sed failed under the sandbox, so numbered PowerShell range reads were used instead.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `8cfe5be`. 4 accepted (3 P1, 1 P2), 0 rejected, 0 deferred. No prior IDs (round 1). After the fixes, the plan was applied task by task to a fresh worktree of master, and each task typechecked and passed its tests (137, 162, then 179).

## R1-F1 [P1]: Start the hunter's missile cooldown only after a successful launch

Confirmed. `hunterThink` set `lastLaunch` while building the input. `stepDuel` then applies ship 0's weapon commands before ship 1's, so a crew laser hit can raise the enemy's Weapons to level 2 and `applyWeaponsInput` refuses the launch, but the cooldown was already spent. `hunterThink` now only requests the launch. `stepDuel` records the enemy's `missilesLaunched` before the command loop and sets `hunter.lastLaunch = state.tick` only if it went up. The hunter launch test now drives the launch through `stepDuel`. A new test sets up exactly the refused case (enemy Weapons 1, shields 0; the crew's full charge locked on Weapons is released that tick) and asserts Weapons 2, no enemy missile, and `lastLaunch` unchanged. Task 3's interface text states the new rule.

## R1-F2 [P1]: Give pursuit steering a deterministic turn when the target is directly behind

Confirmed. `sideOf` is a cross-product sign, 0 both dead ahead and dead astern, so a lead point or trail point exactly behind gave no turn (and, for the ship, no thrust). The new exported `pursuitTurn(heading, dx, dy)` returns `sideOf`, except +1 (clockwise) when the cross product is 0 and the dot product is negative. Ship pursuit and missile steering both use it; threat avoidance keeps its own rule. New test: an enemy facing west with the crew due east gets `{ turn: 1, thrust: 0 }`; a missile pointing north with the trail due south steers 1; `pursuitTurn` dead ahead is 0.

## R1-F3 [P1]: Expire missiles at the end of their 480th flight tick

Confirmed. `flyMissile` incremented `age` and expired on `age > 480` before moving, so a missile lived into a 481st call and the laser stayed frozen one tick longer. As the finding says, changing that to `>=` would drop the 480th move. `flyMissile` now only moves. `resolveMissiles` ends, as `'expired'`, any missile still alive with `age >= MISSILE_LIFE_TICKS` after all contacts. `stepDuel` runs that before the weapon clocks, so the laser unfreezes on the same tick. Thrust still applies while `age <= 360`. New tests: an eastbound missile at age 359 gains at least `MISSILE_THRUST · DT` on tick 360 and only gravity (under 0.2 u/s) on tick 361; a missile at age 478 in open space is alive after tick 479 and gone at the end of tick 480, with the `expired` event and `missilesLost` 1. The old combined turn-and-expire test is now a turn-only test.

## R1-F4 [P2]: Test the resumed full-charge hold timer without a fresh press

Confirmed: no test covered decision 4's central case. New missiles test: charge to full and hold for 100 ticks; launch, so charge and hold freeze for 50 ticks at (full, 100) with `fireHeld` false; the missile hits the planet and the hold resumes that tick (101); after the remaining ticks it is at 179, then vents to (0, 0) on the 180th; 60 more ticks with no press leave the charge at 0.

## Also changed

- Task 2 and Task 3 expected counts: 11 missile tests, 15 hunter and duel tests.

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0b-combat.md

<!-- end -->

---

# Round 2 (delta, reviewing c8ead31, effort medium, 54 s, 200375 in / 147840 cached / 1663 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 Complete the expiry regression assertions requested in R1-F3
The implementation fixes expiry, but the new test does not verify the final movement or same-tick laser unfreezing promised by its title. · plan L678–690 starts with an uncharged laser and asserts only age, missile removal, ending cause, and missilesLost. It never checks position or laser clocks. · The test would still pass if expiry skipped the final movement or occurred after weapon clocks. These were explicit regression cases requested in R1-F3. · Initialize a full laser charge with a nonzero hold timer. Assert the timer remains frozen on tick 479 and advances on tick 480. Give the missile a known velocity and assert its final position or expiry-event coordinates include tick 480's movement.

## Prior findings
- R1-F1: resolved — plan L1291–1293 starts cooldown only when missilesLaunched increases; L1089–1097 covers a crew hit invalidating the proposed launch.
- R1-F2: resolved — plan L1195–1197 distinguishes astern using the dot product, and L1246/L1253 apply it to both pursuits. L1033–1042 tests ship astern, missile astern, and dead ahead.
- R1-F3: still open — The implementation is corrected: plan L830–837 performs movement, L874 expires survivors after contacts, and L1297–1298 orders expiry before weapon clocks. The remaining issue is P2 test coverage: L678–690 does not assert final movement or laser unfreezing.
- R1-F4: resolved — plan L749–766 verifies full charge and hold=100 remain frozen, resume at 101 without a press, vent at 180, and do not recharge. The loop bounds match tickWeapons at L964–966.

## Verified
- HEAD is c8ead31; inspected the current affected plan sections and supporting spec passages.
- Fuel applies through age 360 at plan L835; survivor expiry at L874 implements spec L147's 480-tick lifetime.
- Changed simulation expressions introduce no forbidden Math operations, platform globals, or imports under tests/helpers/determinismGuard.ts:L3–37.
- The revised step retains the H-0c integration boundary stated at plan L1273–1274 and L1331.

## Not verified
- Did not execute the embedded implementation, typecheck, or tests in this read-only review; the responder's execution claims were not independently reproduced.
- The on-disk ledger could not be read because access was denied; used the supplied ledger and response.
- Unchanged material was not re-reviewed beyond dependencies needed to assess the four fixes.

---

# Round 2 response (plan revised)

Reviewed `round-2.json` against the subject at `c8ead31`. 1 accepted (P2), 0 rejected, 0 deferred. Codex confirmed R1-F1, R1-F2 and R1-F4 resolved, and confirmed R1-F3's code fix. R1-F3's test coverage is the same point as R2-F1, and both are fixed here.

## R2-F1 [P2]: Complete the expiry regression assertions requested in R1-F3 (with R1-F3)

Confirmed. The test checked only age, removal, the cause and `missilesLost`, so it would not catch a missile that stopped moving on its last tick or a laser that unfroze a tick late. The test now gives the missile `vx` 60 in open space and gives the crew a frozen full charge (hold 50). On tick 479 the hold stays 50 and the missile is alive. On tick 480 the missile is removed, its `expired` event's `x` is more than 0.9 past its tick-479 `x` (the 480th move happened before expiry), and the hold is 51 (the laser unfroze that same tick). Re-checked by applying the plan task by task to a fresh worktree of master: each task typechecks and passes (137, 162, 179).

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0b-combat.md

<!-- end -->

---

