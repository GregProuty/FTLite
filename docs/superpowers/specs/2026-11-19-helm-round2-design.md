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
    ramp (at most about 20 %).
  - A tap of S on a reverse throttle, or of W on a forward one, is also an ordinary short press.
  - Holding a key longer than the tap time ramps as normal and cuts nothing.
- **The tap time** is a Settings value, `throttleTapMs`: 150, 200, 250 or 300 ms, default **200** (§6.3).
- **The command.** `throttleCut {}`, Helm seat only. Admission, in order:
  - stale-tick;
  - `not-at-helm`;
  - `unavailable` on a class without `newtonianHelm`;
  - `noop` when `thrMille` is 0;
  - otherwise `thrMille = 0` and the latch below is set.
- **The latch.** A new hashed flag on `DuelState`, `thrCut` (false at a round's start). While it is set, the ramp
  ignores `throttleHeld`. It clears on the first tick whose Helm held frame has `throttleHeld` 0, or when nobody
  attends the Helm.
  - Why: online, the held frame that says "S is up" and the cut command can reach the authority on different ticks. A
    late held frame still saying S would ramp the throttle below 0 after the cut and leave it there. With the latch the
    key has to come up before the throttle moves again, whatever the order.
- **Where the tap is detected.** In the app (`app/duel/input.ts`), from the key's down and up times. The sim never
  sees the tap time.
  - The keyboard records the time of a W or S keydown (not a repeat) and, on its keyup, the press length. A press
    shorter than `throttleTapMs` sets a one-shot `KeySample.throttleTap`: −1 for S, 1 for W. It is cleared by `clear`
    and `clearUi`, as the other one-shot fields are.
  - The stale-key rule holds: a W or S already down when the player sits is not a tap when it comes up.
  - The runtime keeps the throttle it saw when the key went down (the sim's `thrMille` in Single player; the online
    seat's predicted throttle, §7). On a `throttleTap` it sends `throttleCut` only if that value is on the tap's side
    (above 0 for S, below 0 for W).
- **The Engines refusal** is unchanged: with no Engines power a press of W or S raises today's refusal and sends
  nothing.

## 3. Flight

### 3.1 Drag and stabilise

- `CREW_FLIGHT` (`sim/tactical/tuning.ts`) becomes
  `{ gravity: true, edge: true, drag: CREW_DRAG, stabilise: CREW_STABILISE, stabiliseUnderThrust: true }` with
  `CREW_DRAG = 0.15` and `CREW_STABILISE = 80`: the values every ship flew before the playtest2feedback spike, and the
  ones Ryan played on the sim 52 build. They are the Hound's own constants now, so tuning them never moves the Hunter.
- With drag above 0, `flyShip` (`sim/tactical/physics.ts`) takes its drag branch: no `MAX_SPEED` cap, and a top speed
  where thrust equals drag (800 u/s at full throttle, 520 at 65 %).
- **Stabilise under thrust.** Today `flyShip` stabilises only while the turn, the thrust and both thrusters are all
  zero (`idle`). With a throttle that stays set, that would never happen while cruising.
  - `FlightTuning` gains `stabiliseUnderThrust: boolean`. When it is true, `idle` ignores the thrust:
    `turn === 0 && rcsX === 0 && rcsY === 0`. `DEFAULT_FLIGHT` has it false, so every other ship's `idle` is today's
    expression.
  - The rest of the stabilise rule is unchanged: on the tick the ship goes idle, the sideways speed (across the nose) is
    captured as the skid to remove, and up to `stabilise × dt` of it comes off each tick. Gravity's later sideways pull
    is never captured, so the ship still falls and orbits.
  - What the player feels: stop turning and stop venting, and the ship's sideways slide dies away, so it flies where
    the nose points. A side burst is a sidestep: the push moves the ship over, and the slide is damped once the
    thruster is released.
- Gravity and the edge spring are unchanged.

### 3.2 A fixed turn rate

- The Hound turns at `TURN_DEG_PER_S` (150°/s) for A / D, the left-button steer, the held heading and the scripted
  Helm alike.
- **Removed:** `helmBoost` (`sim/duel/step.ts`), `Axes.turnBoost` and its read in `flyShip`, `RCS_TURN_BOOST`,
  `BOOST_FAR` and `BOOST_FACE_SIN`, `HelmVent.boosted` and `HelmVent.turn`, and their readers: the boosted turn's puffs
  (`render/tactical/tacticalModel.ts`), its hiss (`app/duel/duelAudio.ts`), the telemetry term
  (`sim/duel/telemetry.ts`) and the scripted crew's record (`sim/duel/scripted.ts`).
- `flyShip`'s heading step loses its `× boost` factor. The factor was 1 for every ship but a boosted Hound, and a
  multiply by 1 is exact, so every other ship's heading arithmetic is unchanged.
- The heading hold on release stays: a left-button steer becomes the held heading, the ship turns to it and holds it,
  and A / D clear it.

### 3.3 The cold gas charge

- **State.** Two new hashed integers on `DuelState`:
  - `gas`: the charge, 0..`GAS_MAX` (720). A round starts full.
  - `gasIdle`: ticks since a thruster key was last held, 0..`GAS_REFILL_DELAY` (30).
- **Spending.** Each tick, for each thruster axis the Helm attendant holds (fore/aft first, then port/starboard, the
  order `crewHelm` reads them today): if `gas >= GAS_SPEND` (8), the axis vents and `gas` drops by 8. Otherwise it does
  not vent. So a full charge is 90 axis-ticks: 1.5 s of one thruster, or 0.75 s of two at once.
- **Refilling.** While any thruster key is held, `gasIdle` is 0 and nothing refills, an empty charge included: the
  player has to let go. With no thruster key held, `gasIdle` counts up to `GAS_REFILL_DELAY`; once there, `gas` gains
  `GAS_REFILL` (3) a tick up to `GAS_MAX`. So an empty charge is full again 0.5 s + 4 s after the keys come up.
- **Unattended:** nothing vents, and the charge refills by the same rule.
- **The push** is stronger: `RCS_THRUST` becomes 70 u/s² (from 35), so a burst is a real dodge. A full charge on one
  thruster is 105 u/s of change in speed before drag.
- It is still never scaled by the Engines, and works with no Engines bars. Tying the refill to a powered compressor is
  the later tank (§9).
- **`helmVent`** (the puffs and the hiss) records the axes that actually vented this tick.
- **The refusal.** A press of a thruster key, or of the PORT / STBD buttons, with `gas < GAS_SPEND` raises `NO GAS` on
  the Helm (the Feel-ii refusal path), once per press.
- **`crewAxes`** (the app's predicted path) vents an axis by the same test, from the state's `gas`.

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
- **Space auto-face** and the **AUTO-FACE button** (`ui/duel/HelmStation.tsx`). At the crew Helm, Space and the
  button's place do nothing. The first-play goal glow clears on the first left-button steer only.
- **Shift+W** is already ignored by the crew Helm (it holds W). Nothing changes; the controls list keeps it under the
  Valkyrn only.
- **The sim keeps both inputs.** `HeldInput.face` and the `heading` command stay admitted as today: the scripted Helm
  flies by `aim` and `face` (W-4's line-up uses `face`), and the non-newtonian Helm keeps its keys.
- The PORT and STBD buttons stay (they are the thrusters), as do the throttle bar and the readouts.

## 5. The scripted Helm

- `sim/duel/scripted.ts` holds W for thrust and S for reverse today, and relies on the throttle falling back to 0 for
  "no thrust". Now, when its axes want thrust 0 and `thrMille` is not 0, it sends `throttleCut` (the Helm player's
  command list), and holds nothing.
- It never vents, so the gas charge does not touch it.
- Its own path prediction flies `flyShip` with the Hound's flight tuning, so it follows the new drag, stabilise and
  turn rate without a change. Its record of the boost (`pair.axes.turnBoost`) goes.
- **The gates.** The per-seed gates in `tests/duelGates.test.ts` and `tests/duelScripted.test.ts` must pass. The
  aggregate band stays `it.skip` (the crew bots lose every seed today). If a per-seed gate fails, only the scripted
  Helm's own constants may move (`CREW_SPEED_SLACK`, `AVOID_TICKS`, `EVADE_RANGE`, `ORBIT_MIN`, `ORBIT_MAX`), each change
  recorded in the plan's report with the seed it fixed. Never the Hunter's knobs or the gate bands.

## 6. The app

### 6.1 The Helm console (`ui/duel/HelmStation.tsx`, `CrewHelmStation`)

- **The throttle bar** runs from REV (−500) to 100, with the cap line and the locked areas as today. Its number reads
  the set throttle in percent of full forward thrust (−50..100).
- **A GAS bar** beside the readouts: filled by `gas / GAS_MAX`, `hot` while a thruster vents, `dim` while empty.
- **The hint lines** become `W/S THR  TAP S CUT  A/D TURN` and `Q/E GAS  LMB STEER`. The plan measures them against
  the console's width.
- The AUTO-FACE button is removed (§4).

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
    on the result, a new round, a sit and a stand, as `torpModeSent` is). Then the replica is the base again.
  - The throttle "when the key went down" for §2.3's test is this predicted value.
- **The gas gauge** draws from the replica. The thrusters are not predicted, as today.
- **The held frame** is unchanged on the wire (`throttleHeld`, `rcsX`, `rcsY`).

## 8. State, hash, version and tests

- **New `DuelState` fields**, in the duel module beside `thrMille` (`sim/duel/modules.ts`), with snapshot validation
  (`sim/duel/snapshot.ts`): `thrCut` (a bit), `gas` (0..720), `gasIdle` (0..30).
- **New command:** `throttleCut` (`net/contracts.ts`, the codec, `DUEL_KINDS` in `step.ts`).
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
- **The cut:** `throttleCut`'s admission (seat, class, noop at 0); it zeroes the throttle; with the latch set a held S
  does not move the throttle, and it moves again after one tick with `throttleHeld` 0; the latch clears when the Helm
  is left.
- **The tap** (`input.ts`, fake clock): a 100 ms S press gives `throttleTap` −1 and a 250 ms one gives none at the 200
  ms setting; the setting's four values move the threshold; a key held at the sit gives none; `clear` drops it.
- **The runtime:** a tap of S with the throttle above 0 at keydown sends `throttleCut`; at 0 or below it sends none; a
  tap of W below 0 sends it; a tap of W above 0 sends none.
- **Flight:** the Hound slows under drag with no thrust; with the throttle set and the nose turned 90°, the sideways
  speed captured when the turn ends is removed at 80 u/s² (stabilise under thrust); the Hunter's flight over a fixed
  input script is unchanged; the Hound's turn is 150°/s for a far left-button steer.
- **Gas:** one thruster held vents for 90 ticks from full and then stops; two held vent for 45; nothing refills while
  a key is held; released, the refill starts after 30 ticks and fills in 240; a press on empty raises `NO GAS`; an
  unattended Helm vents nothing and refills.
- **Low power:** a Hound at rest 300 u from the planet's centre, nose outward, with 1 Engines bar and the throttle at
  its cap, is farther out after 5 s.
- **Removed controls:** at the crew Helm a right press sends no `heading` and pans; Space sends no `face`; the
  AUTO-FACE button is not drawn. The non-newtonian Helm's right press and Space are unchanged.
- **Console and map:** the throttle bar's range and number; the GAS bar; the hint lines; the velocity ring at the
  line's end; no boosted puffs.
- **Settings:** `throttleTapMs` loads, saves and falls back to 200.
- **Online:** the predicted throttle holds after release; after a sent cut it reads 0 until the result; a late held
  frame still saying S after the cut leaves the authority's throttle at 0.
- **Scripted and gates:** the scripted Helm sends `throttleCut` when it wants no thrust and the throttle is not 0, and
  every command it sends is admitted; the per-seed gates pass.
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
