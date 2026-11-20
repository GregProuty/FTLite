# Ledger: w4-amendment-spec

| id | sev | title | status | cycles | note |
|---|---|---|---|---|---|
| R1-F1 | P1 | Nothing on the branch writes `lock` on the Hound: applyWeaponsInput drops laserLock on a laser-less class | fixed:R1 | 0 | spec 3.2: step.ts no-laser line exempts laserLock on a turret class; new lock-only branch in applyWeaponsInput |
| R1-F2 | P1 | The round `room` field cannot be left out by name, bounded or validated as written | fixed:R1 | 0 | spec 3.3: separate room field after flight, ROUND_SLOT 8, bounds by crew owner, placeRound and emptyRound write it |
| R1-F3 | P1 | With the torpedo picked up, E/Q at the Hound's seat are taken by the contact controller as `torpStep` | fixed:R1 | 0 | spec 3.6: contact controller does not take E/Q at the Hound seat; test added |
| R1-F4 | P2 | The enemy window's bracket is gated on `laserTargeted`, which the amendment keeps false on the Hound | fixed:R1 | 0 | spec 3.6: lockRoom is crewSys.lock on a turret class |
| R1-F5 | P2 | Online base for the E/Q room step is unstated | fixed:R1 | 0 | spec 3.6: lockSent online, cleared as torpModeSent |
| R1-F6 | P2 | The third hint row has no vertical room on the Hound's console | fixed:R1 | 0 | spec 2.5: two hint rows, row 2 swaps text while the torpedo has a target |
| R1-F7 | P2 | The amendment breaks W-4 §2.1, §14 and §15 without listing them, and W-4a tests pin the old rules | fixed:R1 | 0 | header lists 2.1, 14, 15; spec 5 names replaced bullets and three kind (a) test rewrites |
| R1-F8 | P2 | §6's task mapping misses Tasks 4, 6 and 8, and the room-tag task must follow Task 6 | fixed:R1 | 0 | spec 6: all gunsManual mentions follow, pewFire rule in Task 6, the room sim task after Task 6 |
| R1-F9 | P2 | Z and V are not read at the Flight seat today, so a §5 test can't pass as written | fixed:R1 | 0 | spec 2.4, 5, 7: Flight seat reads none of Z, V, R |
| R1-F10 | P2 | The duel key handler can't see Ctrl or Meta | fixed:R1 | 0 | spec 2.4: KeyEventLike gains ctrlKey and metaKey; KeyR ignored with either |
| R1-F11 | P2 | The new `pewHit` room/level and its callout are unspecified online and in the view | fixed:R1 | 0 | spec 3.4: hitCallouts pew branch, pushHits flash, online room -1 |
| R1-F12 | P2 | An AUTO torpedo reads `lock` when it lands, so Q/E now retarget one in flight | fixed:R1 | 0 | spec 3.1: lock read at landing, stated and tested; report torpedo levels defined |
