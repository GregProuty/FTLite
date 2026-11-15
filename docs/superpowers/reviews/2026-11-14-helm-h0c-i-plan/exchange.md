# Codex review exchange: helm-h0c-i-plan

Subject: `docs/superpowers/plans/2026-11-14-helm-h0c-i-duel-step.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: Claude.

---

# Round 1 (full, reviewing 060fd85, effort high, 307 s, 1667238 in / 1532800 cached / 9967 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Resolve the contradiction between envelope order and weapon execution order
The tick promises commands apply in envelope order, but folding them into ShipInput loses ordering between command kinds. With a full held laser, missileLaunch followed by laserCharge(false) reports both applied and fires the laser before launching. · plan L1785 promises input order; plan L1819–L1822 validates against unchanged tactical state and folds commands; plan L1159–L1169 executes lock, charge/release, then launch. The reused handler has the same ordering at src/renderer/src/sim/tactical/weapons.ts:L64–L74. spec L158–L159 describes launch freezing the laser and subsequent charge commands being rejected. · Command acknowledgements and combat effects do not follow the promised ordering. The last-wins decision for commands of one kind does not explain reordering different kinds. · Specify and implement cross-kind ordering explicitly. Preserve envelope order after same-kind coalescing, or state and justify the canonical-order deviation. Add tests for both launch/release orders and both lock/release orders, checking results and effects.

### [P1] R1-F2 Make the Missile key guard inspect a production-created missile
The new Missile key guard checks a handwritten object against its own handwritten keys. It does not inspect the missile produced by the launcher. · plan L834–L836 assigns a literal to launched.missiles[0] immediately before checking its keys. Production construction is at plan L1205–L1212 and src/renderer/src/sim/tactical/missiles.ts:L15–L22. · This passes independently of the production constructor and can miss newly initialized optional fields. It therefore does not provide the runtime field guard claimed by plan L21 and L35. · Create the missile through launchMissile or applyWeaponsInput, then assert its keys against the flatten inventory. Keep the existing flattened-length assertion.

### [P2] R1-F3 Dispose the interior when duel construction fails
createDuel allocates an interior before validating the tactical map and repair points, then throws without disposing that interior. · plan L1697 allocates the interior; plan L1700, L1705 and L1708 can subsequently throw. src/renderer/src/sim/state.ts:L72–L84 establishes shared entity allocation and component cleanup; L92–L100 provides disposeSimState. · A rejected seed or layout leaves allocated entity IDs and module-level component cells behind, and the caller receives no state it can dispose. · Wrap post-allocation construction in try/catch, call disposeSimState(interior) on failure, and rethrow. Validate the tactical map before allocating the interior where practical.

## Verified
- Reviewed the plan at commit 46c8c8d. Current master is 060fd854; git diff showed no committed differences in the relevant sim, intent, contracts or spec files.
- Consumed interior interfaces exist with the assumed signatures: createSimState at state.ts:L106, sitDown at stations.ts:L31, interaction and console handlers at commands.ts:L42 and L87, movementSystem at movement.ts:L57, and inReachOfTile at interact.ts:L35. Contract shapes match plan L1643–L1656 and L1749–L1751 (net/contracts.ts:L31–L34, L67–L75).
- Scratch reset matches the sector reset (plan L1740–L1745; sim/step.ts:L34–L36). The stand handler calls shedPower, but Cutter allocations total 9 against capacity 10, so it is inert in this setup (commands.ts:L94; power.ts:L62–L75; cutter.json:L468–L530; sim/tuning.ts:L49).
- Module-level Position, Seated and Life arrays are isolated across live interiors through SHARED_ENTITY_INDEX; crew starts conscious (state.ts:L72–L78, L108, L150–L158).
- Repair uses the correct room and tile-square reach predicates, whole-unit solo/team rates, retained progress, and completion reset (plan L1624–L1632, L1764–L1777; spec L185–L190; interact.ts:L28–L36). Weapons console position is already within reach of its repair point (cutter.json:L488–L493).
- The main phase sequence, post-seat tactical admission, thrust = -moveY, repair before movement, and synchronized tick advancement match the stated design (plan L1794–L1835; spec L271–L282).
- Standoff uses current position within 320, relative closing speed above 40, reverse thrust, and avoidance precedence (plan L1341–L1353; spec L202). Pursuit tests are moved to 500-unit separation (plan L528 and L546).
- Task 1 precedes its Task 2 consumers. Tactical replacements preserve existing behavior except the listed changes; cloneTactical copies mutable nested state (plan L1064–L1077). Static inspection found no forbidden operations or imports under the actual guard rules (tests/helpers/determinismGuard.ts:L3–L40; tests/boundary.test.ts:L25–L27).

## Not verified
- No test suite or TypeScript compiler was run. Test pass claims, the ram-count threshold, and strict compilation remain unverified; inspection was static apart from an isolated JavaScript probe of command folding.
- The review directory was inaccessible/unavailable, and ledger.md does not exist at 46c8c8d. No awaited IDs were supplied, so prior is empty. No exchange files were written.
- Expanded beyond the reading manifest to inspect sim/power.ts, selected sim/tuning.ts constants, the determinism guard and boundary test, spec §7, and tactical-test references. These reads checked stand side effects, reach, guard compliance, weapon ordering and affected expectations.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at the brief commit. 3 accepted (2 P1, 1 P2), 0 rejected, 0 deferred. No prior IDs (round 1). Checked by applying the plan task by task to a fresh worktree of master: each task typechecks and passes (188, then 209 tests).

## R1-F1 [P1]: Resolve the contradiction between envelope order and weapon execution order

Confirmed. `stepDuelTick` folded the commands into one `ShipInput`, and `applyWeaponsInput` (`tactical/weapons.ts:L64-L74`) applies lock, then charge or release, then launch. So "launch, then release" was admitted against the old state and reported both applied, yet the laser fired before the launch. The tick now admits weapon commands in that same fixed order: it walks `WEAPON_ORDER = ['laserLock', 'laserCharge', 'missileLaunch']`, with envelope order kept within a kind and the last accepted command winning. Each result therefore matches what happens. Decision 3 states this as a deliberate exception to "commands apply in envelope order": a launch and a release in the same tick both apply, the release firing first. New duel test `weapon commands take effect lock, then charge, then launch, whatever their envelope order`. For both envelope orders of launch and release, both are applied and the result is one shot and one launch. For both orders of lock and release, with the enemy dead ahead and its shields down, the shot damages the newly locked Engines room. Mutation check: reverting to plain envelope order makes the test fail.

## R1-F2 [P1]: Make the Missile key guard inspect a production-created missile

Confirmed: it compared a hand-written literal with itself. The guard now creates the missile with `launchMissile(launched, 0)` and checks that missile's keys against the list `MISSILE_SLOT` flattens.

## R1-F3 [P2]: Dispose the interior when duel construction fails

Confirmed. `disposeSimState` exists (`sim/state.ts:L93`), and `createDuel` could throw after `createSimState` without calling it. It now builds and validates the tactical map before allocating the interior. The rest of construction runs in `try`, and a failure calls `disposeSimState(interior)` and rethrows. The interface text says so. A test for the missing-role-console throw was tried and dropped: `parseShip` rejects any layout without exactly one station per kind ("expected exactly 7 stations, one per kind"), so that path is defensive only. The interface text says so too.

## Also changed

- Task 2 expected count: 16 duel tests.

## Files changed

- docs/superpowers/plans/2026-11-14-helm-h0c-i-duel-step.md

<!-- end -->

---

