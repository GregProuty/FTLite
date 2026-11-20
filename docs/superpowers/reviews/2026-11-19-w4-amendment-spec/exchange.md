# Codex review exchange: w4-amendment-spec

Subject: `docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md` (spec). Reviewer: Codex CLI via `codex exec`. Responder: controller.

---

# Round 1 (full, reviewing 2993a192, effort high, 433 s, 6587021 in / 6358262 cached / 37377 out)

Verdict: changes requested

## Findings

### [P1] R1-F1 Nothing on the branch writes `lock` on the Hound: applyWeaponsInput drops laserLock on a laser-less class
§3.2 says an admitted `laserLock` 'sets `lock` to the room', and that `laserTargeted` stays false because `applyWeaponsInput` sets it only on a class with a laser. That describes the code as if it already handled this. It does not. In `applyWeaponsInput` the whole laserLock block is gated on `armed` (`slots.laser !== null`), so on the Hound `crew.laserLock` is ignored and `lock` never moves. The spec does not say where the write goes: in step.ts admission at once (like laserMode), or in applyWeaponsInput behind a new turret-class branch. It also does not say whether that branch clears `laserRock` and whether it needs `input.weapons`. Separately, step.ts's no-laser `unavailable` line catches laserLock before `malformed`; it has to exempt the Hound for laserLock only. · spec L145-L156; .worktrees/w4/src/renderer/src/sim/tactical/weapons.ts:L305-L310 (`armed && input.weapons && input.laserLock !== null ...`); .worktrees/w4/src/renderer/src/sim/duel/step.ts:L328 (laserLock `unavailable` when `slots.laser === null`, before L340's malformed/seen checks) · Built as written, Q/E and the room click would be admitted 'applied' and change nothing. Two builders would put the write in different places. Unit tests that drive `applyWeaponsInput` with `laserLock` would pass for one build and fail for the other, and the same-tick order against a hand round would differ. · State it. In `applyWeaponsInput`'s locks step (first, before `tickGun` and the pew), for the crew on a class with no laser and `hasTurret`, with `input.weapons` and a `validLock` room, set `s.lock` and nothing else (no `laserTargeted`, no `laserRock`). In step.ts L328, drop `laserLock` from the no-laser `unavailable` list when `hasTurret(cls)`, then apply §3.2's order. Add a test that a same-tick `laserLock` plus a hand round tags the new room.

### [P1] R1-F2 The round `room` field cannot be left out by name, bounded or validated as written
§3.3 says `roundFields` 'gains the field', that the bound is 0 unless 'its owner is the crew slot of a class with a turret in that pool's weapon', and that the identity test leaves `rounds.*.room` out by name. Four things block this. (a) The identity test filters whole ModuleFields by name, so `room` must be its own field. If it goes into `ROUND_KEYS` it lands inside `${pool}.${k}.flight` and can't be skipped. The spec doesn't say which. (b) The validator finds a round's `active` by fixed back-offsets (0/1/2), so a trailing field needs the missile `manual` pattern. (c) Rounds are in the space module, which is validated before the ship module, where `clsOf` is learned. So the owner's class is not known when a round is checked, and `shape` is documented as read only for its map and slot count. (d) `placeRound` copies a fixed field list. A recycled active entry would keep its old tag unless `room` is added there. `ROUND_SLOT` (7) and the determinism length test also move. · spec L160-L172; .worktrees/w4/tests/valkyrnIdentity.test.ts:L27-L30; .worktrees/w4/src/renderer/src/sim/tactical/hash.ts:L33-L39, L73-L87, L183, L303-L308, L324, L351-L356; .worktrees/w4/src/renderer/src/sim/tactical/gun.ts:L17-L22; .worktrees/w4/tests/tacticalDeterminism.test.ts:L131 · As written, the bound can't be checked in one pass and the identity test can't be kept bit-identical. Builders would pick different layouts, and the hash layout is part of determinism and the wire. · Specify a separate field `${pool}.${k}.room`, after `flight`, excluded from `MissingRoundKeys`. In the validator: within 0..3, 0 on a free entry, nonzero only when the entry's owner is `CREW_SLOT`. Defer the class part to a check after the ship module, or drop it and say why. `placeRound` and `emptyRound` write `room`, and every caller passes it (the Hunter's and the Valkyrn's pass 0). `ROUND_SLOT` becomes 8, and `tacticalDeterminism`'s length line follows.

### [P1] R1-F3 With the torpedo picked up, E/Q at the Hound's seat are taken by the contact controller as `torpStep`
§3.6 says E/Q send `laserLock` and never `torpLock`, and §6 removes only the runtime/online copy of the E/Q torpedo-room block. But `contactController.intercept` still takes KeyE/KeyQ at station 'weapons' while the torpedo is picked up: it returns true (no press edge) and adds to `torpStep`. The TORPEDO card click is now the only way to make a torpedo lock, so this state comes up in ordinary play. With the copy removed, E/Q silently do nothing. A builder who keeps reading `requests.torpStep` sends `torpLock`, which arms the AUTO torpedo to launch, the very thing Judgement call 4 avoids. · spec L215, L228-L229, L278, L302-L304; .worktrees/w4/src/renderer/src/app/duel/contactController.ts:L143-L146; .worktrees/w4/src/renderer/src/ui/duel/WeaponsStation.tsx:L63; .worktrees/w4/src/renderer/src/app/duel/runtime.ts:L518; .worktrees/w4/src/renderer/src/app/duel/onlineDuel.ts:L307 · Two builders would get different behaviour, one of which fires torpedoes. The §5 test 'E / Q ... never torpLock' passes or fails depending on whether the torpedo is picked up. · Fence the intercept: at the Hound's Weapons seat (a `turret` flag on `ContactSync`, like `laser`), E/Q are not taken while the torpedo is picked up and fall through to the target-room step. Alternatively, say they do nothing then. Add a test: torpedo picked up, E sends `laserLock`, the pick-up stays, no `torpLock`.

### [P2] R1-F4 The enemy window's bracket is gated on `laserTargeted`, which the amendment keeps false on the Hound
§3.6 says the window brackets the target room whenever the enemy is seen. `contactModel` sets `lockRoom` only when `crewSys.laserTargeted` is true, and §3.2 keeps that false on the Hound. So no bracket would ever draw. The spec names no change to the gate. · spec L154, L224-L225; .worktrees/w4/src/renderer/src/render/duel/contactModel.ts:L159, L191 · The bracket test (spec L280) and the manual gate entry (L311) can't pass without an unstated change. · Say that `lockRoom` is `crewSys.lock` on a turret class (`hasTurret`) whenever the enemy is drawn, below Level 1 included, and `laserTargeted ? lock : null` elsewhere.

### [P2] R1-F5 Online base for the E/Q room step is unstated
§3.6 judges the step from the latest queued `laserLock`, which is the local runtime's `pending`. The online Hound branch has no queued list. Its laser-fit precedent steps from the replica's `lock` with no sent tracking, so two quick presses before the replica catches up both step from the same room. §2.4 adds `gunModeSent` per slot for exactly this reason ('two quick presses of R flip twice') but gives the room step no equivalent. · spec L98-L99, L220-L221; .worktrees/w4/src/renderer/src/app/duel/onlineDuel.ts:L339-L343 · One online builder copies the replica-based laser-fit code and the other adds a `lockSent`. A double-tap of Q/E then goes one room or two depending on lag. · Add `lockSent {room, sequence, round}` online (cleared on the result, a new round, sit and stand, as `torpModeSent` is) and step from it, else the replica's `lock`. Test it in `w4Online.test.ts`.

### [P2] R1-F6 The third hint row has no vertical room on the Hound's console
§2.5 moves `RIGHT-CLICK TORPEDO: CLEAR` to a third row and asks the plan only to measure widths. The rows sit at y0+116 and y0+134 (18 px pitch). A divider is at y0+156 and the FREQ row at y0+170/174. A third row at y0+152 runs into the divider. The width is fine: `R AUTO/MAN · Q/E ROOM: ENGINES` is 31 characters, against W-4's 39-character row, which fit in 241 px. · spec L120-L122; .worktrees/w4/src/renderer/src/ui/duel/WeaponsStation.tsx:L160-L166; W-4 spec L581-L583 · The layout must move (the divider and the FREQ row, or `STATION.h.weapons`), which touches the frequency row's tests and the console height. The plan has no instruction for that. · Give the third row's y and the new y of the divider and FREQ row, or the panel height change. Alternatively, keep two rows by shortening, e.g. `R MODE · Q/E ROOM: SHIELDS · RMB TORP: CLEAR`, and give its measured width.

### [P2] R1-F7 The amendment breaks W-4 §2.1, §14 and §15 without listing them, and W-4a tests pin the old rules
L4-L6 list the amended sections, but these W-4 rules also break. §2.1: '`lock` stays `Room.Shields`', laserLock is `unavailable` on the Hound, and 'the app no longer sends them from the Hound'. §14 Loadout: 'every laser command from the Hound except `laserFrequency` is `unavailable`'. §14 Autocannon: 'a room level after 6 unshielded hits', which becomes hand-only and lands on `lock`, not the room under the round. §15's row: 'AUTO / MAN guns: new (Z, both together ...)'. Three committed W-4a tests pin the old behaviour, and the amendment names none of them as kind-(a) rewrites. · spec L4-L6, L245-L247; W-4 spec L82-L86, L759, L767, L914; .worktrees/w4/tests/w4PewFire.test.ts:L55-L64; .worktrees/w4/tests/w4Runtime.test.ts:L97-L101; .worktrees/w4/tests/w4Autocannon.test.ts:L78-L89 · Per the brief, everything not named must still hold. A builder following W-4 §2.1 and §14 would keep the tests that contradict §3.2 and §3.6. · Add §2.1 and §15 to L4-L6. In §5, replace (not add to) W-4 §14's Loadout and Autocannon bullets. List the three files as kind-(a) rewrites in the task that lands each rule.

### [P2] R1-F8 §6's task mapping misses Tasks 4, 6 and 8, and the room-tag task must follow Task 6
`gunsManual` is used throughout the W-4b plan beyond Tasks 3, 5, 7 and 9. The plan header uses it (L84, L88), and so do Task 4's tests, Task 6's `pewFire` AUTO refusal (`if (!sys0.gunsManual)`, plan L1468), Task 6's `tickGun` AUTO branch and Task 8's tests (L1807). §2.3's `pewFire` reads `pewManual` rule therefore lives in Task 6, not Task 3. Also, until Task 6 deletes it, W-4a's stand-in in `houndGunner` sends `pewFire`. If the new round-tag task lands before Task 6, those stand-in rounds carry `lock + 1` and wear rooms, moving whole runs an extra time. · spec L290-L298; docs/superpowers/plans/2026-11-19-w4b-turrets-auto.md:L84, L88, L656, L1468, L1479, L1807; .worktrees/w4/src/renderer/src/sim/duel/scripted.ts:L350-L352 · The amended plan can't be written in order from §6 alone. Ordering the new task wrongly re-moves the kind-(b) pins. · Map §2.3's `pewFire` rule to Task 6. Say that Tasks 4, 6 and 8 and the header switch to `pewManual`/`gunManual`. Place the §3 sim task after Task 6.

### [P2] R1-F9 Z and V are not read at the Flight seat today, so a §5 test can't pass as written
§2.4 says the runtime reads Z and V 'where they are read today: the laser fit's Weapons seat and the Flight seat'. §5 tests that they 'still work on the laser fit and the Flight seat'. The runtime's Flight branch reads neither `p.laserMode` nor `p.torpMode`, and online has no Flight branch at all. W-4 §15 also says there is no MANUAL flight on the Flight seat. · spec L103-L107, L276, L319; .worktrees/w4/src/renderer/src/app/duel/runtime.ts:L444-L474; W-4 spec L922 · The test can't pass, and the 'keep Z and V' scope note misdescribes the Flight seat. · Drop 'and the Flight seat' from L104 and L276, and from §7's 'They keep Z and V'. Say the Flight seat has neither and R does nothing there.

### [P2] R1-F10 The duel key handler can't see Ctrl or Meta
§2.4 says a Ctrl or Meta press of R is neither action. The handler's `KeyEventLike` carries only `code`, `repeat` and `shiftKey`. `pageGuards` skips Ctrl/Meta (so the browser reload still happens), but `createDuelKeyboard` would still count the keydown as `weaponMode`. In Electron, Ctrl+R may not reload, so the mode would flip. · spec L100-L102, L275; .worktrees/w4/src/renderer/src/app/duel/input.ts:L131, L163-L164; .worktrees/w4/src/renderer/src/app/web/pageGuards.ts:L26 · The 'Ctrl+R sends nothing' test needs an interface change the spec doesn't name. · Add `ctrlKey?` and `metaKey?` to `KeyEventLike`. In `down`, ignore KeyR's action when either is set. Say so, and test it with the fake event source.

### [P2] R1-F11 The new `pewHit` room/level and its callout are unspecified online and in the view
§3.4 says `pewHit` gains `room` and `level`, and that 'the view shows the ROOM HIT / OFFLINE callout from them, as it does for the gun'. Online, `onlineSource` builds `gunHit`/`pewHit` from counters with `room: -1` and no room. Its `pewHit` literal (`satisfies DuelEvent`) fails typecheck once the fields exist. So online the callout never shows. `hitModel` has gun branches only (`'GUN: '` prefix) and no pew branch, and the spec gives no prefix or flash rule. · spec L194-L195, L240; .worktrees/w4/src/renderer/src/app/duel/onlineSource.ts:L89, L93; .worktrees/w4/src/renderer/src/render/tactical/hitModel.ts:L57, L76 · Online is the main mode. Builders will differ on the prefix, the flash, and whether online derives the callout at all. · Specify `hitCallouts`' pew branch (`'PEW: '`, only on `level`) and `pushHits`' flash (room ≥ 0). Say that online synthesizes `room: -1, level: false` as the gun does today (no callout online), or derive it from the enemy's `rooms` delta.

### [P2] R1-F12 An AUTO torpedo reads `lock` when it lands, so Q/E now retarget one in flight
`land` reads `owner.lock` at impact, not at launch. With Q/E now moving `lock`, an AUTO torpedo launched by F or LMB with no torpedo lock changes target if the gunner steps the room while it flies. That runs against §3.3's principle that a round keeps the room it was fired at. The §5 test 'strikes the target room' doesn't say which moment counts. Also, the ladder report's torpedo room levels have no `level` flag to read: `missileEnd` carries only `room`. · spec L139-L141, L173, L205-L209, L270; .worktrees/w4/src/renderer/src/sim/tactical/missiles.ts:L29-L32, L120-L122 · The owner should know Q/E steer a flying AUTO torpedo's room. The test and the report need an exact rule. · Say the AUTO torpedo strikes the target room as it stands at impact (or snapshot `lock` into `torpRoom` at launch, which would be a sim change). Fix the test wording to match. Define the report's torpedo levels as `min(2, before + levels) − before` at the struck room, or add `level` to `missileEnd`.

## Verified
- `lock` is `Room.Shields` at every round's start for every class (state.ts:L230), 0 in `emptySystems` (L243), hashed in `SYSTEMS_TAIL` (hash.ts:L24) and bounded as a room 0..2 (hash.ts:L229, L241).
- Other readers of `lock` stay safe once it moves on the Hound. `shoot`/`laserStrike` are unreachable without a laser (weapons.ts:L190-L197), and `tickWeapons` never reads it (L350-L372). `houndGunner` doesn't read it (scripted.ts:L339-L356). The contact window's `lockRoom` is gated on `laserTargeted` (contactModel.ts:L159, L191; raised as a finding).
- Item 16: `canLaunch` has no lock requirement, only the magazine, power and range (weapons.ts:L101-L105). `launchMissile` sets `torpRoom = torpLock` (−1 with no lock) (missiles.ts:L32), and `land` uses `torpRoom >= 0 ? torpRoom : lock` (L120). So an F launch with no torpedo lock does strike `lock`, read at impact (raised as a finding).
- Item 18: `laserLock` has no `noop` step today (step.ts:L340). Its no-laser `unavailable` (L328) comes before `malformed` and the seen check.
- Item 15: both pools are `GunRound[]` (state.ts:L189-L191, L107), and `roundFields(pool, k)` serves both (hash.ts:L73).
- The `gunRoomWear` bound `most(hitsPerLevel) − 1` = 5 holds with +3 a pew hit, since the wear resets at ≥ 6 (hash.ts:L249; gun.ts:L126). The Hunter's repair zeroes a repaired room's wear (hunter.ts:L82).
- The Valkyrn, the laser fit and the Hunter fall under §2.1's slot-turret rule. `GUN.turret` and `PEW.turret` are null, `HUNTER_PEW` spreads `PEW`, the Hunter has no gun, and `VALKYRN_LASER_CLASS` has pew and gun null (defs.ts:L107-L118, L153-L157). So `gunMode` is `unavailable` on both Valkyrn classes for each slot, and the Hunter's rounds are never crew-tagged.
- Other readers of the events: telemetry reads only `hull` (telemetry.ts:L104-L105), `hitModel` skips `room < 0` (hitModel.ts:L57, L77) and sounds key on kind (duelSounds.ts:L43, L49). An AUTO `gunHit` with `room: -1` breaks none of them.
- Keys: `PRESS_CODES` has no KeyR (input.ts:L15-L19). `pageGuards` picks up new `PRESS_CODES` automatically and skips Ctrl/Meta/Alt (pageGuards.ts:L11, L26). The handler sees `shiftKey` as the Shift+W case does (input.ts:L131, L163).
- Today V toggles `torpMode` at the Hound's seat in both runtimes (runtime.ts:L529-L530; onlineDuel.ts:L317-L318). The copied E/Q torpedo-room block exists in both (runtime.ts:L517-L524; onlineDuel.ts:L307-L311), as §6 says.
- A plain room click can be told from a pick-up click: `ContactWindow.boxDown` returns when not aiming (ContactWindow.tsx:L61-L63), and `ConsoleInput.lock` exists (input.ts:L187). So a new branch can send `laserLock`.
- `cycleLock` wraps Weapons → Shields → Engines (controls.ts:L68).
- Item 13: W-4 §12 already says that if no ladder setting reaches a crew win, the base numbers ship and the owner decides (W-4 spec L677-L678). The per-seed gates are `pewShots + gunShots ≥ 1` and `missilesLaunched ≥ 1` (L870-L872), which room damage doesn't affect. So §3.5's 'ladder unchanged' can be planned.

## Not verified
- `net/contracts.ts`, `net/codec.ts` and `authority/duelRules.ts` were not read: `gunMode` is not on the branch yet, so its `slot` schema can't be checked against code.
- `app/controlsList.ts` and `tests/duelModules.test.ts`'s pinned lists were not read.
- The W-4c plan and the bodies of W-4b Tasks 5, 7, 9 and 10 were only skimmed by grep for `gunsManual`.
- The hint-row width was estimated by character count against W-4's 241 px figure; the font metrics were not read.
- `scene.ts`'s room-click routing beyond `ContactWindow` was not traced, so whether a plain click reaches the window while the map has focus is unverified.
- `tests/w4Turret.test.ts` and the `tacticalDeterminism` flatten key guard were checked only by grep for `gunsManual` and `ROUND_SLOT`.

---

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

Confirmed (`hitModel.ts` L57, L76 have gun branches only; `onlineSource.ts` L89, L93 build both events with no room). §3.4 now specifies `hitCallouts`' pew branch (`PEW: `, on `level`), `pushHits`' flash (room >= 0), and that online synthesizes `room: -1, level: false` as the gun does today. §7 lists online room callouts as not in this build, and §8 item 13 records it.

## R1-F12 [P2]: An AUTO torpedo reads `lock` when it lands, so Q/E now retarget one in flight

Confirmed (`missiles.ts` L30-L32, L120). Kept as today's code, and stated: §3.1 says the room is read when the torpedo lands, a torpedo launched with a lock keeps its room, and why it differs from a round. §5's test names the moment. §3.5 defines the report's torpedo levels as the struck room's level after the tick minus before. §8 item 6 records the call for the owner.

## Also changed

- (nothing)

## Files changed

- docs/superpowers/specs/2026-11-19-w4-amendment-modes-rooms-design.md

<!-- end -->

---

