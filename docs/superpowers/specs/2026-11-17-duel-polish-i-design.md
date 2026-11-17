# Duel polish i: telegraphs, hit feedback, sound, healing, ship HUD (2026-11-17)

Owner request, 2026-11-17, polish for the first playtest: "2,3,4,5 and lets add a HUD to the ship view. this will have
the [FTL screenshot] health bar for the hull on the top like that, and the energy to each of the systems at the bottom.
similar to the FTL UI". Items 2-5 are from the polish list: telegraph the enemy's shots, show what your hits did, sound
cues for trouble, healing feedback.

Everything here is presentation: no sim, command, wire, hash or golden change; SIM_VERSION stays 44. Every view reads
state and events the duel already has, in Single player and online alike. All art is original (Graphics, SVG or the
existing glyphs); the HUD follows FTL's layout idea (hull bar top left, system bars bottom left), not its art.

## A. The enemy's shot, telegraphed (Helm and Weapons maps)

- While the Hunter (ship 1) holds its laser charge (`systems[1].fireHeld`), both console maps draw a ring around the
  enemy ship marker: an arc from 12 o'clock clockwise, its sweep the charge fill (`laserCharge / LASER_CHARGE_UNITS`),
  in the warning red. A small label over the marker reads `CHARGING`.
- At a full charge the full ring pulses (alpha 0.45 to 1 at 4 Hz) and the label reads `FIRING`: the Helm's cue to turn
  or change speed now.
- Nothing is drawn while the enemy's Weapons are at 2 (its laser is off) or it is not holding a charge.
- Pure model first: `enemyCharge(d): { fill: number; full: boolean } | null` (render/tactical or render/duel), then the
  map layer draws it in screen space at the enemy's drawn (interpolated) position, ring radius about 2.2 ship radii,
  never scaled below 18 screen px.

## B. What your hits did (maps and the contact window)

- For each crew shot that ends this frame (the view events: `laser` with `ship` 0, `missileEnd` with `ship` 0 and
  `target` 1), a callout floats up 24 px over 1.5 s and fades, above the enemy's map position, on both console maps:

  | Event | Text | Colour |
  |---|---|---|
  | laser, `stripped` | `SHIELD DOWN` | the map's shield blue |
  | laser, `hit`, `room` ≥ 0 | `WEAPONS HIT` / `SHIELDS HIT` / `ENGINES HIT`; `… OFFLINE` when that room is now at 2 (Shields: `SHIELDS DMG 2`) | amber; red for OFFLINE |
  | laser, not `hit` | `MISS` | dim |
  | missileEnd on the enemy, `room` ≥ 0 | `MISSILE: <ROOM> HIT` / `… OFFLINE` as the laser | as the laser |

  Two callouts in the same frame stack 14 px apart. At most 4 at once; the oldest goes first.
- The contact window (open on either console) flashes the struck room: a white fill over it, alpha 0.6 to 0 over 0.6 s.
- Pure model: `hitCallouts(events, d): Callout[]` (text, colour, kind); the age and stacking live in the view.

## C. Sound cues for trouble

- A room catches fire: the `alarm` cue once (gain 0.5), besides today's crackle, at most once a second.
- A character stands up: the `console` sound at gain 0.35 (sitting already plays it at 0.5).
- A character goes down (`downed`): the `alarm` cue. A revive (`revived`): the `ready` cue.
- The local player's character below `HEALTH_LOW` (30) and conscious: a heartbeat, `lowBoom` at gain 0.35 through a
  400 Hz low-pass, once every 0.8 s, stopping at or above 30, when downed, or while paused. "Local" is the active
  character in Single player and this seat online, so the duel audio frame gains the local player's index.
- Pure diffs as today (audio/duelSounds.ts, audio/interiorSounds.ts), with tests.

## D. Healing feedback (the ship view)

- While a character heals in the Medbay (`healing(d, pid)` in sim/duel/health.ts), green `+` motes rise from it: three a
  second, each rising 16 px and fading over 0.8 s, from a slightly random x within the character's tile (a view-side
  random, never the sim's RNG).
- On a `revived` event, `REVIVED` floats up over the revived character in green over 1.5 s, with a green ring that
  expands from 0.4 to 1.2 tiles and fades over 0.5 s.
- Drawn in the interior world over the crew (render/duel/interiorView.ts), from a pure model of what to spawn.

## E. The ship HUD (the SHIP view)

Shown only on the SHIP view (standing, `console.station === 'ship'`), in Single player and online, as a React component
in the duel UI, from a pure model `shipHud(d)` added to the duel frame. It sits inside the interior band (left of the
readout column at x 1060, below the tab strip).

- **Hull, top left** at x 12, y 48: a `HULL` label and a segmented bar, one segment per 2 hull (`SHIP_HULL` 40: 20
  segments), each 14 × 18 px with 2 px gaps, lit segments `ceil(hull / 2)`. Lit colour: green above half, amber from a
  quarter to half, red below a quarter; unlit segments a dark outline. Under it, the shield layers as small squares
  (cyan lit, outline when down) labelled `SHIELDS`.
- **Systems, bottom left** from x 12 up from y 708: one column per system, left to right Helm (Engines),
  Weapons, Shields, Medbay. Each column is an icon (original inline SVG, 24 px) over its short name
  (`HELM`, `WEAP`, `SHLD`, `MED`), with its bars stacked above the icon, bottom up, each 22 × 8 px with 2 px gaps:
  - Helm, Weapons, Shields: 2 bars, the tactical room's capacity (`2 − damage level`) lit green, the damaged bars red.
    At level 2 the icon and name turn red (OFFLINE).
  - Medbay: 1 bar, lit green while `medbayOnline(d)`, else dark; the icon dims.
- These bars show each system's working capacity: power cannot be moved between systems in the duel, so they do not
  take clicks.
- The HUD never covers the readout column, the tab strip or the banners, and does not render on the Helm or Weapons
  console views (they have their own status table).

## Tests and gates

- Unit: `enemyCharge`, `hitCallouts`, the sound diffs (fire alarm rate limit, stand, downed, revived, heartbeat on and
  off), the healing/revive spawn model, and `shipHud` (segments, colours at the thresholds, bars by damage, Medbay).
- jsdom: the HUD renders on the SHIP view only, with the hull segments and system columns from a fixture.
- Gates: `npx tsc -b`, `npm test`, `npm run test:duel-app-runtime`, and screenshots of the SHIP view HUD, a charging
  enemy on the Helm map, a hit callout, and healing in the Medbay.
