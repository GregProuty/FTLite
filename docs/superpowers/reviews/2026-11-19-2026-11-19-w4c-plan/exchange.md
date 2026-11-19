# Codex review exchange: 2026-11-19-w4c-plan

Subject: `docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md` (plan). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing a818e098, effort high, 850 s, 15359621 in / 15070733 cached / 65566 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Task 5 redeclares the online `lastGunSel` that W-4a already declares, so tsc fails
Decision 8 says W-4a's online branch has no `lastGunSel`, so Task 5 Step 5.2 adds `lastGunSel = 0` beside `weaponSel = 0, triggerPrev = false`. W-4a already declares it in that same `let` line, resets it everywhere, and updates it in the online Hound branch. The second declaration is a block-scoped redeclaration, which tsc rejects. Step 5.3 also replaces only the `nextWeaponSel` line, so W-4a's own `if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;` stays and the line appears twice. · Plan L100 ("W-4a's online branch has none: Task 5 adds it"), plan L934 (Step 5.2), plan L935-L941 (Step 5.3). The W-4a plan declares it in onlineDuel at L2140 (", weaponSel = 0, lastGunSel = 0, triggerPrev = false (the contract: both runtimes keep lastGunSel, which W-4c reads)"), resets it at L2142, and updates it at L2147-L2148. · Task 5 cannot compile as written. Its tsc step (plan L951) fails. · Correct Decision 8: W-4a's online code already keeps `lastGunSel`. In Step 5.2 add only `, flight: FlightLatch = NO_FLIGHT, triggerLive = false`, and add only `flight = NO_FLIGHT; triggerLive = false;` to each reset. In Step 5.3 replace both of W-4a's lines (`weaponSel = nextWeaponSel(weaponSel, k, manualTorpedoFlying(d.tactical));` and `if (weaponSel !== WeaponSlot.Torpedo) lastGunSel = weaponSel;`) with the new block, as Step 4.3 already does for Single player.

### [P1] R1-F2 Task 6's controls-list test finds the Helm's 'Hold left mouse' row first, so it can never pass
The Single player rows already contain `{ keys: 'Hold left mouse', action: 'At the Helm, steer: the nose turns toward the pointer' }`, and it comes before the `Left click` row. Task 6 adds a second row with the same `keys` after `Left click`. The new test then does `rows.find((r) => r.keys === 'Hold left mouse')?.action).toMatch(/MANUAL torpedo.*steer/)`. `find` returns the Helm row, whose action does not match. · src/renderer/src/app/controlsList.ts:L59 (the Helm's 'Hold left mouse' row, pushed before the L62-L65 mouse rows). Plan L996 (the assertion) and plan L1021 (the new row goes after `Left click`). Neither W-4a (L2371-L2386) nor W-4b changes the Helm row. tests/settingsAndControls.test.ts:L51 also reads `action('Hold left mouse')` and expects it to start with 'At the Helm'. · The test stays red, and no rule covers it. · Keep the Helm row first, because settingsAndControls L51 needs it. Change the assertion to `expect(rows.filter((r) => r.keys === 'Hold left mouse').map((r) => r.action)).toContainEqual(expect.stringMatching(/^At Weapons, with a MANUAL torpedo flying: steer it/))`. Alternatively, give the new row distinct keys such as 'Hold left mouse (Weapons)' and find by those.

### [P1] R1-F3 Task 7's `canonical-trace.ts golden` has no basic.json copy to compare, because no task records the canonical baseline before it
`canonical-trace.ts golden` reads `basicCopy`, which only `canonical-trace.ts baseline` writes, and it throws when the copy is missing. Neither W-4c Task 1, W-4a nor W-4b runs `canonical-trace.ts baseline`. The first W-4c run is Task 8 Step 2, which comes after Task 7. The temp dir is keyed by the worktree root, so a fresh worktree has no copy. Task 7 Step 2 therefore throws ("no copy of tests/golden/basic.json … run the baseline before the bump"). · Plan L1067-L1068 (Task 7 Step 2). Plan L136-L139 (Task 1 Step 3 records only the duel-oracle baseline). scripts/golden/canonical-trace.ts:L16-L21 (baseline writes basicCopy) and L30-L31 (golden throws without it). scripts/golden/versionOnly.ts:L30 (`dirFor(root)` per checkout). A grep of the W-4a and W-4b plans finds no `canonical-trace` call. · Task 7 fails as written. If a stale copy exists instead, the check compares against an unknown commit. · In Task 1 Step 3 also run `npx tsx scripts/golden/canonical-trace.ts baseline`, note its counts, and add it to the report. In Task 7 Step 1 also run `npx tsx scripts/golden/canonical-trace.ts same`, the sector per-tick proof that W-4c moved nothing, then keep the `golden` check after the bless. Add the same missing-baseline fallback that Step 1 already has.

### [P1] R1-F4 Task 5 anchors the Single player edits on W-4a's code, which W-4b changes; read literally, the edit drops W-4b's MAN gate on the held trigger
Step 4.5 says W-4a's merge `weaponsSeatHeld(weaponSel, deps.triggerHeld?.() ?? false)` becomes `weaponsSeatHeld(weaponSel, triggerLive)`, keeping a `turretAim` part if W-4b added one. W-4b actually rewrites that call as `weaponsSeatHeld(weaponSel, (deps.triggerHeld?.() ?? false) && gunModeBase(), deps.reticleAim?.() ?? -1)`. An executor who puts `triggerLive` in place of the trigger expression drops `&& gunModeBase()`, so AUTO sends `gunHeld` again. Step 4.4 likewise quotes `if (pew !== null && weaponSel === WeaponSlot.Pew) {`, which W-4b changes to `… && gunsManual) {`. · Plan L924-L928 (Step 4.4-4.5). The W-4b plan rewrites the merge at L1040 and the pew click at L1038. W-4b's test at L905-L916 ('in AUTO the held trigger puts no gunHeld') would fail. W-4b Decision 7 is at L65. · This is an edit that won't match the post-W-4b code. Two executors would build it differently, and one way breaks W-4b's AUTO rule and its test. · Quote W-4b's text. The merge becomes `weaponsSeatHeld(weaponSel, triggerLive && gunModeBase(), deps.reticleAim?.() ?? -1)`. The pew click becomes `if (click !== null && weaponSel === WeaponSlot.Pew && gunsManual) {`. The dead-trigger line keeps W-4b's `&& gunsManual` and reads `trig = triggerLive`.

### [P1] R1-F5 Task 5's online test cases name a rig that has no session, and case 3 cannot pass as described
The online describe is told to use 'the `tests/w4Online.test.ts` rig'. That file is unit-level: `sessionHeld` cases and W-4b's `rig(sel, aim)`, which returns `{d, held, gunnerHeld}` with no session, client or source. The session cases (`r.d`, `c.helds()`, `h.sources`) live in `tests/onlineDuelSession.test.ts`'s `rig(1)`. Three further problems:
- That rig's replica is a snapshot copy, so 'removing it from the replica' needs `removeMissile(r.d.tactical, 0); r.client().publish(r.d)`.
- `unacked(5)` is no test API: the stub's `heldHighWater` stays [0, 0], so k grows with every pump.
- Case 3 uses `turret(1)` on the autocannon, which starts with 0 bars, so `predictTurret` returns the replica's value with or without a flight. 'Differs once it is gone' fails. · Plan L863-L866. The W-4a plan's w4Online is at L2078-L2104 and its session cases at L2107. W-4b's w4Online `rig(sel, aim)` is at L1426-L1433 and its session prediction case at L1462-L1477. tests/onlineDuelSession.test.ts:L38-L42 (publish copies through a snapshot, `heldHighWater: [0, 0]`) and L110-L143 (rig). W-4b's predictTurret returns `base` when bars < 1 (L1498-L1499). Start power is 1 / 0 / 1. · An executor cannot write these cases as specified, and case 3 as worded stays red. · Put them in onlineDuelSession.test.ts's Hound block:
```ts
it('a MANUAL flight: no gunHeld, no pewFire, then the selection returns; the turret is not predicted while it flies (W-4 spec §7, §11)', () => {
  const r = rig(1);
  placeMissile(r.d.tactical, 0, { x: 0, y: 1300, vx: 0, vy: 0, heading: 0, headingAcc: 0, age: 30 }, true);
  const c = r.attach(); r.session.frame();
  const src = () => h.sources.at(-1) as unknown as { turret(slot: 0 | 1): number };
  const key = (code: string) => { r.key('keydown', code); r.key('keyup', code); r.pump(); };
  key('KeyZ');
  const want = (c.state()!.tactical.ships[0].heading * 256 + 2000) % 65536;
  h.sceneOpts[0]!.requests!.reticle(want); r.pump(); r.pump(); r.session.frame();
  expect(src().turret(0)).toBe(0);   // k = 0 while it flies
  key('Digit2'); h.sceneOpts[0]!.requests!.trigger(true); r.pump();
  expect(c.helds().at(-1)).not.toHaveProperty('gunHeld');
  h.sceneOpts[0]!.requests!.trigger(false); key('Digit1');
  h.sceneOpts[0]!.requests!.pew(1234); r.pump();
  expect(c.commands().filter((x) => x.kind === 'pewFire')).toEqual([]);
  key('Digit3');
  removeMissile(r.d.tactical, 0); r.client().publish(r.d); r.pump(); r.session.frame();
  expect(c.helds().at(-1)).toMatchObject({ weaponSel: 0 });   // back to the last gun
  expect(src().turret(0)).toBeGreaterThan(0);   // predicted again
  r.dispose();
});
```
To test slot 1, set `systems[0].bars[1] = 3; weaponPower = [1, 1, 1]` on `r.d` before `attach`, and select it with Digit2.

### [P2] R1-F6 Resolve the other placeholders: Task 4's right-drag pan, Task 5's Single player cases and Task 6's w4Ui case
Each is given as comments or a list of assertions instead of code. All three can be written against existing rigs:
- the pan case needs manualTorpedoScene's `rig()` with a settable `samplePointer`;
- the Single player cases fit W-4a and W-4b's file-local `rig()` in `w4Runtime.test.ts`, so they belong there rather than in a new file;
- the STEER LMB case fits w4Ui's `mount`, `view` and `weapons` helpers. · Plan L696-L707 (pan stub), plan L856-L861 (Single player list) and plan L981-L987 (w4Ui stub). manualTorpedoScene.test.ts:L36-L64 (rig, fixed `samplePointer`). render/tactical/camera.ts:L68-L72 (`pan` sets follow 'free' and moves centre by −d/zoom). The W-4a plan's w4Runtime rig is at L1848-L1871, with W-4b's additions at L879-L881. torpedoCamera.ts:L16-L29 (a pan during a flight is kept). · Fresh executors would write these tests differently, and a test as weak as 'follow changed' could pass. · Pan: in rig() add `let ptr: PointerSample = { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }`, use `samplePointer: () => { const s = ptr; ptr = { x: null, y: null, wheel: 0, dragX: 0, dragY: 0 }; return s; }`, and return `drag(s) { ptr = s; }`. The test: `r.launch(true); r.tick(); expect(cam.follow).toBe('missile'); const cx = cam.centreX, z = cam.zoom; r.drag({ x: 600, y: 300, wheel: 0, dragX: 40, dragY: 0, rightX: 40, rightY: 0 }); r.rt.frame(1/60); expect(cam.follow).toBe('free'); expect(cam.centreX).toBeCloseTo(cx - 40 / z, 6);`.

Single player: append to w4Runtime.test.ts.
- Case 1: set `sys.bars[DuelSystem.Weapons] = 3; sys.weaponPower = [1, 1, 1]`; `r.press('weaponMode'); r.tick(); r.press('torpMode'); r.tick(); r.press('launch'); r.tick();`. Then check:
  - `press('selectNext')` moves `held()[0].weaponSel` to 1, with no `torpTurn`;
  - `hold(true)` gives no `gunHeld` and `gunShots` stays 0;
  - with `selectTo: 0`, `click()` leaves `pewShots`, `missilesLaunched` and `takeRefusals()` unchanged;
  - `press('weaponMode')` flips `gunsManual`.
- Case 2: MAN, `selectTo: 1` then `selectTo: 2`, MANUAL, `click()` launches 1. Then `hold(true); r.tick(); removeMissile(r.d.tactical, 0); r.tick();` and expect `weaponSel` 1 with no `gunHeld`. `missilesLaunched` stays 1. After `hold(false); tick; hold(true); tick`, expect `gunHeld` true, and `gunShots > 0` after 20 ticks.

w4Ui: `act(() => duel.frame(view(weapons({ autocannon: { heat: 0, locked: false, offline: false, rate: '6/S' }, selected: 2, torpManual: true, missileFlying: true, torpSteer: true, torpCoast: false })))); expect(texts()).toContain('STEER LMB'); expect(texts()).not.toContain('STEER A/D');`.

### [P2] R1-F7 Task 2 misses the `torpTurn` uses in manualTorpedoFlight's 'keeps the mode it launched with' case
Step 1 rewrites only the 'flies a MANUAL torpedo…' case and the `manualTorpTurn` calls. The next case still steps `{ ...IDLE_INPUT, torpTurn: 1 }` twice. Once `torpTurn` leaves `ShipInput`, those literals fail tsc's excess-property check. At runtime the MANUAL torpedo would no longer turn, so `[m.manual, m.heading]` would read `[true, 0]` instead of W-3's number. The catch-all at L297 only covers 'any other file'. · tests/manualTorpedoFlight.test.ts:L105 and L113 (`{ ...IDLE_INPUT, torpTurn: 1 }`), with the expectation at L107. Plan L190-L208. · tsc and that case stay red until an executor notices. Spec §14 says W-3's flight tests keep their numbers. · Add to Step 1: in 'keeps the mode it launched with', `{ ...IDLE_INPUT, torpTurn: 1 }` becomes `{ ...IDLE_INPUT, torpHeading: 64 }` at L105 and L113, and the expectations stay (holdTurn toward 64 from 0 is +1 a tick, as `torpTurn: 1` was). Also update the file header (L3-L4, 'A and D turn it') and manualTorpedoInput's header (L4-L5) to cite W-4 spec §7.

### [P2] R1-F8 The 'git grep … no output' checks contradict the plan's own tests
Task 2 Step 6 and Task 7 Step 4 expect `git grep -n "torpTurn\|heldTorpSteer" -- src tests` (Task 7 also `STEER A/D`) to print nothing. Several things still match:
- the plan's own new tests use the string `torpTurn`: the `'torpTurn' in …` asserts, the malformed `{ torpTurn: 1 }` frames and the checkpoint's invalid `{ ...NONE, torpTurn: 1 }`;
- `tests/contactWindow.test.tsx` and the new w4Ui case assert `not.toContain('STEER A/D')`;
- `net/contracts.ts:112` (the torpMode doc) still says 'flown by the Weapons seat's held torpTurn and torpHeading', and no step edits it. · Plan L410-L411, L1089, L210, L220, L239, L256, L284. tests/contactWindow.test.tsx:L43. src/renderer/src/net/contracts.ts:L112. · Two verification steps cannot print what they promise. An executor following 'expected: no output' would stop. · Restrict both greps to `-- src`. Add a Step 4 edit to contracts.ts L112: 'flown by the Weapons seat's held torpHeading (W-4 spec §7: the LMB steer)'. Optionally add a test-side grep that allows only the listed negative assertions.

### [P3] R1-F9 The import-cycle guard in Task 3 checks the wrong edge
Step 4 says to inline the check 'if `hunter.ts` imports `turret.ts`'. It doesn't. The cycle comes through weapons.ts: turret.ts → manualTorpedo.ts → hunter.ts → weapons.ts (which imports `slewTurrets` from turret.ts after W-4b) → turret.ts. The condition is false, so the executor adds the import and creates a new cycle. It is harmless at runtime (only call-time uses), but the plan's own stated intent ('no import cycle') is missed. · Plan L572. src/renderer/src/sim/tactical/hunter.ts:L16 (imports weapons). manualTorpedo.ts:L4 (imports hunter). The W-4b plan's L815 has weapons.ts import turret.ts. · The instruction is ambiguous and defeats its own goal. · Always inline `missileOf(state, i)?.manual === true` in turret.ts (`missileOf` comes from state.ts, which turret.ts already uses), with the W-4 spec §3.4/§7 comment.

### [P3] R1-F10 Decision 8 returns the selection when the torpedo is selected at the flight's end; the spec says 'selected at launch'
Spec §7 says: 'If the torpedo was selected at launch, the selection returns to the last gun selected.' `flightFrame` tests `sel === WeaponSlot.Torpedo` on the end frame. Because A/D now select during a flight, the two rules differ in two cases:
- launched with F on pew, then 3 pressed mid-flight: the plan returns it, the spec does not;
- launched with the torpedo selected, then A mid-flight: the two outcomes coincide.
The deviation is not flagged as one. · Spec L387-L390. Plan L100 and L893. · This is a small spec drift. The spec's only firm requirement is that control returns to the selected gun, which the plan's rule satisfies. · State the choice as a deviation in Decision 8 ('at the end, not at launch: A/D select during the flight, so the selection at the end is the gunner's latest intent'), or record the selection in the latch at launch.

## Verified
- Task 2's sim edit matches today's code: manualTorpedo.ts:L10-L14 (the turn argument goes), duel.ts:L40, weapons.ts:L46-L49/L56/L58, hunter.ts:L143. step.ts L118-L123 `heldTorpSteer` and L302 `const steer` line are quoted exactly. W-4a's crew literal (W-4a plan L1243-L1247) keeps `torpTurn: steer.turn, torpHeading: steer.heading` and defines `gunnerHeld`, so `heldTorpHeading(gunnerHeld)` compiles.
- Every held schema is `.strict()`, so a frame carrying `torpTurn` becomes malformed: codec.ts:L164-L165, authority/checkpoint.ts:L40-L41, duelCheckpoint.ts:L73, replay.ts:L17. The core.ts expiry (L330) and pause (L436) texts match the plan's deletions. onlineDuel.ts:L74 `heldChanged`, L388-L392 and runtime.ts:L604-L612 match the quoted blocks.
- A grep of src, tests, scripts and services finds `torpTurn` only in the files Task 2 lists, plus the contracts.ts:L112 doc. No script, oracle or scripted gunner sends it, so removing it moves no hashed field. The oracle hashes flattenDuel, results, events and telemetry (duelOracle.ts:L271-L289), not the held inputs.
- Decision 11 holds. No oracle run sends torpMode or gunMode (duelOracle.ts ADDITIONS 57 comment L129-L132; W-4b Decision 13). Task 3's gates are inert without a MANUAL flight (no `pewFire` from the W-4b scripted gunner; the trigger gate is `turretClass && flying`). So `same` mode and a byte-identical duel-1.json and duel-rematch.json are the right expectations. duel-1.json carries no content digest (bless-golden.ts:L51-L54), and the same-version determinism stage rebinds the digest only on a clone (fixture.ts:L46-L49).
- Task 8 follows the bump machinery:
- both baselines are recorded at W4C_BLESS;
- the version changes alone in tuning.ts:L7 (60 today);
- `canonical-trace check`, then `duel-oracle check`, then `npm run bless`;
- bump mode needs no MIGRATIONS entry for 60 (duelOracle.ts:L377, L89 'a version with no entry maps every field to itself');
- goldenRefusal ties the baseline to the stored duel-1.json (L376);
- the smoke seed (duel-app-smoke.ts:L34, internet-app-smoke.ts:L16) is re-picked only if needed;
- determinism runs on three runtimes, the Valkyrn digests are diffed, and w4HunterIdentity's log is checked.
V is read at Task 1 and carried into the report, the commit messages and the gate line (plan L42-L45, L1249).
- W-4b's seam shapes are quoted correctly:
- the MAN branch's `continue` inside `for (const gun of …)` (W-4b plan L788-L808);
- the `pewFire` AUTO refusal line (L1318);
- `turret(slot)` with `predictTurret(d.tactical, slot, sentHeld, gunModeShown ?? …, unackedFrames)` (L1521-L1525);
- the online `sessionHeld` call with `gunModeSent` (L81).
The k = 0 gate at that call is correct. `slewTurrets` runs only for CREW_SLOT (L790), so `manualTorpedoFlying(state, i)` is the crew's.
- Decision 3 (gates read the flight at tick start) is consistent. stepDuel runs applyWeaponsInput before flyMissile and resolveMissiles (duel.ts:L34-L44), and the step admits commands before that, so the trigger, the pewFire admission and the slew all see the same flag.
- `torpedoSteer` mirrors `helmSteer` (flightPointer.ts:L80-L83) with `onWeaponsMap`'s blocks (L29-L44). The scene block's names all exist at its insertion point after L343: `running` L285, `shown` L322, `onConsole` L242, `cam`/`viewport`, `source.missilePrev`, `interpolatedMissile`, `readoutRows`, `options.leftHeld` and `options.pointer`. `lastAimed` is still used by the Flight block (L332). The test points (640, 200) and (740, 300) are clear of OWN_SHIP (x 236-476) and the other Weapons blocks (consoleLayout.ts:L7-L60).
- The camera edits match runtime.ts:L617 and onlineSource.ts:L199. `manualTorpedoFlying` stays imported and used by trackManualTorpedo (L619, L200). cameraInput.apply's `aims` subtracts rightX (runtime.ts:L111-L114), so removing the Weapons exemption makes a right drag pan.
- flightFrame's truth table matches its five unit cases (plan L830-L853). `nextWeaponSel`'s `steering` clause (W-4a plan L1775-L1780) and its w4Input lines (L1573-L1574) are the ones Task 5 rewrites. weaponsSeat.ts already uses WeaponSlot (L1784-L1786).
- Task 3's test helpers exist:
- `createSeatedDuel(CUTTER, 5, 0, 2, ShipClass.Valkyrn)` is used today (tests/crewSteering.test.ts:L68);
- ShipClass.Cutter is the Hound (defs.ts:L130);
- DuelSystem.Weapons is 1 (bars.ts:L8);
- `placeMissile`/`removeMissile` (state.ts:L306-L316), `hostileAt`, `gunShots` and `pewShots` (state.ts:L73, L83, L195);
- rejected results carry `reason` and noop results carry none (step.ts:L272-L274).
- The files named in the run lists exist (valkyrnRounds, valkyrnRoundsRocks, tacticalHunter, flightPointer, feelIiInput, duelRuntime, manualTorpedoUi, pewInput, manualLaserUi, targetingUi, duelCheckpoint, torpedoGuidance, pewHunter, valkyrnOnline, valkyrnRuntime). The STEER A/D sources are WeaponsStation.tsx:L12, L136 and consoleModel.ts:L59-L60.

## Not verified
- The precedent commits (`git show --stat aec698e1 7f9cc710 5c6165d6 b7c0919e`): only file tools were available, so Task 8's file set and order were checked against the bless and oracle scripts, not against those commits.
- The ledger.md contents. This is round 1 and the run dir has only the round-1 prompt, so `prior` is empty.
- Whether Task 3's AUTO case geometry (enemy at (150, 1200), 335 away, hostileAt 0) gives an AUTO solution through fog and line of sight; the plan defers this to W-4b's w4Auto placement. Also whether the Valkyrn-class case fires within 20 ticks on its default power.
- Whether W-4b's executed code matches its plan text, which W-4c anchors on (the branch does not exist in this checkout yet).
- No test suite, tsc or script was run (read-only review).

---

# Round 1 response (plan revised to rev after a818e098)

Reviewed `round-1.json` against the subject at `a818e098`. 10 accepted, 0 rejected, 0 deferred. Round 1 has no prior IDs.

## R1-F1 [P1]: Task 5 redeclares the online `lastGunSel`

Confirmed: the W-4a plan's Task 11 Step 3.4 declares it, resets it and updates it. Decision 8 now says both runtimes already keep it. Step 5.2 adds only `flight` and `triggerLive` to W-4a's `let` line and its resets. Step 5.3 replaces both of W-4a's lines.

## R1-F2 [P1]: Task 6's controls test finds the Helm's row first

Confirmed: controlsList.ts L59, and settingsAndControls.test.ts L51 needs it first. The test now filters the `Hold left mouse` rows and expects the Weapons one among them. The Helm row stays where it is.

## R1-F3 [P1]: No canonical baseline before Task 7's `golden` check

Confirmed: canonical-trace.ts L16-L21 and L30-L31, and versionOnly.ts L30. The fix has three parts:
- Task 1 Step 3 now also runs `canonical-trace.ts baseline`.
- Task 7 Step 1 also runs `canonical-trace.ts same`.
- The lost-baseline fallback now covers both proofs and the `golden` check.

## R1-F4 [P1]: Task 5 anchors on W-4a text that W-4b rewrites

Confirmed against the W-4b plan (its L1038 and L1040). Task 5 now quotes W-4b's merge and makes it `triggerLive && gunModeBase()`, keeping the reticle. It also quotes W-4b's pew click with `&& gunsManual`, and it keeps W-4b's dead-trigger line, which reads `trig = triggerLive`.

## R1-F5 [P1]: Task 5's online cases name a rig with no session

Confirmed: W-4b's w4Online `rig` is unit-level, onlineDuelSession's replica is a snapshot (L38-L42), and the autocannon has 0 bars at the start. The online case is now written in full in onlineDuelSession's Hound block, as the reviewer gave it:
- it places and removes the torpedo, then republishes with `r.client().publish(r.d)`;
- it tests the prediction on pew pew, with a note on why.

The test files are in Task 5's Files and commit.

## R1-F6 [P2]: The remaining placeholders

Confirmed. These are now written in full:
- the pan case, on manualTorpedoScene's rig, with a settable `samplePointer` and `drag()`, asserting `follow` is `'free'` and the centre moved by −40/zoom (camera.ts L68-L72);
- the two Single player flight cases, in `w4Runtime.test.ts` on W-4a's rig rather than a new file;
- the w4Ui STEER LMB case.

## R1-F7 [P2]: `torpTurn` in manualTorpedoFlight's 'keeps the mode' case

Confirmed: manualTorpedoFlight.test.ts L105 and L113. Both literals become `torpHeading: 64` and the expectations stay. The headers of manualTorpedoFlight and manualTorpedoInput cite W-4 spec §7.

## R1-F8 [P2]: The no-output greps contradict the plan's own tests

Confirmed:
- Both greps now cover `-- src` only, with a note that the tests keep negative asserts.
- Task 2 now edits contracts.ts' `torpMode` doc (L112) and the `HeldInput` doc to drop `torpTurn`.

## R1-F9 [P3]: The import-cycle guard checks the wrong edge

Confirmed: hunter.ts L16 imports weapons.ts, and W-4b's weapons.ts imports turret.ts. The guard is now always inline, `missileOf(state, i)?.manual === true`, with the cycle explained. `missileOf` is added to turret.ts's `./state` import if it is missing.

## R1-F10 [P3]: The end-of-flight selection versus the spec's 'at launch'

Confirmed: spec L387-L390. Decision 8 now states it as a deviation with its reason: A/D and 1-3 select during a flight, so the selection at the end is the gunner's latest intent, and no launch-time state is needed.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/plans/2026-11-19-w4c-manual-torpedo.md

<!-- end -->

---

