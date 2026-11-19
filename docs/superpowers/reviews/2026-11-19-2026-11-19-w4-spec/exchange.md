# Codex review exchange: 2026-11-19-w4-spec

Subject: `docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing c341d7fc, effort high, 511 s, 6055309 in / 5837362 cached / 46237 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 4/5/6 and 1/2/3 cannot share today's freqTo: the keyboard maps Digit3-5 to frequencies whatever the class
§9 says FREQ_CODES is read only on a laser class, and that a new GUN_FREQ_CODES (Digit4→0, Digit5→1, Digit6→2) feeds the same freqTo. The keyboard does not know the class. On every keydown in FREQ_CODES it sets freqTo (Digit3→0, Digit4→1, Digit5→2). One freqTo value cannot mean B on the laser fit and A on the Hound for the same key. On the Hound as written: pressing 3 to select the torpedo also sends laserFrequency A, which is now admitted. Pressing 4 sends B, not A. Selection digits also have no KeySample field to travel in. · spec L463-466, L481-482; src/renderer/src/app/duel/input.ts:L21 (FREQ_CODES), L146 (`if (!e.repeat && FREQ_CODES[e.code] !== undefined) freqTo = ...`, class-agnostic); runtime.ts:L521-522 and onlineDuel.ts:L303 send laserFrequency from k.freqTo at the Weapons seat; step.ts:L387 (the admission the spec opens to the Hound). · Two implementers would solve this differently (a class-aware keyboard, a second field, or raw codes). The obvious literal reading makes 3 both select the torpedo and retune the guns, a bug hit in ordinary play. · Specify the interface. Either the keyboard records the raw digit (e.g. `freqKey?: 'Digit3'|'Digit4'|'Digit5'|'Digit6'`) plus a `selectTo?: 0|1|2` from WEAPON_SELECT_CODES, and the runtime and online `play` map them by class; or the keyboard keeps two fields (`freqTo` from FREQ_CODES, `gunFreqTo` from GUN_FREQ_CODES) and the modes read one by class. Console frequency buttons keep writing freqTo directly. Add a w4Input test that 3 on the Hound queues no laserFrequency.

### [P1] R1-F2 The beam's leaving breaks a large set of Hound-laser tests the spec doesn't name, and §13.4's premise about manualLaser* is false
§13.4 says W-2's tests/manualLaser*.test.ts run on VALKYRN_LASER_CLASS and pass. They don't run on that class. Every one builds the Cutter: createTacticalState(5) with the default DUEL_CLASSES, parseShip(cutter), or createSeatedDuel(CUTTER). The laser fit ships only on the Valkyrn layout's Flight seat (main.ts L132, fleet.ts L22). That seat's runtime branch has no laserMode or laserFire path, so W-2's app tests (manualLaserInput, manualLaserScene, manualLaserUi) have no shipping seat to move to. More broadly, 56 test files send laser commands or read laserReleases or WeaponSlot.Beam. The helper todaysCrewWeapons puts 2 bars on WeaponSlot.Beam, which on the Hound now silently powers the autocannon. duelScripted's gunnerPew tests ('defence first', the spacing test) pin behaviour that no class keeps, since the Valkyrn has no pew. §14 lists none of these. · spec L642-643, L580-581, L745-747; tests/manualLaserMode.test.ts:L18, manualLaserBeam.test.ts:L26, manualLaserInput.test.ts:L21, manualLaserUi.test.tsx:L77; tests/helpers/crewWeapons.ts:L9-13; tests/duelScripted.test.ts:L118-160; runtime.ts:L434-464 (Flight branch: no laserMode or laserFire); main.ts:L132; Grep: 300 laser-command occurrences across 56 test files (ftlTargeting 28, tacticalWeapons 25, onlineDuelSession 20, tacticalMissiles 16, duel 16, tacticalHunter 14, engManualBars 14, disabledSystems 14, ...). · The plan's subagents will hit hundreds of red tests with no rule for each kind: port, replace or delete. The manualLaser 'passes unchanged' check, and with it the laser-fit fence, can't be met as written. · Add a §14 rule and an inventory. Sim tests that need a crew beam build state with cls ShipClass.ValkyrnLaser (createTacticalState or createDuel's cls argument). App tests for W-2 run the cutter layout with deps.cls = ValkyrnLaser, and the spec states that the laser-class Weapons-seat path is kept for that developer combination. todaysCrewWeapons is ported to the laser fit, with a sibling helper for the Hound. The gunnerPew tests are listed as kind (a) removals. List each affected file under kind a, b or port.

### [P1] R1-F3 W-4a's and W-4b's intermediate states are undefined: the gates, goldens and the pew's mode before AUTO exists
W-4a ships the gunner (spare bar to the autocannon, no pewFire, no laser) but no AUTO. So from W-4a to W-4b the crew bots fire no gun, and the per-seed gate `pewShots + gunShots ≥ 1` fails on every seed. Every rule change from W-4a on also moves tests/golden/duel-1.json, duel-rematch and the determinism fixture, but the bless is defined only at the merge (§13.3). W-4a's pewFire admission ('unavailable in AUTO') and pewGain's MAN table read gunsManual, which §3.1 places in W-4b. Each part still gets an 'Automated box' in docs/gates.md and is reviewed in turn. · spec L856-870 (W-4a builds the gunner; 'the gates are judged at the merge'), L339-347 and L232 (AUTO-dependent rules), L104-108 (gunsManual is W-4b's state), L617-626 (bless only at the merge), L745-747. · Each part must build and test cleanly in order. Without a rule, one plan leaves red tests on the branch, another skips them, and a third keeps the old gunner. Reviews of W-4a and W-4b can't tell regressions from expected failures. · State per part: (1) W-4a has no mode, so pewFire is admitted as MAN is later, with AUTO gain tables, and gunHeld fires the autocannon. (2) Either re-bless at SIM 59 on the branch at the end of each part (kind b), or name the tests marked `it.skip('until W-4b: …')` (the duelGates and duelScripted per-seed 'uses both weapons', the goldens), with W-4b's plan un-skipping them. (3) Alternatively keep W-4a's gunner sending a MAN pewFire until W-4b. Pick one.

### [P1] R1-F4 Online turret prediction (§11) can't be built as written and its test is vacuous
The spec says the client runs slewTurret 'over the held frames it has sent and the replica hasn't shown'. The client keeps no per-frame history: source.sent stores only the latest held, and unacked is a count capped at 30. slewTurret needs a heading per tick, but the Helm is the other player and its heading is not predicted. It also needs the mode (the replica's gunsManual or gunModeSent?) and the gates the sim applies (0 bars, a MANUAL torpedo in flight, unattended, the torpedo selected). The unacked count is in held frames, not ticks, and frames come faster than 60 Hz. The listed test, 'the predicted turret matches the stepped turret once the replica catches up', holds trivially at zero unacked frames. · spec L543-550, L736-739; onlineSource.ts:L165-173 (thrMille = rampTicks(latest held, unackedFrames)), L208 (sent keeps the last held only); onlineDuel.ts:L393-399 (unacked from heldHighWater, UNACKED_MAX 30, L64). · Two implementers would predict differently: a history buffer, or the latest aim repeated; replica or interpolated heading. Neither the agreement with the authority nor the behaviour on a mode change is testable as specified. · Define it as the throttle's analogue. predicted = slewTurret applied k = unacked times to the replica's turret, with the latest sent turretAim and the replica's heading. Traverse is MAN's when (gunModeSent?.manual ?? replica gunsManual) is true, and k = 0 when AUTO, bars 0, the torpedo selected or a MANUAL torpedo flying. Test: with unacked = k, a fixed heading and the same held, the prediction equals the authority's turret after k stepped ticks; a mode toggle in flight uses gunModeSent.

### [P2] R1-F5 The gates read pewShots/gunShots that the telemetry and DuelRun don't carry
§2.1 says the gates read pewShots and gunShots, and §14 kind (a) says the per-seed gate becomes `pewShots + gunShots ≥ 1`. ShipTelemetry has neither field. DuelRun keeps only telemetry and hashes, not the final systems. The Valkyrn gate gets gunShots from its own ValkyrnRun helper. · spec L97-98, L745-747; sim/duel/telemetry.ts:L25-32 (ShipTelemetry fields); tests/helpers/scriptedDuel.ts:L30 (DuelRun); tests/helpers/valkyrnGate.ts:L23, L39 (gunShots read from systems). · An interface the spec assumes doesn't exist. One implementer would add it to telemetry and another to the test helper. · Say where they come from: add `pewShots` and `gunShots` to DuelRun from the final `systems[0]` (as ValkyrnRun does), or to ShipTelemetry. Add them to telemetryLine for the report, with the hold-end tick and cause.

### [P2] R1-F6 Scripted gunner: the 'refused shipPower' case and the every-command-admitted test
The gunner sends shipPower and weaponPower in one tick, so it can't see a refused shipPower before weaponPower is judged. 'If the shipPower is refused, it moves nothing' only holds if the gunner checks for a spare bar and capacity before sending. duelScripted's whole-duel test requires every command 'applied' and pins the kinds list ['laserLock','sit','stand','torpLock','weaponPower']. On the Hound that list becomes shipPower without laserLock. Neither change is named. · spec L559-564, L740-744; sim/duel/scripted.ts:L336-338 (barMoved gate); tests/duelScripted.test.ts:L88-95; sim/duel/power.ts:L41, L48-51 (sparesOf, applyPower refusals). · A gunner that sends blindly fails the admitted-commands test whenever the spare is gone, and the pinned kinds list breaks without a named kind-(a) change. · Specify `moving = !barMoved && sparesOf(d) ≥ 1 && capacityOf(d, Weapons) > bars[Weapons] && weaponBars(Autocannon) === 0` on a turret class; otherwise send nothing. List the kinds-test update (shipPower in, laserLock out) under kind (a).

### [P2] R1-F7 Planet-vs-rock ties: the spec's 'as today' is the reverse of the code
§5.1 says the planet and a ship still win their ties over a rock, and §14 tests 'the planet and a ship keep their ties over a rock'. In stepRounds, rocks are swept before the planet and the planet needs a strictly smaller entry, so a rock wins an exact tie with the planet. The function's own doc says 'ship, then rocks by ascending slot, then the planet'. · spec L282, L669; sim/tactical/gun.ts:L115 (doc), L134-140 (rock `t < best`, then planet `tp < best`). · On the Hound a tie now decides whether a rock is worn. A test written from the spec fails, or the code gets changed to match the spec. Harmless for the Valkyrn, where both are absorbed, but it is a contradiction. · Write: 'a ship wins its ties; on an exact rock–planet tie the rock is the contact, as today', and test that.

### [P2] R1-F8 Tuning ladder has no step sizes, bounds or stop rule
The ladder names four knobs in order 'until the crew wins at least one seed'. It gives no direction or step (hitsPerHull 12→?), no limits, no rule for when to move to the next rung, and no outcome if all four fail. The target is also ungated, because the aggregate stays it.skip. The bots lose 10/10 today and now lose the beam's opener. · spec L582-589, L748; tests/duelGates.test.ts:L24 (aggregate skipped). · Tuning can't be executed reproducibly by a subagent. Two runs would ship different AUTOCANNON numbers into SIM 60's goldens. · Give each rung its values (e.g. hitsPerHull 12, 10, 8, 6; AUTOCANNON_AUTO_RANGE 600 then 450; MISSILE_GAP −25 % steps; gunner bars 1/1/1 then 1/2/0). Say to stop at the first setting where at least one seed is a crew win and all per-seed gates pass. If none does, ship the base numbers and record the sweep in the report.

### [P3] R1-F9 Valkyrn identity 'leave out by name' and hunter.ts's ShipInput literal need stating
valkyrnIdentity digests the whole flattenTactical array. thrMille is left out only because it was never in it, so 'as it already leaves out thrMille' is no precedent. Dropping systems.*.pewTurret/gunTurret/gunsManual means rebuilding the array from the module fields and skipping those names. Separately, hunter.ts builds its own ShipInput literal with torpTurn, which must change even though §1 says hunter.ts keeps its code paths. · spec L630-633, L411-414; tests/valkyrnIdentity.test.ts:L29; sim/tactical/hunter.ts:L143. · These are small, but both are typecheck or digest traps for a fresh subagent. · Say the digest flattens via TACTICAL_MODULES' fields and skips the three names. Name hunter.ts:L143's literal in §8's ShipInput change (drop torpTurn; add turretAim −1, weaponSel −1, pewTrigger false).

## Verified
- The gunner's +1/+1 reaches 1/1/1: START_BARS [2,2,3,1,1] uses 9 of REACTOR_BARS 10, Weapons is index 1 with 2 bars against START_WEAPON_POWER [1,0,1] (bars.ts:L8, L20-21, L70). Ship commands are admitted before weaponPower in the same tick (step.ts:L416-440).
- Hostility counts shots + gunShots + pewShots or missilesLaunched, and hostilityStep runs after tickWeapons (science.ts:L36-42; duel.ts:L47-48). So AUTO opens on the tick after the hold ends, as §4.3 says.
- Laser commands are 'unavailable' on a null laser (step.ts:L313). laserFrequency's admission is at step.ts:L387 and laserFrequency sits in the science module's command list (hash.ts:L179).
- The Valkyrn's scripted gunner never sends pewFire, because gunnerPew returns when pewReady is false without a pew (scripted.ts:L311). Dropping pewFire's aim therefore can't change the Valkyrn pair's commands. The Hunter never sends pewFire; its pewAim path is separate (weapons.ts:L338; hunter.ts:L143).
- hunterThink reads only the crew's rooms (hunter.ts:L164), so the Hound's class change doesn't move hunterThink's outputs for a fixed trajectory.
- gunHit compares ++gunWear with the owner's threshold of the moment (gun.ts:L97). The gunWear bound most(hitsPerLayer) − 1 = 7 (hash.ts:L246) holds with a weak threshold of 4.
- The gunCooldown bound is most(intervalTicks) (hash.ts:L245). AUTOCANNON spreads GUN (intervalTicks 6), so the explicit table term in spec L603 is needed and correct at 10.
- Rock rules: rockHp = ceil(r/10), so r 15 gives 2 hp and 8 rounds at 0.25. hitRock pushes the hit event, bumps rockHits and fan-breaks at hp ≤ 0 with rocksBroken for the owner. pushRock wakes the rock and skips born pieces (rockBreak.ts:L54-74, L99-103; rocks.ts:L29, L33).
- rockSounds plays ROCK_CRACK only for a 'laser' hit, so a 'gun' hit is silent by default (rockSounds.ts:L23). rockFx's spark is drawn only for collision bumps, so the 'gun' hit branch must be added (rockFx.ts:L51).
- Held frames go out every frame (onlineDuel.ts:L393), so the 250 ms expiry only fires on a stalled link. neutralizeExpired writes NO_HELD (core.ts:L319-322), which clears turretAim, weaponSel and gunHeld together. The pause clear is at core.ts:L436.
- Traverse arithmetic: 364, 455, 273 and 341 fine steps a tick at 60 Hz are 120.0°, 150.0°, 90.0° and 112.4°/s. AUTOCANNON_ARC_STEPS = floor(65536/12) = 5461. AUTO pew gains 360/60, 360/45, 360/30 and 360/24 = 6, 8, 12 and 15.
- launchMissile sets torpRoom from torpLock and clears it; MANUAL takes no lock (missiles.ts:L21-35). manualTorpTurn's turn argument is separable from holdTurn (manualTorpedo.ts:L10-14).
- pewFire's codec schema (codec.ts:L127), the held schema with torpTurn (codec.ts:L163-165) and HeldInput (contracts.ts:L40) are where §8 says. WEAPON_ORDER and DUEL_KINDS are at step.ts:L43-46.

## Not verified
- consoleLayout.ts weaponCard, weaponsModel.ts L260-305, tacticalLayer.ts L375 and the map draws: not read.
- snapshotValidation.ts's laserManual crew-only check and where §13.1's per-class turret bounds would go: hash.ts's systemsRules was read, snapshotValidation.ts was not.
- tests/duelModules.test.ts's pinned lists, tests/valkyrnRoundsRocks.test.ts and the manualTorpedo*.test.ts contents: not read beyond grep.
- flightPointer.ts, mapRequests.ts and the leftHeld plumbing at the Weapons seat in single player and online: not read. LMB press, hold and fresh-press handling is assumed buildable.
- contactController's laserFit flag and how the Weapons-station pick-up would detect the Hound: only L120-157 was read.
- Whether the scripted Helm keeps the Hunter inside ±60° within 450 u often enough for AUTO pew to fire in every gate seed: needs a run.
- scripts/golden/blessGuard behaviour and the duel app smoke's forced-round-end seed: not read.
- The run dir has no ledger.md (only the round-1 prompt and output files), so there were no prior findings to check.

---

# Round 1 response (spec revised to rev after c341d7fc)

Reviewed `round-1.json` against the subject at `c341d7fc`. 9 accepted, 0 rejected, 0 deferred. Round 1 has no prior IDs.

## R1-F1 [P1]: 4/5/6 and 1/2/3 cannot share today's freqTo

Confirmed: input.ts L146 sets `freqTo` from `FREQ_CODES` on every keydown, whatever the class. §9's clash bullet now splits the digits into `freqKeyTo` (FREQ_CODES), `gunFreqKeyTo` (GUN_FREQ_CODES) and `selectTo` (WEAPON_SELECT_CODES). `freqTo` is the console buttons' only. The runtime and online read `freqKeyTo ?? freqTo` on a laser class and `gunFreqKeyTo ?? freqTo` on the Hound. §14 adds "3 on the Hound queues no laserFrequency".

## R1-F2 [P1]: The beam's leaving breaks Hound-laser tests the spec doesn't name

Confirmed: manualLaserMode.test.ts L18 calls `todaysCrewWeapons(createTacticalState(5))` (the Cutter by default, state.ts L273). The grep finds 60 files. §13.4 now says the manualLaser tests are ported to the laser fit, and the laser class's Weapons-seat runtime path is kept, reachable through `cls` (runtime.ts L174, L271). The new §14.1 gives the rules (port by class argument, kind (a) for the Hound-with-beam pins including gunnerPew and the kinds list, the helper's meaning and a `houndWeapons` sibling, kind (b) re-picks, and unchanged cases). W-4a's plan lists every file with its rule.

## R1-F3 [P1]: W-4a's and W-4b's intermediate states are undefined

Confirmed. The new §19.1 says:
- each part that moves a whole run ends with a same-version bless at SIM 59 and its kind (b) re-picks; the bump runs once at the end of W-4c;
- the per-seed gates pass at every part's end, and the ladder runs at the end of W-4b;
- W-4a has no mode: `pewFire {}` is admitted as MAN, along the nose with the AUTO gain; `gunHeld` fires at row 0; the gunner keeps a stand-in ship-only pew rule; and a MANUAL torpedo keeps W-3's A/D steer;
- W-4b leaves §7's flight rules to W-4c.

§19 item 1 no longer says the gates are judged only at the merge. §13.3 points at §19.1.

## R1-F4 [P1]: Online turret prediction can't be built as written

Confirmed: onlineSource.ts L165-L173 predicts thrMille from the latest sent held frame applied `unackedFrames` times. There is no history. §11 now defines the turret's prediction the same way: k = unackedFrames from the replica turret, the replica heading, the latest `turretAim` and MAN traverse. k = 0 unless MAN (gunModeSent, else the replica), a powered gun is selected, the reticle is present and (from W-4c) no MANUAL flight. It also states the frames-versus-ticks lead. §14's online tests now pin equality after k ticks, the k = 0 cases and the in-flight mode.

## R1-F5 [P2]: The gates read pewShots/gunShots that DuelRun doesn't carry

Confirmed: scriptedDuel.ts L30. §2.1 adds `pewShots`, `gunShots`, `holdEndTick` and `holdCause` to `DuelRun` from the final state and the `hostile` event (science.ts L41), as ValkyrnRun does. ShipTelemetry is unchanged, and the telemetry script prints them.

## R1-F6 [P2]: Scripted gunner's refused shipPower and the kinds test

Confirmed: power.ts L48-L51 and duelScripted.test.ts L94. §12 now gives the pre-check (`sparesOf`, `capacityOf`, the autocannon at 0 bars) so that every sent command is admitted. §14 adds the kinds-list kind (a) change.

## R1-F7 [P2]: Planet-vs-rock ties

Confirmed: gun.ts L134-L140 sweeps the rocks before the planet with strict `<`. §5.1 and §14 now state today's order: the ship wins, and a rock wins an exact tie with the planet and is worn.

## R1-F8 [P2]: Tuning ladder has no steps or stop rule

Confirmed. §12 now gives each rung's values. It runs once at the end of W-4b and stops at the first setting with at least one crew win and every per-seed gate passing. If none passes, the base numbers ship and the sweep is reported for the owner.

## R1-F9 [P3]: Valkyrn identity 'leave out by name' and hunter.ts's literal

Confirmed: valkyrnIdentity.test.ts L29 and hunter.ts L143. §13.4 says to build the array from `TACTICAL_MODULES` (hash.ts L183) and skip the three names. §8 and §1 name the Hunter's literal as the only `hunter.ts` edit.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md

<!-- end -->

---

# Round 2 (delta, reviewing 833b0627, effort medium, 69 s, 293274 in / 242880 cached / 6843 out)

Verdict: ready with P2s

## Findings

### [P2] R2-F1 Moving the digit keys off freqTo drops the gun fit's 3/4/5 NO LASER cue and breaks key-path tests that §14.1's grep misses
After R1-F1's fix, keyboard Digit3/4/5 write only `freqKeyTo`, and §9 says it is 'read only on a class with a laser'. `freqTo` now comes only from the console buttons. Today the Valkyrn gun fit's Flight seat flashes NO LASER when `k.freqTo` is set by 3/4/5 (Valkyrn spec §6.1, its review R1-F2). Read literally, the new text never reads `freqKeyTo` there, so pressing 3/4/5 on the Valkyrn goes silent. That breaks the 'Valkyrn's Flight seat keeps theirs' promise at spec L444-445. valkyrnRuntime's test still passes because it injects `freqTo` directly, so nothing catches the loss. Also, scienceInput.test.ts asserts that Digit3/Digit5 keydowns set `freqTo`, and those asserts now fail. §14.1's inventory grep has no `freqTo`/`FREQ_CODES` term, so this file isn't covered by any rule. · spec L444-445, L473-474 ('Read only on a class with a laser'), L479, L482-484; runtime.ts:L453 (`else if (requests.noLaser || (k.freqTo !== undefined && k.freqTo !== null) || …) refuse('laser', NO_LASER)   // §6.1: 1 or 3/4/5 on the gun fit`); input.ts:L146; tests/valkyrnRuntime.test.ts:L127-134 (holds `{ freqTo: 1 }` to stand in for 3/4/5); tests/scienceInput.test.ts:L38-44 (Digit3/Digit5 keydowns expect `sample().freqTo`); spec L810 (§14.1 grep pattern: laserLock|laserFire|laserCharge|laserMode|laserReleases|WeaponSlot.Beam|todaysCrewWeapons). · This is a quiet regression of a pinned Valkyrn cue that the existing test can't detect. The scienceInput failures will turn up red during W-4a with no rule in §14.1 telling the subagent what to do with them. · In §9, say that the gun fit's Flight seat refuses NO LASER on `freqKeyTo ?? freqTo` (runtime.ts L453 reads both), and change valkyrnRuntime's test to hold `freqKeyTo`. Add `freqTo`/`FREQ_CODES` to §14.1's grep, and list scienceInput.test.ts as a port: key asserts move to `freqKeyTo`, the console `ui.frequency` asserts stay on `freqTo`, and new asserts cover Digit4-6 → `gunFreqKeyTo` and Digit1-3/Numpad1-3 → `selectTo`, including the clear/clearUi and repeat cases.

## Prior findings
- R1-F1: resolved — §9 L471-486 adds separate freqKeyTo/gunFreqKeyTo/selectTo KeySample fields with class-based reading, and the §14 test at L729-731 pins that 3 on the Hound queues no laserFrequency. A side effect on the gun fit's cue is raised as a new P2.
- R1-F2: resolved — §13.4 L682-691 corrects the premise and keeps the laser-class Weapons-seat path through cls. §14.1 L806-829 gives port/kind-a/helper/kind-b/unchanged rules. The createTacticalState(seed, slots, crewClass) signature (state.ts:L273) and createDuel's cls argument (duel/state.ts:L97) match the port rule.
- R1-F3: resolved — §19.1 L969-994 defines per-part same-version blesses, per-seed gates passing at every part end, W-4a's no-mode pewFire admission with PEW_TICKS_BY_BARS, the stand-in gunner pew, and the W-4b/W-4c boundaries. §19 item 1 and §13.3 L663 agree with it.
- R1-F4: resolved — §11 L566-579 defines the prediction as the thrMille analogue (k = unackedFrames capped, replica heading held fixed, latest turretAim, MAN traverse, explicit k=0 conditions, gunModeSent first). The §14 online tests at L787-790 are concrete and not vacuous.
- R1-F5: resolved — §2.1 L97-102 adds pewShots/gunShots/holdEndTick/holdCause to DuelRun from the final state and the hostile event. tactical.hostileAt exists (hash.ts:L165) and the hostile event carries its cause (science.ts:L41).
- R1-F6: resolved — §12 L593-596 gives the sparesOf/capacityOf/autocannon-at-0 pre-check, and §14 L797-799 names the kinds-list change as kind (a), including the W-4a stand-in's pewFire.
- R1-F7: resolved — §5.1 L286-288 and §14 L717 now match stepRounds' order (ship, rocks, planet, strict <): a rock wins an exact tie with the planet and is worn.
- R1-F8: resolved — §12 L616-626 gives per-rung values, a single pass at W-4b end with earlier rungs held at base, a stop rule, and a fallback to base numbers plus a sweep report.
- R1-F9: resolved — §13.4 L668-672 builds the digest from TACTICAL_MODULES' fields, skipping the three names, and says this is new. §8 L420-422 and §1 L34 name hunter.ts L143's literal as the only hunter.ts edit.

## Verified
- input.ts:L146, L160-161, L176, L191-192: freqTo is set by FREQ_CODES keydowns and by ui.frequency, and cleared by clear/clearUi. This matches the premise of spec L471-481.
- runtime.ts:L449-453 and L521-522, onlineDuel.ts:L303: the laserFrequency send sites the spec names.
- state.ts:L273 createTacticalState(seed, slots, crewClass) and duel/state.ts:L97 createDuel(layout, seed, helmPlayer, crew, cls) support §14.1's port rule.
- science.ts:L40-41 and state.ts:L149: the hostile event's cause union includes 'gun' and 'pew', as §2.1's holdCause and §14's hold tests need.
- scripted.ts imports: it already imports weaponBars/WeaponSlot from bars.ts. sparesOf/capacityOf would be a new import from power.ts, which §12 names.

## Not verified
- Whether flattenTactical iterates TACTICAL_MODULES' fields in exactly the order §13.4's rebuilt digest assumes. I didn't read hash.ts's flattenTactical body.
- Whether the W-4a stand-in gunner (ship-only pew along the nose, ±60°) gets pewShots ≥ 1 on every gate seed. This can only be checked by running the duel gates, which is out of scope here.
- sparesOf/capacityOf exact signatures in sim/duel/power.ts (cited by the ledger at L41/L48-51, not re-read).

---

# Round 2 response (spec revised to rev after 833b0627)

Reviewed `round-2.json` against the subject at `833b0627`. 1 accepted, 0 rejected, 0 deferred. The reviewer confirmed R1-F1 to R1-F9 resolved.

## R2-F1 [P2]: Moving the digit keys off freqTo drops the gun fit's NO LASER cue and misses key-path tests

Confirmed: runtime.ts L453 refuses NO LASER on `k.freqTo`, and scienceInput.test.ts L38-L44 asserts that keydowns set `freqTo`. §9 now says the gun fit's Flight seat refuses on `freqKeyTo ?? freqTo`, and that `valkyrnRuntime.test.ts` holds `freqKeyTo`. The `freqKeyTo` bullet says it tunes only on a laser class and only raises NO LASER on the gun fit. §14.1's grep adds `freqTo|FREQ_CODES`, and a new "key path" rule ports scienceInput.test.ts: key asserts move to `freqKeyTo`, console asserts stay on `freqTo`, and there are new `gunFreqKeyTo` / `selectTo` asserts with the repeat and clear cases.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-w4-weapons-controls-design.md

<!-- end -->

---

