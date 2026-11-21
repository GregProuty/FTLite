# Science hacking (spike) — design

Owner request 2026-11-20: "if they're locked on the enemy and in range they can click a button to hack an individual
room on the enemy: weapons, shield or engine. They need to coordinate with helm to stay within range for 7 seconds, and
then the room/module is disabled for 30 seconds. They need at least 2 energy in science to enable this module. Make
science a module similar to the weapons that can be enabled for the allocated energy in that station. Add a
disabled/electrical short effect on the enemy ship/room/module that is disabled."

Owner order: spec → Fable review → plan → Fable review → build → Fable code review → finish, taking every
recommendation, no check-ins. Branch `spike/hacking` (worktree `.worktrees/hacking`), from origin/master 7e92c060 (SIM 69).

## 1. Decisions (recommendations taken)

| # | Question | Decision |
|---|---|---|
| D1 | Where does "energy in Science" come from? | The Science station's energy is the ship's **Sensors** system bars (Engineering already powers Sensors 0..3, +1 overdrive). Science splits its effective Sensors bars between two modules, **SCAN** and **HACK**, the way Weapons splits its bars between the weapons. |
| D2 | What does a bar on HACK cost? | It comes off SCAN. SCAN's bars (effective Sensors − HACK's) drive sensor range and scan rate. With HACK at 0 every Sensors rule is exactly today's (no behaviour change for anyone who never hacks). |
| D3 | How is HACK powered? | Science's own pips (left click +1, right click −1), like the weapon pips. Stored as `hackPower` 0..4, trimmed on read to the effective Sensors bars (`hackBars`). Unallocated Sensors bars are SCAN's automatically, so Engineering adding a Sensors bar still grows the range. |
| D4 | "At least 2 energy" | HACK is online while `hackBars ≥ 2` (`HACK_MIN_BARS`). Below that its room buttons are dim and a running hack is lost. |
| D5 | "Locked on the enemy" | Science's selection: the enemy is **designated** (`t.designated === Contact.Enemy`, Sci-1's click/T on the enemy). No new lock concept. |
| D6 | "In range" | The enemy ship is **seen** (`shipSeen`: inside the crew's sensor range). Because HACK's bars come off SCAN, hacking shortens the range: Helm must close in and hold. That is the coordination the owner asked for. |
| D7 | One hack or several? | One hack at a time (`hackRoom`, `hackTicks`). Hacking another room restarts the hold on the new room. |
| D8 | What breaks a hack? | Any tick the conditions fail: Science unattended, HACK below 2 bars, the enemy not designated, or the enemy unseen. The hack is **lost**: progress resets to 0 and the hack ends (event). It must be held for an unbroken 7 s. |
| D9 | Hold and effect lengths | `HACK_TICKS = 420` (7 s at 60 Hz), `HACK_DISABLE_TICKS = 1800` (30 s). |
| D10 | What does "disabled" do? | The hacked room reads as damage level 2 (off) for every system gate on that ship, through one helper `roomLevel(sys, r)`, without touching `rooms` (repair, damage and the Hunter's repair AI are unchanged). Weapons: the laser is offline, torpedo launches refused, gun cannot fire, and the **pew is unpowered** (a non-crew pew today ignores room damage; a hack now gates it). Engines: the class's level-2 engine factor (no thrust/turn). Shields: the shields **drop to 0** when the hack lands and recharge at the level-2 rate (0) until it ends. |
| D11 | Hacking a room already hacked | Refused `unavailable` while that room's disable runs (no refresh stacking). |
| D12 | Does hacking turn the enemy hostile? | Yes, landing a hack counts as a crew attack for the hostility step (as a shot does). Starting a hack does not. |
| D13 | Crew ship hackable? | No: only the crew hacks. `hacked` exists on every slot (the gates read it generically) but only the crew's target is ever written. |
| D14 | SIM | New state fields and a rule change: SIM 69 → 70, by the standard two-step bump (alone + bless, then the change + same-version bless). |

## 2. Sim

### 2.1 State (all flat scalars or fixed vectors, so flatten, clone, hash and snapshot follow from the modules)

- `ShipSystems.hackPower: number` — crew only (0 on other slots); 0..`HACK_BAR_MAX` (4). In the ship module's scalar tail.
- `ShipSystems.hacked: [number, number, number]` — ticks left switched off per Room (0 none); 0..`HACK_DISABLE_TICKS`. A
  ship-module vector after `weaponPower`.
- `TacticalState.hackRoom: number` (−1 none, 0..2) and `hackTicks: number` (0..`HACK_TICKS`) — the science module's tail.
- Value rules in hash.ts for all four. Every round (the rematch's included) starts `hackPower 0`, `hacked [0,0,0]`,
  `hackRoom −1`, `hackTicks 0`.

### 2.2 Helpers (bars.ts, pure)

`hackBars(sys) = min(hackPower, effectiveBars(Sensors))`, `scannerBars(sys) = effectiveBars(Sensors) − hackBars(sys)`,
`hackOnline(sys) = hackBars ≥ HACK_MIN_BARS`, `roomLevel(sys, r) = hacked[r] > 0 ? 2 : rooms[r]`.

`sensorRange` and `scanProgressRate` read `scannerBars` instead of the effective Sensors bars, and so does the
contactScan admission's "no Sensors, no scan" check (now "no scanner bars, no scan").

### 2.3 Gates that read `roomLevel` instead of `rooms` (non-crew paths; crew paths already use bars)

- `weapons.ts`: `canLaunch` (non-crew `up`), `laserOffline` (non-crew), the non-crew laser charge rate, the non-crew
  shield recharge rate.
- `gun.ts`: the cooling halving and the fire gate.
- `pew.ts`: `pewPowered` for a non-crew ship: `roomLevel(Weapons) < 2`.
- `physics.ts` / `predict.ts`: the non-crew engine factor and `flyShip`'s engines level.
- Not changed: damage application (missiles, laser, gun, pew room wear), repair, the Hunter's repair choice, the crew's
  `effectiveBars` (the crew is never hacked).

### 2.4 Commands (DuelCommand, codec, the science module's command list)

- `sciencePower { delta }` — Science attendant only (`invalid-seat`), stale-tick first, `delta` ±1 else `malformed`. +1:
  `unavailable` when `hackPower ≥ HACK_BAR_MAX` or `hackPower + 1 > effectiveBars(Sensors)`; −1: `unavailable` at 0.
  Applied in (player, sequence) order after the ship commands (so a same-tick Sensors bar from Engineering counts).
- `hack { room }` — room −1 (cancel) or 0..2. Order: stale-tick, seat (`invalid-seat`), room (`malformed`), then for −1:
  `noop` when no hack runs, else the hack ends (no event); for a room: `unavailable` when HACK is offline, the enemy is
  not designated, unseen, or that room is already hacked; `noop` when that room's hack is already running; else
  `hackRoom = room, hackTicks = 0`. Last applied wins. Admitted after `sciencePower` in the same tick.

### 2.5 The hack step (science.ts `hackStep(t, scientist)`, in stepDuel after scanStep)

1. Every slot's `hacked[r] > 0` counts down by 1 (a hack that ends this tick frees the room this tick).
2. If `hackRoom ≥ 0`: if any D8 condition fails → push `{ kind: 'hack', what: 'lost', room }`, `hackRoom −1`,
   `hackTicks 0`. Else `hackTicks++`; at `HACK_TICKS`: the target slot's `hacked[room] = HACK_DISABLE_TICKS`; a Shields
   hack sets its `shields = 0`, `shieldClock = 0`; push `{ kind: 'hack', what: 'done', room }`; count it for hostility
   (a crew counter `hacksLanded` is not added: the hostility step reads a per-tick flag, `t.hackLanded`, transient,
   not hashed — or simply the done event; plan picks the smallest correct form); `hackRoom −1`, `hackTicks 0`.

The crew input carries `hacker: boolean` (Science attended), as it carries `scanner`.

### 2.6 Events

`DuelEvent` gains `{ kind: 'hack'; what: 'done' | 'lost'; room: number }`. Views and audio may read it (a zap SFX if one
exists in the bank; no new asset required).

## 3. UI

### 3.1 Science station block (ScienceStation.tsx, consoleModel SciencePanel)

The block grows (STATION.h.science 96 → about 176) to hold, under the SENSOR RANGE row and the hover readout:

- **SCAN** and **HACK** module rows, each with four pips like the weapon pips (fourth dashed for overdrive). SCAN's pips
  are read-only (they show `scannerBars`); HACK's take left/right clicks → `sciencePower ±1`. `FREE`-style text is not
  needed (every bar not on HACK is SCAN's).
- HACK's three room buttons **WEAP / SHLD / ENG**: a click sends `hack {room}`; clicking the running room again sends
  `hack {−1}` (cancel). Dim while unavailable; the hacked rooms show their seconds left (`ENG 23`).
- A progress bar for the running hack and one status word line: `HACK: NEED 2 BARS`, `HACK: SELECT THE ENEMY`,
  `HACK: OUT OF RANGE`, `HACKING SHLD 4 s` (hot), `SHLD DOWN 27 s`, or the key help.
- SENSOR RANGE shows the SCAN range (it already reads `sensorRange`).

### 3.2 Enemy contact window (contactModel / ContactWindow)

A hacked room gets an **electrical short** look: a flickering jagged arc (3–4 zig-zag segments, re-seeded on the
presentation clock several times a second, from `t` so it is deterministic per frame) across the room polygon, the
fill dimmed and blinking, and the label replaced by `HACKED 23`. A room being hacked shows a thin progress outline
pulse. Drawn whatever the scan level the rooms are drawn at.

### 3.3 Map

The enemy ship on the tactical map gets small crackling spark arcs around its sprite while any of its rooms is hacked
(tacticalLayer, cheap Pixi graphics; deterministic on the presentation clock). A `HACKED` tag beside its marker.

### 3.4 Input path

`sciencePower` and `hack` ride the existing ship-command queue (`ConsoleInput.ship`), which both Single player and
online already forward; `ShipCommand` widens to include them. The sim refuses them off the Science seat.

## 4. Tests (vitest)

- bars helpers: hackBars trims, scannerBars, roomLevel.
- Commands: each refusal and noop in §2.4; last wins; seat checks.
- hackStep: 420 unbroken ticks land; each D8 condition loses it; the disable counts down to 0 in 1800 ticks; Shields
  hack zeroes shields and holds recharge; hacked Weapons stops the Hunter's laser, torpedo and pew; hacked Engines stops
  its thrust; hostility turns on a landed hack.
- Sensor range shrinks with HACK bars; with HACK 0 everything is unchanged (the duel goldens hold across the bump's
  "alone" step and the change step leaves runs without hacking identical).
- hash/snapshot round trip with a running hack and a hacked room; value rules reject out-of-range values.
- UI models: Science panel status words; contact window hacked room view; a React render smoke for the station.

## 5. Out of scope

Enemy hacking the crew; hack defence; new art or sound assets; balance tuning beyond the owner's numbers.

## 6. Fable spec review amendments (R1, all taken; these override §1–§4 where they differ)

1. **Hostility is state-derived** (replaces §2.5's undecided wording and D12). `hostilityStep` also turns the enemy hostile
   while the crew target's `hacked` has any value > 0, cause `'hack'` (after `missile`, before `clock`; the hostile
   event's cause union widens). Since hostilityStep runs before hackStep, hostility lands the tick after the hack lands
   (`hostileAt = landing rt + 1`); a test pins it. No transient flag.
2. **Bump hygiene.** hash.ts imports HACK_BAR_MAX, HACK_DISABLE_TICKS, HACK_TICKS. The pinned command lists in
   tests/scienceState.test.ts and tests/duelModules.test.ts gain `hack`, `sciencePower`. The in-progress edits are set
   aside (patch file) for the "SIM 69 → 70 alone" step and re-applied after it.
3. **Value rules** (validateTacticalValues, following the crew-only checks): `hackPower` 0 off the crew slot; `hacked`
   all 0 on the crew slot; `hackRoom === −1 ⇔ hackTicks === 0`; `hackTicks ≤ HACK_TICKS − 1`; the target's
   `hacked[hackRoom]` is 0 while a hack runs.
4. **Admission placement.** `hack` and `sciencePower` are **not** SHIP_KINDS (those admit any player). They get their own
   loops after `weaponPower` (sciencePower first, then hack), and both join DUEL_KINDS. They still ride the client's
   ship-command queue (§3.4). `contactScan` is admitted earlier in the tick and so reads start-of-tick scanner bars.
5. **hackPower is clamped like weaponPower.** Copy `applyWeaponPower` / `clampWeaponPower` (sim/duel/weaponSlots.ts): a
   ±1 first writes back the trimmed `hackBars`, refusals are judged on the trimmed value, and `clampToCapacity` clamps
   `hackPower` to the effective Sensors bars, so lost Sensors bars never silently return to HACK. A
   `sciencePowerRefusal` helper mirrors `weaponPowerRefusal` for the UI.
6. **Online events.** Tactical events are not in snapshots; the online source derives them from counters (`gapEvents`).
   Add the target's `hacked` rise (0 → > 0 on any room) as the online `hack done` derivation. `lost` is not derived
   online (a cancel and a loss look alike in a snapshot); the UI shows status from state only. Every visual reads only
   `hacked`, `hackRoom`, `hackTicks`.
7. **Science block click exclusion.** The taller block (176 px; fits at 1280×720) must swallow map clicks: add the
   Science block to the station-block exclusion the Science map click uses (scene.ts / flightPointer.ts pattern) with
   a test. The key help line moves to the block's bottom.
8. **Contact window, both branches.** The hacked look applies in the level-0 "?" silhouette branch and the level 1–2
   branch (no scan gate; revealing which "?" room is hacked is accepted). The label is `HACK 23` (short, fits).
9. **Gates.** §2.3's list is complete. Only `shipEngineFactor` matters for engines (the `engines` argument to flyShip /
   predict is dead; leave it). A hacked enemy pew **holds its charge** (no gain while hacked) so it does not burst the
   moment the hack ends; a hacked Hunter therefore makes no pew rng draws (test).
10. **Engines is the strongest hack** (factor 0 stops turning too, so the Hunter cannot bring weapons to bear for 30 s).
    Kept as the owner's numbers; flagged in the report for tuning.
11. `sensorRange`'s Pick type gains `'hackPower'`; the only Sensors readers are science.ts (range, scan rate) and the
    contactScan admission.
12. **Intended:** the shorter range while hacking also blinds the crew's own AUTO fire, locks and turret (they read
    `shipSeen`). Tested.
13. **No-hack behaviour proof.** The new fields change every hash, so instead of "goldens hold", the change step runs
    the duel oracle / canonical trace check against the SIM 70 baseline; if the new fields make it refuse, a test
    compares a no-hack run's telemetry and final bodies against values captured before the change.
14. The target slot is `systems[CREW_SLOT].target`. `ShipInput.hacker` is added to every ShipInput literal, default true
    (as `scanner`). Pins: a hack admitted on tick N lands at the end of tick N + 419; the room is gated for exactly 1800
    ticks.
15. **Extra tests:** snapshot restore mid-hack and on the tick after landing equals an uninterrupted run; the predictor
    verifies with `hack` / `sciencePower` in its log; codec strict accept/reject for both; a rematch resets all four
    fields; a cancel emits no event; same-seed two-run hash equality with hack commands; the Science block click
    exclusion.
