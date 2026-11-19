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
