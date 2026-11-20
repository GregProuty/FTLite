# W-4 amendment: a mode per weapon, and room targeting (design, 2026-11-19)

Ryan's playtest notes, round 2 (`docs/superpowers/research/2026-11-19-ryan-notes-v2.md`, §1 and §4), with the owner's
calls of 2026-11-19. This spec **amends** the W-4 spec (`2026-11-19-w4-weapons-controls-design.md`): §2.1 (the Hound's
`lock` now moves and `laserLock` is admitted, §3.2), §3.1, §3.4, §4.1, §5, §6, §7, §8, §9, §10, §11, §13, §14 (two of
its bullets are replaced, §5 here) and §15 (its AUTO / MAN row: a switch per gun on R, not Z for both), Decision 5, and
§17 items 7 and 14. Where they differ, this spec wins. Everything else in W-4 stands.

The notes this spec answers:

> - Universal AUTO/MANUAL switch: any system with an auto mode shows a clickable AUTO/MANUAL switch on the HUD. R flips
>   the selected system and Shift+R flips all of them.
> - Q/E: cycle the target room on the enemy ship (Weapons, Shields, Engines). Clicking a room in the enemy window is the
>   backup way to pick one.
> - Manual can target the selected enemy room and gets a small bonus to traverse speed and fire rate.
> - Auto [...] only hits the hull, never a chosen room.

Starting point: branch `w4-weapons-controls` at dc64136d. W-4a is complete (fd845c4f) and W-4b Task 1 is in (2e5a9190:
the turret state, `gunsManual` and the slew law). The builder holds before W-4b Task 3. Paths are under
`src/renderer/src/` unless they start with `tests/` or `docs/`. Every number is a starting value.

## 1. The owner's calls on round 2 (2026-11-19)

Where Ryan's round 2 differs from W-4, the owner decided:

1. **AUTO keeps its lead** and the 1.0° fire tolerance (W-4 §4.2). Ryan's "auto doesn't lead its shots" is not adopted.
2. **F and the left button both launch the torpedo** (W-4 §9). Ryan's "replaces F" is not adopted.
3. **Each weapon gets its own AUTO/MAN switch, on R and Shift+R** (§2). W-4 had one switch for both guns on Z.
4. **Q/E cycle one target room, and a gun in hand damages it** (§3). An AUTO-driven gun does hull damage only.
5. **Pew pew in hand also damages the target room** (§3.4). The owner chose this over keeping pew pew to shields and
   hull.
6. **A MAN gun that is not selected still fights on AUTO** (W-4 §17 item 19 stands).

Scope: the Hound only, as W-4. The Hunter, the Valkyrn and the laser fit keep their rules, keys and bits.

## 2. A mode per weapon

### 2.1 State

- `gunsManual` (W-4 §3.1, in the branch since 2e5a9190) is replaced by two flags, in its place in `SYSTEMS_TAIL`
  (`sim/tactical/hash.ts`) and in `FLAGS`:
  - `pewManual`: pew pew's mode (false AUTO, true MAN);
  - `gunManual`: the autocannon's.
- Both are false at every round's start (`systemsFor`, `emptySystems`).
- **Bounds** (`hash.ts`, `sim/snapshotValidation.ts`): each is a bit, true only on the crew slot of a class whose
  weapon in that slot has a turret (`slots.pew?.turret` for `pewManual`, `slots.gun?.turret` for `gunManual`).
- **The Valkyrn identity test** (W-4 §13.4) leaves out `pewTurret`, `gunTurret`, `pewManual` and `gunManual` by name,
  and asserts them 0 / false.
- The torpedo keeps `torpManual` (W-3).

### 2.2 The command

- `gunMode {slot, manual}`: `slot` is 0 (pew pew) or 1 (the autocannon); `manual` is a boolean. It replaces W-4's
  `gunMode {manual}` (§4.1, §8). Nothing has shipped with the old shape.
- **Admission, in order:**
  - stale-tick;
  - `not-at-weapons`;
  - `malformed` for a slot other than 0 or 1, or a non-boolean;
  - `unavailable` when the class's weapon in that slot has no turret (the Valkyrn, the laser fit);
  - `noop` when that gun's mode is unchanged.
- It is set at once, in W-4's place in `WEAPON_ORDER`, so a same-tick `pewFire` is judged in the new mode.
- Two `gunMode` commands in one tick for different slots both apply (Shift+R, §2.4). A second for the same slot in a
  tick follows the admission above against the mode the first one set.
- `torpMode` is unchanged.

### 2.3 Hand control

- `handControl(state, i, weaponSel, slot)` (W-4 §3.4) becomes: **that gun's own flag** is MAN, and it is the selected
  weapon, and no crew MANUAL torpedo flies.
- The rest of W-4 §3.4 stands, reading "the mode is MAN" as "that gun's mode is MAN". The cases:

| Pew pew | Autocannon | Selected | Pew pew is | Autocannon is |
|---|---|---|---|---|
| AUTO | AUTO | any | AUTO-driven | AUTO-driven |
| MAN | AUTO | pew pew | in hand | AUTO-driven |
| MAN | AUTO | autocannon | AUTO-driven | AUTO-driven (the left button does nothing) |
| AUTO | MAN | autocannon | AUTO-driven | in hand |
| MAN | MAN | pew pew | in hand | AUTO-driven |
| MAN | MAN | autocannon | AUTO-driven | in hand |
| MAN | MAN | torpedo | AUTO-driven | AUTO-driven |

- A MAN gun that is not in hand fights on AUTO with AUTO's numbers and rules (the hold, the 80 % heat stop, ship-only
  targets, the line of sight), as W-4 decided. So a gun's switch matters only while that gun is selected.
- **`pewFire` admission** (W-4 §6): "`unavailable` in AUTO" reads `pewManual`. The other steps are unchanged.
- **The MAN bonus** (W-4 §4.4) is still the gun in hand's.
- **During a crew MANUAL torpedo flight** no gun is in hand and both fight on AUTO, whatever their switches say (W-4
  Decision 10).

### 2.4 Keys at the Hound's Weapons seat

| Input | Action |
|---|---|
| R | Flip the selected weapon's switch. Pew pew or the autocannon: `gunMode {slot, manual: !its mode}`. The torpedo: `torpMode`, by W-3's rules. |
| Shift+R | Both guns together. If either gun is on MAN, both go to AUTO; otherwise both go to MAN. It sends `gunMode` only for a gun whose mode changes. The torpedo is not touched. |
| Z, V | Nothing at the Hound's Weapons seat. |

- **Why Shift+R leaves the torpedo out.** Ryan's use is "set the guns to auto in one motion before launching a missile,
  and back after". Flipping the torpedo with them would undo the mode the gunner just chose for the flight.
- **The mode the app judges from** is the latest it has sent for that slot, else the state's (`gunModeSent` per slot,
  W-4 §11's pattern). So two quick presses of R flip twice.
- **`app/duel/input.ts`:** `KeyR` joins `PRESS_CODES` as `weaponMode`. A press with Shift held is `weaponModeAll` (the
  key handler already sees `shiftKey`, as the Shift+W case does).
  - **Ctrl+R and Meta+R are not mode presses.** The handler's `KeyEventLike` carries only `code`, `repeat` and
    `shiftKey` today, so it gains `ctrlKey?` and `metaKey?`, and `down` counts neither action for KeyR when either is
    set. The page guards already let Ctrl and Meta chords through to the browser (`pageGuards.ts`), and KeyR is not
    added to `GUARDED_CODES`: plain R and Shift+R have no browser default.
- **W-4's rename of KeyZ's action is dropped.** KeyZ stays `laserMode` and KeyV stays `torpMode` in the table. The
  runtime and online read them only at a laser class's Weapons seat (the laser fit), as today. At the Hound's Weapons
  seat they read neither. W-4a's Hound branch reads V today (`p.torpMode`, in `runtime.ts` and `onlineDuel.ts`); that
  read goes.
- **Elsewhere:** on the laser fit's Weapons seat Z and V are unchanged and R does nothing. The Flight seat reads none of
  Z, V and R, as today (it has no modes). Moving the laser fit to R is not in this build (§7).
- **`app/controlsList.ts`:** W-4's "Z: both guns AUTO / MAN" row becomes "R: the selected weapon AUTO / MAN" and
  "Shift+R: both guns AUTO / MAN". The Hound's Z and V rows go. The rows stay built from the input tables.

### 2.5 The console

- **Each card has its own AUTO / MAN tag, and each tag is its own switch.** A click on a gun's tag sends that gun's
  `gunMode`. A click on the torpedo's tag sends `torpMode`, as now. W-4 §10's "the two gun tags are one switch" goes.
- **The word** is what the weapon is doing now, as W-4: `MAN` on a gun in hand, `AUTO` on an AUTO-driven gun, `HOLD`
  on an AUTO-driven gun during the 30 s hold.
- **The light** is the gun's own switch: lit when it is set to MAN. So a MAN gun that is not selected reads `AUTO`,
  lit, which tells the gunner it will come to hand when selected.
- **The torpedo's tag** is unchanged apart from its key hint (R with the torpedo selected).
- **The hint rows** under the cards stay two, at today's places (`y0 + 116` and `y0 + 134` in `WeaponsStation.tsx`;
  the divider at `y0 + 156` leaves no room for a third):
  - row 1: `LMB FIRE · A/D SELECT · W/S POWER`, as W-4a;
  - row 2: `R AUTO/MAN · Q/E ROOM: <NAME>` (§3.6; the name is `WEAPONS`, `SHIELDS` or `ENGINES`, 30 characters);
  - row 2 while the torpedo has a target (a room or a rock): `Q/E ROOM: <NAME> · RMB TORPEDO: CLEAR` (38
    characters), so the clear hint shows when there is something to clear and the room name never leaves;
  - W-4a's `RIGHT-CLICK TORPEDO: CLEAR` row fits left of `ROCKS n` today, and W-4 measured a 39-character row to fit
    with 8 px to spare. The plan measures both new texts the same way, against the space left of `ROCKS n`.

### 2.6 Online and the manual torpedo

- **Online** (W-4 §11): `gunModeSent` is kept per slot. The selected turret's prediction runs when the selected gun's
  own mode is MAN (the latest sent for that slot, else the replica's flag). The other conditions are unchanged.
- **The manual torpedo** (W-4 §7): "Z still toggles the guns" becomes "R and Shift+R still work during a flight". The
  guns fight on AUTO for the flight either way. With the torpedo selected, R sends `torpMode`, which W-3's rules answer
  during a flight as they do today.

## 3. Room targeting

### 3.1 The target room

- The crew's **target room** is `ShipSystems.lock`: a Room (Weapons, Shields or Engines), hashed and bounded today,
  and `Room.Shields` at every round's start on the Hound (W-4 §2.1). It is always one of the three; there is no "none".
- It is the room that rounds fired by hand damage (§3.4).
- It is also already the room an AUTO torpedo strikes when it was launched without a torpedo lock (`missiles.ts`
  `land`: `torpRoom >= 0 ? torpRoom : lock`). So an AUTO torpedo launched by F or the left button now goes for the Q/E
  room. That rule's code does not change.
  - `land` reads `lock` **when the torpedo lands**, not at launch (its comment: "the lock room as it lands"). So
    stepping the room while such a torpedo flies moves its strike. That is kept: the torpedo is guided, a round is not
    (§3.3). A torpedo launched with a torpedo lock keeps that room, as today.

### 3.2 The command

- `laserLock {room}` keeps its name on the wire, as `laserFrequency` did in W-4 §5.2. On the Hound it is the target
  room's command.
- **Admission on a class with a turret gun and no laser** (the Hound), in order:
  - stale-tick;
  - `not-at-weapons`;
  - `malformed` for a room outside −1..2 (today's `validTarget`);
  - `unavailable` for −1 (there is nothing to clear);
  - `unavailable` when the enemy ship is not seen (today's fog rule for locks, `step.ts`);
  - otherwise it is admitted: `crew.laserLock = room`, as today's branch does.
- **`step.ts` today** answers `laserLock` `unavailable` on any class without a laser, in the no-laser line that runs
  before the `malformed` check. That line stops catching `laserLock` when the crew class has a turret gun
  (`hasTurret`, `defs.ts`), and the `laserLock` branch then applies the order above. The other laser commands stay in
  the line.
- **The write is new code.** `applyWeaponsInput` (`weapons.ts`) gates its whole `laserLock` block on a laser
  (`armed`), so today nothing writes `lock` on the Hound. A second branch is added beside it, in the same place (the
  locks step, first in the tick's order, before `tickGun` and the pew): for the crew slot on a class with no laser and
  a turret gun, with `input.weapons` and `input.laserLock` a room 0..2 (`validLock`), it sets `s.lock` and nothing
  else. It does not touch `laserTargeted` (it stays false on the Hound) or `laserRock`.
- Because the lock is applied first, a `laserLock` and a hand shot in the same tick tag the round with the new room
  (§3.3).
- On a class with a laser the command is unchanged. On a class with neither (the Valkyrn) it stays `unavailable`.
- The other laser commands stay `unavailable` on the Hound (W-4 §2.1).

### 3.3 Rounds carry the room

- The round entry of both pools (the gun pool `rounds` and the pew pool `pew`; `GunRound` in `sim/tactical/state.ts`)
  gains `room`: 0 for none, else the Room index + 1 (1 Weapons, 2 Shields, 3 Engines). Zero is "none" so that an ended
  entry still holds zeros.
- **Set when the round is fired:**
  - an autocannon round fired by the held trigger with the gun in hand: `lock + 1`;
  - a pew pew round fired by an admitted `pewFire` (the trigger): `lock + 1`. This holds even when the pew is not in
    hand that tick (W-4 §6: online, a held `weaponSel` can trail the command by a frame). The click is a shot by hand;
  - every round fired by AUTO's rules: 0;
  - every round of the Hunter and the Valkyrn: 0.
- **`placeRound` and `emptyRound`** (`gun.ts`, `state.ts`) write it. `placeRound` copies a fixed list of members, so
  `room` joins the list, or a recycled entry would keep its old tag. Its argument type (`Omit<GunRound, 'active'>`)
  then makes every caller pass it: the Hunter's and the Valkyrn's pass 0.
- **Hash** (`hash.ts`): `roundFields` gains a third field of its own per entry, `${pool}.${k}.room`, a scalar after
  `${pool}.${k}.flight`. It does not join `ROUND_KEYS` (the `flight` vector), so it can be left out by name.
  `MissingRoundKeys` excludes `'room'` beside `'active'` and `'owner'`. `ROUND_SLOT` becomes 8, and
  `tests/tacticalDeterminism.test.ts`'s length line follows.
- **Bounds** (`validateTacticalValues`): the entry's `active` is found for the new field by its back-offset, as the
  missile's `manual` is. The field is within 0..3, 0 on a free entry, and nonzero only when the entry's owner is
  `CREW_SLOT`.
  - The class is not checked. Rounds are in the space module, validated before the ship module where the classes are
    learned, so a round's owner's class is not known at that point. The sim never tags a round on a class without a
    turret, and the tests assert it (§5).
- **The Valkyrn identity test** adds the two pools' `room` fields (`rounds.<k>.room`, `pew.<k>.room`) to its left-out
  pattern, beside the turret fields and the two flags, and asserts them 0.
- The room is the one at the moment of firing. Changing the target room does not retarget rounds in flight.

### 3.4 Hits

Only the crew's turret weapons change. A shield hit is unchanged for both guns, the weak frequency included.

- **The autocannon** (`gunHit`, `gun.ts`, for a gun whose `turret !== null`), on an unshielded hit:
  - the hull wear is as today (`hitsPerHull`);
  - **a round with a room** wears that room, not the room under the round: today's rule on `gunRoomWear[room]`
    (`hitsPerLevel`, the level up to 2, the wear held at 0 on a level-2 room);
  - **a round with no room** (AUTO) wears no room. Its `gunHit` event has `room: -1` and `level: false`.
- **The Valkyrn's gun** (`turret === null`) keeps `gunRoomOf`, the room under the round, byte for byte.
- **Pew pew** (`pewHit`, `pew.ts`, for the crew's pew with `turret !== null`), on an unshielded hit:
  - the hull damage is as today (`def.hull`);
  - **a round with a room** also adds `PEW_ROOM_WEAR = 3` (`tuning.ts`) to the target's `gunRoomWear[room]`. At the
    owner's gun's `hitsPerLevel` (6 on the Hound) or more, the room's level rises by one and the wear goes to 0. On a
    level-2 room the wear is held at 0, as the autocannon's;
  - so two pew pew hits by hand raise a room a level. The wear is shared with the autocannon's: one pew pew hit and
    three autocannon hits by hand also raise it;
  - a class with a turret pew and no gun gets no pew room wear. No such class exists;
  - **a round with no room** (AUTO) is today's hit: hull only.
- **`pewHit`** (the event) gains `room` (−1 for none or a shield hit) and `level`, as `gunHit` has.
  - **The view** (`render/tactical/hitModel.ts`): `hitCallouts` gets a pew branch like the gun's, a room callout with
    the prefix `PEW: `, only for a `pewHit` on the enemy with `room >= 0` and `level`. `pushHits` flashes the struck
    room for a `pewHit` on a ship other than the crew's with `room >= 0`, as it does for `gunHit`.
  - **Online** (`app/duel/onlineSource.ts`) builds `gunHit` and `pewHit` from the replica's counters and names no room
    today (`room: -1`). Its `pewHit` literal gains `room: -1, level: false`. So online a room hit by either gun shows
    no callout or flash, as the gun's shows none today; the enemy window's room levels still follow the replica.
- **The Hunter's pew** has no turret, so it never wears a room. Its repair still zeroes a repaired room's wear
  (`hunter.ts`).
- **`gunRoomWear`'s bound** (0 to `hitsPerLevel` − 1) holds: the wear resets whenever it reaches the threshold.
- **A MANUAL torpedo** still strikes the room at its impact point (`roomAtImpact`).

### 3.5 What AUTO loses

- Before this amendment an AUTO autocannon raised room levels where its rounds landed. Now AUTO guns never damage a
  room. Rooms go down by hand shots and by torpedoes.
- **The scripted gunner** (W-4 §12) leaves its guns on AUTO, so the crew bots take rooms only with the torpedo.
  - The per-seed gates must still pass at the end of W-4b.
  - The tuning ladder (W-4 §12) is unchanged. Its report also records, per seed, the enemy room levels the crew raised
    and by which weapon, so the owner can see what the rule cost the bots: one per `gunHit` or `pewHit` event with
    `level`; and for each of the crew's `missileEnd` events on the enemy with `room >= 0`, that room's level after
    the tick minus its level before it.

### 3.6 Controls

| Input at the Hound's Weapons seat | Action | W-4 |
|---|---|---|
| E / Q | Step the target room forward / back: Weapons → Shields → Engines, wrapping (`cycleLock`, `app/duel/controls.ts`). Sends `laserLock {room}`. | Stepped the torpedo's lock (`torpLock`) |
| Click a room in the enemy window, nothing picked up | `laserLock {room}` | Nothing |
| Click a room in the enemy window, the torpedo picked up | `torpLock {room}`, as now: the AUTO torpedo launches when it legally can | Same |
| Right-click, the torpedo's target | Clears the torpedo's target, as now | Same |

- **The step is judged from** the latest queued `laserLock` this frame, else `lock`, as the torpedo's step is judged
  from the latest queued `torpLock` (`runtime.ts`).
  - **Online** there is no queued list. `onlineDuel.ts` keeps `lockSent {room, sequence, round}`, set when a
    `laserLock` is sent and cleared on that command's result, a new round, a sit and a stand, as `torpModeSent` is.
    The step starts from `lockSent.room`, else the replica's `lock`, so two quick presses step twice.
- **With the torpedo picked up.** Today the contact controller takes E / Q at Weapons while the torpedo is picked up
  and turns them into `torpStep` (`contactController.ts` `intercept`). At the Hound's Weapons seat it no longer takes
  them: the controller is told the seat is the Hound's (a flag on `ContactSync`, as `laser` is), and E / Q fall through
  to the target-room step. The pick-up stays. The Hound's branch never reads `requests.torpStep`. The Flight seat and
  the laser fit keep today's rule.
- **Unseen enemy:** the keys and the click raise the `NO CONTACT` refusal, as the lock keys do today. The target room
  keeps its value.
- **The enemy window** brackets the target room (`hot`) whenever it draws the enemy's rooms, the unknown-contact
  drawing included. `contactModel.ts` sets `lockRoom` only while `laserTargeted` today, which stays false on the
  Hound, so on a class with a turret gun `lockRoom` is `crewSys.lock`; on any other class it stays
  `laserTargeted ? lock : null`. The torpedo's own target mark is unchanged.
- **The hint row** names it: `R AUTO/MAN · Q/E ROOM: SHIELDS` (§2.5), so the gunner sees the room with the window
  closed.
- **W-4 §17 item 14** (E / Q step the torpedo's room on the Hound) is replaced by this section. A torpedo lock is now
  made only by the pick-up click, and the scripted gunner's `torpLock` is unchanged.
- **`app/controlsList.ts`:** a new row, "Q / E at Weapons: the target room (Weapons, Shields, Engines)". The laser
  fit's and the Flight seat's E / Q rows are unchanged.

## 4. Wire, state and version

- **Commands:** `gunMode` gains `slot` (the codec, `net/contracts.ts`, `authority/duelRules.ts`). `laserLock` is
  unchanged on the wire. No new command kind beyond W-4's.
- **Held input:** unchanged from W-4.
- **State:** `pewManual` and `gunManual` replace `gunsManual`; both round pools gain `room`. `tests/duelModules.test.ts`'s
  pinned lists follow.
- **Events:** `pewHit` gains `room` and `level`; an AUTO autocannon hull hit's `gunHit` has `room: -1`.
- **Determinism:** the new arithmetic is integer (a tag, a wear sum, a compare). No new randomness.
- **SIM_VERSION:** inside W-4's one bump at the end of W-4c. The branch is cut from SIM 60 and master is at 61, so the
  merge bumps to 62 (the builder's note).

## 5. Tests

Added to W-4 §14's lists, except where a bullet says it replaces one.

- **Replaced W-4 §14 bullets, and the W-4a tests that pin them** (kind (a) rewrites, each in the task that lands its
  rule):
  - Loadout's "every laser command from the Hound except `laserFrequency` is `unavailable`" becomes "except
    `laserFrequency` and `laserLock`". `tests/w4PewFire.test.ts`'s case of that name drops `laserLock` from its list.
  - Autocannon's "a room level after 6 unshielded hits" becomes the two Rooms cases below (by hand on the target
    room; none on AUTO). `tests/w4Autocannon.test.ts`'s "six unshielded hits raise a room a level" is rewritten to
    fire by hand with a target room.
  - `tests/w4Runtime.test.ts`'s "E / Q step the torpedo's target room (no laserLock)" becomes "E / Q step the
    target room (`laserLock`, no `torpLock`)".

- **Modes** (`w4Manual.test.ts`, `w4Turret.test.ts`):
  - `gunMode {slot, manual}` admission: the seat, malformed slot and value, `unavailable` on the Valkyrn and the laser
    fit, the noop per slot, and its order before `pewFire`;
  - two `gunMode` commands for different slots in one tick both apply;
  - every row of §2.3's table: which gun follows the reticle, which slews to its own solution, which the left button
    fires;
  - `pewFire` is refused with `pewManual` false and admitted with it true, whatever `gunManual` is;
  - the MAN bonus is the gun in hand's only.
- **Rooms** (`w4Rooms.test.ts`, new):
  - `laserLock` on the Hound: the seat, malformed, −1 `unavailable`, unseen `unavailable`, sets `lock`, leaves
    `laserTargeted` and `laserRock` as they were; on the Valkyrn `unavailable`; on the laser fit unchanged;
  - a `laserLock` and a shot by hand in the same tick: the round carries the new room;
  - a round's `room`: by hand it is `lock + 1` at the moment of firing, and a later change of `lock` leaves it; by AUTO
    it is 0; a `pewFire` admitted with the pew not selected still carries the room;
  - autocannon by hand: six unshielded hits raise the target room's level, whichever part of the ship they land on, and
    no other room's wear moves;
  - autocannon on AUTO: unshielded hits wear the hull at `hitsPerHull` and no room, with `room: -1` on the event;
  - pew pew by hand: two unshielded hits raise the target room's level, each also costs the hull; one pew pew hit plus
    three autocannon hits by hand raise it; a level-2 room holds its wear at 0;
  - pew pew on AUTO: hull only;
  - shield hits by either gun are unchanged, the weak frequency included;
  - the Hunter's pew and the Valkyrn's gun: their hits are unchanged, with `room` 0 on every round;
  - an AUTO torpedo launched by F with no torpedo lock strikes the room `lock` names when it lands: stepping the room
    while it flies moves the strike; one launched with a torpedo lock keeps its room.
- **Hash and snapshot:** the two flags' bounds; the round `room` bound (0..3, 0 on a free entry, nonzero only on a
  crew round); a recycled pool entry takes the new round's tag; `ROUND_SLOT` 8 in the determinism length check; a
  snapshot round-trip with tagged rounds in flight, `tests/duelModules.test.ts`'s lists, and the Valkyrn identity test's left-out fields.
- **App** (`w4Input.test.ts`, `w4Ui.test.tsx`):
  - R flips the selected gun, and the torpedo when it is selected; Shift+R follows §2.4's rule in all four gun states
    and never sends `torpMode`; a KeyR keydown with `ctrlKey` or `metaKey` counts no press (the fake event source);
  - Z and V queue nothing at the Hound's Weapons seat, and still work on the laser fit's Weapons seat;
  - each tag sends its own weapon's command; the word and the light follow §2.5 in every row of §2.3's table;
  - E / Q send `laserLock` with the stepped room and never `torpLock`; a plain room click sends `laserLock`; a room
    click with the torpedo picked up still sends `torpLock`;
  - with the torpedo picked up at the Hound's seat, E sends `laserLock`, the pick-up stays and no `torpLock` goes;
    at the Flight seat E / Q with the torpedo picked up still step its room;
  - the hint row's two texts (§2.5), by whether the torpedo has a target;
  - a `pewHit` with `level` on the enemy shows the `PEW: ` room callout and flashes the room; one without a room
    shows neither;
  - the enemy window's bracket and the hint row's room name follow `lock`;
  - the controls list rows come from the tables.
- **Online** (`w4Online.test.ts`): `gunModeSent` per slot; the prediction runs on the selected gun's own mode; two E
  presses before a replica arrives step the room twice (`lockSent`), and it clears on the result, a new round, a sit
  and a stand.
- **Scripted and gates:** the gunner sends no `gunMode` and no `laserLock` on the Hound; the per-seed gates pass; the
  ladder's report has the room levels by weapon (§3.5).

## 6. Where it lands in the build

W-4a is not touched. The W-4b and W-4c plans are amended, and the builder resumes from the amended W-4b plan.

- **W-4b**, from the hold:
  - a new task after Task 2 splits `gunsManual` into `pewManual` and `gunManual` (state, hash, bounds, the identity
    test's list). Task 1's commits stay as they are;
  - **every later mention of `gunsManual` follows:** the plan's header, and Tasks 3, 4, 5, 6, 7, 8 and 9 (their code
    and their tests);
  - Task 3 (`gunMode`, hand control, the MAN tables) takes §2.2 and §2.3's `handControl`;
  - Task 6 (AUTO fires; it owns `pewFire`'s AUTO refusal and `tickGun`'s AUTO branch) takes §2.3's "`pewFire` reads
    `pewManual`";
  - Task 5 (the reticle, the mode key, the left button by mode) takes §2.4;
  - Task 9 (the tag and the hint row) takes §2.5;
  - Task 7 (the online prediction) takes §2.6;
  - new tasks for §3: the `laserLock` admission and write, the round's `room` and the hit rules (sim); E / Q, the
    contact controller's fence, the window click, the bracket, `lockSent` and the hint row (app); the ladder report's
    room levels (with Task 10).
  - **The §3 sim task comes after Task 6.** Until Task 6 deletes it, W-4a's stand-in in the scripted gunner sends
    `pewFire`; tagged before then, those rounds would wear rooms and move whole runs an extra time.
- **The smokes.** The duel app smoke (step 5) and the internet smoke launch a MANUAL torpedo with V then F (W-4a).
    With V retired at the Hound's seat they select the torpedo (3), press R, then F. The task that binds R changes
    both.
  - **The copied E / Q block.** W-4a's Hound branch in `runtime.ts` copies the Flight seat's E / Q torpedo-room block
    (the builder's deferred review note), and `onlineDuel.ts` mirrors it. The task that moves E / Q to the target room
    (§3.6) removes the copy from the Hound's branch in both files; the Flight seat keeps its own.
  - **State at the hold** (the builder, 3b2a90c5): W-4b Tasks 1 and 2 are done. `gunsManual` is in the ship tail, the
    flags list, `validateTacticalValues`' mode check, `tests/w4Turret.test.ts`, the `tacticalDeterminism` flatten key
    guard and the Valkyrn digest's left-out list. `turretAim` is on every held schema, the authority's lists and
    `ShipInput`, and nothing reads it yet.
- **W-4c:** §7's text (§2.6) and its tests' key names. No rule changes.
- **Gate entries** (`docs/gates.md`): W-4b's manual box gains "R flips the selected weapon's tag, Shift+R both guns;
  Q/E moves the bracket in the enemy window; six autocannon hits or two pew pew hits by hand take the bracketed room
  down a level; on AUTO the same hits only wear the hull".

## 7. Not in this build

- **Ryan's "auto doesn't lead its shots"** (owner's call 1).
- **Dropping F** (owner's call 2).
- **The AUTO torpedo launching on its own while ammo lasts** (W-4 §17 item 16 stands).
- **R on the laser fit's Weapons seat.** It keeps Z and V. The Flight seat has no modes and reads none of the three.
- **Room callouts online** for the guns (§3.4): the replica carries no room for a hit.
- **A target room for the Hunter**, or AUTO room targeting.
- The rest of round 2 (the Helm, the sensors blip, on foot) has its own specs.

## 8. Judgement calls (owner to check)

1. **Shift+R leaves the torpedo out** (§2.4), and it means "both to AUTO if either is MAN, else both to MAN".
2. **Z and V do nothing at the Hound's Weapons seat** (§2.4). They are not kept as aliases, so there is one way to do
   it.
3. **The target room is the old laser lock field,** and `laserLock` carries it (§3.1, §3.2). No new state or command.
4. **E / Q no longer make a torpedo lock** (§3.6). A torpedo lock arms the AUTO torpedo to launch when it legally can,
   so stepping the guns' room with it would fire torpedoes. The pick-up click still makes one.
5. **Choosing a room needs the enemy seen** (§3.2), as locks do today.
6. **A round keeps the room it was fired at** (§3.3). **An AUTO torpedo launched without a lock follows the room until
   it lands** (§3.1), which is today's code: stepping Q/E while it flies moves its strike.
7. **A clicked pew pew shot always carries the room,** even when the selection trails the click online (§3.3).
8. **`PEW_ROOM_WEAR = 3`:** two pew pew hits by hand a room level, sharing the autocannon's wear counter (§3.4). At 3
   bars in MAN that is a level about every 0.9 s of clean hits, on top of pew pew's hull damage.
9. **The AUTO autocannon loses its room damage** (§3.5), which is Ryan's rule. The bots lose it too.
10. **A MAN gun's tag reads `AUTO`, lit, while it is not selected** (§2.5).
11. **With the torpedo picked up, E / Q still step the guns' room** on the Hound (§3.6). The torpedo's own target is
    set only by the room click.
12. **The second hint row swaps its text while the torpedo has a target** (§2.5), since only two rows fit.
13. **Online, a room hit by a gun shows no callout** (§3.4), as the Valkyrn's gun shows none online today.
