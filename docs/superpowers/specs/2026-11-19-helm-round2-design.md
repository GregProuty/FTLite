# Helm round 2: a throttle that stays, a tap to cut, drag, and a gas charge (design, 2026-11-19)

Ryan's playtest notes, round 2 (`docs/superpowers/research/2026-11-19-ryan-notes-v2.md`, §3 Helm and §1), with the
owner's calls of 2026-11-19. This spec **amends** the playtest2feedback spec
(`2026-11-18-playtest2feedback-design.md`: §2's flight, §3's throttle, §4 and §4a's cold gas and boosted turn, §6's
hints) and the owner's merge decisions of 2026-11-19 recorded in the code ("free cold gas", "the far turn is always
gas-boosted"). Where they differ, this spec wins.

Everything here is for the **crew Helm on a `newtonianHelm` class**: the Hound (`CUTTER_CLASS`). The Hunter, the Valkyrn
and its Flight seat keep their flight, keys and bits.

Paths are under `src/renderer/src/` unless they start with `tests/` or `docs/`. Code is quoted from master at eaf84426
(SIM_VERSION 61). Every number is a starting value, tuned in playtest.

## 1. The owner's calls (2026-11-19)

1. **A and D keep turning the ship.** Ryan's "A/D: side bursts" is not adopted. Q / E and the arrows stay the thrusters.
2. **Drag and auto-stabilise come back for the Hound** (Ryan: "keep auto-stabilise", "drag: probably keep"). The
   owner's earlier "no drag" is replaced.
3. **The turn is a fixed rate.** The free 2× cold gas boost on far turns goes.
4. **The cold gas is a charge:** hold a thruster to push while the charge lasts; it refills once you let go. It
   replaces "free cold gas". (Owner: the shared-charge option, over one fixed kick per press.)
5. **The right-click heading hold and Space auto-face leave the player's Helm.**
6. From the notes as written: the throttle stays where it is left; a tap of S cuts it; reverse is 50 %; 0 to full in
   about 1 s; the HUD shows a velocity marker; the first-play hints teach braking.

## 2. The throttle

### 2.1 It stays where you leave it

- `thrMille` (`DuelState`, hashed) stays the held throttle in per mille of full forward thrust. Its range becomes
  **−500..1000** (`THR_MIN = -500`, `THR_MAX = 1000`, `sim/duel/tuning.ts`): −500 is full reverse.
- **The ramp** (`rampThrottle`, `sim/duel/helmFlight.ts`): W held adds `THR_RAMP`, S held takes it away, and **neither
  held leaves it alone**. `THR_RETURN` is removed.
  - `THR_RAMP = 17` per tick: 0 to 1000 in 59 ticks (0.98 s), and 0 to −500 in 30 ticks (0.5 s).
  - The clamp to the Engines bars' floor and cap stays, every tick (`throttleFloor`, `throttleCap`). So losing a bar
    lowers a throttle above the new cap at once, and getting the bar back does not raise it again.
- **With no key held, attended or not,** the throttle keeps its value: with nobody at the Helm, and in Single player
  with the Helm character seated while you play Weapons. Today it returned to 0 in both cases. A set throttle is a
  lever; leaving the seat does not move it.
- **A new round** starts at 0.
- **`rampTicks`** (the app's local prediction) follows the same rule.

### 2.2 Reverse is 50 %

- `crewThrust(m)` becomes `m < 0 ? m / 500 : m / 1000`: the thrust axis in −1..1.
- The Hound's reverse fraction becomes 0.5: a new `HOUND_REVERSE_FRACTION = 0.5` (`sim/tactical/tuning.ts`), read by
  `CUTTER_CLASS.reverseFraction` (`defs.ts`). `REVERSE_FRACTION` (0.4) stays for every other class, so the Hunter still
  brakes at 40 %.
- Full reverse is therefore 60 u/s² (`THRUST` 120 × 0.5), against 48 today.
- Reverse still needs at least one Engines bar (`throttleFloor`). The Engines cap applies to forward throttle only, as
  today.
- **Snapshot validation** (`sim/duel/snapshot.ts`) checks `thrMille` against the new `THR_MIN`.

### 2.3 A tap cuts it

- **The rule for the player.** A press of S shorter than the tap time, judged when the key comes up, cuts a forward
  throttle straight to 0. A press of W shorter than the tap time does the same to a reverse throttle.
  - "Forward" and "reverse" are judged from the throttle **when the key went down**: a tap of S cuts only if the
    throttle was above 0 then; a tap of W only if it was below 0.
  - With the throttle at 0 when the key went down, a tap is an ordinary short press: it nudges the throttle by the
    ramp, at most `THR_RAMP` × the tap time in ticks (about 20 % at 200 ms, 30 % at 300 ms).
  - A tap of S on a reverse throttle, or of W on a forward one, is also an ordinary short press.
  - Holding a key longer than the tap time ramps as normal and cuts nothing.
- **The tap time** is a Settings value, `throttleTapMs`: 150, 200, 250 or 300 ms, default **200** (§6.3).
- **The command.** `throttleCut {}`, Helm seat only. It is admitted in `step.ts`'s Helm block, in its own loop right
  after `heading`'s, against the seats as they stand after the seat phase, as `throttle` and `heading` are. In order:
  - `stale-tick`;
  - `invalid-seat` when there is no Helm attendant or the sender is not it (the reason `throttle` and `heading`
    give; there is no `not-at-helm`);
  - `unavailable` on a class without `newtonianHelm`;
  - `noop` when `thrMille` is 0;
  - otherwise `thrMille = 0` and the latch below is set.
  - The helm module's `reasons` list is unchanged (`invalid-seat`, `malformed`, `stale-tick`, `unavailable`).
- **The latch.** A new hashed flag on `DuelState`, `thrCut` (false at a round's start). While it is set, the ramp
  ignores `throttleHeld`.
  - **The order inside `crewHelm`**, which runs after the commands on the same tick:
    1. if `thrCut` is set and nobody attends the Helm, or the attendant's `throttleHeld` is 0, clear it;
    2. ramp with the held value `thrCut ? 0 : throttleHeld` (0 with no attendant);
    3. clamp to the floor and cap.
  - **The cut's own tick counts.** A cut that arrives with the key already up (the ordinary case, and the scripted
    Helm's) sets the latch and clears it in the same tick, so the next tick's W or S ramps at once.
  - Why: online, the held frame that says "S is up" and the cut command can reach the authority on different ticks. A
    late held frame still saying S would ramp the throttle below 0 after the cut and leave it there. With the latch the
    key has to come up before the throttle moves again, whatever the order.
- **Where the tap is detected.** In the app (`app/duel/input.ts`), from the key's down and up times. The sim never
  sees the tap time.
  - `createDuelKeyboard` has no clock and no settings today. `DuelKeyboardOptions` gains `now?: () => number`
    (milliseconds; default `performance.now`) and `tapMs?: () => number` (default 200), both read live, so a Settings
    change needs no new keyboard. Tests pass a fake `now`.
  - The keyboard keeps a down time per code for KeyW and KeyS, set on a keydown that is not a repeat. On that keydown
    it also sets a one-shot `KeySample.throttleDown`: −1 for S, 1 for W. Shift held or not makes no difference here
    (today's Shift+W case adds no press edge; the down time and `throttleDown` are set before that branch).
  - On the key's keyup, a down time that is still there and less than `tapMs()` old sets a one-shot
    `KeySample.throttleTap` (−1 for S, 1 for W). The down time is dropped either way.
  - **The down times are dropped** by `clear` (blur, Tab, restart) and by `staleHeld` (a sit), so a key held across
    any of them gives no tap when it comes up. `throttleDown` and `throttleTap` are dropped by `clear` and `clearUi`,
    as the other one-shot fields are.
  - W and S are timed separately. With both down the held throttle cancels to 0, as today.
  - **The runtime** records the throttle on the sample that carries `throttleDown` (the sim's `thrMille` in Single
    player; the online seat's predicted throttle, §7), per key. On a `throttleTap` it sends `throttleCut` only if the
    recorded value is on the tap's side (above 0 for S, below 0 for W). A press shorter than one frame carries both
    fields in one sample: the runtime records first, then judges.
  - `throttleCut` joins the runtime's `isConsoleCommand` list, so a Tab or a stand drops a queued one, as it drops a
    queued `heading`.
- **The Engines refusal** is unchanged: with no Engines power a press of W or S raises today's refusal and sends
  nothing.

## 3. Flight

### 3.1 Drag and stabilise

- `CREW_FLIGHT` (`sim/tactical/tuning.ts`) becomes
  `{ gravity: true, edge: true, drag: CREW_DRAG, stabilise: CREW_STABILISE, stabiliseUnderThrust: true }` with
  `CREW_DRAG = 0.15` and `CREW_STABILISE = 80`: the values every ship flew before the playtest2feedback spike, and the
  ones Ryan played on the sim 52 build. They are the Hound's own constants now, so tuning them never moves the Hunter.
- With drag above 0, `flyShip` (`sim/tactical/physics.ts`) takes its drag branch: no `MAX_SPEED` cap, and a top speed
  where thrust equals drag (about 800 u/s at full throttle, 520 at 65 %).
- **The drag-0 branch and `MAX_SPEED` stay in `flyShip`**, for the test configurations that fly with no drag. No game
  ship takes that branch any more. `tests/crewFlight.test.ts` pins `CREW_FLIGHT`'s literal and the 400 u/s cap for the
  Hound; those cases are rewritten for the new tuning (a replaced rule).
- **Stabilise under thrust.** Today `flyShip` stabilises only while the turn, the thrust and both thrusters are all
  zero (`idle`). With a throttle that stays set, that would never happen while cruising.
  - `FlightTuning` gains an optional `stabiliseUnderThrust?: boolean` (absent means false, so the test
    configurations that build a `FlightTuning` literal need no edit). When it is true, `idle` ignores the thrust:
    `turn === 0 && rcsX === 0 && rcsY === 0`. `DEFAULT_FLIGHT` does not set it, so every other ship's `idle` is
    today's expression.
  - The rest of the stabilise rule is unchanged: on the tick the ship goes idle, the sideways speed (across the nose) is
    captured as the skid to remove, and up to `stabilise × dt` of it comes off each tick. Gravity's later sideways pull
    is never captured, so the ship still falls and orbits.
  - What the player feels: stop turning and stop venting, and the ship's sideways slide dies away, so it flies where
    the nose points. A side burst is a sidestep: the push moves the ship over, and the slide is damped once the
    thruster is released.
- Gravity and the edge spring are unchanged.

### 3.2 A fixed turn rate

- The Hound turns at `TURN_DEG_PER_S` (150°/s) for A / D, the left-button steer, the held heading and the scripted
  Helm alike. "Fixed" means no boost: the Engines factor still scales it, as today (1 at 1 to 4 Engines bars, 1.25
  on the overdrive bar, 0 with none).
- **Removed:** `helmBoost` (`sim/duel/step.ts`), `Axes.turnBoost` and its read in `flyShip`, `RCS_TURN_BOOST`,
  `BOOST_FAR` and `BOOST_FACE_SIN`, `HelmVent.boosted` and `HelmVent.turn`, and their readers: the boosted turn's puffs
  (`render/tactical/tacticalModel.ts`), its hiss (`app/duel/duelAudio.ts`), the telemetry term
  (`sim/duel/telemetry.ts`), the scripted crew's record (`sim/duel/scripted.ts`), and the module-load guard in
  `sim/tactical/defs.ts` that checks a boosted turn stays inside the far band.
- `flyShip`'s heading step loses its `× boost` factor. The factor was 1 for every ship but a boosted Hound, and a
  multiply by 1 is exact, so every other ship's heading arithmetic is unchanged.
- The heading hold on release stays: a left-button steer becomes the held heading, the ship turns to it and holds it,
  and A / D clear it.

### 3.3 The cold gas charge

- **State.** Two new hashed integers on `DuelState`:
  - `gas`: the charge, 0..`GAS_MAX` (720). A round starts full.
  - `gasIdle`: ticks since a thruster axis was last held, 0..`GAS_REFILL_DELAY` (30). A round starts at 30.
- **What the sim sees** is the Helm attendant's held `rcsX` and `rcsY` (each −1, 0 or 1), not keys. The app cancels
  opposite keys, so Q and E together are an axis of 0: nothing vents and the charge may refill.
- **Each tick, in `crewHelm`:**
  1. **Spend.** For the fore/aft axis (`rcsY`) and then the port/starboard axis (`rcsX`), the order `crewHelm` reads
     them today: if the axis is nonzero and `gas >= GAS_SPEND` (8), it vents and `gas` drops by 8; otherwise it does
     not vent. So a full charge is 90 axis-ticks: 1.5 s of one thruster, or 0.75 s of two at once.
  2. **Idle count.** If either axis is nonzero (vented or not), `gasIdle = 0`. Otherwise
     `gasIdle = min(gasIdle + 1, GAS_REFILL_DELAY)`.
  3. **Refill.** If `gasIdle === GAS_REFILL_DELAY` after step 2, `gas = min(GAS_MAX, gas + GAS_REFILL)` with
     `GAS_REFILL = 3`.
- So nothing refills while an axis is held, an empty charge included: the player has to let go. The first refill
  comes on the 30th tick after the last held tick, and an empty charge is full 240 ticks after that (0.5 s + 4 s).
- **Unattended:** both axes read 0, so nothing vents and the charge refills by the same rule.
- **The push** is stronger: `RCS_THRUST` becomes 70 u/s² (from 35), so a burst is a real dodge. A full charge on one
  thruster is 105 u/s of change in speed before drag.
- It is still never scaled by the Engines, and works with no Engines bars. Tying the refill to a powered compressor is
  the later tank (§9).
- **`helmVent`** (the puffs and the hiss) records the axes that actually vented this tick.
- **The refusal.** `RefusedControl` (`render/duel/situationModel.ts`) gains `'gas'`, with the reason `NO GAS`. Both
  runtimes raise it once per press: on a sample whose `rcsX` or `rcsY` changes from 0 to nonzero (the keys and the
  PORT / STBD buttons both arrive there) while the state's `gas` (online, the replica's) is below `GAS_SPEND`. The
  Helm shows it in place of its second hint line, the one that names the gas keys (§6.1), and the GAS bar flashes.
- **`crewAxes`** (the app's predicted path) vents an axis by the same test and in the same order, from the state's
  `gas`.

### 3.4 Low power

- Engines bars still cap the forward throttle at 25 % a bar (`throttleCap`).
- At 1 bar the main engine gives 30 u/s². The planet pulls harder than that inside about 288 u of its centre (its
  surface is at 70 u, and a ship touches it at 90 u). The belt starts at 1100 u, so the played orbits are far outside
  that.
- Ryan's rule, "at 1 bar thrust must still beat the planet's pull on the inner orbits", is pinned by a test at 300 u
  (§8). Raising the 1-bar thrust is a tuning change, not in this spec.

## 4. What leaves the player's Helm

- **The right-click heading hold.** At the crew Helm the app no longer sends `heading` from a right press or drag, and
  the right button pans the map, as it does at Science. The right-click-on-own-ship clear goes with it. The preview
  chevron and dashed line of the held heading stay, since the left-button steer still sets one.
- **Space auto-face** and the **AUTO-FACE button** (`ui/duel/HelmStation.tsx`). At the crew Helm, Space does nothing
  and the button is not drawn (the GAS bar takes its row, §6.1).
- **Shift+W** is already ignored by the crew Helm (it holds W). Nothing changes; the controls list keeps it under the
  Valkyrn only.
- **The code sites,** each changed only for the crew Helm seat (`crewHelmSeat`); the non-newtonian Helm and the Flight
  seat keep today's lines:
  - `face` goes out for `seat === 'helm'` today in `runtime.ts`'s held frame and `onlineDuel.ts`'s `sessionHeld`.
    Both stop sending it at the crew Helm.
  - the `heading` command sent from the right button, in both runtimes' crew Helm branches, goes; so does
    `onlineDuel.ts`'s line that clears `headingSent` on Space, and both runtimes' crew-Helm `auto-face` and `heading`
    refusals. `RefusedControl` keeps those two members for the other Helm.
  - `scene.ts` asks for a heading on a right press or release over any Helm map today. At the crew Helm's map it no
    longer does, and it draws no right-button preview.
  - the camera's right-button pan is switched off while the Helm map shows (`shown === 'helm'`, in `runtime.ts` and
    `onlineSource.ts`). At the crew Helm it is switched back on.
  - **the goal glow** (`scene.ts`) clears on A / D or the left-button steer. Space no longer clears it at the crew
    Helm.
  - `HDG nnn TO nnn` still reads `holdHeading`, which the left-button steer sets and A / D clear.
- **The sim keeps both inputs.** `HeldInput.face` and the `heading` command stay admitted as today: the scripted Helm
  flies by `aim` and `face` (W-4's line-up uses `face`), and the non-newtonian Helm keeps its keys.
- The PORT and STBD buttons stay (they are the thrusters), as do the throttle bar and the readouts.

## 5. The scripted Helm

- `sim/duel/scripted.ts` holds W for thrust and S for reverse today, and relies on the throttle falling back to 0 for
  "no thrust". Now, when its axes want thrust 0 and `thrMille` is not 0, it sends `throttleCut` (the Helm player's
  command list), and holds nothing.
- **Before it stands.** The scripted Helm stands to repair, revive or heal, and an unattended Helm now keeps its
  throttle (§2.1). A cut sent on the tick it stands would be refused, since the Helm's commands are judged after the
  seat phase. So when the scripted Helm wants to stand, for any reason, and `thrMille` is not 0, it sends
  `throttleCut` and stays seated that tick; it stands on a later tick, once `thrMille` is 0. It never leaves the seat
  with the throttle set.
- It never vents, so the gas charge does not touch it.
- Its own path prediction flies `flyShip` with the Hound's flight tuning, so it follows the new drag, stabilise and
  turn rate without a change. Its record of the boost (`pair.axes.turnBoost`) goes.
- **The gates.** The per-seed gates in `tests/duelGates.test.ts` and `tests/duelScripted.test.ts` must pass. The
  aggregate band stays `it.skip` (the crew bots lose every seed today). If a per-seed gate fails, only the scripted
  Helm's own constants may move (`CREW_SPEED_SLACK`, `AVOID_TICKS`, `EVADE_RANGE`, `ORBIT_MIN`, `ORBIT_MAX`), each change
  recorded in the plan's report with the seed it fixed. Never the Hunter's knobs or the gate bands.

## 6. The app

### 6.1 The Helm console (`ui/duel/HelmStation.tsx`, `CrewHelmStation`)

- **The throttle bar** runs from REV (−500) to 100, with the cap line and the locked areas as today: `THR_LABELS`'s
  last entry becomes `['REV', -500]`, and `yAt` already reads `THR_MIN`.
- **A new readout,** `THR <n>%`, in the right column under `CAP` (at `rx`, `y0 + 72`, `FONT_NATIVE`): the set throttle
  in percent of full forward thrust, −50..100. The bar has no number today. The plan checks it clears `CAP`'s text.
- **A GAS bar** in the row the AUTO-FACE button leaves (`y0 + 118`): the label `GAS` at `rx`, then a bar from `rx + 32`,
  116 px wide and 10 px high, with a `data-ui-gas` attribute carrying `gas`. It is filled by `gas / GAS_MAX`, `hot`
  while a thruster vents, `dim` while `gas < GAS_SPEND`, and it flashes on a `NO GAS` refusal.
- **The hint lines** become `W/S THR  TAP S CUT  A/D TURN` and `Q/E GAS  LMB STEER`. The plan measures them against
  the console's width. A refusal replaces the line that names its control: the first line for `throttle`, the second
  for `turn` and `gas`. The crew Helm no longer raises `heading` or `auto-face` (§4).
- The AUTO-FACE button is removed (§4).

- **The OUTSIDE readout** (`render/duel/readoutModel.ts`) shows `COASTING` under an empty Helm today. With the Helm
  empty and `thrMille` not 0 that row reads `THRUST <n>%` (the set throttle), in the same alert style, so the crew
  sees the ship is still under power.

### 6.2 The map

- **The velocity marker.** The dashed line from the ship to where it will be in 1 s at its present velocity exists
  (`render/tactical/tacticalModel.ts`, drawn in `tacticalLayer.ts`). It gains a small ring (radius 4 px, `mid`) at its
  far end, so it reads as a marker separate from the nose line. With drag back, the predicted path and this line
  already use the same `flyShip`.
- The boosted-turn puffs go (§3.2). The thruster puffs stay, from `helmVent`.

### 6.3 Settings

- `Settings` (`app/settingsStore.ts`) gains `throttleTapMs`, one of `THROTTLE_TAP_STEPS = [150, 200, 250, 300]`,
  default 200. A stored record without it, or with any other value, reads 200. The record stays `version: 2`, as
  `mapGrid` was added.
- The Settings page gets a row "Throttle tap" with the four choices, in the pattern of the shake row.
- The keyboard reads the value when it is created and when Settings changes it.

### 6.4 Hints and the controls list

- **The sit-down card** (`render/duel/sitModel.ts` `SIT_CARDS.helm`): title `HELM: POINT AT THE ENEMY`, keys
  `HOLD LMB  STEER`, `W/S  THROTTLE (IT STAYS)`, `TAP S  CUT THRUST`, `BRAKE: TAP S, OR FLIP AND BURN`. Its stale
  `A/D  THRUSTERS` line goes. The plan checks the card's size holds four lines.
- **`app/controlsList.ts`:** the crew Helm rows are rewritten: W / S ramp the throttle and it stays; a tap of S (or of
  W in reverse) cuts it; A / D turn; Q / E and the arrows vent the cold gas while the charge lasts; hold the left
  button to steer. The right-click heading and Space auto-face rows leave the crew Helm (the other Helm keeps them),
  and the stale "A/D fire the side thrusters" text goes.

## 7. Online

- **The authority decides.** The throttle, the latch and the gas are sim state. `throttleCut` is judged by the
  authority.
- **The local throttle prediction** (`app/duel/onlineSource.ts` `thrMille`, playtest2feedback Decision 14) keeps its
  shape: the replica's value plus the latest sent held frame applied `unackedFrames` times, with the new ramp (no
  return).
  - After the seat sends `throttleCut`, the prediction shows 0 until that command's result arrives (`cutSent`, cleared
    on the result, a new round, a sit and a stand, as `torpModeSent` is). Then the replica is the base again. A
    refused cut clears `cutSent` the same way, and the replica's throttle shows.
  - **The latch is predicted too.** While the replica's `thrCut` is set, or a cut is in flight, the prediction ramps
    with a held value of 0 until the seat's own `throttleHeld` has been 0 on a sample taken since the cut was sent
    or, with no cut in flight, since the replica's `thrCut` was first seen set. That record is cleared with
    `cutSent`. So a player who lets go and presses W again sees the ramp at once, even while the replica still shows
    the latch.
    `crewAxes` (`step.ts`, the predicted path's axes) does the same from the state's `thrCut`, so it still flies
    exactly what `crewHelm` flies.
  - The throttle "when the key went down" for §2.3's test is this predicted value.
- **The gas gauge** draws from the replica. The thrusters are not predicted, as today.
- **The held frame** is unchanged on the wire (`throttleHeld`, `rcsX`, `rcsY`).

## 8. State, hash, version and tests

- **New `DuelState` fields**, in the helm module's `HELM` list (`sim/duel/modules.ts`), in this order after today's
  three: `throttle`, `holdHeading`, `thrMille`, then `thrCut` (a flag), `gas` (0..720), `gasIdle` (0..30). Snapshot
  validation (`sim/duel/snapshot.ts`) reads them at `helmAt + 3`, `+ 4` and `+ 5` with those bounds, after
  `thrMille` at `helmAt + 2`. The helm module then holds six values, so the same file's `powerAt` becomes
  `helmAt + 6` (it is `helmAt + 3` today, with a comment that says three), and every offset after it follows.
- **New command:** `throttleCut` in `net/contracts.ts`, the codec, `DUEL_KINDS` in `step.ts`, the helm module's
  `commands` list (`['throttle', 'heading', 'throttleCut']`; `tests/duelModules.test.ts` pins the lists) and the
  runtime's `isConsoleCommand`.
- **`FlightTuning.stabiliseUnderThrust`**; `Axes.turnBoost` removed.
- **Determinism:** integers for the throttle, the latch and the gas. The flight arithmetic is the existing drag branch.
  No new randomness.
- **Bit-identical:** the Hunter and the Valkyrn. `tests/valkyrnIdentity.test.ts`'s digests hash the tactical state,
  which gains no field here, and their flight tuning is unchanged. `tests/w4HunterIdentity.test.ts` (once W-4 is in)
  passes unchanged.
- **SIM_VERSION** bumps by one with the repo's bless pattern (re-pick the whole-run pins, a same-version bless for the
  new behaviour, then the bump alone). §10 says from which version.

Tests, each rule one:

- **Throttle:** the ramp reaches 1000 in 59 ticks and −500 in 30; released, it holds its value for 600 ticks; the clamp
  lowers it when a bar is lost and does not raise it when the bar returns; an unattended Helm keeps it; a new round
  starts at 0.
- **Reverse:** full reverse pushes 60 u/s² on the Hound and 48 on the Hunter's class.
- **The cut:** `throttleCut`'s admission (`stale-tick`, `invalid-seat`, `unavailable` on the Valkyrn, noop at 0); it
  zeroes the throttle; a cut with the key already up clears the latch in the same tick, and W held on the next tick
  ramps; a cut with S still held leaves the throttle at 0 while S stays held, and it moves again after one tick with
  `throttleHeld` 0; the latch clears when the Helm is left.
- **The tap** (`input.ts`, a fake `now`): a fresh W or S keydown gives `throttleDown`, with Shift held too; a 100 ms S
  press gives `throttleTap` −1 and a 250 ms one gives none at the 200 ms setting; `tapMs` is read live and its four
  values move the threshold; a key held across a sit (`staleHeld`), a blur or a `clear` gives no tap when it comes up;
  a repeat keydown does not restart the timing.
- **The runtime:** a tap of S with the throttle above 0 at keydown sends `throttleCut`; at 0 or below it sends none; a
  tap of W below 0 sends it; a tap of W above 0 sends none.
- **Flight:** the Hound slows under drag with no thrust; with the throttle set and the nose turned 90°, the sideways
  speed captured when the turn ends is removed at 80 u/s² (stabilise under thrust); the Hunter's flight over a fixed
  input script is unchanged; the Hound's turn is 150°/s for a far left-button steer.
- **Gas:** one axis held vents for 90 ticks from full and then stops; two held vent for 45 (fore/aft is served first
  when the charge covers one); nothing refills while an axis is held; released from empty, the first refill is on the
  30th tick after and the charge is full 240 ticks later; a round starts full with `gasIdle` 30; a press on empty
  raises `NO GAS` once, for a key and for a PORT / STBD button; an unattended Helm vents nothing and refills.
- **Low power:** a Hound at rest 300 u from the planet's centre, nose outward, with 1 Engines bar and the throttle at
  its cap, is farther out after 5 s.
- **Removed controls:** at the crew Helm a right press sends no `heading` and pans, in Single player and online;
  Space sends no `face` and raises no refusal; the AUTO-FACE button is not drawn; A / D and the left-button steer
  clear the goal glow and Space does not. The non-newtonian Helm's right press and Space are unchanged.
- **Console and map:** the throttle bar's range and number; the GAS bar; the hint lines; the velocity ring at the
  line's end; no boosted puffs.
- **Settings:** `throttleTapMs` loads, saves and falls back to 200.
- **Online:** the predicted throttle holds after release; after a sent cut it reads 0 until the result; a late held
  frame still saying S after the cut leaves the authority's throttle at 0.
- **Scripted and gates:** the scripted Helm sends `throttleCut` when it wants no thrust and the throttle is not 0, and
  every command it sends is admitted; over whole scripted duels it never stands from the Helm with `thrMille` not 0;
  the per-seed gates pass.
- **Predictions:** `crewAxes` flies what `crewHelm` flies with the latch set and a key held; the readout reads
  `THRUST <n>%` for an empty Helm with a set throttle.
- **Hash and snapshot:** the three new fields' bounds, a snapshot round-trip mid-burst, and the duel module's pinned
  lists.
- **Final checks:** `npm run typecheck`, `npm test`, `npm run test:determinism`, `npm run build`.

## 9. Not in this build

- **The cold gas tank, pressure gauge and powered compressor** (Ryan's "later"). The charge here is its stand-in: the
  same gauge, with the refill rate fixed.
- **Turns tighter than the gyro that spend gas**, and **hypergolic side thrusters**.
- **Click-to-fly autopilot.**
- **Raising the 1-bar thrust** (§3.4).
- **A/D as side bursts** (owner's call 1).
- **The Valkyrn's Flight seat** and the non-newtonian Helm: unchanged.

## 10. Where it is built

- W-4 is being built on `w4-weapons-controls`, cut from SIM 60, and it touches `scripted.ts`, `step.ts`, `input.ts`,
  `runtime.ts` and `onlineDuel.ts` as this does. To avoid building the same files twice in parallel, this is built
  **after W-4's last task and its merge with master** (which brings master's A / D turn change and SIM 62), on a
  branch cut from that point. It bumps SIM once more.
- If the owner merges W-4 to master first, the starting point is the same commit on master.
- One plan. Its gate entry in `docs/gates.md` asks the owner to check, by hand: the throttle staying at a set value;
  the tap of S and of W; flip-and-burn braking; the sidestep from a thruster burst and the gauge emptying and
  refilling; the slide dying away after a turn; the velocity ring; the right drag panning.

## 11. Judgement calls (owner to check)

1. **An unattended Helm keeps its throttle** (§2.1). Stand up at 65 % and the ship keeps thrusting. Today it fell back
   to 0. Single player needs it (the Helm character stays seated while you play Weapons), and it is what a lever does.
2. **A tap is judged against the throttle when the key went down** (§2.3), so a quick S from 15 % cuts to 0 rather than
   leaving a little reverse, and a tap at 0 is just a nudge.
3. **After a cut the key has to come up before the throttle moves again** (the latch, §2.3).
4. **Drag 0.15 and stabilise 80** are the sim 52 values (§3.1). Top speed is about 800 u/s at full throttle, where the
   no-drag build capped at 400.
5. **Stabilise acts under thrust** (§3.1): whenever you are not turning or venting.
6. **The gas numbers** (§3.3): 1.5 s of push, a 0.5 s wait, 4 s to refill, a push of 70 u/s² (twice today's). The
   charge does not refill while a thruster key is held.
7. **The AUTO-FACE button goes with Space** (§4), though Ryan's notes also say to keep every clickable control. His
   notes name the auto-face assist as replaced and call the Helm fully manual.
8. **The bots keep auto-face** (§4, §5): only the player loses it.
9. **Built after W-4, on top of it** (§10), so one playtest covers both.
