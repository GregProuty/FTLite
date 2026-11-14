# Codex review exchange: helm-h0a-plan

Subject: `docs/superpowers/plans/2026-11-14-helm-h0a-flight-sim.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 0fdd1e3, effort high, 261 s, 558942 in / 501760 cached / 8967 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Stabilise cancels gravity applied during the same tick
flyShip applies gravity to velocity before computing stabilise, allowing the assist to erase gravity's sideways contribution completely. · plan L743-L752 updates velocity from gravity before removing sideways velocity; spec L125 explicitly says stabilise never cancels gravity. Evaluating the supplied code with DEFAULT_FLIGHT, position (1200, 0), zero velocity, heading 0 and released axes leaves both position and velocity unchanged after one tick. · An idle ship can hover against gravity instead of falling. The existing stabilise tests disable gravity, so they cannot detect this contradiction. · Compute the stabilise correction from incoming velocity before adding gravity and edge increments, then apply drag and update position. Add a gravity-enabled regression proving that stabilise preserves the tick's gravitational acceleration.

### [P1] R1-F2 Mixed contacts resolve in a different body order from the spec
resolveContacts handles static contacts for both ships before resolving their moving contact. The spec requires static then moving contacts for each body in crew/enemy order. The plan discloses an asteroid-order change, but not this change. · plan L908-L915 places shipShip after the complete ships loop; spec L74-L86 requires per-body static contacts followed by moving contacts. plan L38 only explains replacing broad-phase cell order with asteroid index order. · Collision corrections do not commute. With an asteroid at (600, 0), radius 20, and stationary ships at (545, 0) and (580, 0), the supplied resolver ends at x=532.5 and x=572.5. It resolves the enemy's asteroid contact before the crew's ship contact, changing subsequent corrections and leaving the enemy overlapping that asteroid. · Resolve the crew's static contacts and ship–ship pair before the enemy's static contacts, preventing duplicate pair resolution. Add a mixed static/moving-contact test that asserts the specified sequence and resulting positions.

### [P2] R1-F3 The Engines-factor test never checks damaged turn rate
The test named 'scales thrust and turn' checks only velocity magnitude. Turn assertions elsewhere cover only undamaged Engines. · plan L627-L633 asserts thrust magnitude without inspecting heading or headingAcc; plan L612-L618 tests turning with healthy rooms. spec L109 requires Engines damage to scale both thrust and turn. · An in-memory mutation removing the Engines factor from plan L738 still passed all 31 planned test assertions. · For damage levels 0, 1 and 2, assert accumulated rotation over multiple ticks using heading plus headingAcc against TURN_STEPS_PER_TICK multiplied by elapsed ticks and the expected factor.

## Verified
- The checkout is master at 0fdd1e3; git diff against 3fc7999 showed no changes to the subject, spec or listed dependencies.
- Consumed repository interfaces exist with the assumed signatures: src/shared/rng.ts:L2-L21, src/shared/hash.ts:L3, and src/renderer/src/sim/tuning.ts:L2-L3. Script dependencies and test discovery match package.json:L9-L26 and vitest.config.ts:L6.
- Task dependencies are ordered correctly by inspection. Task 3's physics has no premature contacts import (plan L714-L763); Task 4 supplies the import and replacement stepFlight together (plan L921-L935).
- All 31 planned test assertions passed in a custom in-memory harness using the extracted code and repository RNG/hash helpers: 22 before contacts and nine additional assertions-based tests after Tasks 4–5. This was not a Vitest or TypeScript compiler run.
- The heading generator guarantees the tested rotational symmetry, produces the stated 0.024541228522912288 literal, and had maximum unit-length error 1.11e-16 (plan L210-L246). All 200 seeded-map validations passed (plan L308-L309).
- Zero-distance static and ship–ship contacts remained finite; planet-centre contact pushed to (0, -90). Valid dirBetween interpolation remained finite, and synthetic grid-corner queries returned their asteroid (plan L263-L267, L501-L522, L878-L895).
- Manual guard inspection found no forbidden constructs in the proposed sim modules; generator trigonometry stays outside the guarded graph (plan L202-L228; tests/boundary.test.ts:L12-L27; tests/helpers/determinismGuard.ts:L3-L41).
- flattenTactical includes RNG state, fractional headings, rooms, grace timers and counters, and canonicalises negative zero. Map/grid omission is coherent under the stated seed-derived, unchanged-map invariant (plan L41, L1040-L1046).
- The flight/combat milestone split follows spec L301-L306 and explicitly defers authority integration, golden replay and SIM_VERSION changes (plan L15-L20, L1115-L1116).

## Not verified
- Strict TypeScript compilation, actual Vitest execution and AST-guard execution were not performed. The proposed files do not exist as implementation files, scratch writes are unavailable in this read-only sandbox, and node_modules inspection was prohibited. In-memory type stripping does not prove type correctness.
- The requested review ledger is absent both from the checkout and commit 3fc7999. No awaited finding IDs were supplied, so prior is empty.
- Cross-platform execution and map validity beyond the specified 200 seeds were not verified.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `0fdd1e3`. 3 accepted (2 P1, 1 P2), 0 rejected, 0 deferred. No prior IDs (round 1). After the fixes, the revised plan was extracted task by task into a scratch worktree, and after each task the typecheck and the tactical and boundary tests passed (83, 90, 106, 112, then 119 tests).

## R1-F1 [P1]: Stabilise cancels gravity applied during the same tick

Confirmed, and the problem is wider than the finding. Cancelling all sideways velocity each tick erases gravity whenever its pull is sideways to the nose. A released ship flying nose-forward in orbit would stop orbiting, against spec §6 ("still coasts, falls and orbits"). Moving stabilise before the forces, as suggested, only delays that by a tick: next tick's stabilise would cancel the previous tick's gravity. The fix changes the mechanic. On the tick both axes go to zero, `flyShip` records the sideways speed as `skidBudget`, with its side in `skidSign`, and removes up to `STABILISE · dt` of it per tick, along the fixed perpendicular, until the budget is spent. It runs before this tick's forces, and sideways speed added later is never recorded. `Ship` gains `released`, `skidBudget` and `skidSign` (initialised in `shipAt`, flattened in `hash.ts`). New Task 3 tests: a released ship at rest at r = 1200 still falls on its first tick; a released ship nose-forward in a circular orbit stays within 2% for 60 s with stabilise on; only the captured skid is removed, and a later sideways push is not. The spec §6 Stabilise row is amended to match, with a change-log entry, and the plan records it as decision 6. The existing 60 u/s skid test still passes.

## R1-F2 [P1]: Mixed contacts resolve in a different body order from the spec

Confirmed. Spec §4 orders contacts per body: static contacts, then the other moving bodies. `resolveContacts` ran both ships' statics before the pair. It now runs ship 0's statics, then the ship pair (once), then ship 1's statics, through a new `hitStatics` helper. New Task 4 test: ship 1 sits 1 unit clear of the planet, and ship 0 overlaps it by 5. The pair push moves ship 1 into the planet, and its own planet contact then pushes it out; under the old order it would end inside. Recorded as plan decision 7.

## R1-F3 [P2]: The Engines-factor test never checks damaged turn rate

Confirmed. The test checked only the thrust magnitude. It now also turns for 60 ticks at each Engines level and asserts `heading + headingAcc` equals `TURN_STEPS_PER_TICK × 60 × factor`.

## Also changed

- Task 3 and Task 4 expected counts: 14 flight tests, 5 contact tests.

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0a-flight-sim.md
- docs/superpowers/specs/2026-11-14-helm-demo-design.md

<!-- end -->

---

