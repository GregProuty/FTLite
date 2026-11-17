# Artemis-style Helm and Weapons consoles (design)

Owner, 2026-11-17: "refactor the UI for the weapons and helm to look more like the artemis UI, not exactly but similar
layout, in the react code", then "lets do a first pass with the artemis layout as the reference and we can tweak from
there". The references are two Artemis Bridge Simulator screenshots: Helm (`artemis2.png`) and Weapons (`artmeis3.png`).
We take the layout only. We keep our own skin: the amber CRT console display (CRT map, 34a4acb) and the pixel stage's
m5x7 text. Artemis's chevron buttons, its CAM ring and its colours are not copied.

Owner decisions (brainstorm, 2026-11-17):
1. The panels are clickable, and every keyboard control keeps working.
2. The Helm gets a set-and-forget throttle (a sim change). W/S nudge it a notch; turning stays held, on A/D or on two
   mouse buttons.
3. Weapons shows today's mechanics only, laid out Artemis-style: no new weapons.
4. A top tab strip HELM / WEAPONS / SHIP, clickable where allowed.

## 1. Parts

- **Artemis-i: layout, tabs and clickable controls.** React and app input only. The sim, commands, wire format and
  SIM_VERSION are unchanged. The Helm's throttle block shows today's held thrust (§4.2, "Artemis-i").
- **Artemis-ii: the throttle.** A new duel module and command, fractional thrust in flight physics, the scripted pair,
  and the drawn prediction. SIM_VERSION 40 → 41 (duel-fire merged at 40), blessed in two steps (§5.6).

Each part gets its own plan, review loop and merge.

## 2. Screen layout (internal 1280×720)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [HELM][WEAPONS][SHIP]            ENEMY BRG 055  RNG 294            ┌────────┐│
│ ┌──────────────┐                                                  │ZOOM    ││
│ │HULL     10/40│                                                  │[-]0.90[+]│
│ │SHIELD     ■■ │                     (map)                        │[SNAP C]││
│ │WEAPONS DMG 1 │                                                  └────────┘│
│ │ ...          │                                                            │
│ │HUNTER (inv.) │                                                            │
│ └──────────────┘                                                            │
│ ┌───────────────────┐                                                       │
│ │ helm: throttle    │                                                       │
│ │ weapons: laser,   │                                             ── 100 u  │
│ │ missile, lock     │                                                       │
│ └───────────────────┘                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Named constants live in a new pure module `render/duel/consoleLayout.ts`, so components, tests and the probe share them:

| Region | x | y | w | h |
|---|---|---|---|---|
| Tab strip (`TABS`) | 12 | 8 | 3 tabs of 96, 4 apart (ends at x 308) | 26 |
| Status table (`STATUS`) | 12 | 42 | `READOUT_W` (204) | to content |
| Station block (`STATION`) | 12 | 720 − 12 − h | 300 | Helm 200, Weapons 216 |
| Right column (`SIDE`) | 1280 − 12 − 132 | 42 | 132 | to content |
| Scale bar | its right end 16 from the right edge | 720 − 28 | | |

The status table's height at its longest (the Helm rows, 14 rows at `LINE`) must end above `STATION`'s top. A layout
test asserts it for both stations with the longest fixture.

**Text sizes.** Readout rows and values keep `FONT_SIZE`. Button labels, key hints and the station block's small headings
use `FONT_NATIVE`. Only ASCII is drawn: arrows are `<` and `>`; the throttle column, bars and pips are `Box`es, not glyphs.

- **Tab strip.** Three equal tabs reading `HELM`, `WEAPONS`, `SHIP`, drawn as `<Button>`s (§3) in states from §6.3:
  `current` is lit, `open` is idle (clickable), `locked` is disabled. It shows in the Helm, Weapons and interior (SHIP)
  views. It is not shown in the flight dev view, on the end card or while paused (§6.1).
- **Status table.** Today's readout rows (`readoutRows`), moved from the right-hand column to the left. The first row
  (the `HELM`/`WEAPONS`/`ON FOOT` heading) is dropped, because the tab strip now says it. The Weapons rows `LASER`,
  `LOCK`, `CHARGE` and `MAG` move into the station block and leave the table. The help block is removed: each button
  shows its key (§3). The CRT emphasis rules (`crtRowLook`) and the pips are unchanged.
- **Map framing.** `tacticalModel`'s single `reserveRight` becomes `reserve: { left, right }`. The duel consoles pass
  `{ left: 12 + 204 + 12, right: 12 + 132 + 12 }` (228 and 156). Off-screen arrows (`edgePoint`, `spreadArrows`) keep
  inside `[left + ARROW_MARGIN, w − right − ARROW_MARGIN]`. The Weapons notice is centred on that span, at x
  `(left + w − right) / 2` = 676, y 12, so it starts right of the tab strip at its longest text (a layout test checks
  the notice's left edge against x 308 + 8). The flight dev view passes `{ left: 0, right: FLIGHT_RESERVE_RIGHT }`, so
  it is unchanged. Arrows may still pass under the station block: it is low on the left edge, and that is accepted for
  the first pass.
- **Right column.** A `ZOOM` heading; a row of `[-]`, the zoom value (today's `zoomText` without the word ZOOM), `[+]`;
  then a `[SNAP  C]` button, lit while the camera is free (today's snap hint, which leaves the bottom centre). On
  Weapons the same button reads `[CAMERA C]`, because C is the gunner's missile camera there. The scale bar moves to the
  bottom right.
- **The interior (SHIP) view.** Its readout column (x ≥ 1068) does not meet the tab strip. `INTERIOR_BAND`'s top moves
  from 0 to 42, so the fitted ship never sits under the strip.

## 3. Buttons (shared)

A new stage component `<Button>` in `ui/stage/Button.tsx`: a `Box` with a 1-internal-pixel outline (the hairline rule
`ReadoutPanel` uses) and a `<PixelText>` label at `FONT_NATIVE`, drawn by state:

| State | CRT on | CRT off |
|---|---|---|
| idle | outline `mid`, text `main` | outline DIM, text TEXT |
| hover | outline `main`, text `hot` | outline AMBER, text AMBER |
| lit (active, held, selected) | fill `main`, text `glass` | fill AMBER, text BG |
| disabled | outline `faint`, text `faint` | outline BAR_OFF, text DIM |

Rules every button keeps:
- **It never takes focus.** The element is a `div` with `role="button"` and no `tabIndex`, so it is not focusable.
  Keys keep going to the window listener, and Space and Enter never activate a button.
- **Pointer events.** The stage stays `pointer-events: none`. Only button elements set `pointer-events: auto`. So the
  wheel and right-drag on the map still reach the canvas everywhere except over a button.
- **Any mouse button.** `pointerdown`, `mousedown`, `contextmenu` and `auxclick` call `preventDefault()` on the button,
  so no context menu or middle-click autoscroll opens over it. Only the primary button acts.
- **Press or hold.** A press button acts on `pointerdown`. A hold button is held from `pointerdown` until `pointerup`,
  `pointercancel` or `lostpointercapture` (it captures the pointer), or until it unmounts. Each of these releases it
  exactly once.
- **Labels carry the key.** For example `FIRE  SPC`, `LAUNCH  F`. The key is a second, `mid`/DIM text.
- **data-testid** on every button: `console-<name>` (for example `console-fire`, `console-tab-weapons`).

## 4. The stations

### 4.1 Weapons (station block, 300 × 216)

```
┌ LASER ──────────────────────────────┐
│ CHARGE [██████████░░░░]        FULL │
│ [ FIRE  SPC ]  (hold)               │
│ LOCK [WEAP] [SHLD] [ENG]   E/Q      │
├ MISSILE ────────────────────────────┤
│ MAG 4/4           [ LAUNCH  F ]     │
│ STEER [<  A]  [D  >]  (hold)        │
└─────────────────────────────────────┘
```

- `CHARGE`: today's charge bar and value text (`FROZEN`, `FULL`, a percentage), same emphasis rule as today's row.
- `FIRE`: a hold button standing for Space (§6.2). Lit while the merged Space state is held.
- `LOCK`: three press buttons for the enemy rooms in Room order (Weapons, Shields, Engines). The locked room
  (`d.tactical.systems[0].lock`) is lit. A click asks for `laserLock {room}` directly (§6.2). E/Q still cycle.
- `MAG` and `LAUNCH`: a press button standing for F. Disabled when `canLaunch(d.tactical, 0)` is false, the test the
  runtime makes before it queues a launch.
- `STEER`: two hold buttons standing for A and D, enabled only while our missile is in flight
  (`missileOf(d.tactical, 0)`).

### 4.2 Helm (station block, 300 × 200)

```
┌ THROTTLE ──────┬ HDG 055 ───────────┐
│ 100 [█]        │ SPD 142            │
│  75 [█]        │                    │
│  50 [█] <      │ [<  A]  [D  >]     │
│  25 [ ]        │  turn (hold)       │
│ STOP[ ]        │                    │
│ REV [ ]        │ W/S  THROTTLE      │
└────────────────┴────────────────────┘
```

- **Artemis-ii (the target).** A vertical throttle of six notches, top to bottom `100`, `75`, `50`, `25`, `STOP`,
  `REV`. The set notch has a `<` pointer and the notches from `25` up to the set one are filled. Each notch is a press
  button that asks for that level (§6.2). W and S each move it one notch up or down (§5.4). `PORT` and `STBD`
  (`<  A`, `D  >`) are hold buttons standing for A and D.
- **Artemis-i (until the throttle lands).** The same block, but the column shows today's held thrust: `100` lit while W
  is held, `REV` lit while S is held, `STOP` otherwise. Its notches are not clickable. Instead there are two hold
  buttons, `THRUST  W` and `REV  S`, standing for W and S. Artemis-ii removes them.
- `HDG` (000–359, `bearingDeg` of our heading vector) and `SPD` (u/s, rounded) are read from ship 0's tactical state.
  They are view values only.

### 4.3 Who may click what

A click that stands for a key does exactly what that key would do at that moment, through the same code (§6.2). Station
buttons draw only on their own station's view, and the console is drawn only for the local player's current view. So
nobody can click another seat's controls.

## 5. Artemis-ii: the throttle

### 5.1 State and module

A new duel module `helmModule` (id `helm`), placed in `DUEL_MODULES` after `round` and before `interior`. It owns one
canonical field, `throttle`: an integer level in `−1..4` (−1 reverse, 0 stop, 1–4 are 25/50/75/100 %), stored as
`DuelState.throttle`. It is hashed through the module flatten and set to 0 by `startRound`. The snapshot carries it:
`validateDuelSnapshot` (net/snapshot.ts) gains `helmAt = roundAt + 4; interiorAt = helmAt + 1`, and rejects a throttle
that is not an integer in `−1..4`. The
module's command kinds are `['throttle']` and its reasons `['invalid-seat', 'malformed', 'stale-tick']`.

### 5.2 Command

`{ kind: 'throttle'; level: number }` joins `DuelCommand` and `DUEL_KINDS` (so a decided round answers `duel-decided`
like the other round commands). In `stepDuelTick` it is handled after the seat phase, beside the tactical commands, with
the checks in this order:
1. `requestedTick !== tick` → rejected `stale-tick`;
2. the sender is not `attendant(d, d.nav)` → rejected `invalid-seat`;
3. `level` is not an integer in `−1..4` → rejected `malformed`;
4. `level === d.throttle` → `noop`; otherwise applied, and `d.throttle = level`.
Within one tick, envelope order holds and the last applied one wins. The running result helper gains a `noop` status
for this case.

**Wire.** `throttle` joins the wire `DuelCommand` in net/contracts.ts and `duelWire.commands` in net/codec.ts as
`z.object({ kind: z.literal('throttle'), level: z.number().finite() }).strict()`. Any finite level passes the codec, so a
bad level reaches the sim and is answered `malformed`. The online duel's authority runs in the host app, so the
signalling service needs no redeploy. The wire change lands in step 1 of §5.6.

### 5.3 Physics and step

- `flyShip` quantises thrust to quarters instead of by sign: `q = clamp(Math.round(thrust × 4), −4, 4) / 4`, with NaN as 0.
  Forward thrust is `q × cls.thrust × f`. Any negative `q` gives today's reverse, `−cls.thrust × reverseFraction × f`.
  "Idle" for stabilising is still `turn === 0 && q === 0`. The hunter sends only −1, 0 and 1, so its flight is unchanged.
- The crew ship's axes are `{ turn: held moveX of the Helm attendant, thrust: throttleThrust(d.throttle) }` while the
  Helm is crewed, where `throttleThrust(l) = l < 0 ? −1 : l / 4`. While the Helm is empty the ship coasts as today and
  the level is kept for whoever sits next. Held moveY no longer thrusts in the duel.
- Everything that reads "the Helm's axes" uses the same function: `runtime.axes()` and `onlineSource.axes()` (both now
  return `{ turn, thrust: throttleThrust(d.throttle) }` while crewed, `NO_AXES` otherwise). So the drawn predicted path and
  the thrust flame follow the throttle. The online source reads `d.throttle` from the replica.
- Telemetry's manoeuvre rule becomes "the Helm turns, or the throttle is not 0".

### 5.4 Keys and clicks

W and S become press-edge actions in the duel's Helm view (`throttleUp`, `throttleDown`; auto-repeat ignored), and each
asks for `throttle {base ± 1}`, clamped to `−1..4`. A notch click asks for its level. `base` is:
- **Local runtime:** the latest `throttle` command for the active player in `pending`, or else `d.throttle`.
- **Online:** a `throttleSent = { level, sequence } | null`. While it is set, `base = throttleSent.level`. When the
  result for that sequence arrives it is cleared (applied: the replica has the level; noop or rejected: drop it). It is
  also cleared on attach, a new round, stand and sit. Otherwise `base = d.throttle`. Two quick presses inside one round
  trip therefore move two notches.

The flight dev view keeps held W/S thrust: it does not run the duel sim.

### 5.5 Scripted pair

Each tick the scripted Helm is seated, it computes its wanted level from its wanted thrust (1 → 4, 0 → 0, −1 → −1) and
sends `throttle {level}` when that differs from `d.throttle`. Its hazard prediction (`hazardAway`) predicts with
`{ turn: pair.axes.turn, thrust: throttleThrust(d.throttle) }`: the thrust the ship actually flies at this tick, before
any new command.

### 5.6 SIM_VERSION and the goldens (two steps)

The duel migration oracle refuses a bump unless every duel run is unchanged per tick. So, as duel-fire did:
1. **Bump alone.** `SIM_VERSION` 40 → 41. Add `helmModule` with `throttle` always 0, the command kind and its admission,
   and `MIGRATIONS[40] = { change: 'Artemis-ii: helm throttle', rename: () => undefined, derived: [], added:
   [/^helm\.throttle$/] }`. The scripted pair, the step's held thrust and the physics are unchanged. Bless; the oracle
   proves every run unchanged.
2. **The gameplay change**, a same-version deliberate bless at 41: quarter physics, the step's throttle thrust, the
   scripted pair, telemetry, the keys and the views.

## 6. Data flow

### 6.1 The view model

`DuelUiView` gains `console: ConsoleView | null`, built by a new pure `render/duel/consoleModel.ts`. It is null on the
end card, in the flight view, and while paused: locally `runtime.paused()` (any reason), online any phase other than
`running`. Otherwise:

```ts
interface ConsoleView {
  station: 'helm' | 'weapons' | 'ship';
  tabs: Record<'helm' | 'weapons' | 'ship', 'current' | 'open' | 'locked'>;
  helm: { throttleShown: number; throttleSettable: boolean; heading: number; speed: number; held: { up: boolean; down: boolean; left: boolean; right: boolean } } | null;
  weapons: { lock: number; charge: ReadoutRow; magazine: string; canLaunch: boolean; missileFlying: boolean; fireHeld: boolean; held: { left: boolean; right: boolean } } | null;
  side: { zoom: string; free: boolean; snapLabel: 'SNAP' | 'CAMERA' };
}
```

The status table keeps using `readout.rows`. The sink's `replaceEqualDeep` sharing covers the new branch.

`DuelViewSource` (scene.ts) gains the members `consoleModel` needs, implemented by both the runtime and the online
source: `seat(): Seat` (the local driven character's seat), `uiHeld(): HeldFlags` (new in app/duel/input.ts:
`interface HeldFlags { fire: boolean; left: boolean; right: boolean; up: boolean; down: boolean }`, filled from the
last merged `KeySample`'s codes; `ConsoleView`'s `held` fields are picks of it), and,
from Artemis-ii, `throttle(): number` (the level shown: the local base of §5.4). Today's `axes()`, `paused()` and the
cameras give the rest.

### 6.2 Clicks back to the game

The keyboard becomes the single merge point. `createDuelKeyboard` keeps two held sets, `keys` (the physical keyboard)
and `ui` (clicks), and gains a `ui` handle:

```ts
interface ConsoleInput {
  press(action: KeyAction): void;          // adds one press edge, as a key-down would
  hold(code: 'Space' | 'KeyA' | 'KeyD' | 'KeyW' | 'KeyS', on: boolean): void;
  lock(room: number): void;                // Weapons only
  throttle(level: number): void;           // Artemis-ii, Helm only
}
```

- A code is held when it is in either set. `sample()` builds `moveX`, `moveY`, `interactHeld` and `fireHeld` from the
  merged state, exactly as today from the one set.
- `fireDown` is counted when the merged Space state goes from released to held, and `fireUp` when it goes from held to
  released, whichever source caused it. So Space held while the FIRE button is clicked and released gives no edge until
  both are released. A keydown with `repeat` true never counts a `fireDown`, even when it re-adds Space to the merged
  state (after a clear).
- `lock(room)` and `throttle(level)` are queued as requests in the sample (`KeySample.lockTo: number | null`,
  `throttleTo: number | null`; the last one wins) and turned into commands in `play()` beside E/Q and W/S, with the same
  seat checks.
- `clear()` empties both sets and the requests without counting any edges. It runs only where it runs today (Tab,
  restart, blur). A new `clearUi()` empties only the `ui` set and the requests, also without edges. It runs whenever the
  drawn console's `station` changes or the console becomes null (stand, sit, seat change, pause of any reason, end card,
  a new round). The physical keys are untouched there, as today. The runtime's existing rule, release a sent charge when Fire is no longer
  held (runtime.ts L339 and its online twin), then lets go of any charge.

Wiring: `createUiActions` gains `console: ConsoleInput`, which forwards to a `ConsoleInput | null` slot held by the
actions object; `actions.setConsole(input | null)` fills it. `duelMode.ts` and `onlineDuel.ts` already receive the UI
dependencies from `main.ts`; they gain the actions and call `setConsole(keyboard.ui)` on start and `setConsole(null)` on
dispose. With the slot empty every call is a no-op.

### 6.3 Tabs

The same rules in both modes, by occupancy, for the local driven character `me`:
- The console `me` sits at is `current`; `SHIP` is `current` while `me` stands.
- A console is `open` when `me` stands, `consoleInReach(d, me)` is that console and `repairInReach(d, me) < 0`. The click
  is E (sit).
- **Single player only:** a console is also `open` when the other character sits there. The click is Tab.
- `SHIP` is `open` while `me` is seated. The click is X.
- Every other tab is `locked`.

## 7. Errors

The duel region's `RegionBoundary` covers the new components. A button that throws takes the duel region down, and the
boundary's reset key (the duel epoch) brings it back, as today. The unmount releases every held button (§3), and the
console's change to null runs `clearUi()` (§6.2), so a crash never leaves a hold behind.

## 8. Tests

- `consoleModel`: tabs for every row of §6.3 in single player and online, including a standing player next to an empty
  console with a repair in reach (locked); launch disabled exactly when `canLaunch` is false; steer enabled only with a
  missile in flight; heading and speed values; null while paused, on the end card and online when not running.
- Keyboard merge: a click hold and a key hold of the same code give one `fireDown` and one `fireUp` in every
  interleaving; moveX from `KeyA` on one source and `KeyD` on the other is 0; `clear()` and `clearUi()` drop holds
  with no stray edge, and `clearUi()` leaves a held physical key held; a repeat Space keydown after a `clear()` counts
  no `fireDown`; `lockTo`/`throttleTo` last-wins.
- `<Button>`: not focusable; Space with the pointer over a button does not click it; right and middle buttons do
  nothing and open no menu; a held button releases exactly once on `pointerup`, `pointercancel`, lost capture and
  unmount.
- Layout: the status table ends above the station block at its longest fixture; the Weapons notice starts right of the
  tab strip; nothing overlaps the right column.
- Duel UI (jsdom): the tab strip, status table, station block and right column render from a fixture; clicks on FIRE,
  LAUNCH and a lock room reach `ConsoleInput`.
- Artemis-ii, sim: admission order and reasons (stale-tick, invalid-seat, malformed, noop, applied); quarter-thrust
  physics (level 4 matches today's held W tick for tick; level 2 gives half the forward acceleration; −1 matches held
  S); the hunter's flight unchanged; the level kept across stand and sit and reset by a new round; a snapshot round
  trip mid-throttle, and a snapshot with throttle 7 or 0.5 rejected; the codec round-trips a throttle command; the
  oracle at step 1 and the goldens at step 2.
- Artemis-ii, online: two W presses inside one round trip move two notches; a rejected throttle drops back to the
  replica level.
- Electron smoke: in Single player, click `console-tab-weapons`, hold `console-fire` until the charge shows FULL, then
  release; click `console-launch` and see the magazine drop.
- Look check: probe screenshots of Helm, Weapons and the interior, CRT full and off, in
  `C:\Users\djuar\FTLite-shots\artemis`.
