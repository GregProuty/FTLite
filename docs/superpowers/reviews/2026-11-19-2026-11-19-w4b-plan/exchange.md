# Codex review exchange: 2026-11-19-w4b-plan

Subject: `docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 57784286, effort high, 768 s, 12615279 in / 12318264 cached / 69577 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Decision 4 makes the AUTO pew fire a three-round burst when every hold ends, which spec §4.3 rules out
Decision 4 lets an AUTO pew fire every stored third on consecutive on-solution ticks. The pew starts each round full (state.ts L230: `pewCharge: pew ? pewFullCharge(pew) : 0`), and tickPew keeps it full through the 30 s hold. So the AUTO pew's first act in every round is three rounds on ticks h, h+1 and h+2. This is not an edge case. Spec §4.3 states the result it requires: "So it fires each time a third has charged, and it never bursts." Reading that as "no deliberate burst rule" contradicts the spec. The codebase already calls rapid stored-thirds fire a burst: the Hunter's pewBurst, and hunter.ts L123 "after a burst it waits for every third". · plan L58 (Decision 4), L1197 (`else if (auto.pew && hostile) firePewTrigger`), L1056-1062 (the test pins the 3-round opener via `at.slice(3)`); spec L204-205; state.ts L230; pew.ts L41-44 (pewReady), L86-89 (tickPew to full); hunter.ts L123 · The spec is fixed and not reopened. As written, every duel opens with an AUTO pew burst at hold end. That changes the opener, the gates and the tuning ladder's baseline. · Use a stateless rule that meets both halves of the sentence. In applyWeaponsInput, AUTO fires when `auto.pew && hostile && (s.pewCharge >= pewFull(def) || s.pewCharge % pewThird(def) < pewGain(state, i))`. That is: the pew is full, or its last tickPew has just completed a third. From full it fires one round; the charge then sits at 2/3 + gain, and the next AUTO round comes when the next third completes, every PEW_TICKS_BY_BARS ticks. The AUTO gains 6/8/12/15 divide 360 exactly, so the modulo test is integer and exact. The simplest alternative is to fire only at a full charge (`pewCharge >= pewFull(def)`), which keeps two thirds in reserve. Record the choice as a corrected Decision 4. Rewrite Task 6's first test to expect one round at hold end, then a gap of PEW_RECHARGE_TICKS between every round, `at.slice(1)` included.

### [P1] R1-F2 Task 4 expects the pew's solution at bearing 40 to be 40×256, but the lead from the muzzle is heading 42
`autoSolution(st, 0, 'pew')` takes its lead from the muzzle, `muzzleForward` = SHIP_RADIUS + 1 = 21 ahead of the centre, not from the centre. The Hunter sits 300 u from the centre on heading 40 (56.25°). Relative to the muzzle it is at (forward 166.7 − 21, lateral 249.4) = 59.7°, which is 42.46 heading steps. nearestHeading returns 42, and 42×256 = 10752 lies inside the ±10922 arc. So the function returns 10752, and `expect(autoSolution(st, 0, 'pew')).toBe(40 * 256)` fails. The bearing-6 cases still pass: the muzzle-relative angle is 6.45 steps, which rounds to 6. · plan L615-617; pew.ts L67-70 (pewMuzzle), L150-156 (pewLead from the muzzle); defs.ts L99 (`muzzleForward: SHIP_RADIUS + 1`); tuning.ts L38 (SHIP_RADIUS 20); lead.ts L35-43 (nearestHeading) · A test written in the plan cannot pass. Task 4 Step 7 expects w4Turret to PASS. · Assert against the sim's own lead: `const e = st.ships[1]!; expect(autoSolution(st, 0, 'pew')).toBe(turretOffset(0, pewLead(st, 0, e.x, e.y, 0, 0)))`, which is 42 × 256. Or pin `42 * 256` with a comment on the muzzle parallax. Keep the `gun` null assertion: 10752 is outside ±5461.

### [P1] R1-F3 Task 6 turns every AUTO-trigger test red, including Task 4's own, with no rewrite named
After Task 6, a turret gun in AUTO ignores `gunHeld`, and every round starts in AUTO. These tests drive the Hound's autocannon with the held trigger in AUTO, and Task 6 Step 6 expects them to PASS:
- Task 4's 'a pew round and an autocannon round leave along them'. It calls `tickGun(st, 0, { ...IDLE_INPUT, gunHeld: true })` and then dereferences `st.rounds.find(...)!`, so it throws.
- All five `it`s of W-4a's tests/w4Autocannon.test.ts, which use `TRIGGER` on a default-AUTO Hound.
- W-4a's w4PewFire case 'on the Hound gunHeld fires the autocannon only with weaponSel 1'.
Task 6 Step 4 names only w4PewFire's admission test. Setting MAN is not a drop-in fix either: MAN switches to the MAN interval row (8/7/5/4), so W-4a's 10/8/6/5 assertions still fail. · plan L647-649, L1164 (`s.gunsManual ? input.gunHeld : auto && …`), L1216, L1281-1282; W-4a plan L557-633 (TRIGGER at L569, L584, L590, L594, L604, L609, L616, L619, L628), L1138-1147 · The tests go red with no rule. The executor will either set MAN everywhere, which breaks the AUTO-row intervals, or weaken the tests. · Name the kind (a) rewrites in Task 6, citing W-4 spec §4.3:
- w4Autocannon: the interval, rounds-along-aim, cooldown and six-hits tests call `tickGun(st, 0, IDLE_INPUT, true)`, which is AUTO on solution with the AUTO rows. The heats-and-locks test sets `s.gunsManual = true` and keeps TRIGGER, because only MAN can lock. The 0-bar case uses `auto = true` too.
- Task 4's round test sets `s.gunsManual = true` before `tickGun`, or passes `auto = true`.
- w4PewFire's gunHeld case sets `gunsManual = true`, or is deleted as superseded by Task 6's w4Manual case, named in the commit.
List all three files in Task 6's Files and commit.

### [P1] R1-F4 Task 5 gates LMB and gunHeld on MAN and so turns W-4a's runtime and online tests red; Step 9 says they pass
Task 5 makes both runtimes send `pewFire` and `gunHeld` only in MAN, and every round starts in AUTO. Several W-4a tests assert the old behaviour on a fresh rig:
- w4Runtime 'LMB: pewFire with pew pew selected …' expects `[sys.pewShots, statuses] = [1, ['applied']]` after a click.
- w4Runtime 'the held trigger sends gunHeld only with the autocannon selected, and a dead trigger refuses NO POWER' expects `gunHeld` true and the NO POWER refusal.
- The onlineDuelSession Hound case (1) expects `{ weaponSel: 1, gunHeld: true }`, and case (2) expects a `pewFire` and NO CHARGE.
Task 5 lists those files only for renames, and Step 9 expects all PASS. · plan L952-954, L976, L981, L998-999; W-4a plan L1905-1913, L1915-1926, L2108-2109 · The tests go red with no rule. The fallout rule requires each to be classified and rewritten, not left to whoever executes. · In Task 5, name these as kind (a) rewrites (W-4 spec §4.3, §9). Each gets `r.press('weaponMode'); r.tick();` online, or a Z key down/up and a pump, before its existing MAN assertions. The new W-4b `it`s keep the AUTO negatives. Add the files to Step 9's run list and the commit.

### [P1] R1-F5 Task 7 adds `turret` to createDuelRuntime's returned literal but not to the `DuelRuntime` interface, so tsc fails
`createDuelRuntime(deps): DuelRuntime` returns an object literal directly. TypeScript's excess-property check rejects any member that `DuelRuntime` does not declare, and the interface lists every returned member (thrMille L250, takeRefusals L252). Task 7 adds `turret: (slot: 0 | 1) => …` only to the literal and to `DuelViewSource`. · plan L1382; runtime.ts L204-254 (interface DuelRuntime), L269, L559 · Task 7 Step 5 `npx tsc -b` fails with TS2353. W-4a's `weaponSel` addition has the same shape, so the fix is the same. · In Task 7 Step 4, also add `/** W-4 spec §11: gun slot's turret offset (the sim's; no lag locally). */ turret(slot: 0 | 1): number;` to `interface DuelRuntime` in runtime.ts, beside W-4a's `weaponSel` if W-4a added it there.

### [P2] R1-F6 The W-4b/W-4c seam: W-4c anchors on `turret()`, a void-returning MAN branch and a trigger text that W-4b does not leave
W-4c's anchors do not match the shapes W-4b leaves:
1. W-4c greps for `turret()` in onlineSource.ts and stops if it is missing (W-4c L128-129). It calls `source.turret()` with no argument (L866), and adds its flight gate to onlineSource's own conjunction (L948). W-4b defines `turret(slot: 0 | 1)`, with the k = 0 gates inside `predictTurret` in weaponsSeat.ts. So the grep fails, `turret()` fails tsc, and the conjunction W-4c names does not exist. W-4c never mentions `predictTurret`.
2. W-4c inserts `if (sys.gunsManual && manualTorpedoFlying(state, i)) return;` as the MAN branch's first statement (L569). In W-4b the MAN branch sits inside the `for` over both guns, in a function returning `AutoOnSolution`, so a bare `return;` fails tsc. It must be `continue`, or `return out`.
3. W-4c L946 anchors on `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: requests.triggerHeld() })`. W-4a's text is `trigger: triggerNow()` (W-4a L2191), and W-4b Task 5 Step 6 changes it to `trigger: triggerNow() && (…), aim: reticleNow() ?? -1`. · plan L36, L784-785, L981, L1367-1375, L1393-1397; W-4c plan L128-129, L565-572, L866, L946, L948; W-4a plan L2191 · W-4c consumes these names. As written, W-4c's first check stops the run, and two of its edits do not compile or do not match. · Add a short "Seam for W-4c" block to W-4b giving the exact shapes:
- the online source's `turret(slot: 0 | 1)`, which delegates to `predictTurret(t, slot, held, manual, k)`; W-4c's flight gate is `k = manualTorpedoFlying(d.tactical) ? 0 : unackedFrames` at that call;
- the MAN branch `if (s.gunsManual) { … continue; … }` inside the per-gun loop, where W-4c's guard is `if (manualTorpedoFlying(state, i)) continue;`;
- the post-W-4b `sessionHeld` call text.
Then have the controller amend W-4c L128, L569, L866, L946 and L948 to match.

### [P2] R1-F7 Task 10: a kept rung turns pinned tests red with no rule, and the `1 | 2` knob may not compile
Three gaps in Task 10:
- Keeping rung 2 (`AUTOCANNON_AUTO_RANGE` 450) breaks W-4a's w4Loadout pin, `[…, AUTOCANNON_AUTO_RANGE, …]` toEqual `[…, 600, 800]`.
- Keeping rung 4 breaks Task 6's 'its first seated tick sends shipPower … then weaponPower Autocannon +1 … weaponPower [1, 1, 1]'. Task 10 updates only w4Loadout's hitsPerHull destructuring.
- `export const HOUND_GUNNER_AUTOCANNON_BARS: 1 | 2 = 1;` followed by `HOUND_GUNNER_AUTOCANNON_BARS === 2` is very likely rejected. TypeScript narrows a const by its initialiser, so the comparison of `1` with `2` fails with TS2367 at Step 1's `npx tsc -b`. · plan L35, L1651, L1657, L1668, L1681-1684, L1236-1243; W-4a plan L302 · Step 4 expects the fences and gates green, and the ladder's no-op step must compile. · Add a rule to Task 10 Step 3: for the setting kept, update the tests it pins. Rung 2 changes the w4Loadout pin to `AUTOCANNON_AUTO_RANGE`'s new value with a `// W-4b ladder: was 600` note. Rung 4 makes the first-tick test read the four commands and `[0, 2, 1]`. Both are kind (a), citing spec §12, and go in the commit. Declare the knob as `export const HOUND_GUNNER_AUTOCANNON_BARS = 1 as 1 | 2;` (or type it `number`) so the comparison type-checks.

### [P2] R1-F8 Outline test bodies and 'check at execution' notes are left for the executor
Task 8's six `it`s have comment-only bodies. An empty `it` passes, so Step 2's "Expected: FAIL" cannot happen, and one comment is garbled ("16384 / 4 (a quarter of the arc... use 2731)"). Tasks 5, 7 and 9 give their rig cases only in prose. Task 3 L470 leaves "check the noop's status string" to the executor; the code already answers it. `result(e, undefined, 'noop')` yields status `'noop'` (step.ts L317, L322), so Task 3's `toMatchObject({ status: 'noop' })` is right as written. · plan L1438-1451, L864-868, L886, L1350, L1575-1579, L470, L1781; step.ts L317, L322 · The plan's own placeholder rule and the brief both count outlines as defects. Outline bodies also break TDD. · Write Task 8's bodies out in full. On `createTacticalState(5)` with `combatModel({ …, console: 'weapons', weaponSel: 0, turrets: { pew: 2731, gun: -2731 } })`, assert:
- `turretArc.half` is `PEW_ARC_STEPS / AIM_STEPS * 2 * Math.PI`;
- `muzzles.map(m => m.selected)` is `[true, false]`;
- the first muzzle's `atan2(x2 − x1, −(y2 − y1))` is `headingAngle(own.h) + 2731 / AIM_STEPS * 2π`, and its length is `PEW_RANGE * zoom`;
- with `weaponSel: 2`, `turretArc` is null, as are `pewCone` and `pewAim`.
For the bracket, set `hostileAt` 0 or −1 and `pewTurret = autoSolution(st, 0, 'pew')!`, then expect `live` true or false. With `gunsManual` true, expect null. Helm gives 2 muzzles, both `selected` false, and a null arc, reticle and bracket; the laser fit gives no muzzles. Delete the Task 3 'check' sentence.

### [P3] R1-F9 The self-review's note on W-4a's trigger closure is stale, and Task 5 quotes a placeholder instead of W-4a's text
W-4a already reads the online trigger through `const triggerNow = (): boolean => requests.triggerHeld()` and calls `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() })`. The local runtime reads `deps.triggerHeld?.()`. Task 5 Step 6 quotes `trigger: <the trigger closure>()`, and the self-review says W-4a calls `requests.triggerHeld()` inside play and pump. · plan L906, L978-982, L1783; W-4a plan L2015, L2028, L2179, L2191 · The rule is to match every edit by the quoted text; a placeholder quote invites a mismatch. · Quote W-4a's exact line, `sessionHeld(k, d, me, steer, { sel: weaponSel, trigger: triggerNow() })`. Drop the conditional in Step 3 and the stale self-review bullet.

## Verified
- Task 1's hash edits match the code. The SYSTEMS_TAIL / FLAGS quotes match hash.ts L24-L27. `member` turns a FLAGS key into `flag()` (hash.ts L45; module.ts L32-L34). `validateTacticalValues(shape, values, offset)` is the argument order the plan uses (hash.ts L283). The replaced `rule` line matches L298 verbatim. `clsOf` is set from `cls` in SYSTEMS_HEAD before any tail key (L300), so `turretRule` and the gunsManual crew-and-turret check can read it.
- systemsFor and emptySystems anchors (`torpManual: false,   // W-3: and the torpedo too` and `torpManual: false,`) exist at state.ts L232 and L240; createTacticalState(seed, slots, crewClass) matches the tests' calls (state.ts L273).
- The Valkyrn digest's rebuilt array equals SIM 59's flattenTactical element for element. flattenModule only calls each field's `read` (module.ts L49-L53). flattenTactical only maps −0 to 0 (hash.ts L186-L190). The three new fields are appended inside each systems record and skipped by name. The test's other inputs (throttle, holdHeading, power, results) are untouched (tests/valkyrnIdentity.test.ts L29-L30).
- The slew law is integer-exact. turretOffset's intermediate is positive for aim 0..65535 and heading 0..255. The Task 1 vectors check out: turretOffset(0,65000)=−536, (255,100)=356, (64,16384)=0, turretWorldAim(255,400)=144. The arc-clamp loops reach ±arcSteps within 60 ticks (24 and 48 ticks).
- duelModules: 'gunMode' belongs after 'designate' in the sorted kinds list (tests/duelModules.test.ts L153). changedFirst turns gunsManual 0 into 1 and pewTurret/gunTurret into v+1, so 'every field changes the hash' and the clone test still hold (L61, L104-L124, L156-L170).
- gunMode admission follows spec §4.1. The loop's stale-tick and not-at-weapons checks come first (step.ts L311-L312), then unavailable via hasTurret, then malformed, then the noop, and it is set at once. The step's crew literal and pewFire block quotes match W-4a's (W-4a plan L1243-L1259).
- Hold timing: hostilityStep runs after every applyWeaponsInput and tickWeapons (duel.ts L34, L47-L48). enemyHostile read inside applyWeaponsInput therefore opens AUTO fire the tick after the hold ends (spec §4.3).
- The Hunter and Valkyrn fences hold. slewTurrets returns NONE for i ≠ CREW_SLOT and for classes without a turret. pewGain's non-crew early return stays first (pew.ts L34). tickGun's `turret === null` branch is equivalent to master's single condition (gun.ts L51-L52). The only hunter.ts change is the literal's `turretAim: -1` (hunter.ts L143). The Valkyrn pair's gunner keeps MISSILE_GAP; the ladder's knobs are Hound-only (scripted.ts L54, L347).
- AUTO autocannon heat: the stop check comes after cooling and before fireRound. With heatPerShot 50 and cool 4 it peaks below 850 and settles at about one round per 12.5 ticks, so the [78, 82] band over 1000 ticks is consistent and it never locks.
- gunLead uses only interceptTime and nearestHeading (lead.ts L10-L43) with the velocity relative to the Hound. That matches fireRound adding ship.vx/vy (gun.ts L30). No trig and no new randomness.
- predictTurret is the thrMille analogue. The k = 0 gates cover MAN, the sent selection, a turret, a bar, a reticle and a running round, and the seat is checked in onlineSource. The replica heading is held fixed. k comes from unackedFrames, which onlineDuel caps at UNACKED_MAX (onlineDuel.ts L64, L395). sentHeld carries turretAim (onlineSource.ts L208). gunModeBase is fed beside both throttleBase calls (onlineDuel.ts L366, L400).
- AUTO's target is the ship only: shipSeen, centre-to-centre range, the planet and live rocks via lineOfSight (geometry.ts L22-L32), and ±arcSteps. The test rigs' `st.rocks.fill(0)` clears the rocks lineOfSight reads.
- The renames are complete in src: aimLaser, laserAim() and resetLaserAim appear only in mapRequests.ts, duelMode.ts, scene.ts, runtime.ts and onlineDuel.ts. `p.laserMode` appears only in the two laser branches (runtime.ts L526, onlineDuel.ts L307), plus input.ts and controlsList.ts.
- The smoke's Z press goes before W-4a's `const before = …` sampling in step 5 (W-4a plan L2425), so MAN keeps the 2 s quiet check valid.
- Task 8's model block reads locals that exist before its insertion point: own, ownS, cls, z, enemyS, and enemyShown (weaponsModel.ts L155-L157, L202). ArcDraw has {x, y, r, angle, half} (L37).

## Not verified
- W-4a's executed code: its quotes were checked against the W-4a plan text, not a branch. W-4a's own excess-property problem with `weaponSel` on DuelRuntime is assumed fixed by its executor.
- Task 7's agreement rig assumes the seed-5 Hound's heading stays fixed over 30 idle ticks under the crew Helm. I did not trace helmTurn or flight for that seed.
- Whether seeds 1, 2 and 4 of Task 6's whole-duel scripted test can end inside the hold. That would give no hostile event and cause '', and the `['missile','clock']` assertion would fail.
- Whether a same-version `npm run bless` runs the duel oracle's `same` or `added` check. If it does, W-4b might need an ADDITIONS entry for the three fields; I did not read the bless script or blessGuard beyond its header.
- The duel app smoke's later steps (after step 5) were not read, to see whether any assumes AUTO guns after Z set MAN.
- tests/duelGates.test.ts per-seed outcomes and the ladder's results can only be known by running; the Jest/Vitest suite was not run.
- The test rigs in tests/w4Runtime.test.ts, onlineDuelSession.test.ts and w4Ui.test.tsx (W-4a's) were read only through the W-4a plan's descriptions.

---

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

---

# Round 2 (delta, reviewing 0f820aff, effort medium, 203 s, 2312072 in / 2216663 cached / 17284 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Task 7's new online prediction case assumes the replica's Hound faces heading 0, but the spawn heading depends on the seed
The case sends `reticle(8000)` and then expects `src().turret(0)` to be > 0 and either a multiple of 455 or exactly 8000. But `turretAim` is a world fine aim: `predictTurret` calls `slewTurret(v, t.ships[0].heading, aim, …)`. So the target offset is `turretOffset(heading, 8000)`, clamped to ±10922, and that equals 8000 only when the replica's Hound heading is 0. For most headings the offset is negative, or it is clamped, or it ends at a value that is neither 8000 nor a multiple of 455. · plan L1459-1475 (reticle(8000), `expect(p).toBeGreaterThan(0); expect(p % 455 === 0 || p === 8000)`), plan L1492-1499 (predictTurret slews about `t.ships[0].heading`); map.ts L57-59 (spawnAt: heading = (first + 64) % 256, prograde), L72-73 (`first = nextInt(rng, HEADING_COUNT)`); state.ts L283 (ships at map.spawns). · As written, the test can pass only by luck of seed 5's spawn heading, so Task 7 Step 6's expected PASS is not guaranteed. This is a test the executor cannot make pass as written. · Derive the reticle from the replica. Use `const h0 = c.state()!.tactical.ships[0].heading; const want = (h0 * 256 + 2000) % 65536;` and send `reticle(want)`. Then assert `p > 0 && p <= 2000 && (p % 455 === 0 || p === 2000)`. Alternatively, assert `p` equals `predictTurret(c.state()!.tactical, 0, { weaponSel: 0, turretAim: want }, true, k)` for the k the rig reached.

### [P2] R2-F2 Task 10's commit names tests/w4Auto.test.ts for rung 4, but the first-seated-tick test lives in tests/duelScripted.test.ts
The new rung-4 rule updates Task 6's 'its first seated tick sends shipPower …' case. Step 5's git add appends `<tests/w4Auto.test.ts if rung 4 is kept>`, but Task 6 puts that describe block in `tests/duelScripted.test.ts`, which the commit omits. · plan L1341-1345 (the case is in tests/duelScripted.test.ts); plan L1911 (rung 4 rule); plan L1926 (commit placeholder names w4Auto.test.ts) · If rung 4 is kept, the updated test would be left out of the tuning commit, and an unchanged file would be staged. · Change the placeholder to `<tests/duelScripted.test.ts if rung 4 is kept>`. Add `<tests/w4Loadout.test.ts if rung 2 is kept>` as well; it is already listed, so note that it changes only for rung 2.

### [P3] R2-F3 The w4Autocannon rewrite names the wrong lines: the interval case drives TRIGGER through gaps(), and the heat-lock case pins no interval
Task 6 Step 4 says the interval case calls `tickGun(st, 0, IDLE_INPUT, true)`. That case reaches tickGun only through the `gaps()` helper, which hard-codes `TRIGGER`. Step 4 also says to re-pin the heat-and-lock case's interval numbers to the MAN row, but that case asserts no interval. · plan L1323-1324; W-4a plan L567-571 (gaps uses TRIGGER), L587-600 (heat-and-lock case: heat, lock and cooling only) · The executor has to infer that `gaps()` itself changes, while the lock case, which needs TRIGGER in MAN, does not use `gaps()`. The re-pin instruction points at numbers that are not there. · Say that `gaps()` calls `tickGun(st, 0, IDLE_INPUT, true)`, along with the direct TRIGGER calls at W-4a L584, L604, L609, L616, L619 and L628. Say that the heat-and-lock case sets `s.gunsManual = true`, keeps TRIGGER and needs no re-pin.

### [P3] R2-F4 The self-review's Placeholders bullet is stale after R1-F8
The Self-review still says that the app-rig tests in Tasks 5, 7, 8 and 9 only name their assertions and the rig to copy. Those tests are now written in full. · plan L2008; compare plan L879-925, L945-972, L1459-1475, L1555-1636, L1759-1796 · It contradicts the revised tasks and could lead a reader to look for outlines that no longer exist. · Rewrite the bullet: every test body, sim and app, is written in full.

## Prior findings
- R1-F1: resolved — Decision 4 (L58-62) and pewAutoReady (L1284-1289) use pewFull, pewThird and pewGain. All three exist: pew.ts L21 and L31, defs.ts L104, and pew.ts already imports pewThird (L11). From full (1080) a shot leaves 720; then 726 % 360 = 6, which is not < 6, so the next round waits 60 ticks. The tests at L1143-1156 check out arithmetically.
- R1-F2: resolved — L630-631 asserts turretOffset(0, pewLead(st, 0, e.x, e.y, 0, 0)). pewLead is in the import list (L580) and turretOffset is in Task 1's import (L104).
- R1-F3: resolved — Task 6 Files (L1101) and Step 4 (L1322-1325) name all three files. The AUTO-row intervals hold under auto=true: at interval 5, 60 ticks gain about 360 heat, below the 800 stop (tuning.ts L171-174). There is a wording nit in a new P3.
- R1-F4: resolved — Kind (a) inserts are named for both w4Runtime cases (L881) and for the online cases (1) and (2) (L943). onlineDuelSession is in Step 9's run list and in the commit (L1084, L1090). The rig's methods (set, click, hold, statuses) match W-4a L1862-1870.
- R1-F5: resolved — L1507 adds turret(slot) to interface DuelRuntime after W-4a's weaponSel().
- R1-F6: resolved — The Seam section (L74-84) matches Task 4's loop and MAN branch (L792-798), Task 6's refusal (L1318) and Task 7's call (L1521). W-4c L128-129 now greps for the new shapes.
- R1-F7: resolved — The `1 as 1 | 2` knob is at L1870 and the rung rules are at L1907-1913. The rung-4 commit names the wrong file; that is a new P2.
- R1-F8: resolved — Task 8's w4Map is written in full on pewViews' rig, which matches pewViews.test.ts L14-18; headingAngle and drawnScale exist (tacticalModel.ts L210, L33). Task 3's and Task 8's hedges are replaced with facts. The stale self-review bullet is a new P3.
- R1-F9: resolved — L992 and L1064 quote W-4a's triggerNow() line; the stale bullet is removed.

## Verified
- pewAutoReady's arithmetic: third 360, AUTO gain 6 at 1 bar (pew.ts L31-37, bars.ts L90); mid-third, just-completed and under-a-third cases (plan L1152-1155).
- The seam's MAN branch text matches Task 4's code (plan L78 vs L792-798); the pewFire refusal (L79 vs L1318); the predictTurret call (L77 vs L1521).
- W-4a's runtime rig exposes set/click/hold/statuses/press/tick (W-4a L1862-1870); the online stub client exposes ids, results, helds and commands (onlineDuelSession.test.ts L32-49).
- w4Map imports: headingAngle (tacticalModel.ts L210); AUTOCANNON_ARC_STEPS, AUTOCANNON_AUTO_RANGE and PEW_ARC_STEPS from W-4a's tuning (W-4a L44, L292).
- AUTOCANNON_MAN_INTERVAL_BY_BARS exists in W-4a (W-4a L387).
- W-4c L128-129 now anchors on `turret: (slot: 0 | 1)` and predictTurret.

## Not verified
- That Task 9's UI cases match W-4a's w4Ui rig (mount, weapons(over), AC, input()) and the WeaponsPanel shape with gunsManual and gunsHold; the W-4a rig text was not read in full.
- Whether createSeatedDuel overrides the spawn heading: not checked; the P1 assumes it does not (state.ts L283).
- Task 8's bracket and muzzle-length assertions depend on Task 8 Step 3's model code, which was not re-read line by line.

---

# Round 2 response (plan revised to rev after 0f820aff)

Reviewed `round-2.json` against the subject at `0f820aff`. 4 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F9 resolved.

## R2-F1 [P1]: Task 7's online case assumes heading 0

Confirmed: map.ts L57-L59 and L72-L73 seed the spawn heading. The case now reads `c.state()!.tactical.ships[0].heading`, aims `(h0 * 256 + 2000) % 65536`, and asserts `0 < p <= 2000` in steps of 455 (or exactly 2000).

## R2-F2 [P2]: Task 10's commit names the wrong file for rung 4

Confirmed: the first-seated-tick case is in duelScripted.test.ts. The placeholder now names it. A note says w4Loadout is always committed and that its range pin changes only for rung 2.

## R2-F3 [P3]: The w4Autocannon rewrite names the wrong lines

Confirmed against the W-4a plan's w4Autocannon (`gaps()` at L567-L571; the heat case asserts no interval). The rewrite now names `gaps()` and the direct TRIGGER calls. The heat-and-lock case sets MAN with no re-pin.

## R2-F4 [P3]: Stale Placeholders bullet

Confirmed. It now says every test body is written in full, and it names the rigs.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md

<!-- end -->

---

# Round 3 (delta, reviewing ebde9040, effort medium, 32 s, 140252 in / 115152 cached / 2812 out)

Verdict: ready

## Prior findings
- R2-F1: resolved — Plan L1465-1472 now reads h0 from c.state()!.tactical.ships[0].heading (the stub's state() returns the published replica, onlineDuelSession.test.ts:L44; DuelState.tactical at sim/duel/state.ts:L45). It aims want = (h0*256 + 2000) % 65536, so turretOffset(h0, want) = +2000, which sits inside the ±10922 arc. predictTurret (plan L1495-1502) slews about the same t.ships[0].heading, so p lands in (0, 2000] in 455 steps or at exactly 2000, whatever the seed.
- R2-F2: resolved — Plan L1928: the commit placeholder now names <tests/duelScripted.test.ts if rung 4 is kept>. Plan L1916: the new note says w4Loadout.test.ts is always committed and that its range pin changes only for rung 2.
- R2-F3: resolved — Plan L1324 now names the gaps() helper (W-4a plan L567-571, TRIGGER at L569). The direct TRIGGER calls it cites match the W-4a plan line for line: L584 (0 bars), L604 and L609 (along the aim), L616 and L619 (cooldown), L628 (six hits). The heat-and-lock case (W-4a L587-600) asserts only heat, lock and cooling. The plan keeps TRIGGER there under MAN with no re-pin, which is correct.
- R2-F4: resolved — Plan L2011: the Placeholders bullet now says every test body is written in full and names the rigs extended. This matches the revised Tasks 5, 7, 8 and 9.

## Verified
- The Task 7 online case (plan L1462-1477) uses only stub members that exist: state(), commands(), ids, results (onlineDuelSession.test.ts:L32-49).
- The line numbers in the w4Autocannon rewrite (plan L1324) match the W-4a plan's TRIGGER call sites at L569, L584, L604, L609, L616, L619 and L628.
- The heat-and-lock case (W-4a plan L587-600) pins no interval, so leaving it un-re-pinned is consistent.
- The Task 10 commit (plan L1928) and the new note (L1916) agree with Task 6's placement of the first-seated-tick case in tests/duelScripted.test.ts.
- The diff introduced no contradiction with predictTurret's signature or its heading convention (plan L1495-1502).

## Not verified
- Whether rig(1) has published a replica before c.state() is read at plan L1467. The earlier frame() call suggests it has, but I did not trace the rig body.
- How many unacknowledged frames k the rig reaches after the two pumps. The assertion holds for any k ≥ 1; k = 0 would fail p > 0, but that was already the premise of the case before this round.

---

# Round 3 response (no subject change)

Reviewed `round-3.json` against the subject at `ebde9040`. 0 accepted, 0 rejected, 0 deferred. The reviewer confirmed R2-F1 to R2-F4 resolved and raised no new findings.

## Also changed

- (nothing)

## Files changed

<!-- end -->

---

