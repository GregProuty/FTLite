# Spike: playtest 2 feedback, Helm flight (2026-11-18)

The owner and a teammate played a long two-player test and agreed on a list of notes. This spike takes the notes that
no other spec covers yet: the Helm's flight. The others are already placed:

| Note | Where it lives |
|---|---|
| Each HUD reads out its station's power, and the station spends it | Engineering spike §10 (it quotes the notes) |
| 1 bar = 25 % throttle | Engineering spike §10.2 (this spike moves the cap onto the Helm's ENGINE share, §5) |
| Three weapons at 1-3 bars each | Engineering spike §10.3 |
| Fog of war, with sensor range from Sensors power and repair | Engineering spike §10.4 |
| Manual aim inside the cone, and a manual torpedo flown like the Helm at full throttle | Pew pew spec W-1, W-2, W-3 |
| Mouse reticle with a slewing turret, left-click fire, W/S weapon power, A/D or number keys to select, auto mode that aims and fires | **Not here.** A later amendment to the pew pew spec, before W-1 is built |

The notes for this spike:

> "the throttle level should continuously move up or down depending on how long W/S is held for ... not touching W/S
> ... moves the throttle level back to zero ... W/S used a constant slow ramp rate for going -25>100 and not pressing
> W/S used a fast ramp rate to return to 0 throttle."
>
> "also use a cold gas thruster for side to side and up down short burst pushes with arrow keys. cold gas thrusters can
> be controlled with an aircompressor and a pressure gage/tank that needs power"
>
> "velocity and heading stays constant unless you bump into something or do a throttle cold gas helm input"
>
> "power in helm is used for how quickly cold gas pressure tank recharges (air compressor power) or how much max
> throttle can be achieved with helm (1 power = 25% max throttle, 4 power = 100% max throttle)"

A follow-up from the teammate, the same day:

> "WS should be used for continuous ... up and down the throttle and then AD can be used for short side-by-side bursts
> for the cold gas thrusters, and then your ships heading can be controlled with the mouse wherever your mouse is
> pointing the ship can point when you're holding down left click ... you can use cold gas tank also to be consumed for
> changing turning radius ... WASD for movement forward back throttle side to side cold gas pretty much makes movement
> on the ship really really similar to how your dude moves around on the ground"

The owner's decisions in brainstorming:
- Scope is the Helm only.
- No drag, but gravity stays.
- The thrusters push relative to the ship. A/D, Q/E and ←/→ all strafe; ↑/↓ push fore and aft.
- Holding a key gives a steady push.
- Holding the left mouse button steers: the ship turns to point at the cursor. A and D no longer turn the ship.
- Gas speeds up turns: while the ship turns and the tank has gas, it vents gas to turn faster. Turning without gas
  works at the normal rate.
- The Helm splits its bars between ENGINE and COMPRESSOR, the way Weapons splits its bars.

Starting point: master at SIM_VERSION 53. The Helm lives in:
- `sim/duel/throttle.ts`;
- the `helm` module in `sim/duel/modules.ts`;
- `sim/duel/step.ts`: the `throttle` admission, `helmTurn` and the crew's axes;
- `sim/tactical/tuning.ts`: `THRUST`, `REVERSE_FRACTION`, `DRAG`, `STABILISE` and `FlightTuning`;
- `app/duel/input.ts` and `app/duel/runtime.ts`: `helmAxes`, `throttleRequest` and the wheel;
- `app/duel/onlineDuel.ts`;
- `ui/duel/HelmStation.tsx`.

All paths are under `src/renderer/src/`. All numbers are starting values, kept in tuning files and tuned in playtest.

## 1. Branch and spike rules

- The branch is `spike/playtest2feedback`, in the worktree `.worktrees/playtest2feedback`, cut from master.
- Spike rules: nothing merges until the owner has played it.
- The spike only changes the duel, not the sector map's Helm.

## 2. Newtonian flight (crew ship)

- **No drag:** the crew ship flies with drag 0 and stabilise 0. It coasts at the same velocity until something
  changes it: an input, gravity, a bounce or a collision.
- **Turning:** heading holds still unless the mouse is steering (§4a) or a held heading is set. There is no angular
  momentum.
- **Gravity stays:** planet gravity, bounces and contact damage are unchanged.
- **Top speed:** `MAX_SPEED` = 400 u/s. Without drag, the speed would otherwise have no limit.
  - Main engine or thruster thrust is applied only up to the cap. Any thrust component that would take the speed past
    400 in the velocity's direction is dropped, and the rest is kept.
  - Gravity and bounces are not capped.
  - The cap is checked with + − × ÷ and sqrt only.
- **How it's wired:** a `CREW_FLIGHT: FlightTuning = { gravity: true, edge: true, drag: 0, stabilise: 0 }` is used for
  the crew slot. The Hunter keeps `DEFAULT_FLIGHT`, so its tuned AI doesn't break. Moving the Hunter to Newtonian
  flight is a question for a later playtest.
- **Engines shut off by room damage** (level 2): the ship drifts and no longer slows down. Thrusters still work, since
  cold gas is not the Engines.

## 3. Held throttle

- **The value:** the throttle is an integer per mille, from −250 to +1000 (`THROTTLE_MIN`, `THROTTLE_MAX`). It replaces
  the −1..4 levels and is stored in the `helm` module's `throttle` field.
- **The input:** a new `HeldInput` field `throttleHeld`, which is −1, 0 or 1. W sets 1 and S sets −1; if both are held,
  the value is 0.
- **The ramp,** each tick, while the crew ship's Helm is attended (otherwise as if `throttleHeld` were 0):
  - **`throttleHeld = 1`:** the throttle goes up by `THROTTLE_RAMP` (7 per tick, 0.42 per second, so 0 to 100 % takes
    about 2.4 s).
  - **`throttleHeld = −1`:** it goes down by `THROTTLE_RAMP`.
  - **`throttleHeld = 0`:** it moves toward 0 by `THROTTLE_RETURN` (34 per tick, 2.0 per second, so 100 % to 0 takes
    0.5 s), stopping at 0 and never overshooting.
  - **The cap:** it's then clamped to [reverse floor, cap] (§5). The reverse floor is −250 with ENGINE ≥ 1, else 0.
- **Thrust:**
  - Forward: `throttle / 1000`, as the thrust axis.
  - Reverse: `throttle / 250`, as the axis, so −25 % gives −1, which is today's full reverse (`REVERSE_FRACTION` of
    `THRUST`).
  - `throttleThrust` keeps its shape, and the flight code is unchanged.
- **The engine factor** (room damage, today's `ENGINE_FACTOR`) still scales thrust and turning.
- **Removed:**
  - the `throttle` command, from `DuelCommand`, `duelWire`, `authority/duelRules.ts` and `DUEL_KINDS`;
  - the throttle wheel and wheel accumulator;
  - the clickable throttle notches;
  - the W/S notch stepping.
- **Kept:** the old envelope kind is refused `malformed`, like any unknown kind.
- **Kept:** the held heading, set by the `heading` command with right-click and drag. Left-button steering cancels it
  (§4a), which used to be A/D's job.
- **Unattended Helm** (solo play, or the Valkyrn's `helmHoldsUnattended`):
  - the throttle returns to 0, and the ship coasts;
  - a held heading still turns it, as today.

## 4. Cold gas thrusters

- **Keys:**
  - A, Q and ← push to port.
  - D, E and → push to starboard.
  - ↑ pushes forward.
  - ↓ pushes aft.
  - Each push is relative to the ship's nose: the push direction is the heading table's forward or right vector.
- **Input:** new `HeldInput` fields `rcsX` (−1 port, 0, 1 starboard) and `rcsY` (−1 aft, 0, 1 forward). Opposite keys
  held together give 0 on that axis.
- **Thrust:** while an axis is non-zero, the tank is above 0 and the Helm is attended, that axis pushes at
  `RCS_THRUST` = 35 u/s². This thrust counts toward the top speed cap (§2).
- **Room damage:** thrusters are not scaled by Engines room damage.
- **Gas:**
  - **The tank:** it holds `RCS_TANK` = 1000 units. Each venting axis costs `RCS_GAS_PER_TICK` = 8 units a tick, so
    one axis empties a full tank in about 2 s, and two axes in about 1 s.
  - **Running low:** an axis vents only if the tank holds at least its cost. With both axes on and gas for one, the
    `rcsY` axis goes first.
  - **The empty-tank refusal:** pressing a thruster key while the tank can't pay shows "NO PRESSURE", through the
    Feel-ii refusal path. This is a client cue only; the sim just doesn't thrust.
- **The compressor** refills the tank by `COMPRESSOR_RATE_BY_BARS` = [0, 1, 2, 3] × 50 / 60 units per tick:
  - 0 bars: never;
  - 1 bar: 20 s for a full tank;
  - 2 bars: 10 s;
  - 3 bars: about 6.7 s.
  - It's kept as an integer accumulator in sixtieths, so tick counts are exact. Refill happens even while the tank is
    venting.
- **Round start:** the tank is full.

## 4a. Mouse steering and the gas-boosted turn

- **Steering:** while the Helm player holds the left mouse button on the Helm view, the ship turns toward the cursor.
  - The client sends the world heading from the ship's centre to the cursor, as a heading index, in the existing
    `HeldInput.aim` field. It's sent every frame the button is held.
  - The sim already turns toward a held aim: `heldAim` and `aimTurn` in `sim/duel/step.ts` (Valkyrn spec §6.2). The
    priority in `helmTurn` is unchanged: auto-face, then aim, then the held heading.
  - Releasing the button stops the turn, and the heading then holds still.
- **A/D no longer turn.** For the crew Helm (the Cutter and Hound classes), the client maps A/D into `rcsX` and sends
  `moveX` as 0. So `helmTurn`'s A/D branch never fires for the crew Helm, and its code stays as it is for the Valkyrn.
- **Steering clears the held heading:** a tick whose Helm attendant has a held aim sets `holdHeading` to −1. A/D used
  to do that.
- **What a left click no longer does:** a left click on the Helm view only steers. Any left-click handling the Helm
  view has today (throttle notches) is removed with §3. Right-click and drag still set a held heading.
- **The gas boost:** on a tick the crew ship turns (the turn axis is non-zero) and the tank holds at least
  `RCS_TURN_GAS` = 4 units:
  - the turn rate is multiplied by `RCS_TURN_BOOST` = 2. `flyShip` reduces the turn axis to its sign, so the boost
    can't travel in the axis. `Axes` gains an optional `turnBoost` (1 or 2, default 1), and `flyShip`'s turn becomes
    `sign(turn) × turnBoost × cls.turnStepsPerTick × engine factor`;
  - the tank loses 4 units.
  - It applies to any turn of the crew ship: the mouse, auto-face or a held heading. Without gas, the turn runs at the
    normal rate.
  - ENGINE bars set only the throttle cap; they don't change turning. When the Engines room is failed (damage level 2),
    the engine factor is 0 and the ship can't turn, as today. That tick spends no boost gas.
- **The aim band:** `aimTurn`'s three-index dead band assumes the turn is under 3 steps a tick. At 2× it's about 3.56
  steps, so the boosted turn needs a matching dead band: `aimTurn` and `headingTurn` take the tick's step size, and
  stop within it, so the nose never oscillates around the target.
- **Gas spending order** in a tick: the turn boost first, then `rcsY`, then `rcsX`.

## 5. Helm power: ENGINE and COMPRESSOR

- **The budget:** the Helm has a budget of `HELM_BARS` bars.
  - In this spike it's a fixed stand-in of 4.
  - When the Engineering spike lands, it becomes the Engines system's effective bars (Engineering §10), and Engines
    overdrive gives a 5th bar.
- **The split:** the pilot splits the budget: COMPRESSOR is `helm.compressor`, from 0 to 3, and ENGINE is
  `HELM_BARS − compressor`.
  - **Round start:** compressor 1, so 3 ENGINE and 1 COMPRESSOR.
- **What ENGINE does:**
  - The throttle cap is `min(ENGINE, 4) × 250`. A 5th ENGINE bar, from overdrive, adds Engineering's 1.25 engine
    factor instead of more throttle.
  - Reverse needs ENGINE ≥ 1.
- **The command:** `helmPower { delta: +1 | −1 }`. +1 moves a bar to ENGINE, which is compressor − 1; −1 moves a bar
  to COMPRESSOR, which is compressor + 1.
  - **Who may send it:** the Helm seat only. It's checked like `heading`: `stale-tick` first, then `invalid-seat` for
    anyone but the Helm attendant.
  - **Out of range:** a move that would leave compressor outside [0, min(3, HELM_BARS)] is refused `unavailable`.
- **Keys and clicks:** 1 sends `helmPower +1` and 2 sends `helmPower −1`. Clicking an ENGINE or COMPRESS cell on the
  strip sends the matching move.
- **Losing bars** (after Engineering, when `HELM_BARS` falls): bars come off COMPRESSOR first until it fits, and then
  ENGINE shrinks.
- **The cap drops:** if the cap falls below the current throttle, the throttle is clamped down that same tick.
- **Merge note for the Engineering spike:** its §10.2 `THROTTLE_CAP_BY_BARS` reads Engines bars directly. When both
  spikes merge, the cap reads the Helm's ENGINE share instead, and Engineering's Helm power strip shows the
  ENGINE / COMPRESS split. Whichever spike merges second makes this change.

## 6. Helm console and feel (amber CRT)

The changes are in `ui/duel/HelmStation.tsx` and the console models:

- **Throttle bar:**
  - It runs from −25 to 100 and fills to the current throttle.
  - A cap line marks the ENGINE cap, and the part above the cap is drawn locked (dark).
  - The labels say REV, 0, 25, 50, 75 and 100.
- **Tank gauge:** a vertical "PRESSURE" bar with the tank percentage, and a COMPRESSOR rate readout.
- **Power strip:** `HELM POWER`, with the budget's cells split into ENGINE (lit cells, left) and COMPRESS (lit cells,
  right). The cells are clickable (§5).
- **Thruster puffs:** short amber gas puffs at the hull edge opposite the push, on the tactical view and the Helm map.
  They're drawn from the last tick's vented axes, which the runtime already learns from the sim's axes, extended with
  `rcsX` and `rcsY`.
- **Sound:**
  - A soft hiss loop plays while venting: a Kenney CC0 sample, added as `sfx.rcs` in `audio/soundBank.ts`.
  - The engine hum, which already scales with the flame, now follows the continuous throttle.
- **Key hints:** the Helm's key hint line lists "W/S throttle · hold LMB steer · A/D Q/E ←→↑↓ thrusters · 1/2
  power".
- **Steering marker:** while the left button is held, a dashed amber line runs from the ship to the cursor on the Helm
  view.

## 7. Sim rules, state and the wire

- **New held fields:** `throttleHeld`, `rcsX` and `rcsY` on `HeldInput`.
  - They're optional on the wire, defaulting to 0, so they go in the held-input zod schema and the online held frames.
  - Local input builds them in `app/duel/input.ts` (`helmAxes` grows into the Helm's held fields). Online input sends
    them in `app/duel/onlineDuel.ts`.
- **New command:** `helmPower`, added in `DuelCommand`, `duelWire`, `authority/duelRules.ts` and `DUEL_KINDS`. It's
  admitted in the step where `throttle` was.
- **State in the `helm` module:**
  - `throttle`, now per mille;
  - `rcsGas`;
  - `rcsAcc`, the refill sixtieths;
  - `compressor`.
  - All of it goes into the tactical hash and the duel snapshot, with snapshot validation bounds. `validThrottle`
    becomes −250..1000.
- **Step order, after seats and before flight:**
  1. `helmPower` admission;
  2. the cap clamp;
  3. the throttle ramp;
  4. the turn boost (§4a), then thruster venting;
  5. the compressor refill;
  6. the crew's axes, `{ turn, thrust, rcsX, rcsY }`, for flight.
- **The flight step** (`sim/tactical`) adds the thruster push to the main thrust, applies the top speed cap, then
  gravity. It uses the crew slot's `CREW_FLIGHT`.
- **Scripted crew** (`sim/duel/scripted.ts`, `scriptedPilot.ts`): instead of throttle commands, it holds
  `throttleHeld` to reach and keep a target throttle. It hands the held value through the same path human held input
  takes. It doesn't use thrusters unless a gate needs them.
- **Determinism:**
  - Only integers and the existing arithmetic rules are used.
  - SIM_VERSION goes 53 → 54.
  - The duel goldens (`tests/golden/duel-1.json`, `duel-rematch.json`) and the determinism fixture are re-recorded,
    and the trajectory-pinned tests are updated.
  - `npm run test:determinism` passes on Node, Electron and Firefox.

## 8. Tests

- **Throttle:**
  - Held W reaches 1000 after ceil(1000 / 7) ticks; held S reaches −250.
  - Releasing returns to 0 at the return rate, with no overshoot.
  - The cap clamps the ramp. The cap falling clamps the throttle that same tick.
  - ENGINE 0 gives a floor of 0.
  - An unattended Helm returns to 0.
- **Flight:**
  - With no input and no planets in range, the velocity is the same after 600 ticks.
  - Gravity still bends the path.
  - Thrust stops adding speed at 400, while a perpendicular push still turns the velocity.
  - The Hunter still has drag.
- **Thrusters:**
  - Each key pushes the right ship-relative way at two headings.
  - Gas drains by 8 per axis per tick.
  - The tank won't go negative, and the `rcsY`-first rule holds.
  - Refill timing for 0-3 bars is exact.
  - Engines room damage at level 2 leaves the thrusters working.
- **Steering:**
  - A held `aim` turns the crew ship toward it and clears `holdHeading`.
  - A/D on the crew Helm give `rcsX` and no turn.
  - With gas, a turn runs at 2× and drains 4 units a tick; without gas it runs at 1×.
  - A boosted turn settles on the aim without oscillating.
  - The Valkyrn's A/D turning is unchanged.
- **`helmPower`:**
  - Helm seat only.
  - The range is refused at both ends.
  - The start split is 3 and 1.
  - Moving a bar off ENGINE lowers the cap and clamps the throttle.
- **Wire:**
  - The held fields round-trip and are optional.
  - `helmPower` round-trips.
  - The old `throttle` kind is refused.
- **Gates:** `tests/duelGates.test.ts` and the scripted duels still show the scripted crew winning in 3 to 5 minutes,
  with the numbers tuned until they do.
- **Manual (the owner):**
  - The throttle feels like a held lever.
  - Coasting feels right.
  - The thrusters give useful dodges.
  - The power split is a real choice.

## Out of scope

- The Weapons notes: mouse reticle and slewing turret, left-click fire, W/S weapon power, A/D or number-key weapon
  select, and AUTO aim and fire for the laser and pew pew. They go in a later amendment to the pew pew spec, before W-1
  is built.
- That amendment also settles the two definitions of pew pew: the pew pew spec has a skill shot, while Engineering
  §10.3 has an FTL burst laser with a room lock.
- Newtonian flight for the Hunter.
- Angular momentum.
- Thrusters for the Hunter, or on the sector map.
- The Valkyrn solo ships: their Flight seat keeps today's controls (A/D turn, and the left button is the gun).
- Engineering's real Engines bars, which plug in at merge (§5).
