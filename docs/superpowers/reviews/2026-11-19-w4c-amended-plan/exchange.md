# Codex review exchange: w4c-amended-plan

Subject: `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 4c85b898, effort high, 457 s, 7358130 in / 7148143 cached / 40557 out)

Verdict: ready with P2s

## Findings

### [P2] R1-F1 Task 3 never tests pew pew in hand during a MANUAL flight (slot 0's slew and tickPew's MAN gain)
Every slew and fire case in w4Flight.test.ts uses the autocannon (gunMode slot 1, weaponSel 1). Pew pew appears only in the pewFire refusal case. The amendment's table row 'MAN, any, pew pew selected' during a flight, where pew pew should be AUTO-driven, has no test. Decision 13 says tickPew (through tickWeapons) reads handControl, so pew pew charges at AUTO's rate during the flight, but nothing pins that either. · plan L556-L626 (the slew and fire cases set `gunMode {slot: 1}` and `weaponSel: 1` only); L572-L588 (slot 0 is used only for the pewFire order); Decision 13 at plan L112 names `tickPew` as a reader; amendment spec L72-L87 (the table and the flight rule); W-4b plan L804-L806 (`handControl` branches on slot) · The flight term is one line shared by both slots, but `manual` comes from a per-slot ternary (`slot === 0 ? s.pewManual : slot === 1 && s.gunManual`). If an implementer touches only one branch, or W-4b's executed helper differs and gets matched 'by meaning', a pew-pew-in-hand regression would pass every W-4c test. Pew pew is also the weapon selected at a sit, so a gunner who presses R and then launches with F hits exactly this case. · Add a w4Flight case like the 'MAN gun fights on AUTO' case but for slot 0: `gunMode {slot: 0, manual: true}`, `fly(d, true)`, `hostileAt = 0`, the enemy at (150, 1200), and held `{ weaponSel: 0, turretAim: 49152 }` for 120 ticks. Assert `s.pewManual === true`, `s.pewTurret > 0` (toward the ship, not the reticle) and `s.pewShots > 0` with no pewFire sent. Optionally also assert that one tick's `pewCharge` gain equals `pewGain(t, 0, false)`.

### [P3] R1-F2 Task 1's pre-flight check does not look for handControl, which Task 3 now anchors on
Step 1 greps for W-4b's `slewTurrets`, the online `turret(slot)` and `predictTurret` and stops if any is missing. It does not grep for `handControl` in state.ts, which is now the anchor that Task 3 Step 4 edits. · plan L137-L138 (the grep lists `export function slewTurrets\|turret: (slot: 0 | 1)\|export function predictTurret`); plan L668-L683 (Task 3 replaces handControl's return line); W-4b plan L101 and L804-L806 · If W-4b executed without the helper, or under another name, the gap shows up only at Task 3. Task 1 is the point that is meant to catch a missing seam before the baselines are recorded. · Add `export function handControl` and `src/renderer/src/sim/tactical/state.ts` to Step 1's git grep, and name it in the 'If either W-4b name is missing' sentence.

### [P3] R1-F3 Gate line 4's 'R and Shift+R still flip the tags' leaves out that the words stay AUTO/HOLD during the flight
During a flight no gun is in hand, so each gun's tag word reads AUTO or HOLD whatever its switch says. R and Shift+R change only the tag's light (its switch). Line 3 explains this, but line 4 says the tags 'flip', and a tester may expect the word to change to MAN. · plan L1398-L1399 (gate items 3 and 4); W-4b plan L76 (Decision 9: the light is the switch, the word is what the gun does now) · The owner's manual gate is the acceptance check. A tester who expects MAN may file a false failure. · Reword item 4: '…and R and Shift+R still flip each tag's light (its switch); the words stay AUTO or HOLD until the flight ends.'

### [P3] R1-F4 The merge-version note is only in the plan; the report and gate entry Task 8 writes say W-4 ends at V + 1 (61)
Task 8's header note tells the executor the merge controller bumps to 62. But Step 8 writes 'W-4 complete … at SIM_VERSION <V + 1>' to the report and 'SIM_VERSION <V> → <V + 1>' to docs/gates.md, and neither mentions the merge bump. The merge controller reads the report, so the number it sees (61) is already master's, for the Helm keys change. · plan L1434 (the note); plan L1528-L1535 (Step 8's report and gate lines) · Item 10 asks whether the merge controller will see the note. As written, it reaches only the plan's reader, and the branch's own records name a version master already holds. · In Step 8's report bullet, add: '(the branch is cut from SIM 60 and master is at 61; the merge controller bumps to V + 2 at the merge, amendment §4)'. Optionally add the same clause to the gate note line. No step's mechanics change.

## Verified
- handControl anchor: W-4c Task 3 Step 4 quotes the return line `return manual && weaponSel === slot;`, which is word for word the second line of W-4b Task 4's helper (W-4b plan L804-L806) and its Seam (L101). The added `&& missileOf(state, i)?.manual !== true` uses `missileOf`, which is in state.ts (.worktrees/w4/src/renderer/src/sim/tactical/state.ts:L305). It is equivalent to `manualTorpedoFlying` (manualTorpedo.ts:L17-L19). It short-circuits, so the Hunter and Valkyrn paths never reach it.
- pewFire refusal anchor: plan L658 quotes `if (!sys0.pewManual) { result(e, 'unavailable'); continue; }`, which matches W-4b Task 7 (L1997) and the Seam (L102). The missile-in-flight line goes after it and before the noop (L1998).
- step.ts trigger line: plan L649 quotes the line exactly as on the branch (.worktrees/w4/src/renderer/src/sim/duel/step.ts:L317).
- Online prediction anchor: plan L1213 quotes `predictTurret(d.tactical, slot, sentHeld, gunModeShown[slot] ?? (slot === 0 ? sys.pewManual : sys.gunManual), unackedFrames)`, which matches W-4b Task 9 (L2886) and the Seam (L100).
- Online held-frame anchor: plan L1211 quotes the `sessionHeld(... trigger: triggerNow() && (gunModeSent[1] ? gunModeSent[1].manual : d.tactical.systems[0].gunManual) ...)` call, matching W-4b Task 6 Step 7.6 (L1660) and the Seam (L104).
- Local frame merge: plan L1193 quotes `weaponsSeatHeld(weaponSel, (deps.triggerHeld?.() ?? false) && gunModeBase(1), deps.reticleAim?.() ?? -1)`, matching W-4b L1616. The pew click gate `if (pew !== null && weaponSel === WeaponSlot.Pew && pewManual) {` and the dead-trigger line with `gunManual` match W-4b L1614 and L1655.
- The top two lines W-4c replaces in both Hound branches (`weaponSel = nextWeaponSel(weaponSel, k, manualTorpedoFlying(d.tactical));` and the lastGunSel line) exist on the branch (runtime.ts:L510-L511, onlineDuel.ts:L299-L300), and W-4b does not touch them (no nextWeaponSel or lmbLaunch edits in the W-4b plan). The resets W-4c extends exist (runtime.ts:L282, L405, L435; onlineDuel.ts:L148, L246, L248, L251, L418, L475).
- Raw left button: `DuelRuntimeDeps.gunHeld?()` (runtime.ts:L182) is wired to `pointer.leftHeld()` in duelMode.ts:L71, and only the Flight seat reads it otherwise (runtime.ts:L646). `pointer.leftHeld()` is already used in onlineDuel.ts (L260, L441). `takeTorpHeading?()` exists (runtime.ts:L203).
- The w4Runtime rig (tests/w4Runtime.test.ts:L18-L40) has press, set, click, hold and statuses (via lastResults). W-4b adds `weaponMode` and `weaponModeAll` to emptyPresses (W-4b L1501). The local torpedo launch works with the default power (existing case L81-L82), so the click-launch case, which sets no bars, can pass.
- The online rig's `key` takes modifiers after W-4b (W-4b L1380), so `r.key('keydown','KeyR',{shiftKey:true})` at plan L1112 is valid.
- Test sequences checked against W-4b's `modeRequests` order (Shift+R, then R on the selection, then tags; W-4b L1543-L1550) and the branch order, where selection comes before the mode block: R with selectTo 2 sends torpMode; Shift+R with the autocannon on MAN sets both guns to AUTO and changes only slot 1 (plan L1037-L1040).
- Scene Decision 14: `contact.cancelAim()` exists (contactController.ts:L53, L104). `station`, `view`, `onMap`, `running`, `shown`, `cam`, `alpha` and `onConsole` are all in scope after the crew Helm steer block (scene.ts:L238-L351). The triggerAt computation (L279-L281) runs earlier, so a pick-up still gates the trigger on the first frame.
- The scene test rig (tests/manualTorpedoScene.test.ts:L36-L64) has launch (placeMissile, no draw), marker, contact and requests, so the Decision 14 sequences work as written.
- No old shapes are left in the plan: grep for gunsManual, KeyZ/KeyV, Z as a guns key, torpStep, torpLock, press('torpMode') and old W-4b task numbers finds only the amendment's own explanatory text (plan L37-L38, L1236, L1491).
- Smokes: the branch's only `'V'` presses (duel-app-smoke.ts:L168, internet-app-smoke.ts:L121, L158) are exactly the ones W-4b Task 6 Step 8 replaces (W-4b L1674-L1684), so Task 8 Step 6's grep guard is sound.
- Controls rows: W-4b's DUEL_ACTION texts (W-4b L1557-L1560) and its w4Ui pins (L1464-L1467) are compatible with Task 6's new weaponMode and torpMode texts and its regexes (plan L1260-L1262, L1297-L1298).
- Task 2's quoted text matches the branch: the contracts.ts HeldInput doc lines (contracts.ts:L34-L37), the torpMode doc line (contracts.ts:L114, quoted by text), the codec comment 'torpTurn, torpHeading: W-3' (codec.ts:L165), runtime.ts's W-3 torpSteering block (L648-L651, L656), and the STEER A/D sites (WeaponsStation.tsx:L12, L153, L216; consoleModel.ts:L61-L62).
- Item 8: the step's gunHeld gate, the pewFire missile-in-flight refusal after the pewManual refusal, gunMode admitted during a flight (sim and both R and Shift+R locally), and the AUTO torpedo leaving MAN alone are each tested (plan L556-L634, L1021-L1042).
- Item 9: Task 5 reads no `requests.torpStep` and no E / Q path. The E / Q block in the Hound branches (runtime.ts:L517-L524, onlineDuel.ts:L306-L312) is W-4b Task 12's and is not quoted by W-4c.
- Item 10: the merge-version note sits in Task 8's header, before Step 1 (plan L1434). It matches W-4b's Global Constraints (L33) and amendment §4 (spec L296), and no step contradicts it.

## Not verified
- W-4b's executed code does not exist yet. All W-4b shapes were judged against the W-4b plan's code blocks, not real source.
- Whether W-4b's AUTO slew with no solution holds the turret or returns it to the nose. Task 3's first case expects gunTurret 0 either way, since it starts at 0.
- Whether `unackedFrames` is still above 0 after `r.client().publish(r.d)` in the online flight case, which the final `turret(0) > 0` assertion needs. That part is unchanged from the converged text, so I did not re-derive it.
- Whether any W-4b test (w4Manual, w4Map, w4Ui) places a MANUAL missile and so would be moved by Task 3's handControl change. Those files do not exist yet. The plan's kind (a) fallback covers it.
- The AUTO geometry in Task 3's MAN-gun-on-AUTO case (fog, line of sight and arc at (150, 1200)). It copies the converged AUTO case and the plan's L638 fallback.

---

# Round 1 response (plan revised)

Reviewed `round-1.json` against the subject at `78f3b85e`. 4 accepted, 0 rejected, 0 deferred. Each was checked against the plan, the revised W-4b plan and the W-4 branch's code in `.worktrees/w4` (3b2a90c5).

## R1-F1 [P2]: Task 3 never tests pew pew in hand during a MANUAL flight (slot 0's slew and tickPew's MAN gain)

Confirmed: every slew and fire case in Task 3's `w4Flight.test.ts` set `gunMode {slot: 1}` and `weaponSel: 1`; slot 0 appeared only in the `pewFire` refusal case. Task 3's test file gains a case after the "MAN gun fights on AUTO" one: pew pew's own switch on MAN, pew pew selected, a reticle due west, a MANUAL torpedo flying. It asserts `pewManual` true, `pewTurret > 0` (toward the ship, not the reticle), `pewShots > 0` with no `pewFire` sent, and that one tick's gain from an empty charge equals `pewGain(t, 0, false)` (AUTO's 6 at one bar against MAN's 7; the three-argument `pewGain` is W-4b Task 4's, and today's is at `pew.ts` L31). The file's imports gain `pewGain`.

## R1-F2 [P3]: Task 1's pre-flight check does not look for handControl, which Task 3 now anchors on

Confirmed. Step 1's `git grep` now also looks for `export function handControl` in `src/renderer/src/sim/tactical/state.ts`, and the stop sentence names it.

## R1-F3 [P3]: Gate line 4's 'R and Shift+R still flip the tags' leaves out that the words stay AUTO/HOLD during the flight

Confirmed against W-4b's Decision 9 (the light is the switch, the word is what the gun does). Gate item 4 now reads that R and Shift+R flip each tag's light, and the words stay AUTO or HOLD until the flight ends.

## R1-F4 [P3]: The merge-version note is only in the plan; the report and gate entry Task 8 writes say W-4 ends at V + 1 (61)

Confirmed. Step 8's report line and the gate note line now both say the merge to master bumps once more (the branch is cut from SIM 60 and master is at 61). No step's mechanics change.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md

<!-- end -->

---

