# Codex review exchange: 2026-11-19-w4a-plan

Subject: `docs/superpowers/plans/2026-11-19-w4a-loadout.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing ab6b0ef2, effort high, 1152 s, 23776203 in / 23386241 cached / 79190 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 The known-red window misses every scripted-pair test that breaks when master's gunner sends laserLock to the laser-less Hound (Task 3 to Task 8)
From Task 3 on, the Cutter has no laser, but the scripted gunner is still master's code until Task 8. On master the gunner pushes `laserLock` whenever the target is seen and `!sys.laserTargeted`, which is every tick on a laser-less class. The step answers each one `unavailable`. So any test that requires every scripted command to be applied goes red, and those tests are not in the window. The window lists only the goldens, a few trajectory pins and 'duelScripted's whole-run values'. Task 3 Step 10's fallout rule has no class for these: they are not ports, not kind (a) without an owner, and not kind (b). Step 10 also defers any kind (b) pin found in another file to Task 14, which contradicts 'only these'. · scripted.ts:L340-L341 (`if (!sys.laserTargeted || sys.lock !== want) out.push({ kind: 'laserLock' ...})`); state.ts:L227 (laserTargeted = crew && laser !== null, so false on the Hound); step.ts:L313 (laserLock is `unavailable` with a null laser); tests/helpers/scriptedDuel.ts:L39-L46, L55 (requireApplied throws on any non-applied scripted command); tests/duelOracle.test.ts:L89-L90 (`runDuel(1, 'scripted', 1300, 600)`); tests/duelScripted.test.ts:L69-L87 (the repair-walk test asserts every result is 'applied' over 900 ticks). Plan L62-L65 (the window), L508 (Step 10), L1258-L1436 (Task 8 fixes the gunner). · The plan's binding rule is that every test not in the window passes at the end of each task. Executors at Tasks 3-7 will find red tests that no rule covers, and two executors will handle them differently (one tunes, one skips, one stops). · Recommended: in Task 3, add the one-line guard at the top of `gunner`: `if (hasTurret(classOf(d.tactical, 0))) { /* W-4a: Task 8 builds houndGunner */ pair.barMoved = true; return; }`, then have Task 8 replace it with `houndGunner`. Alternatively, extend the window by name: all of `tests/duelOracle.test.ts` and `tests/duelScripted.test.ts`, the `runDuel`-based cases of `tests/engWeapons.test.ts`, and any `requireApplied` or all-applied scripted test. Make them red from Task 3 until Task 8, with Task 8 Step 5 running them. Also say explicitly that a kind (b) pin found in Step 10 joins the window until Task 14.

### [P1] R1-F2 Task 7 won't type-check: duelScripted's `pewAimOf` reads `c.aim` / `c.aimAcc` on the new `{ kind: 'pewFire' }`
Task 7 changes `DuelCommand`'s pewFire member to `{ kind: 'pewFire' }`. `tests/duelScripted.test.ts`'s `pewAimOf` reads `c.aim * 256 + c.aimAcc` after narrowing on `c.kind === 'pewFire'`, which becomes a compile error. Task 7 Step 6's grep (`kind: 'pewFire'`) misses this line, and the plan defers duelScripted to Task 8. `tsc -b` includes `tests/**`, so Task 7 Step 7's 'tsc clean' fails. · tests/duelScripted.test.ts:L118-L124 (`return c && c.kind === 'pewFire' ? c.aim * 256 + c.aimAcc : -1;`); tsconfig.web.json:L10 (include has `tests/**/*`); plan L1147-L1150 (the new pewFire member), L1242 (the grep), L1246-L1247 (tsc clean expected), L1270 (Task 8 replaces pewAimOf). · Task 7 can't finish as written: tsc is red and the task's commit gate fails. · In Task 7 Step 6, grep `'pewFire'` (not `kind: 'pewFire'`) across `tests/`. Either replace `pewAimOf` there with Task 8's `pewFires` helper (plan L1273-L1278), or delete the W-1 gunnerPew describe block in Task 7 and leave only the new block to Task 8.

### [P1] R1-F3 Task 9 won't type-check: `KeyAction` gains selectPrev / selectNext, but controlsList's exhaustive `DUEL_ACTION` record is only updated in Task 12
`DUEL_ACTION` is typed `Record<Exclude<KeyAction, 'fireUp'>, string>`. Adding `'selectPrev' | 'selectNext'` to `KeyAction` in Task 9 makes that literal miss two required keys. Task 9's file list does not include `app/controlsList.ts`, yet Task 9 Step 9 expects tsc to be clean. The entries and the loop's `continue` arrive only in Task 12 Step 5. · src/renderer/src/app/controlsList.ts:L19-L36 (the exhaustive Record), L47-L50 (the loop over every action); plan L1449-L1454 (Task 9 files), L1611 (KeyAction gains them), L1771-L1772 (tsc clean expected), L2157-L2158 (Task 12 adds them). · Task 9 fails its tsc gate. · Move to Task 9 (and add controlsList.ts to its Files) the `DUEL_ACTION` entries `selectPrev` / `selectNext` and the `continue` for them in the loop. Leave the merged rows and the text changes to Task 12.

### [P1] R1-F4 Task 11's online branch calls `requests.triggerHeld()` on the ContactRequests, not the MapRequests
Inside `play`, `requests` is the `ContactRequests` parameter. Inside `pump`, `requests` is shadowed by `contact.takeRequests()`. Neither has `triggerHeld`, so both new calls fail to compile. The file already warns about this shadowing and works around it with closures (`takeSteer0`, `pewRequest`). · onlineDuel.ts:L98 (`requests = createMapRequests()`), L120-L122 (the shadowing comment and `takeSteer0`), L233 (`play(..., requests: ContactRequests, ...)`), L357 (`const requests = contact.takeRequests()` in pump); plan L2037 (`const trig = requests.triggerHeld();` in play), L2049 (`trigger: requests.triggerHeld()` in pump). · tsc fails in Task 11, and the online trigger can't be read as written. · Add `const triggerNow = (): boolean => requests.triggerHeld();   // W-4: the map's trigger, read through a closure as takeSteer0` beside L122. Use `triggerNow()` in the Hound branch of `play` and in `pump`'s `sessionHeld(..., { sel: weaponSel, trigger: triggerNow() })`.

### [P1] R1-F5 Task 5's 'a static rock wakes on the push' test can't pass: a Static rock written into a free slot isn't in the broad-phase grid
`rocksNear` finds Static rocks only through `queryGrid(s.grid, …)`, and that grid is built once from the map's asteroids at their seeded positions. Moving rocks are scanned by position. The test writes `RockKind.Static` into slot 100 at (200, −2500). The round's sweep never sees it, so there is no push, the rock stays Static and the assertion fails. The arena also clears every rock. · src/renderer/src/sim/tactical/rocks.ts:L60-L72 (Static via queryGrid, Moving via scan); state.ts:L281 (`grid: buildGrid(map.asteroids, map.rMap)`); tests/helpers/rockArena.ts:L9-L18 (arena empties the pool), L23-L27 (`seeded(st, k)`: 'the grid indexes it there'); plan L738-L743 (the test). · The test is red after the implementation is correct, with no rule to fix it. · Use `seeded(st, k)` for a map asteroid k, then fire the round at `st.map.asteroids[k]` from `a.x - a.r - 5` along +x, and assert `st.rocks[k * ROCK_STRIDE] === RockKind.Moving` and `rockAt(st, k).vx > 0`.

### [P1] R1-F6 Task 13's observer reads `systems.0.weaponPower.${k}`, which no field is named; weaponPower is one 3-wide vector
`flattenTactical` registers weaponPower as `vector('systems.${i}.weaponPower', WEAPON_SLOTS, …)`. The observer's `named()` maps each field name to the offset of its first value. So `n.at.get('systems.0.weaponPower.1')` is undefined, `powered[*].weaponPower[1]` is undefined, and the smoke's `until(... === 1)` times out. The plan's 'check the names' hedge leaves the right form to the executor. · src/renderer/src/sim/tactical/hash.ts:L132 (`vector(`systems.${i}.weaponPower`, WEAPON_SLOTS, …)`); scripts/network/duel-app-observer.ts:L16-L24 (`at.set(f.name, k); k += f.count`), L55; plan L2198 (the key), L2216 (the until). · `npm run test:duel-app-runtime` fails in Task 13 and again in Task 14 Step 4. · State it exactly: `const wp = n.at.get('systems.0.weaponPower')!;` then `weaponPower: [0, 1, 2].map((k) => v[wp + k]!)`. The scalars `systems.0.pewShots`, `systems.0.gunShots` and `systems.0.missilesLaunched` are correct as written (hash.ts:L24-L26 SYSTEMS_TAIL). Drop the hedge.

### [P2] R1-F7 Resolve the items left to the executor; each has a definite answer in the code
Several steps say 'check and adjust' where the code already gives one answer, so they should state it:
- Task 3: the validator is `validateTacticalValues(shape, values, offset = 0)`, but the plan calls it with (values, shape).
- Task 5: the `fx` cast should be the real constructor.
- Tasks 6 and 7: the noop hedge is unnecessary; their expectations are already right.
- Task 12: render may import app.
- Task 11: folding the AUTO F launch into one `refusal` check differs from today's code, which sends an AUTO launch only when the replica's `canLaunch` holds, and the plan asks the executor to align it. · hash.ts:L283 (`validateTacticalValues(shape: TacticalState, values: ArrayLike<number>, offset = 0)`), L288 (the error names the field, so /gunCooldown/ matches); render/tactical/fxModel.ts:L57 (`createFx()`), tests/rockFx.test.ts:L42 (`const hit = createFx(); pushRockFx(hit, …)`); step.ts:L272-L273 and net/contracts.ts:L142 (a noop is `{ id, tick, status: 'noop' }` with an optional reason); render/duel/consoleModel.ts:L3-L4 (render already imports app/duel/controls and app/duel/input); onlineDuel.ts:L331-L338 (today's MANUAL/AUTO F split); plan L339, L811, L980, L2132, L2045. · These are the 'left to check at execution' defects the brief names. The F-handling one could be built two ways online. · Write the answers into the plan:
- Task 3: `validateTacticalValues(st, flattenTactical(st))`.
- Task 5: `const fx = createFx()` from `../src/renderer/src/render/tactical/fxModel`, then assert `fx.items.map((i) => i.kind)` equals `['spark']`. Also state the planet tie as written (a Moving rock is found by radius, rocks.ts:L64-L69, so the same circle gives the same t).
- Tasks 6 and 7: drop the noop hedge.
- Task 12: import `autocannonRateText` from `../../app/duel/weaponsSeat` directly.
- Task 11: keep today's two branches verbatim: `if (launches > 0 && torpManual) {…torpSent…} else if (launches > 0 && canLaunch(d.tactical, 0, sys0.torpRock, false)) send({ kind: 'missileLaunch' })`, plus the AUTO `refusal` line as at L340-L342.

### [P2] R1-F8 Key-path ports leave tests red between tasks: valkyrnRuntime from Task 9, and scienceInput's Weapons-frequency case from Task 3
Two between-task reds that the plan doesn't list:
- **valkyrnRuntime (Task 9):** Task 9 Step 8 switches valkyrnRuntime to `hold({ freqKeyTo: 1 })`, but the runtime reads `k.freqTo` until Task 10's `laserFreqKey`. Its NO LASER and laser-fit tune cases are red at the end of Task 9. The plan admits this ('goes green in Task 10') but doesn't list it in the window.
- **scienceInput (Tasks 3 to 5):** the 'Weapons: 3/4/5 (or a button) send laserFrequency' case runs on the default class (the Hound). From Task 3 until Task 6, `laserFrequency` is `unavailable` on a class with no laser, so that case is red. Task 2's table files scienceInput as 'kind (a), Task 9', not as a port.
- **No laser-fit port needed:** Task 9 Step 8's 'if that runtime is the Hound, port it to the laser fit' is unnecessary. `gunFreqRequest` falls back on `freqTo`, so the console-button case stays valid on the Hound once Task 6 admits it. · tests/valkyrnRuntime.test.ts:L127-L143; tests/scienceInput.test.ts:L64-L83 (rig: default cls, `freq` sets freqTo), L124-L133; step.ts:L387 (laserFrequency `unavailable` without a laser until Task 6); plan L62-L65, L249, L1765-L1767, L1772, L1756 (`gunFreqRequest` = `gunFreqKeyTo ?? freqTo`). · The 'every other test passes at the end of each task' rule is broken twice, and Task 9 Step 9 expects scienceInput to pass. · Move the valkyrnRuntime `freqTo` → `freqKeyTo` edit (spec §9 L486) into Task 10, beside the `laserFreqKey` edit. Either list `scienceInput.test.ts` L124-L133 in the window from Task 3 to Task 6, or move Task 6's admission change into Task 3. In Task 9 Step 8, state that the scienceInput runtime case keeps `freqTo` (the button) and stays on the Hound.

### [P2] R1-F9 Spec §14's loadout test 'every laser command from the Hound except laserFrequency is unavailable' has no task
`w4Loadout.test.ts` checks the defs, the start power, the trim and the bound, but it never steps a duel. No other W-4a test sends `laserLock`, `laserCharge`, `laserMode`, `laserFire` or `rockLock {weapon: 'laser'}` from the Hound's Weapons seat and expects `unavailable`. Task 6 covers only `laserFrequency`'s admission. · spec L699-L705 (the Loadout bullets); plan L291-L336 (w4Loadout as written), L961-L976 (Task 6's laserFrequency case only); step.ts:L313 (the rule under test). · This is a spec requirement in W-4a's scope with no test. It pins the Hound side of the no-laser rule that the beam ports moved off the Cutter. · Add a case to `tests/w4PewFire.test.ts` (it already has the duel envelope helper). On `createSeatedDuel(CUTTER, 5)`, the gunner sends `laserLock {room: 1}`, `laserCharge {held: true}`, `laserMode {manual: true}`, `laserFire {aim: 0, aimAcc: 0}` and `rockLock {weapon: 'laser', rock: -1}` in one tick. Expect every result `rejected` / `unavailable`, then `laserFrequency {freq: 1}` `applied`.

### [P2] R1-F10 The test bodies for Tasks 10, 11 and 12 are titles and comments, not tests
Task 10's `w4Runtime.test.ts` and Task 12's UI `it` blocks are empty bodies or comment sketches. Task 11 asks for three session cases 'in the idiom of' another file. These carry the riskiest app paths: the held trigger's press edge, W/S refusing with the command still queued, 3 not tuning, the laser fit keeping Space/Z/3, and the online held-change stamp. The rigs they should copy exist and are short enough to name. · plan L1802-L1818, L1973, L2086-L2104; the rigs: tests/scienceInput.test.ts:L65-L83 (a compact runtime rig with sampleKeys/scheduler/contact), tests/valkyrnRuntime.test.ts:L127-L143 (`rig({ cls })`, `hold`, `takeRefusals`), tests/duelRuntime.test.ts (`rt`), tests/manualTorpedoUi.test.tsx (makeUi). · Two executors will write different tests, and a weak one can pass a broken branch. One example: `deps.triggerHeld` is read only on the press edge with the autocannon selected, which is easy to under-test. · Write at least the runtime file in full on the scienceInput `rig()` pattern, with `triggerHeld` and `takePew` deps, asserting `rt.held()[me]` and `rt.lastResults()` / `rt.takeRefusals()`. For the UI and online cases, name the exact rig (file and function) and the exact selector or value each assertion reads.

### [P3] R1-F11 Task 2 moves every arena-based rock test onto the laser fit, not just the beam's
Changing `arena`'s default class to `ShipClass.ValkyrnLaser` moves 10 rock test files onto FIGHTER flight and VALKYRN_HULL, including rockShips, rockContacts, rockBlast, rockBreak and manualTorpedoMode, whose subject isn't the beam. Most read hull deltas, so they likely still pass. But the port rule (plan L58) is for 'a test of the crew beam's own rules'. · plan L229-L233; tests/helpers/rockArena.ts:L11-L18; arena( is used in rockBlast, rockBreak, rockContacts, rockShips, rockFx, rockTargetModel, rockMaskBetweenTicks, manualTorpedoMode and engineeringFog, besides rockLaser. · It widens the change surface and risks re-pins that aren't needed. · Keep `arena(seed = 5, cls: number = ShipClass.Cutter)` and pass `ShipClass.ValkyrnLaser` explicitly in rockLaser, rockLock and the laser cases of rockTargetModel.

## Verified
- The Valkyrn and Hunter fences hold in Tasks 4-8:
- fireRound's `turret === null` branch computes `ship.vx + h0 * g.speed` exactly as today (gun.ts:L26-L36), and the cooldown stays `g.intervalTicks`.
- stepRounds' new `rock` tracking only acts when `g.rock !== null`, and the tie order (ship, rocks by slot, planet) is unchanged (gun.ts:L122-L144).
- gunHit's threshold is fenced on owner CREW_SLOT and `weakHitsPerLayer !== null`; pewHit's on CREW_SLOT and `def.turret !== null` (HUNTER_PEW spreads PEW, so turret is null; defs.ts:L102).
- The step's trigger is `!hasTurret || weaponSel === 1`.
- laserFrequency's new admission only widens on `hasTurret` (step.ts:L387).
- The hunter.ts literal gains only the two inert fields (hunter.ts:L143).
- tests/valkyrnIdentity.test.ts hashes flattenTactical plus the command results on the Valkyrn class (L22-L33). W-4a adds no hashed field, and every Valkyrn branch is fenced, so it stays green unchanged.
- The Hunter identity test (plan L127-L164) uses names that all exist: stepDuel(state, crew) (duel.ts:L28), Outcome (state.ts:L123), UNCREWED_INPUT, and the Hunter fields it hashes (state.ts:L246-L249). Its deviation from spec §13.4 (the whole Hunter state, crew parked, on the Valkyrn) is stated as Decision 14.
- Task 3's numbers check out:
- AUTOCANNON_ARC_STEPS is floor(30/360 × 65536) = 5461.
- The trim `[1,1,1]` on 1 usable bar gives `[1,0,0]` (bars.ts:L76-L82).
- `systemsFor` leaves laserCharge 0 and laserTargeted false on a null laser (state.ts:L226-L227).
- The gunCooldown bound edit targets the real line (hash.ts:L245), and the bound becomes 10.
- Task 4's timings check out against tickGun's order (cool, then cooldown−−, then fire; gun.ts:L44-L53):
- intervals 10/8/6/5;
- the overdrive 4th bar with bars[1] = 10 (usable 10 > 9, so no trim to 3);
- a 60-tick held run at interval 5 never locks (12×50 − 240 < 1000);
- the lock tick reads heatMax, then heatMax − coolLocked;
- the mid-cooldown bar change gives 6.
- Task 8's bar move is admitted:
- Ship commands are applied before weaponPower in the same tick (step.ts:L417-L440).
- `sparesOf` = 10 − Σbars = 1 at the start (power.ts:L41; START_BARS sum 9).
- `capacityOf(Weapons)` = 10 > 2.
- So `shipPower +1` then `weaponPower {1, +1}` both apply, giving 1/1/1.
- The stand-in pew's `pewReady` pre-check matches the step's admission, which reads the same pre-tick state (step.ts:L350-L355).
- Task 9's pieces fit the code:
- `weaponPowerRefusal` reproduces applyWeaponPower's checks and order (weaponSlots.ts:L9-L21).
- `refusal`'s new 'autocannon' branch can use `gunnerPresent`, `Room`, `trimmedWeaponPower` and `WeaponSlot`, all already in situationModel (L227-L240).
- The contact intercept edit matches L141 verbatim. With `laser: false` from the scene's sync (scene.ts:L323), Digit1/Digit2 fall through to the keyboard at the Hound's seat.
- GUARDED_CODES is built from Object.keys of the tables (pageGuards.ts:L11).
- The keyboard edits match input.ts:
- the `down` handler's freqTo line (L146), `clearUi`/`clear` (L160-L161) and `sample()`'s out and reset (L191-L192);
- KeyA/KeyD press edges still leave the keys held for moveX (L149-L150).
- The held-schema anchors exist as quoted:
- `torpHeading: z.number().int().min(-1).max(255).optional(),` in codec.ts:L164, checkpoint.ts:L40, duelCheckpoint.ts:L73 and replay.ts:L17;
- core.ts expireHeld's `h.torpHeading !== undefined ||` (L330) and the pause's `delete h.torpHeading;` (L436);
- HeldInput's `torpHeading?: number;` (contracts.ts:L40).
- The codec's pewFire schema is `.strict()` (codec.ts:L127), so `{ kind: 'pewFire', aim, aimAcc }` becomes malformed once the member is `{ kind }`. That matches Decision 5.
- Online NO CHARGE still works for `pewFire {}`: the Hound branch adds the sequence to `pewSent`, and observe() turns an `unavailable` answer into `refuse('pew', 'NO CHARGE')` (onlineDuel.ts:L218). `heldChanged` (L73-L74) is the one comparator that needs weaponSel and gunHeld. The online source has `sentHeld` (onlineSource.ts:L107, L208).
- Task 2's table accounts for all 62 files the grep returns at master, each listed once as port, unchanged or later kind (a). The files I spot-checked under 'unchanged' (duelRounds, duelMode, contactModel, duelWeaponsView, duelProducers, engWeaponPower) use the Hunter's beam, transport only, or relative values.
- `render/` already imports from `app/` (consoleModel.ts:L3-L4, readoutModel.ts:L5), so Task 12 can import `autocannonRateText` from app/duel/weaponsSeat.
- The scene has every hook Task 10 uses:
- `options.leftHeld`, `options.pointer`, `onWeaponsMap`, `readoutRows`, `classOf` and `CREW_SLOT` (scene.ts:L237-L343);
- duelMode wires `takeTorpHeading` at L69, so the plan's `triggerHeld` anchor exists.
- Spec conformance: W-4a's §19.1 rules are followed:
- row 0 only, with the nose aim;
- pewFire {}'s admission order;
- the stand-in pew with no torpedo-first branch;
- A/D steering a MANUAL torpedo in flight.
- The kind (a) gate change is `pewShots + gunShots ≥ 1` with `missilesLaunched ≥ 1` (spec L802-L804; duelGates.test.ts:L19-L20).

## Not verified
- Whether all ten per-seed gates pass after Task 8 with the stand-in pew. That needs the Hunter inside 450 and the nose's ±60° cone while pewReady in every seed, and I can't run the duels. The plan's stop-and-report rule is consistent with spec §19.1, which puts tuning only at the end of W-4b.
- Whether Task 8's 'spaces its rounds… gaps.length > 10' over seeds 1, 2 and 4 holds without a laser line-up. It needs more than 11 stand-in pews across three whole duels.
- Whether the Valkyrn-pair test (plan L1331-L1337) sees exactly the two weaponPower commands. Master's gunner also pushes laserLock if the Hunter is seen at tick 0 (within 900 at Sensors 1 bar), and I didn't compute seed 2's spawn distance.
- Whether Task 7's pewFire test's round direction check holds exactly. It reads `pewAimFine` after the tick, so it assumes the crew Helm's unattended flight doesn't turn the nose in that tick.
- Whether any other test outside the grep pins the Hound's readout CHARGE row. After Task 3, readoutModel.ts:L67 shows the autocannon's HEAT there because the laser is null and a gun is present. I only checked the ported crtReadout and duelReadout.
- The engWeapons runDuel cases and the remaining scripted-pair files (duelFire, duelHealth, crewSteering, engHazards, duelCache, duelOnlineView) beyond grep hits. I didn't read them in full, so which of them are pinned whole-run numbers and which are relative comparisons is unconfirmed.
- I read outside the manifest where a finding needed it:
- tsconfig.web.json/tsconfig.node.json (whether tsc covers tests);
- rocks.ts L60-L76 and tests/helpers/rockArena.ts (the static-rock grid);
- fxModel.ts createFx;
- scripts/network/duel-app-observer.ts (field names);
- tests/duelOracle.test.ts by grep;
- tests/pewHunter.test.ts;
- readoutModel.ts L55-L77;
- leadModel.ts and weaponsModel.ts by grep.

---

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

---

# Round 2 (delta, reviewing 6f1b9108, effort medium, 148 s, 1451461 in / 1364554 cached / 12902 out)

Verdict: changes requested

## Findings

### [P1] R2-F1 Task 12's frequency-row UI test can't pass: the key hint is one text '4/5/6', not three texts
The new w4Ui test asserts `for (const k of ['4','5','6']) expect(texts()).toContain(k)`. texts() is an array of whole canvas texts, and the station draws the key hint as a single PixelText ('3/4/5' today; Task 12 Step 4 says 'the frequency row as today, with the key hint `4/5/6`'). No canvas text equals '4', '5' or '6', so the test is red after a correct implementation. Its title also promises the weak mark, but nothing asserts it. · plan L2292-L2296 (the test), plan L2362 (the hint `4/5/6`); src/renderer/src/ui/duel/WeaponsStation.tsx:L156 (`<PixelText text="3/4/5" .../>`, one text), L152 (FREQ_NAMES labels on the buttons), L154 (the weak mark carries data-ui-weak-freq); manualTorpedoUi.test.tsx:L28 (texts() = each canvas's data-text). · A test that is red after a correct implementation, with no rule to fix it. That fails Task 12's gate. · Assert `expect(texts()).toContain('4/5/6')` and `expect(texts()).not.toContain('3/4/5')`. For the weak mark, assert `q('[data-ui-weak-freq]')!.dataset.uiWeakFreq` equals `FREQ_NAMES[2]` (import FREQ_NAMES, or hard-code its third label).

### [P2] R2-F2 Task 11's online session cases don't fit the rig they name: the scene stub has no trigger(), and there are no key samples
Case (1) calls `h.sceneOpts[0]!.requests!.trigger(true)`, but the hoisted `h.sceneOpts` type and the scene mock's `requests` type list only pew/aimLaser/torpHeading, so this fails tsc -b. Cases (1) and (3) speak of 'a sample with selectTo: 1' or 'gunFreqKeyTo: 0'. onlineDuelSession's rig has no key-sample stub: keys reach the real keyboard through `r.key('keydown', code)` on a fake window. So the cases can't be written as described, and executors will write them differently. · plan L2106-L2111; tests/onlineDuelSession.test.ts:L56 and L70 (the requests type literals), L137 (`key(type, code)` dispatches window events), L37 (`helds()` reads the sent held frames). · Task 11's tsc gate fails unless the executor widens the stub. The 'sample' wording invites a second harness or a guess. · State: add `trigger(held: boolean): void` to both requests type literals (L56 and L70). Write the cases as key events: `r.key('keydown','Digit2')` (and keyup) to select the autocannon, then Digit1 for the selection-only held change, Digit4 for laserFrequency 0, Digit3 for no laserFrequency. Read held frames from `c.helds().at(-1)`.

### [P3] R2-F3 Task 8 Step 2's expected failure text is stale after Task 3 Step 8b
Step 2 still expects 'FAIL (the Hound's gunner sends the pew → beam move)'. After Task 3 Step 8b parks the gunner on a turret class, it sends nothing on the Hound, so the failure is the missing shipPower/weaponPower and pewFire. · plan L1416; plan Task 3 Step 8b (L503-L511). · Misleads the executor about why the red step fails. The test still fails, so the gate holds. · Change to 'Expected: FAIL (the Hound's gunner is parked by Task 3 Step 8b and sends nothing)'.

## Prior findings
- R1-F1: resolved — Step 8b's guard uses `t` from gunner's first const line (scripted.ts L330) and classOf (already imported, L20). Task 8 replaces it. The window adds Task 3-8 for the gates and the scripted crew, and kind (b) finds join until Task 14.
- R1-F2: resolved — Task 7 greps 'pewFire' and deletes the W-1 block with pewAimOf; Task 8 adds the replacement.
- R1-F3: resolved — Task 9 Step 5b adds DUEL_ACTION entries and the loop continue; controlsList.ts is in Files and the commit.
- R1-F4: resolved — triggerNow closure beside takeSteer0; play and pump call triggerNow().
- R1-F5: resolved — seeded(st, 0), fired at map asteroid 0 from its near edge; asserts Moving and vx > 0.
- R1-F6: resolved — wp = n.at.get('systems.0.weaponPower'), v[wp + k]; hedge dropped.
- R1-F7: resolved — Validator call (st, flattenTactical(st)), createFx(), noop shape, render imports app, and F's two branches plus launchWhy are all stated.
- R1-F8: resolved — valkyrnRuntime edit moved to Task 10 Step 1b; scienceInput L124-L133 in the window for Tasks 3-6; the runtime case stays on freqTo.
- R1-F9: resolved — w4PewFire case sends the five laser commands with holdInSight and expects rejected/unavailable, then laserFrequency applied.
- R1-F10: resolved — w4Runtime and w4Ui are written in full and their rigs match the code. The online cases are now concrete, but their remaining defects are raised as new findings (the stub type and the key path).
- R1-F11: resolved — arena keeps the Cutter default; rockLaser, rockLock and rockTargetModel laser cases pass ValkyrnLaser explicitly.

## Verified
- w4Runtime rig mirrors tests/scienceInput.test.ts:L64-L83; runtime.ts L174 (cls), L195 (takePew), L226 held(), L236 lastResults(), L252 takeRefusals() exist
- weaponPower refused as 'unavailable' (step.ts L439), consistent with the W/S test's 'rejected:unavailable'
- pew starts the round full (state.ts L230), consistent with one click giving pewShots 1
- Step 8b compiles: gunner's first line defines t (scripted.ts L330); classOf imported L20; hasTurret not yet imported (the plan adds it)
- w4Ui rig copies manualTorpedoUi.test.tsx L28-L41; ui/actions.ts L85 contact.pickUp and L92 setConsole exist; card clicks are onPointerDown (WeaponsStation.tsx L56, L65); freq buttons are console-freq-<f> (L152)
- onlineDuelSession rig(seat, ui, api, extra, cls) at L110; stub client has helds() and commands() (L36-L37)

## Not verified
- Whether w4Runtime's E/Q, MANUAL torpedo launch and trigger edge cases pass as written; they depend on Task 9/10 code not yet written (gunHeld undefined matches plan L1785's weaponsSeatHeld design)
- The new data-ui-card-selected and data-ui-overheat attributes; they are added by Task 12 itself
- Whether a seed 7 seated replica in onlineDuelSession's rig lets a Digit4 laserFrequency be sent at seat 1 without extra sight setup

---

# Round 2 response (plan revised to rev after 6f1b9108)

Reviewed `round-2.json` against the subject at `6f1b9108`. 3 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F11 resolved.

## R2-F1 [P1]: Task 12's frequency-row UI test can't pass

Confirmed: WeaponsStation.tsx L156 draws the key hint as one PixelText. The test now asserts `'4/5/6'` and not `'3/4/5'`, and the weak mark through `[data-ui-weak-freq]` = `'C'` (`FREQ_NAMES` in scienceModel.ts L12; the station sets it at L154).

## R2-F2 [P2]: Task 11's online cases don't fit the rig

Confirmed: onlineDuelSession.test.ts L56 and L70 type `requests` without `trigger`, and keys reach the real keyboard through `r.key` (L137). Task 11 now:
- adds `trigger(held: boolean): void` to both type literals;
- writes each case as `r.key('keydown'/'keyup', code)` events;
- reads `c.helds().at(-1)` (L37) and `c.commands()`.

## R2-F3 [P3]: Task 8 Step 2's expected failure is stale

Confirmed. The step now expects the parked gunner (Task 3 Step 8b) to send nothing.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4a-loadout.md

<!-- end -->

---

