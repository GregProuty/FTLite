# Round 1 response (plan revised to rev after the W-4b brief commit)

Reviewed `round-1.json` against the subject at the brief commit. 9 accepted, 0 rejected, 0 deferred. Round 1 has no prior IDs.

## R1-F1 [P1]: Decision 4 makes the AUTO pew fire a three-round burst

Confirmed: state.ts L230 starts the pew full, and spec §4.3 says "it never bursts". I took the reviewer's stateless rule.
- Decision 4 is rewritten.
- New `pewAutoReady(state, i)` in pew.ts: `pewReady` and either a full charge, or `pewCharge % pewThird < pewGain`.
- `applyWeaponsInput`'s AUTO branch calls it.
- Task 6's first test expects one round from full and then a gap of `PEW_RECHARGE_TICKS` between every round, `at[1] - at[0]` included.
- A `pewAutoReady` unit case pins full, a third just completed, mid-third, and under a third.

## R1-F2 [P1]: The pew's solution at bearing 40 is 42×256

Confirmed: pew.ts L67-L70 takes the lead from the muzzle, 21 u ahead. The test now asserts `turretOffset(0, pewLead(st, 0, e.x, e.y, 0, 0))`, and a comment explains the parallax. `turretOffset` and `pewLead` are already imported there.

## R1-F3 [P1]: Task 6 turns AUTO-trigger tests red with no rewrite named

Confirmed. Task 6 Step 4 now names three kind (a) rewrites:
- **w4PewFire:** the admission case and the gunHeld case set MAN.
- **w4Autocannon:** the interval, aim, cooldown, six-hits and 0-bar cases use `tickGun(st, 0, IDLE_INPUT, true)`, so W-4a's AUTO-row numbers stand. The heat-and-lock case sets MAN and re-pins its interval to the MAN row.
- **Task 4's round test:** uses `auto = true`.

All three files are in Task 6's Files.

## R1-F4 [P1]: Task 5 gates LMB and gunHeld on MAN and turns W-4a's tests red

Confirmed:
- **w4Runtime:** W-4a's LMB case and its held-trigger case press `weaponMode` first, and the laser-fit case's press is renamed.
- **onlineDuelSession:** W-4a's online Hound cases (1) and (2) press Z first.
- Both files are in Step 9's run list and the commit.

## R1-F5 [P1]: `turret` is missing from the DuelRuntime interface

Confirmed: runtime.ts L204-L254 declares every returned member. Task 7 now adds `turret(slot: 0 | 1): number;` to `interface DuelRuntime`. The same gap existed in W-4a for `weaponSel`; it is fixed in the W-4a plan (7285fc65), so W-4b has no conditional.

## R1-F6 [P2]: The W-4b/W-4c seam

Confirmed. A new "Seam for W-4c" section gives the exact shapes:
- `turret(slot)` delegating to `predictTurret`, with W-4c's gate at the `k` argument;
- the MAN branch inside `for (const gun of ['pew', 'gun'] as const)`, with W-4c's guard a `continue`;
- the `pewFire` AUTO refusal;
- the crew literal;
- the post-Task-5 `sessionHeld` call.

The W-4c plan is amended to match (c8ef8826): its grep, the MAN guard, `turret(1)`, `triggerNow()`, the `sessionHeld` text and the `k` gate.

## R1-F7 [P2]: Task 10's kept rung and the `1 | 2` knob

Confirmed. Task 10 Step 3 now names each kept rung's test updates:
- rung 2's `w4Loadout` range pin;
- rung 4's first-tick commands and `[0, 2, 1]`.

The knob is now declared `= 1 as 1 | 2`.

## R1-F8 [P2]: Outline test bodies and check-at-execution notes

Confirmed. These are now written in full:
- Task 8's `w4Map.test.ts`, on pewViews' `input()` rig: the arc halves, the muzzle angles and lengths, the reticle, the bracket live and hold cases, MAN, the Helm map and the laser fit.
- Task 5's runtime cases, on W-4a's rig plus a `reticleAim` dep, and its three online cases.
- Task 7's online prediction case.
- Task 9's four UI cases.

Two hedges are resolved:
- Task 3's noop hedge: the shape is `step.ts` L317, L322.
- Task 8's `enemyShown` hedge: it is declared at `weaponsModel.ts` L202.

## R1-F9 [P3]: Stale trigger-closure notes

Confirmed: W-4a declares `triggerNow`. Task 5 now quotes W-4a's exact `sessionHeld` line, the closure paragraph states the fact instead of a conditional, and the stale self-review bullet is gone.

## Also changed

- W-4a plan (7285fc65): `weaponSel(): number` is declared in `interface DuelRuntime`, so W-4a's Task 10 type-checks.
- W-4c plan (c8ef8826): anchors on W-4b's seam shapes (R1-F6).

## Files changed

- docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md

<!-- end -->
