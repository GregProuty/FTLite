# Round 1 response (spec revised)

Reviewed `round-1.json` against the subject at `2993a192`. 12 accepted, 0 rejected, 0 deferred. Each was checked against the W-4 branch's code in `.worktrees/w4` (3b2a90c5) before the spec changed.

## R1-F1 [P1]: Nothing on the branch writes `lock` on the Hound: applyWeaponsInput drops laserLock on a laser-less class

Confirmed. `weapons.ts` L305-L310 gates the whole `laserLock` block on `armed` (`slots.laser !== null`), and `step.ts` L328 answers `laserLock` `unavailable` on a no-laser class before the `malformed` check at L340. §3.2 now says both: the no-laser line stops catching `laserLock` on a class with a turret gun (`hasTurret`), and a second branch in `applyWeaponsInput`'s locks step writes `s.lock` only (crew slot, no laser, turret gun, `input.weapons`, a `validLock` room), leaving `laserTargeted` and `laserRock` alone. §5 gains the same-tick `laserLock` plus hand shot test.

## R1-F2 [P1]: The round `room` field cannot be left out by name, bounded or validated as written

Confirmed on all four points: the identity test filters whole fields by name (`valkyrnIdentity.test.ts` L27-L30), `ROUND_KEYS` is the `flight` vector (`hash.ts` L35, L73-L87), the round validator finds `active` by back-offset and runs before classes are known (L351-L356), and `placeRound` copies a fixed member list (`gun.ts` L21). §3.3 now specifies a separate scalar field `${pool}.${k}.room` after `flight`, `MissingRoundKeys` excluding `'room'`, `ROUND_SLOT` 8, the back-offset, the bound (0..3, 0 when free, nonzero only for a `CREW_SLOT` owner) with the reason the class is not checked, and `placeRound` / `emptyRound` writing it with every caller passing it. §5's hash bullet follows.

## R1-F3 [P1]: With the torpedo picked up, E/Q at the Hound's seat are taken by the contact controller as `torpStep`

Confirmed. `contactController.ts` L143-L146 returns true for KeyE / KeyQ at `weapons` while the torpedo is picked up and adds to `torpStep`. §3.6 now fences it: the controller is told the seat is the Hound's (a flag on `ContactSync`, as `laser` is), E / Q fall through to the target-room step, the pick-up stays, and the Hound's branch never reads `requests.torpStep`. §5 gains the test, and §8 item 11 records the call.

## R1-F4 [P2]: The enemy window's bracket is gated on `laserTargeted`, which the amendment keeps false on the Hound

Confirmed (`contactModel.ts` L159, L191). §3.6 now says `lockRoom` is `crewSys.lock` on a class with a turret gun whenever the window draws the enemy's rooms, the unknown-contact drawing included, and `laserTargeted ? lock : null` on any other class.

## R1-F5 [P2]: Online base for the E/Q room step is unstated

Confirmed. Online has no queued list, and the laser fit's branch steps from the replica's `lock` (`onlineDuel.ts` L339-L343). §3.6 adds `lockSent {room, sequence, round}`, cleared as `torpModeSent` is (L231, L248, L251, L417), and §5's Online bullet tests it.

## R1-F6 [P2]: The third hint row has no vertical room on the Hound's console

Confirmed (`WeaponsStation.tsx` L160-L164: rows at `y0 + 116` and `y0 + 134`, the divider at `y0 + 156`). §2.5 keeps two rows: row 2 is `R AUTO/MAN · Q/E ROOM: <NAME>` (30 characters), and while the torpedo has a target it reads `Q/E ROOM: <NAME> · RMB TORPEDO: CLEAR` (38 characters, inside W-4's measured 39-character row). §8 item 12 records the swap; §5 tests both texts.

## R1-F7 [P2]: The amendment breaks W-4 §2.1, §14 and §15 without listing them, and W-4a tests pin the old rules

Confirmed against W-4 L82-L86, L759, L767, L914 and the three test cases (`w4PewFire.test.ts` L55-L64, `w4Runtime.test.ts` L97-L101, `w4Autocannon.test.ts` L78-L89). The header now lists §2.1 and §15 and says §14 has two replaced bullets. §5 opens with the replaced bullets and names the three tests as kind (a) rewrites.

## R1-F8 [P2]: §6's task mapping misses Tasks 4, 6 and 8, and the room-tag task must follow Task 6

Confirmed: the stand-in `pewFire` is at `scripted.ts` L350-L352 until Task 6 deletes it. §6 now says every later mention of `gunsManual` follows (the header and Tasks 3 to 9), maps "`pewFire` reads `pewManual`" to Task 6, and places the §3 sim task after Task 6 with the reason.

## R1-F9 [P2]: Z and V are not read at the Flight seat today, so a §5 test can't pass as written

Confirmed: the Flight branch (`runtime.ts` L444-L474) reads neither `p.laserMode` nor `p.torpMode`; the reads are at L530 (the Hound) and L570, L583 (a laser class's Weapons seat). §2.4, §5 and §7 now name only the laser fit's Weapons seat, say the Flight seat reads none of Z, V and R, and say W-4a's V read at the Hound goes.

## R1-F10 [P2]: The duel key handler can't see Ctrl or Meta

Confirmed (`input.ts` L131: `KeyEventLike` has `code`, `repeat`, `shiftKey?`). §2.4 now adds `ctrlKey?` and `metaKey?` to it and has `down` count no KeyR action when either is set; KeyR is not added to `GUARDED_CODES`. §5 tests it with the fake event source.

## R1-F11 [P2]: The new `pewHit` room/level and its callout are unspecified online and in the view

Confirmed (`hitModel.ts` L57, L76 have gun branches only; `onlineSource.ts` L89, L93 build both events with no room). §3.4 now specifies `hitCallouts`' pew branch (`PEW: `, on `level`), `pushHits`' flash (room ≥ 0), and that online synthesizes `room: -1, level: false` as the gun does today. §7 lists online room callouts as not in this build, and §8 item 13 records it.

## R1-F12 [P2]: An AUTO torpedo reads `lock` when it lands, so Q/E now retarget one in flight

Confirmed (`missiles.ts` L30-L32, L120). Kept as today's code, and stated: §3.1 says the room is read when the torpedo lands, a torpedo launched with a lock keeps its room, and why it differs from a round. §5's test names the moment. §3.5 defines the report's torpedo levels as the struck room's level after the tick minus before. §8 item 6 records the call for the owner.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md

<!-- end -->
