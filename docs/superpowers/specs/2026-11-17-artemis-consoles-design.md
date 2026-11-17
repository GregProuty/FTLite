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
- **Artemis-ii: the throttle.** A new duel command, a duel-state field, fractional thrust in flight physics, and the
  scripted pair. SIM_VERSION goes up by one and the goldens are re-blessed. Artemis-ii starts after the `duel-fire`
  branch (SIM_VERSION 40) merges, so it takes 41.

Each part gets its own plan, review loop and merge.

## 2. Screen layout (internal 1280×720)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [HELM][WEAPONS][SHIP]            ENEMY BRG 055  RNG 294             ┌───────┐ │
│ ┌STATUS──────────┐                                                 │ZOOM   │ │
│ │HULL       10/40│                                                 │[-]0.90[+]│
│ │SHIELD       ■■ │                     (map)                       │[SNAP C]│ │
│ │WEAPONS   DMG 1 │                                                 └───────┘ │
│ │ ...            │                                                           │
│ │HUNTER (inverse)│                                                           │
│ │ ...            │                                                           │
│ └────────────────┘                                                           │
│ ┌STATION─────────┐                                                           │
│ │ helm: throttle │                                                           │
│ │ weapons: laser,│                                                 ── 100 u  │
│ │ missile, lock  │                                                           │
│ └────────────────┘                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

Named constants live in a new pure module `render/duel/consoleLayout.ts`, so tests and the probe share them:

| Region | x | y | w | h |
|---|---|---|---|---|
| Tab strip (`TABS`) | 12 | 8 | 3 tabs of 104, 4 apart | 26 |
| Status table (`STATUS`) | 12 | 42 | 248 | to content, at most 390 |
| Station block (`STATION`) | 12 | 720 − 12 − its height | 248 | Helm 196, Weapons 220 |
| Right column (`SIDE`) | 1280 − 12 − 132 | 42 | 132 | to content |
| Scale bar | its bar ends 16 from the right edge | 720 − 28 | | |

- **Tab strip.** Three equal tabs reading `HELM`, `WEAPONS`, `SHIP`. The current view's tab is drawn inverse (filled
  `main`, text `glass` on the CRT; filled AMBER, text BG off the CRT). A tab that can be clicked has a `mid` outline. A tab
  that cannot be clicked is drawn `faint` with no outline. The strip shows in the Helm, Weapons and interior (SHIP)
  views. It is not shown in the flight dev view, on the end card or while paused.
- **Status table.** Today's readout rows (`readoutRows`), moved from the right-hand column to the left. The first row
  (the `HELM`/`WEAPONS`/`ON FOOT` heading) is dropped, because the tab strip now says it. The Weapons rows `LASER`,
  `LOCK`, `CHARGE` and `MAG` move into the station block and leave the table. The help block is removed: each button
  shows its key (§4). The CRT emphasis rules (`crtRowLook`) and the pips are unchanged.
- **Banner.** The Weapons top notice (`ENEMY BRG … RNG … NO SHOT`) keeps its centre position. The tab strip ends at x 332
  and the notice is centred, so they do not overlap at its longest text (checked in the probe, §6).
- **Right column.** `ZOOM` heading; a row of `[−]`, the zoom value (today's `zoomText` without the word ZOOM), `[+]`;
  then a `[SNAP  C]` button, lit while the camera is free (today's snap hint, which leaves the bottom centre). Weapons
  adds a `[CAMERA C]` label in place of SNAP, since C is the gunner's missile camera there. The scale bar moves to the
  bottom right.
- **The interior (SHIP) view** keeps its own readout column; only the tab strip is added above it. If the interior
  readout's top is under y 42, it moves down to y 42.

## 3. Buttons (shared)

A new stage component `<Button>` in `ui/stage/Button.tsx`: a `Box` with a 1-internal-pixel outline and a `<PixelText>`
label, drawn by state:

| State | CRT on | CRT off |
|---|---|---|
| idle | outline `mid`, text `main` | outline DIM, text TEXT |
| hover | outline `main`, text `hot` | outline AMBER, text AMBER |
| lit (active, held, selected) | fill `main`, text `glass` | fill AMBER, text BG |
| disabled | outline `faint`, text `faint` | outline BAR_OFF, text DIM |

Rules every button keeps:
- **It never takes focus.** The element is a `div` with `role="button"`, `tabIndex={-1}`, and `preventDefault()` on
  `pointerdown`, so Space and Enter still reach the duel keyboard and never activate a button.
- **Pointer events.** The stage stays `pointer-events: none`. Only button elements set `pointer-events: auto`. So the
  wheel and right-drag on the map still reach the canvas everywhere except over a button.
- **Primary button only.** Left-button presses act. A right or middle press on a button does nothing.
- **Press or hold.** A press button acts on `pointerdown`. A hold button is held from `pointerdown` until `pointerup`,
  `pointercancel` or `lostpointercapture` (it captures the pointer), and is released on window blur, like a held key.
- **Labels carry the key.** For example `FIRE  SPC`, `LAUNCH  F`. Key names are in a small DIM/`mid` second text.
- **data-testid** on every button, `console-<name>` (for example `console-fire`), for the smokes.

## 4. The stations

### 4.1 Weapons (station block)

```
┌ LASER ───────────────────────┐
│ CHARGE [██████████░░░░] FULL │
│ [ FIRE  SPC (hold) ]         │
│ LOCK  [WEAP][SHLD][ENG]  E/Q │
├ MISSILE ─────────────────────┤
│ MAG 4/4    [ LAUNCH  F ]     │
│ STEER [◄ A]  [D ►] (hold)    │
└──────────────────────────────┘
```

- `CHARGE`: today's charge bar and value text (`FROZEN`, `FULL`, a percentage), same emphasis.
- `FIRE`: a hold button, exactly Space held: press = `fireDown`, release = `fireUp`. Lit while held or while the charge
  is held from the keyboard.
- `LOCK`: three press buttons for the enemy rooms in Room order (Weapons, Shields, Engines). The locked room is lit.
  Clicking one queues `laserLock {room}` directly. E/Q still cycle.
- `MAG` and `LAUNCH`: a press button, exactly F. Disabled when the sim would refuse a launch (`canLaunch` false or the
  magazine empty), the same test the runtime makes.
- `STEER`: two hold buttons, exactly A and D held, enabled only while our missile is in flight.

### 4.2 Helm (station block)

```
┌ THROTTLE ─────┬ HEADING 055 ─┐
│ 100 ▕█▏        │ SPEED  142   │
│  75 ▕█▏        │              │
│  50 ▕█▏ ◄      │ [◄ A] [D ►]  │
│  25 ▕ ▏        │  turn (hold) │
│ STOP▕ ▏        │              │
│ REV ▕ ▏        │ W/S throttle │
└───────────────┴──────────────┘
```

- **Artemis-ii (the target).** A vertical throttle of six notches, top to bottom `100`, `75`, `50`, `25`, `STOP`,
  `REV`. The set notch has a pointer and the column below it is filled. Each notch is a press button that sets the
  throttle to that level (§5). W and S each move it one notch up or down. `PORT` and `STBD` (`◄ A`, `D ►`) are hold
  buttons, exactly A and D held.
- **Artemis-i (until the throttle lands).** The same block, but the throttle shows today's held thrust: `100` lit while
  W is held, `REV` lit while S is held, `STOP` otherwise. Its notches are not clickable yet. Instead there are two hold
  buttons, `THRUST W` and `REV S`, exactly W and S held. They are removed in Artemis-ii.
- `HEADING` (000–359, the map's bearing convention, `bearingDeg`) and `SPEED` (u/s, rounded) are read from our ship's
  tactical state. They are new readout values only. Nothing in the sim changes for them.

### 4.3 Who may click what

All clicks go through the same rules as the keys they stand for: a click that maps to a key does exactly what that key
does at that moment, nothing more. Station buttons draw only on their station's view. So nobody can click another
seat's controls.

## 5. Artemis-ii: the throttle

- **State.** `DuelState.throttle: number`, an integer level in `−1..4`: −1 reverse, 0 stop, 1–4 are 25/50/75/100 %. It is
  hashed, in the snapshot (validated as an integer in range), and reset to 0 at each round start.
- **Command.** `{ kind: 'throttle'; level: number }`, added to `DuelCommand`. Applied when the sender is seated at the
  Helm and `level` is an integer in `−1..4`. A sender not at the Helm is rejected with `invalid-seat`; a bad level with
  `malformed`. Applying the current level is `noop`. It is a Helm command, so like the others it is admitted only while
  the round runs.
- **Physics.** `flyShip` quantises thrust to quarters instead of by sign: `q = clamp(round(thrust × 4), −4, 4) / 4`
  (NaN counts as 0). Forward thrust is `q × cls.thrust × f`. Reverse uses the existing reverse share at any negative
  `q`: `−cls.thrust × reverseFraction × f`. Idle, for stabilising, is still `turn === 0 && q === 0`. The hunter only
  sends −1, 0 and 1, so its flight is unchanged.
- **Step.** The crew ship's thrust is `throttle / 4` (reverse −1) while the Helm is crewed. While the Helm is empty the
  ship coasts as today, and the throttle level is kept for whoever sits next. Held W/S no longer thrusts in the duel.
- **Keys.** W and S become press-edge actions in the duel's Helm view (auto-repeat ignored): each queues
  `throttle {level ± 1}`, clamped, from the latest queued level. A/D stay held for turning. The flight dev view keeps
  held W/S thrust: it does not run the duel sim.
- **Scripted pair.** Its Helm sends `throttle` commands (4, 0 or −1) whenever its wanted thrust changes, instead of held
  thrust.
- **Wire.** The command codec admits the new kind. The online duel's authority runs in the host app, so the signalling
  service needs no redeploy.
- **SIM_VERSION** goes up by one; the goldens are re-blessed with `scripts/bless-golden.ts`.

## 6. Data flow

- **The view model.** `DuelUiView` gains `console: ConsoleView | null` (null on the end card, while paused, and in the
  flight view), built by a new pure `render/duel/consoleModel.ts` from the duel state, the local seat, the camera and the
  runtime's held/sent state:
  `{ tabs: { helm, weapons, ship: 'current' | 'open' | 'locked' }, station: HelmPanel | WeaponsPanel | null, side: { zoom, free } }`.
  The status table keeps using `readout.rows`. The sink's `replaceEqualDeep` sharing covers the new branch.
- **Clicks back to the game.** The mode owns a new `DuelUiInput` in `app/duel/uiInput.ts`:
  `press(action)`, `hold(key: 'fire' | 'left' | 'right' | 'up' | 'down', on)`, `lock(room)`, `throttle(level)` (Artemis-ii)
  and `clear()`. Each frame its sample is merged into the keyboard's: press counts add, held flags OR. `lock` and
  `throttle` are queued as commands by the runtime, through the same paths as E/Q and W/S. `clear()` runs wherever the
  keyboard's `clear()` runs (Tab, restart, blur). `createUiActions` gains `console: { press, hold, lock, throttle }`,
  wired by `duelMode.ts` and `onlineDuel.ts` to their `DuelUiInput`, and a no-op outside the duel.
- **Tabs.** Single player: `HELM` or `WEAPONS` is `open` when a character is seated there that the keyboard does not
  drive, and clicking it is one Tab press; `SHIP` is `open` when the driven character is seated, and clicking it is X.
  Online: our own seat's tab is `current` while we sit there. While we stand, it is `open` only when `consoleInReach`
  is that console, and clicking it is E (sit); otherwise it is `locked`. The partner's seat tab is always `locked`.
  `SHIP` is `current` while we stand, and otherwise `open`, and clicking it is X.

## 7. Errors

The duel region's `RegionBoundary` covers the new components. A button that throws takes the duel region down and the
boundary's reset key (the duel epoch) brings it back, as today. Clicks during a pause or on the end card do nothing,
because the console is not drawn.

## 8. Tests

- `consoleModel`: tabs for every seat combination (single player, online Helm, online Weapons, standing, partner at the
  other seat); Weapons launch disabled exactly when the runtime would not launch; steer enabled only with a missile in
  flight; heading and speed values.
- `DuelUiInput`: presses and holds merge into the keyboard sample; `clear` drops holds; a hold released after `clear` does
  not emit a stray release.
- `<Button>`: never focusable; Space with a button under the pointer does not click it; right button does nothing; a held
  button releases on `pointerup`, `pointercancel` and blur.
- Duel UI (jsdom): the tab strip, status table, station block and right column render from a fixture; a click on FIRE,
  LAUNCH and a lock room calls the matching action.
- Artemis-ii, sim: throttle command admission and reasons; quarter thrust physics (100 % equals today's full thrust tick
  for tick; 50 % gives half the acceleration); the hunter's flight unchanged; throttle kept across standing up and reset
  by a new round; snapshot round trip mid-throttle; determinism and goldens after the bless.
- Electron smoke: in Single player, click `console-tab-weapons`, then `console-fire` (hold) and `console-launch`; the
  readout shows the charge and the magazine drops.
- Look check: probe screenshots of Helm, Weapons and the interior, CRT full and off, in
  `C:\Users\djuar\FTLite-shots\artemis`.
