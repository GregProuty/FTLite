# W-4 amendment: a mode per weapon, and room targeting (design, 2026-11-19)

Ryan's playtest notes, round 2 (`docs/superpowers/research/2026-11-19-ryan-notes-v2.md`, §1 and §4), with the owner's
calls of 2026-11-19. This spec **amends** the W-4 spec (`2026-11-19-w4-weapons-controls-design.md`): §3.1, §3.4, §4.1,
§5, §6, §7, §8, §9, §10, §11, §13 and §14, Decision 5, and §17 items 7 and 14. Where they differ, this spec
wins. Everything else in W-4 stands.

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
  key handler already sees `shiftKey`, as the Shift+W case does). A press with Ctrl or Meta held is neither, so the
  browser's reload stays the browser's.
- **W-4's rename of KeyZ's action is dropped.** KeyZ stays `laserMode` and KeyV stays `torpMode` in the table. The
  runtime reads them only where they are read today: the laser fit's Weapons seat and the Flight seat. At the Hound's
  Weapons seat it reads neither.
- **Elsewhere** (the laser fit, the Valkyrn's Flight seat) Z and V are unchanged, and R does nothing. Moving those seats
  to R is not in this build (§7).
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
- **The hint rows** under the cards: `LMB FIRE · A/D SELECT · W/S POWER`, then `R AUTO/MAN · Q/E ROOM: <name>` (§3.6).
  `RIGHT-CLICK TORPEDO: CLEAR` moves to a third row. The plan measures each row against the space left of `FREE n` /
  `ROCKS n`, as W-4 §10 did.

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
- It is also already the room an AUTO torpedo strikes when it was launched without a torpedo lock (`missiles.ts`:
  `torpRoom >= 0 ? torpRoom : lock`). So an AUTO torpedo launched by F or the left button now goes for the Q/E room.
  That rule's code does not change.

### 3.2 The command

- `laserLock {room}` keeps its name on the wire, as `laserFrequency` did in W-4 §5.2. On the Hound it is the target
  room's command.
- **Admission on a class with a turret gun and no laser** (the Hound), in order:
  - stale-tick;
  - `not-at-weapons`;
  - `malformed` for a room outside −1..2 (today's `validTarget`);
  - `unavailable` for −1 (there is nothing to clear);
  - `unavailable` when the enemy ship is not seen (today's fog rule for locks, `step.ts`);
  - otherwise it sets `lock` to the room.
- `laserTargeted` stays false on the Hound: `applyWeaponsInput` (`weapons.ts`) sets it only on a class with a laser.
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
- **Hash and bounds:** `roundFields` (`hash.ts`) gains the field for both pools. It is within 0..3, and 0 unless the
  round is active and its owner is the crew slot of a class with a turret in that pool's weapon.
- **The Valkyrn identity test** leaves `rounds.*.room` and `pew.*.room` out by name and asserts them 0, as it does the
  turret fields.
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
- **`pewHit`** (the event) gains `room` (−1 for none or a shield hit) and `level`, as `gunHit` has. The view shows the
  ROOM HIT / OFFLINE callout from them, as it does for the gun.
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
    and by which weapon (`gunHit` and `pewHit` events with `level`, and the torpedo's), so the owner can see what the
    rule cost the bots.

### 3.6 Controls

| Input at the Hound's Weapons seat | Action | W-4 |
|---|---|---|
| E / Q | Step the target room forward / back: Weapons → Shields → Engines, wrapping (`cycleLock`, `app/duel/controls.ts`). Sends `laserLock {room}`. | Stepped the torpedo's lock (`torpLock`) |
| Click a room in the enemy window, nothing picked up | `laserLock {room}` | Nothing |
| Click a room in the enemy window, the torpedo picked up | `torpLock {room}`, as now: the AUTO torpedo launches when it legally can | Same |
| Right-click, the torpedo's target | Clears the torpedo's target, as now | Same |

- **The step is judged from** the latest queued `laserLock` this frame, else `lock`, as the torpedo's step is judged
  from the latest queued `torpLock` (`runtime.ts`).
- **Unseen enemy:** the keys and the click raise the `NO CONTACT` refusal, as the lock keys do today. The target room
  keeps its value.
- **The enemy window** brackets the target room (`hot`) whenever the enemy is seen. The torpedo's own target mark is
  unchanged.
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

Added to W-4 §14's lists.

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
    `laserTargeted` false; on the Valkyrn `unavailable`; on the laser fit unchanged;
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
  - an AUTO torpedo launched by F with no torpedo lock strikes the target room.
- **Hash and snapshot:** the two flags' bounds, the round `room` bound, a snapshot round-trip with tagged rounds in
  flight, `tests/duelModules.test.ts`'s lists, and the Valkyrn identity test's left-out fields.
- **App** (`w4Input.test.ts`, `w4Ui.test.tsx`):
  - R flips the selected gun, and the torpedo when it is selected; Shift+R follows §2.4's rule in all four gun states
    and never sends `torpMode`; Ctrl+R sends nothing;
  - Z and V queue nothing at the Hound's Weapons seat, and still work on the laser fit and the Flight seat;
  - each tag sends its own weapon's command; the word and the light follow §2.5 in every row of §2.3's table;
  - E / Q send `laserLock` with the stepped room and never `torpLock`; a plain room click sends `laserLock`; a room
    click with the torpedo picked up still sends `torpLock`;
  - the enemy window's bracket and the hint row's room name follow `lock`;
  - the controls list rows come from the tables.
- **Online** (`w4Online.test.ts`): `gunModeSent` per slot; the prediction runs on the selected gun's own mode.
- **Scripted and gates:** the gunner sends no `gunMode` and no `laserLock` on the Hound; the per-seed gates pass; the
  ladder's report has the room levels by weapon (§3.5).

## 6. Where it lands in the build

W-4a is not touched. The W-4b and W-4c plans are amended, and the builder resumes from the amended W-4b plan.

- **W-4b**, from the hold:
  - a new task after Task 2 splits `gunsManual` into `pewManual` and `gunManual` (state, hash, bounds, the identity
    test's list). Task 1's commits stay as they are;
  - Task 3 (`gunMode`, hand control, the MAN tables) takes §2.2 and §2.3;
  - Task 5 (the reticle, the mode key, the left button by mode) takes §2.4;
  - Task 9 (the tag and the hint row) takes §2.5;
  - Task 7 (the online prediction) takes §2.6;
  - new tasks for §3: the round's `room` and the hit rules (sim); E / Q, the window click, the bracket and the hint row
    (app); the ladder report's room levels (with Task 10).
- **W-4c:** §7's text (§2.6) and its tests' key names. No rule changes.
- **Gate entries** (`docs/gates.md`): W-4b's manual box gains "R flips the selected weapon's tag, Shift+R both guns;
  Q/E moves the bracket in the enemy window; six autocannon hits or two pew pew hits by hand take the bracketed room
  down a level; on AUTO the same hits only wear the hull".

## 7. Not in this build

- **Ryan's "auto doesn't lead its shots"** (owner's call 1).
- **Dropping F** (owner's call 2).
- **The AUTO torpedo launching on its own while ammo lasts** (W-4 §17 item 16 stands).
- **R on the laser fit and on the Valkyrn's Flight seat.** They keep Z and V.
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
6. **A round keeps the room it was fired at** (§3.3).
7. **A clicked pew pew shot always carries the room,** even when the selection trails the click online (§3.3).
8. **`PEW_ROOM_WEAR = 3`:** two pew pew hits by hand a room level, sharing the autocannon's wear counter (§3.4). At 3
   bars in MAN that is a level about every 0.9 s of clean hits, on top of pew pew's hull damage.
9. **The AUTO autocannon loses its room damage** (§3.5), which is Ryan's rule. The bots lose it too.
10. **A MAN gun's tag reads `AUTO`, lit, while it is not selected** (§2.5).
