# Codex review exchange: helm-h0b-impl

Subject: `src/renderer/src/sim/tactical/duel.ts src/renderer/src/sim/tactical/geometry.ts src/renderer/src/sim/tactical/hash.ts src/renderer/src/sim/tactical/hunter.ts src/renderer/src/sim/tactical/missiles.ts src/renderer/src/sim/tactical/state.ts src/renderer/src/sim/tactical/tuning.ts src/renderer/src/sim/tactical/weapons.ts tests/tacticalDeterminism.test.ts tests/tacticalGeometry.test.ts tests/tacticalHunter.test.ts tests/tacticalMissiles.test.ts tests/tacticalWeapons.test.ts` (impl). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing bc9dd45, effort high, 256 s, 886250 in / 807808 cached / 8755 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Make the laser occlusion test reach the line-of-sight check
The purported blocked-laser case passes because the target is out of range, so it does not exercise laser occlusion. · tests/tacticalWeapons.test.ts:72 places ships 600 units apart. src/renderer/src/sim/tactical/weapons.ts:41 rejects distances above 450 before evaluating lineOfSight at L42. Removing that lineOfSight call in memory left all 52 test bodies passing under the Node assertion harness. Spec L140 requires occlusion. · The geometry tests verify the helper, but cannot detect the laser firing through obstacles because its caller stops using that helper. · Use an in-range, in-arc blocked fixture, such as ships at (-200, 0) and (200, 0), and release a full charge. Assert a miss and unchanged target damage; include an asteroid-blocked case.

### [P1] R1-F2 Test shield-clock preservation with nonzero progress
The level-2 shield test freezes an already-zero clock and never checks repair resumption, so resetting instead of preserving progress passes. · tests/tacticalWeapons.test.ts:118 reaches two layers, then L119 disables recharge without giving the clock nonzero progress; L121 consequently captures zero. src/renderer/src/sim/tactical/weapons.ts:86-L87 implements the behavior required by spec L101. An in-memory mutation resetting shieldClock whenever Shields is level 2 left all 52 test bodies passing. · Losing accumulated recharge during damage or repair violates an explicit state-preservation rule and would escape the current regression tests. · Accumulate nonzero recharge before setting Shields to level 2, assert that exact value throughout the freeze, then repair to level 1 and verify resumed increments and the exact layer-completion tick.

### [P1] R1-F3 Exercise the hunter's temporal and RNG invariants
The hunter tests do not establish their claimed lead time, 18-tick history delay, or single jitter draw. · tests/tacticalHunter.test.ts:12-L13 gives the lead test stationary ships; L93 fills every trail entry identically; L61 checks only that RNG changed. The relevant implementation is src/renderer/src/sim/tactical/hunter.ts:58-L59, L69 and L82. Independently removing the velocity lead, reading the newest trail slot, or adding an extra nextInt draw left all 52 test bodies passing in the in-memory harness. Spec L201-L202 requires all three invariants. · These regressions change pursuit behavior and the deterministic RNG sequence while preserving every current assertion. · Use a moving target whose lead changes the expected steering; feed distinguishable positions through multiple ring-buffer wraps and assert the exact 18-tick delay; compare RNG state against exactly one nextInt call and assert no further draws while a release remains scheduled. Cover cancellation and rescheduling.

## Verified
- Implementation and tests match requested commit 4fac7ec; current HEAD bc9dd45 adds only review metadata. No files were modified.
- npx tsc --noEmit succeeded. Both referenced projects also passed explicit checks with --noEmit --composite false --incremental false --emitDeclarationOnly false.
- All 52 test bodies in the five manifested test files passed an in-memory Node assertion harness. The actual deterministicViolations helper passed all eight changed sim files (tests/helpers/determinismGuard.ts:20).
- Weapons transition rows and command-before-movement ordering were traced through weapons.ts:61, weapons.ts:80 and duel.ts:18. Missile contacts and expiry precede weapon clocks at duel.ts:25-L26.
- Missile contact precedence, shield bypass, room selection, age-60 exemption and end-of-tick-480 expiry match the accepted rules (missiles.ts:36, L53, L62-L80). Direct probes confirmed immunity at age 60 and self-hit at age 61.
- Direct probes confirmed in-range planet occlusion, preservation and resumption of nonzero shield progress, and the hunter's 18-tick trail across wraps (weapons.ts:42, L87; hunter.ts:58-L59).
- Hunter repair priority, console attendance, dead-astern turn, lock selection and cooldown after an actual launch match the specified behavior (hunter.ts:20, L37-L52, L62, L76; duel.ts:19-L21).
- All seven current Missile fields affect the hash; Ship and Hunter fields are represented, with events deliberately excluded (state.ts:34; hash.ts:12-L28). Across 59,013 paired ticks over ten seeds, flattened states matched and inspected dynamic scalars remained finite and free of negative zero.

## Not verified
- Actual Vitest execution was blocked by spawn EPERM during configuration loading. A native-loader retry failed on extensionless build/contentDigest resolution. The Node harness does not establish Vitest runner integration.
- Cross-runtime bitwise replay compatibility was not tested; deterministic execution checks used one Node runtime.
- The review directory and ledger were absent, so prior review history could not be inspected. No awaited finding IDs were supplied.
- Read package.json, tsconfig.json, tsconfig.web.json, tsconfig.node.json and vitest.config.ts beyond the manifest to establish typecheck scope and diagnose test startup. package.json defines no lint command; no broader lint-config search was performed.
- sed failed under the sandbox; line-numbered PowerShell range reads were used instead.

---

# Round 1 response (tests strengthened; no production code changed)

Reviewed `round-1.json` against the subject at `bc9dd45`. 3 accepted, 0 rejected, 0 deferred. No prior IDs (round 1). All three findings were test-adequacy gaps backed by in-memory mutations; the implementation was already right, so only test files changed. Each fix was checked by re-running Codex's mutations, and two more of mine, against the new tests: every mutation now fails. Verify: `npm run typecheck` exit 0; `npm test` 138 files passed (1 skipped), 1,785 tests passed.

## R1-F1 [P1]: Make the laser occlusion test reach the line-of-sight check

Confirmed. The planet case put the ships 600 apart, so `laserEligible` returned on range (`weapons.ts:41`) before reaching `lineOfSight` (L42). The new test `a release in range and arc misses when the planet or an asteroid blocks the line of sight` places the ships 400 apart along x with the blocker centred between them: the planet, then asteroid 0. It asserts `lineOfSight` false, `inArc` true and distance ≤ `LASER_RANGE`, so only occlusion can cause the miss. It then releases a full charge and asserts shots 1, hits 0, the target's shields and hull unchanged, and a `laser` event with `hit: false`. The old test keeps its arc and range cases. Mutation check: removing `lineOfSight` from `laserEligible` now fails this test.

## R1-F2 [P1]: Test shield-clock preservation with nonzero progress

Confirmed. The level-2 case froze a clock that was already 0. The new test `Shields level 2 holds a part-charged clock exactly, and repair to level 1 resumes it to the exact tick` charges the clock to 450 of 900 (150 ticks at 3), sets Shields to level 2, and asserts 450 on every one of 600 ticks. It then repairs to level 1 and asserts shields 1 with clock 898 after 224 ticks, and shields 2 with clock 0 on tick 225. The old recharge test is retitled to cover only the rates. Mutation check: resetting the clock whenever Shields is at level 2 now fails.

## R1-F3 [P1]: Exercise the hunter's temporal and RNG invariants

Confirmed. Three new tests in `tacticalHunter.test.ts`:
- **Lead:** the crew is dead ahead of the west-facing enemy but moving south at 600 u/s, so the 0.5 s lead point is south-west and the turn is −1. Moving north gives +1. Without the lead the turn would be 0.
- **Trail delay:** with the enemy's missile pointing north, the crew alternates 18 calls east and 18 calls west of the missile for 72 calls (four wraps of the ring buffer). Steering on calls 18–35, 36–53 and 54–71 is exactly +1, −1 and +1, which is the position from exactly 18 calls earlier.
- **One draw:** the rng seed is chosen so the first jitter is at least 3 ticks, and `state.rng` is compared with a reference stream advanced by exactly one `nextInt(13)`. Scheduling takes exactly one draw and sets `fireAt = tick + j`; waiting takes none. Moving the crew out of arc cancels (`fireAt` −1, no draw); moving back takes exactly one more draw; the release then comes on the scheduled tick with no further draws.

Mutation check: removing the velocity lead, reading the newest trail slot, an extra draw when scheduling, and a draw while waiting each make these tests fail.

## Also changed

- (nothing)

## Files changed

- tests/tacticalWeapons.test.ts
- tests/tacticalHunter.test.ts

<!-- end -->

---

