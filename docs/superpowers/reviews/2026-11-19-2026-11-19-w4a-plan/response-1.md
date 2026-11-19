# Round 1 response (plan revised to rev after a76136da)

Reviewed `round-1.json` against the subject at `a76136da`. 11 accepted, 0 rejected, 0 deferred. Round 1 has no prior IDs.

## R1-F1 [P1]: The known-red window misses the scripted-pair tests broken by master's gunner on the laser-less Hound

Confirmed. scripted.ts L340-L341 pushes `laserLock` while `!sys.laserTargeted`, which is always false without a laser (state.ts L227), and step.ts L313 answers it `unavailable`, so `requireApplied` throws. I took the recommended fix:
- Task 3 has a new Step 8b that parks the gunner on a turret class (`if (hasTurret(classOf(t, 0))) { pair.barMoved = true; return; }`) and imports `hasTurret`.
- Task 8 now replaces that line with the `houndGunner` call; its import note says `hasTurret` is already imported.
- The known-red window lists the per-seed gates (and any test that needs the crew to fire) from Task 3 until Task 8.
- The window also says that any kind (b) pin found in Task 3 Step 10 joins it until Task 14.

## R1-F2 [P1]: Task 7 won't type-check, because duelScripted's pewAimOf reads the aim

Confirmed: duelScripted.test.ts L118-L124. Task 7 now greps `'pewFire'` across `tests/`, and it deletes the W-1 gunner-pew describe block, with `pewAimOf`, `givePewBar` and `movedPair`, in Task 7 (kind (a)). Task 8 adds its replacement block where the old one was.

## R1-F3 [P1]: Task 9 won't type-check, because the exhaustive DUEL_ACTION record arrives only in Task 12

Confirmed: controlsList.ts L19-L36. Task 9 now has a Step 5b that adds `selectPrev`/`selectNext` to `DUEL_ACTION` and the loop's `continue`. `app/controlsList.ts` is in Task 9's Files and its commit. Task 12's text says both are already there.

## R1-F4 [P1]: Task 11 calls requests.triggerHeld() on the ContactRequests

Confirmed: onlineDuel.ts L120-L122 and L233/L357. Task 11 adds `const triggerNow = (): boolean => requests.triggerHeld();` beside `takeSteer0`, and both `play` and `pump` call `triggerNow()`.

## R1-F5 [P1]: Task 5's static-rock test can't pass

Confirmed: rocks.ts L60-L72 finds Static rocks only through the grid built from the map's asteroids. The test now calls `seeded(st, 0)`, fires at `st.map.asteroids[0]` from its near edge, and asserts the slot turns Moving with `vx > 0`. `seeded` is imported.

## R1-F6 [P1]: Task 13's observer key doesn't exist

Confirmed: hash.ts L132 and duel-app-observer.ts L16-L24. The observer now reads `const wp = n.at.get('systems.0.weaponPower')!` and then `v[wp + k]`. The hedge is gone.

## R1-F7 [P2]: Resolve the items left to the executor

Confirmed for each item, and each is now stated in the plan:
- Task 3 calls `validateTacticalValues(st, flattenTactical(st))` (hash.ts L283, L288).
- Task 5 uses `createFx()` (fxModel.ts L57) and states the planet tie as exact.
- Task 6's noop hedge is replaced by the result shape (step.ts L272-L273).
- Task 12 states that render already imports app (consoleModel.ts L3-L4).
- Task 11's F block copies today's two branches and the `launchWhy` line, with `launches` in place of `p.launch`.

## R1-F8 [P2]: Key-path ports leave tests red between tasks

Confirmed:
- The `valkyrnRuntime.test.ts` edit moved to Task 10 Step 1b, beside the runtime's `laserFreqKey` read, and is in Task 10's Files and commit. It is gone from Task 9's.
- The scienceInput Weapons case (L124-L133) is in the known-red window from Task 3 to Task 6.
- Task 9 Step 8 now says that runtime case stays on the Hound with `freqTo`, the button's field.

## R1-F9 [P2]: Spec §14's 'every laser command unavailable' test has no task

Confirmed. Task 7's `w4PewFire.test.ts` adds that case:
- `laserLock`, `laserCharge`, `laserMode`, `laserFire` and `rockLock {laser}` in one tick are all `rejected`/`unavailable`;
- `laserFrequency` is then `applied`;
- `holdInSight` is imported, so `laserLock` is judged by the laser rule.

## R1-F10 [P2]: Tasks 10-12 test bodies are outlines

Confirmed:
- Task 10's `w4Runtime.test.ts` is now written in full on scienceInput's `rig()` (L64-L83), with `takePew`/`triggerHeld` deps. It asserts `rt.held()`, `lastResults()` and `takeRefusals()`, including the laser-fit case.
- Task 11's session cases now go into `onlineDuelSession.test.ts`'s own `rig()` (L110). They are modelled on its W-1 NO CHARGE block (L160-L176), with the exact calls.
- Task 12's `w4Ui.test.tsx` is now written in full on manualTorpedoUi's rig, with the selectors resolved: `console-freq-<f>` (WeaponsStation.tsx L152), `console-fire` (Button.tsx L56), `ui.actions.contact.pickUp` (actions.ts L85), and a `data-ui-overheat` attribute for the blinking OVERHEAT, drawn as a `Box` because `Bar` takes no attrs.

## R1-F11 [P3]: Task 2 moves every arena-based rock test onto the laser fit

Confirmed: rockArena.ts L11-L18 has 10 callers. `arena`'s default stays `ShipClass.Cutter`. `rockLaser`, `rockLock` and the laser cases of `rockTargetModel` pass `ShipClass.ValkyrnLaser` explicitly, and the port table names `rockTargetModel`.

## Also changed

- **Version:** master moved to SIM_VERSION 60 with the fire-venting merge (0dbe1be6), after the spec. Global Constraints now define V (60 today; spec §13.3's version note, commit a33ad26e), Task 1 Step 1 reads it, and every "SIM 59" in the plan reads V.
- **Online `lastGunSel`** (the W-4c plan's author noted it was missing): Task 11's online state and resets now carry `lastGunSel` beside `weaponSel`, as the contract says both runtimes do.

## Files changed

- docs/superpowers/plans/2026-11-19-w4a-loadout.md

<!-- end -->
