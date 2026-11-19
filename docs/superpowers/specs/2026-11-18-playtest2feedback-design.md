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
- The Valkyrn solo ships keep their controls.

Starting point: master at SIM_VERSION 53. All paths are under `src/renderer/src/`. All numbers are starting values, kept
in tuning files and tuned in playtest.

## 1. Branch, spike rules and which ships

- The branch is `spike/playtest2feedback`, in the worktree `.worktrees/playtest2feedback`, cut from master.
- Spike rules: nothing merges until the owner has played it.
- The spike only changes the duel, not the sector map's Helm.
- **Which ships.** Everything in §2-§5 applies only to a crew slot whose class has the new `ShipClassDef` flag
  `newtonianHelm: true`.
  - That's the Cutter, the crew's ship, which is drawn as the Hound.
  - `newtonianHelm` is false for the Hunter, the Valkyrn and the Valkyrn laser fit.
  - Below, "the crew Helm" means slot 0 with a `newtonianHelm` class.
- **The Valkyrn is unchanged.** It keeps:
  - `DEFAULT_FLIGHT`;
  - the `throttle` command with its −1..4 levels;
  - W/S notch stepping;
  - A/D turning;
  - the held aim that becomes the held heading;
  - its unattended throttle that holds (`helmHoldsUnattended`);
  - its scripted pilot (`scriptedPilot.ts`).
  - It gets no thrusters, no turn boost and no `helmPower`. A test pins that its flight is bit-identical to today's.

## 2. Newtonian flight (crew Helm)

- **No drag:** the crew Helm's ship flies with drag 0 and stabilise 0. It coasts at the same velocity until something
  changes it: an input, gravity, the edge spring, a bounce or a collision.
- **Turning:** heading holds still unless the ship is turning toward an aim, auto-face or a held heading (§4a). There
  is no angular momentum.
- **Gravity, the edge spring, bounces and contact damage** are unchanged.
- **Per-slot tuning:** a new `flightFor(state, i): FlightTuning` returns:
  - `CREW_FLIGHT = { gravity: true, edge: true, drag: 0, stabilise: 0 }` for slot 0 when its class is `newtonianHelm`;
  - `DEFAULT_FLIGHT` otherwise.
  - Where it's used:
    - `stepDuel` (`sim/tactical/duel.ts`) calls `flySlot` with `flightFor(state, i)`. Its `tuning` argument stays only
      as an explicit override for the §4 test configurations; when it's given, every slot uses it, as today.
    - `predictPath` and `predictFlight` (`sim/tactical/predict.ts`) default their tuning to `flightFor(state, i)`.
    - Their callers then get the crew's flight with no change of their own: `sim/duel/scripted.ts` L87,
      `render/duel/situationModel.ts` L116 and `render/tactical/tacticalModel.ts` L337.
    - Moving the Hunter to Newtonian flight is a question for a later playtest.
- **Top speed:** `MAX_SPEED` = 400 u/s. In `flyShip`, a ship flying with `drag === 0`:
  1. Sums the main engine's and the thrusters' accelerations into `tx, ty`, and gravity and the edge into `gx, gy`.
  2. Sets `s0 = |v|`, then `v1 = v + t·DT` and `s1 = |v1|`.
  3. If `s1 > max(MAX_SPEED, s0)` and `s1 > 0`, scales `v1` by `max(MAX_SPEED, s0) / s1`.
  4. Then adds `g·DT`, uncapped, and integrates the position as today.

  This uses + − × ÷ and sqrt only. Thrust never raises the speed past `max(400, the speed before thrust)`. A
  perpendicular push still turns the velocity. Gravity and bounces can still push the speed past 400, and thrust then
  can't add to it. A ship flying with drag (the Hunter, the Valkyrn) runs today's code path exactly.
- **Engines room failed** (damage level 2): the ship can't thrust or turn, as today, and now drifts without slowing.
  The thrusters still work, since cold gas is not the Engines.

## 3. Held throttle (crew Helm)

- **The value:** a new `helm` module field `thrMille`, an integer per mille from −250 to 1000 (`THR_MIN`, `THR_MAX`).
  The existing `throttle` field (levels −1..4) stays for the Valkyrn and is 0 for the crew Helm.
- **The input:** a new `HeldInput` field `throttleHeld`: −1, 0 or 1. The client sends 1 for W and −1 for S, and 0 if
  both or neither are held.
- **The ramp,** run each running tick (outcome Running). The value used is the Helm attendant's `throttleHeld`; with no
  attendant it's taken as 0.
  - **`throttleHeld = 1`:** `thrMille += THR_RAMP` (7 per tick, so 0 to 1000 takes 143 ticks, about 2.4 s).
  - **`throttleHeld = −1`:** `thrMille −= THR_RAMP`.
  - **`throttleHeld = 0`:** it moves toward 0 by `THR_RETURN` (34 per tick, so 1000 to 0 takes 30 ticks, 0.5 s), and
    stops at 0.
  - **The clamp:** it's then clamped to [floor, cap] (§5). The floor is −250 when ENGINE ≥ 1, else 0.
- **Thrust:** `crewThrust(m) = m < 0 ? m / 250 : m / 1000` gives the thrust axis in [−1, 1].
  - `flyShip` stops quantising the axis to quarters. It uses `q = clamp(Math.round(axes.thrust × 1000) / 1000, −1, 1)`
    (`|| 0` for NaN and −0).
  - Reverse becomes proportional: `ax −= h0 · cls.thrust · cls.reverseFraction · |q| · f`.
  - Whole axes (the Hunter's −1, 0 and 1, and the Valkyrn's levels as `throttleThrust` gives them: −1, ¼, ½, ¾ and 1)
    fly exactly as today. The tests check this for every level.
  - The prediction shares `flyShip`, so it follows.
- **The engine factor** (Engines room damage, `ENGINE_FACTOR`) still scales thrust and turning.
- **The `throttle` command stays for the Valkyrn only.** For a `newtonianHelm` class it's refused `unavailable`.
- **Removed for the crew Helm:**
  - throttle levels;
  - the throttle wheel and `accumulateWheel` use on the crew Helm;
  - the clickable notches;
  - W/S notch stepping;
  - Shift+W full burn;
  - the `throttleUp`/`throttleDown` key actions' crew use.
  These all stay as they are for the Valkyrn's Flight seat.
- **Client prediction of the throttle:**
  - `throttleBase`, `throttleSent` (`app/duel/onlineDuel.ts`) and `shownThrottle` (`app/duel/onlineSource.ts`) are
    not used for the crew Helm.
  - The console shows `thrMille` predicted locally: the sim's value plus the ramp the local held W/S would add over the
    unacknowledged ticks, the same rule as the sim's.
  - `onlineSource.axes()` and `runtime.ts`'s `sentAxes` read `crewThrust(d.thrMille)` for the crew Helm.
- **Other readers:**
  - `scene.ts`'s `sitThrottle` (L238, L246) reads `thrMille` for the crew Helm.
  - Telemetry's "acted" and "bait" tests (`telemetry.ts` L132-L133) count a turn, a vent or a non-zero `thrMille`.
- **The held heading stays:** the `heading` command, set with right-click and drag.
- **An unattended crew Helm:** the throttle returns to 0 and the ship coasts. A held heading still turns it. Today an
  unattended Hound/Cutter Helm sets `crew.helm` false and flies `NO_AXES` (step.ts L279-L287). For a `newtonianHelm`
  class with no attendant, the step instead sets `crew.helm = true` and flies:
  - `turn`: `outcome Running && holdHeading ≥ 0 ? headingTurn(…) : 0`;
  - `turnBoost`: `helmBoost(d, NO_HELD)`;
  - `thrust`: `crewThrust(thrMille)`, while it returns to 0;
  - `rcsX` and `rcsY`: 0.

  The same rule is mirrored in `situationModel.stateAxes` (L106-L110) and `runtime.ts`'s `sentAxes` (L321-L322).

## 4. Cold gas thrusters (crew Helm)

- **Keys:**
  - A, Q and ← push to port.
  - D, E and → push to starboard.
  - ↑ pushes forward.
  - ↓ pushes aft.
  - Each push is relative to the ship's nose: the push direction is the heading table's forward vector `(hx, hy)`, or
    its right vector `(−hy, hx)`.
- **Input:** new `HeldInput` fields `rcsX` (−1 port, 0, 1 starboard) and `rcsY` (−1 aft, 0, 1 forward).
  - Opposite keys held together give 0 on that axis.
  - For the crew Helm, the client sends A/D as `rcsX` and sends `moveX` as 0.
- **The tank:** an integer `rcsGas` from 0 to `RCS_TANK` (1000), and an integer `rcsAcc` from 0 to 59. Both are in the
  `helm` module. The round starts with a full tank and `rcsAcc` 0.
- **Each running tick, in this order:**
  1. **The turn boost** spends its gas (§4a).
  2. **The fore/aft axis:** if `rcsY ≠ 0`, the Helm is attended and `rcsGas ≥ RCS_GAS_PER_TICK` (8), the tank pays 8
     and that axis pushes at `RCS_THRUST` (35 u/s²).
  3. **The side axis:** `rcsX`, the same way.
  4. **The compressor:**
     - `rcsAcc += COMPRESSOR_RATE[compressor]`, where `COMPRESSOR_RATE` is [0, 50, 100, 150] sixtieths per tick;
     - then `rcsGas += floor(rcsAcc / 60)` and `rcsAcc %= 60`;
     - then `rcsGas = min(rcsGas, RCS_TANK)`;
     - if the tank is full, `rcsAcc = 0`.
     - The compressor runs every running tick, attended or not.
- **Refill times** for an empty tank: 1 bar 1200 ticks (20 s), 2 bars 600 ticks (10 s), 3 bars 400 ticks (6.7 s).
- **Thrust details:**
  - The thrust counts toward the top speed cap (§2).
  - It isn't scaled by Engines room damage.
  - One axis empties a full tank in 125 ticks, about 2.1 s.
- **The empty-tank refusal:** pressing a thruster key while `rcsGas < 8` shows "NO PRESSURE", through the Feel-ii
  refusal path. This is a client cue only.
- **The vented axes:** the sim records each tick's vented axes and boost in an unhashed, unsnapshotted scratch
  `d.helmVent = { x, y, boosted }`, recomputed each tick. The puffs and the hiss read it (§6).

## 4a. Mouse steering and the gas-boosted turn (crew Helm)

- **Steering:** while the Helm player holds the left mouse button on the Helm view, the client sends the world heading
  from the ship's centre to the cursor, as a heading index, in the existing `HeldInput.aim` field, every frame.
  - The runtime's existing `steer` path (`runtime.ts` L500-L510) is extended to the crew Helm.
  - The sim turns toward a held aim with the existing `heldAim` and `aimTurn` (`sim/duel/step.ts`).
- **The held aim becomes the held heading,** as today (step.ts L283). On release, the nose settles on the last aim and
  then holds still. Right-click and drag still set a held heading.
- **The turn order** in `helmTurn` for the crew Helm: auto-face, then the aim, then the held heading.
  - The sim ignores `moveX` turning for a `newtonianHelm` class, which is an authority rule: `helmTurn`'s moveX branch
    and the moveX clear of `holdHeading` (step.ts L282) apply only to other classes.
  - The scripted crew (`scripted.ts` L321) moves from `moveX: axes.turn` to `aim`, as `scriptedPilot` already does, or
    `face`.
- **The gas boost.** A tick is boosted when all of these hold:
  - the crew ship's turn axis is non-zero;
  - the engine factor is above 0;
  - `rcsGas ≥ RCS_TURN_GAS` (4);
  - the target is **far**.
  - A boosted tick spends 4 gas and turns at `RCS_TURN_BOOST` (2) times the step.
  - Otherwise the ship turns at the normal step and spends nothing.
  - "Far" means outside a band wider than the boosted step:
    - **aim or held heading:** the signed index difference `|d| > 4` (2 × 1.78 = 3.56 < 4);
    - **auto-face:** the target isn't within `BOOST_FACE_SIN` (sin 6°, about 4.27 indices, more than the 4 whole
      indices a boosted tick can step) of the nose, or is behind it.
  - Inside the band, the normal step and today's bands (aimTurn's |d| ≤ 1, `AUTO_FACE_SIN`) finish the turn. So the
    boosted step never reaches today's bands, and the nose never chatters.
  - Whether a tick is far is decided before the turn is applied, from the state before the step. It's computed by one
    pure function, `helmBoost(d, h)`, which the step and the app's prediction both call.
- **`Axes`** gains an optional `turnBoost` (1 or 2, default 1). `flyShip`'s turn becomes
  `sign(turn) × turnBoost × cls.turnStepsPerTick × f`.
  - `defs.ts` adds an assertion that `RCS_TURN_BOOST × turnStepsPerTick < 4` for every `newtonianHelm` class.
- **What a left click no longer does:** on the crew Helm view, a left click only steers.
- **The Helm's turn buttons:** HelmStation's "HOLD TO TURN" A/D buttons become "PORT" and "STBD" thruster buttons
  that hold `rcsX`.
- **The "turn" refusal:** the Engines-off "turn" refusal (`runtime.ts` L427) fires on a left-button steer while the
  Engines are failed, not on A/D.

## 5. Helm power: ENGINE and COMPRESSOR

- **The budget:** the Helm has a budget of `HELM_BARS` bars.
  - In this spike it's a stand-in of 4. `createDuel` gains a sixth parameter, `opts: { helmBars?: number } = {}`,
    stored as `d.helmBars` (default 4), so tests can set 0-5. `startRound` passes `d.helmBars` through to the next
    round's `createDuel`. The online authority and client always use the default, and so does a snapshot restore
    (`snapshot.ts` L203 calls `createDuel` without `opts`).
  - When the Engineering spike lands, it becomes the Engines system's effective bars.
- **The split:** the pilot splits the budget: `helm.compressor`, from 0 to `min(3, HELM_BARS)`, and ENGINE is
  `HELM_BARS − compressor`.
  - **Round start:** `compressor = min(1, HELM_BARS)`, so 3 + 1 with the stand-in.
- **What ENGINE does:**
  - The throttle cap is `min(ENGINE, 4) × 250`.
  - Reverse needs ENGINE ≥ 1.
  - ENGINE bars don't change thrust strength or turning; only the cap reads them.
- **The command:** `helmPower { delta: +1 | −1 }`. +1 moves a bar to ENGINE (compressor − 1), and −1 moves a bar to
  COMPRESSOR (compressor + 1).
  - Admission, in order:
    1. `stale-tick`;
    2. `invalid-seat` unless the sender is the Helm attendant;
    3. `unavailable` for a class that isn't `newtonianHelm`;
    4. `unavailable` if the move leaves compressor outside [0, min(3, HELM_BARS)];
    5. otherwise applied.
  - Envelope order holds within a tick.
- **Keys and clicks:** 1 sends `helmPower +1`, and 2 sends `helmPower −1`. Clicking an ENGINE or COMPRESS cell on the
  strip sends the matching move.
- **The cap drops:** if the cap falls below `thrMille`, `thrMille` is clamped down the same tick, in the ramp's clamp.
- **Losing bars** (after Engineering, when `HELM_BARS` falls by `lost`): bars come off COMPRESSOR first. compressor
  becomes `max(0, min(3, compressor − lost, HELM_BARS))`, and ENGINE is what remains.
- **Merge note for the Engineering spike.** Whichever spike merges second makes these changes:
  - **(a) The start split is an owner call at merge.** Engineering starts Engines at 3 bars, and the owner's rule is
    "75 % by default". So either Engineering's Engines start becomes 4, or the merged start is compressor 0. The
    recommendation is Engines starting at 4.
  - **(b) The engine factor** (`[0, 1, 1, 1, 1, 1.25]`) reads the Engines effective bars. Only the throttle cap reads
    the ENGINE share.
  - **(c) SIM_VERSION:** the spike that merges second takes the next number. This also applies against the pew pew
    parts, which plan their own bumps.

## 6. Helm console and feel (amber CRT)

The changes are in `ui/duel/HelmStation.tsx`, the console models (`render/duel/consoleModel.ts`,
`situationModel.ts`) and `app/duel/controlsList.ts`. They apply to the crew Helm only:

- **Throttle bar:**
  - It runs from −25 to 100 and fills to the shown `thrMille`.
  - A cap line marks the ENGINE cap, and the part above the cap is drawn locked (dark).
  - The labels say REV, 0, 25, 50, 75 and 100.
- **Tank gauge:** a vertical "PRESSURE" bar with the tank percentage, and the COMPRESSOR rate.
- **Power strip:** `HELM POWER`, with the budget's cells split into ENGINE (left) and COMPRESS (right). The cells are
  clickable (§5).
- **Thruster puffs:** short amber gas puffs at the hull edge opposite each push, drawn from `d.helmVent`, on the
  tactical view and the Helm map. A boosted turn puffs at the bow and stern on opposite sides.
- **Sound:**
  - A soft hiss loop plays while `d.helmVent` shows venting: a Kenney CC0 sample, added as `sfx.rcs` in
    `audio/soundBank.ts`.
  - The engine hum follows `|crewThrust(thrMille)|`.
- **Steering marker:** while the left button is held, a dashed amber line runs from the ship to the cursor.
- **The predicted path** (`situationModel.ts` L110) flies the held thrust, the held thrusters and the boost from
  `helmBoost`.
- **The controls list and key hints:** "W/S throttle · hold LMB steer · RMB set heading · A/D Q/E ←→↑↓ thrusters · 1/2
  power". The crew's throttle-notch, wheel and A/D-turn entries are removed. The Valkyrn's entries stay.
- **The UI probe:** `uiProbe.ts` L21 is updated to the new Helm controls.

## 7. Sim rules, state and the wire

- **New held fields:** `throttleHeld`, `rcsX` and `rcsY` on `HeldInput`, each `z.number().int().min(−1).max(1)
  .optional()`, and absent means 0. They're added to every held schema:
  - `net/codec.ts` L151;
  - `authority/checkpoint.ts` L40;
  - `authority/duelCheckpoint.ts` L73.
- **The authority** (`authority/core.ts`):
  - the expiry check (L329) also expires a player whose `throttleHeld`, `rcsX` or `rcsY` is non-zero;
  - the pause clear (L435) deletes all three.
- **A lost release frame:** the remote held timeout is 250 ms (`REMOTE_HELD_TIMEOUT_MS`), 15 ticks. Within it, a stale
  W can add at most 105 per mille, and a stale thruster can spend at most 120 gas per axis. After that the Helm reads as
  released: the throttle returns to 0 and the venting stops.
- **Local input** builds the fields in `app/duel/input.ts`. `helmAxes` grows into the crew Helm's held fields, while
  the Valkyrn's mapping stays. Online input sends them in `app/duel/onlineDuel.ts`.
- **New command:** `helmPower`, added in `DuelCommand`, `duelWire`, `authority/duelRules.ts`, `DUEL_KINDS` and the
  console-command list (`runtime.ts` `isConsoleCommand`). It's admitted right after the `throttle` and `heading`
  admission.
- **The `helm` module's fields:** today's `throttle` and `holdHeading`, plus `thrMille`, `rcsGas`, `rcsAcc` and
  `compressor`.
  - All of them are hashed and snapshotted.
  - The snapshot validation bounds are:
    - `thrMille`: an integer −250..1000;
    - `rcsGas`: 0..1000;
    - `rcsAcc`: 0..59;
    - `compressor`: 0..3;
    - plus today's checks for `throttle` and `holdHeading`.
  - **Module contract** (`sim/duel/modules.ts`):
    - `helmBars` is a duel option, not state. `helmBars` and `helmVent` are listed in `DUEL_NOT_SNAPSHOTTED`, with
      their reasons: an option fixed per duel, and per-tick scratch.
    - `helmModule.commands` gains `helmPower`, and `helmModule.reasons` gains `unavailable`.
    - `tests/duelModules.test.ts`'s pinned kind and field lists are updated.
- **Step order,** after seats and before flight:
  1. `throttle` (Valkyrn), `heading` and `helmPower` admission;
  2. the turn (`helmTurn` for an attended crew Helm; with no attendant, the held-heading turn of §3's unattended
     rule) and `helmBoost`;
  3. the throttle ramp and clamp;
  4. the boost's gas, then fore/aft venting, then side venting;
  5. the compressor;
  6. `d.helmVent`;
  7. the crew's axes, `{ turn, turnBoost, thrust: crewThrust(thrMille), rcsX, rcsY }` (the vented axes only), for
     flight.
- **The flight step:** `flyShip` adds the thruster push (in the ship frame, `RCS_THRUST` per vented axis) to the main
  thrust, applies the top speed cap (§2), then gravity and the edge.
- **The scripted crew** (`scripted.ts`):
  - It holds `throttleHeld` toward a target `thrMille` (hold 1 or −1 until within one ramp step, then 0 once at 0).
  - It turns with `aim` or `face`.
  - It doesn't use thrusters.
  - Its hazard check calls `predictPath` with the crew's thrust, which picks up `CREW_FLIGHT` through `flightFor`.
- **Determinism:**
  - Only integers for the new state, and the existing arithmetic rules for flight.
  - SIM_VERSION goes 53 → 54, or the next free number at merge (§5c).
  - The duel goldens (`tests/golden/duel-1.json`, `duel-rematch.json`) and the determinism fixture are re-recorded.
    The trajectory-pinned tests are updated, and the Valkyrn's pinned tests must not change.
  - `npm run test:determinism` passes on Node, Electron and Firefox.

## 8. Tests

The tests that need a budget other than the stand-in set `helmBars` through `createDuel`'s `opts`. They reach a
starting compressor value by writing `d.compressor` after `createDuel`, or by sending `helmPower`.

- **Throttle:**
  - With compressor 0 (cap 1000), held W reaches 1000 in 143 ticks.
  - From the round start (cap 750), it stops at 750.
  - Held S reaches −250.
  - Releasing returns to 0 at 34 per tick with no overshoot.
  - Moving a bar off ENGINE clamps `thrMille` that same tick.
  - `HELM_BARS` 3 with compressor 3 gives ENGINE 0, a floor of 0 and a cap of 0.
  - An unattended Helm returns to 0.
  - A `throttle` command is `unavailable` for the crew Helm and still works for the Valkyrn.
- **Flight:**
  - With no input, gravity off (a test tuning) and no contacts, the velocity is identical after 600 ticks.
  - With gravity, the path bends.
  - On a thrust-only tick, the speed never exceeds max(400, the speed before thrust).
  - A perpendicular push at 400 still turns the velocity.
  - Whole thrust axes, and every Valkyrn level, fly bit-identically to today.
  - The Hunter and the Valkyrn keep drag.
  - `predictFlight` for slot 0 matches the stepped crew flight.
- **Thrusters:**
  - Each key pushes the right ship-relative way at two headings.
  - Each vented axis costs 8 gas.
  - With 8 gas and both axes held, only `rcsY` vents.
  - The tank never goes below 0.
  - Refill timing is exact for 0-3 bars, and `rcsAcc` resets at a full tank.
  - Engines at damage level 2 leave the thrusters working.
- **Steering:**
  - A held `aim` turns the crew ship toward it, and on release it settles on the last aim.
  - A/D on the crew Helm give `rcsX` and no turn.
  - A `moveX` held input doesn't turn a `newtonianHelm` class.
  - A far turn with gas runs at 2× and spends 4 gas a tick. With under 4 gas, or once inside the band, it runs at 1×.
  - A boosted turn settles on the aim, the held heading and the auto-face target without oscillating (`helmTurn`
    returns 0 for 10 straight ticks).
  - A crew ship whose Helm stands up at `thrMille` 1000 thrusts down the 30-tick return and turns onto its held
    heading.
  - The Valkyrn's held aim still becomes the held heading, and its A/D still turn it.
- **`helmPower`:**
  - It's Helm-seat only.
  - It's refused at both ends of the range.
  - It's refused `unavailable` for the Valkyrn.
  - The start split is 3 and 1.
- **Wire and authority:**
  - The three held fields round-trip through the codec and both checkpoints, and are optional.
  - `helmPower` round-trips.
  - An expired held frame with only `throttleHeld` set is expired, and the throttle returns to 0.
  - A pause clears the three fields.
- **Gates:** `tests/duelGates.test.ts` and the scripted duels still show the scripted crew winning in 3 to 5 minutes,
  with the numbers tuned until they do.
- **Manual (the owner):**
  - The throttle feels like a held lever.
  - Coasting feels right.
  - Mouse steering and the boost feel good.
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
- Any change to the Valkyrn solo ships (§1).
- Engineering's real Engines bars, which plug in at merge (§5).
