# The sensors blip: an enemy beyond sensor range shows as a rough ping (design, 2026-11-19)

Ryan's playtest notes, round 2 (`docs/superpowers/research/2026-11-19-ryan-notes-v2.md`, §5): "Beyond sensor range, the
enemy shows as a rough, inexact blip rather than vanishing, so a 1v1 duel doesn't become a search." The owner approved
this design on 2026-11-19. It **amends** the Engineering spike's fog (`2026-11-18-engineering-spike-design.md` §10.4):
the enemy ship's fading ghost becomes a blip. Everything else in §10.4 stands.

It is drawing only. The sim, the wire, the hash and SIM_VERSION do not change: each client already has the enemy's
state and hides it (`render/tactical/fogModel.ts`).

Paths are under `src/renderer/src/` unless they start with `tests/` or `docs/`. Code is quoted from master at eaf84426.
Every number is a starting value.

## 1. What changes for the player

- **Today:** when the enemy ship leaves sensor range, a hollow chevron stays at its exact last seen place and heading,
  fades over 10 s (`GHOST_SECONDS`) and is gone. After that the map shows nothing.
- **Now:** while the enemy ship is alive and beyond sensor range, the map shows a **blip**: a dotted circle with the
  enemy somewhere inside it when it was drawn. It is redrawn every 2 s of game time at a new guess, like a ping. It
  never fades away for good. When the circle is off the screen, an arrow at the screen's edge points to it.
- The circle is small just beyond range and grows with the distance beyond it, so a far enemy is a vague region and a
  near one is almost a fix.
- It gives a direction and a rough distance. It gives no heading, no exact place and nothing to lock.

## 2. The blip

### 2.1 When there is one

- There is a blip while the crew's target ship is active and not seen (`contactSeen(t, Contact.Enemy)` false,
  `sim/tactical/science.ts`), on every frame of the round.
- There is none while the enemy is seen, after it is destroyed (not active), or in a round with no enemy ship.
- It needs no earlier sighting: an enemy that starts the round out of range has a blip from the first frame.
- **The enemy ship's ghost is removed.** `stepFog` no longer makes a ghost of kind `'enemy'`. The derelict's and the
  enemy torpedo's ghosts are unchanged.

### 2.2 Its size

- `beyond` = the distance from the crew ship's centre to the enemy's centre, minus the sensor range (`sensorRange`),
  never below 0.
- The radius is `r = min(BLIP_R_MAX, BLIP_R_MIN + BLIP_GROW × beyond)`, with `BLIP_R_MIN = 150`, `BLIP_GROW = 0.25` and
  `BLIP_R_MAX = 600` (world units). So just beyond range it is 150 u, 1000 u beyond it is 400 u, and from 1800 u beyond
  it stays 600 u.

### 2.3 Where it is drawn, and the ping

- A blip is a **ping**: a centre and a radius fixed when the ping is made, held until the next ping.
- **The ping's clock is the game's, not the screen's.** Pings are timed on the tactical state's tick counter
  (`TacticalState.tick`, which the view only reads), with `BLIP_PING_TICKS = 120` (2 s at `TICK_HZ` 60). The ping's
  index is `floor(t.tick / BLIP_PING_TICKS)`.
  - Why not the presentation clock: that clock runs on while the game is paused, while an online copy is frozen after
    a lost link, and while the tab is in the background. New pings around an enemy that is not moving would let a
    player average the centres and find it. On the tick clock a paused or frozen state makes no new ping.
  - The ghosts of the derelict and the torpedo keep the presentation clock (`now`), as today.
- **A new ping is made** on a frame where the enemy is unseen and either no ping is held or the held ping's index is
  not this frame's index. So the first unseen frame makes one at once, and after that one is made each time the tick
  passes a multiple of 120.
- **The ping's centre** is the enemy's true position at that frame plus an offset inside the circle:
  - the offset's length is `0.8 × r × sqrt(u)` and its direction is `2π × v`, with `u` and `v` in 0..1 from the hash
    below, so the enemy is inside the circle when the ping is made, at least `0.2 × r` from its edge, and the centre
    is not a good guess of where it is;
  - **the hash** of the round (`epoch`) and the ping's `index`, in 32-bit integer arithmetic (`Math.imul`, `>>>`):
    `h = imul(epoch ^ 0x9e3779b9, 0x85ebca6b) ^ imul(index + 1, 0xc2b2ae35)`; then `h ^= h >>> 16`,
    `h = imul(h, 0x85ebca6b)`, `h ^= h >>> 13`, `h = imul(h, 0xc2b2ae35)`, `h ^= h >>> 16`; then
    `u = (h & 0xffff) / 65536` and `v = (h >>> 16) / 65536`;
  - it is plain view code. It reads no `Math.random` and none of the sim's random state, so the sim's randomness is
    untouched. The same round and index give the same offset. Two clients need not agree: the blip is each screen's
    own.
- **Between pings** the circle does not move. The enemy does, so it can leave the circle before the next ping. That is
  the roughness.
- **Its age.** The held ping stores the tick it was made at (`madeAt`). Its age on a frame is
  `(t.tick − madeAt) / ((index + 1) × BLIP_PING_TICKS − madeAt)`, kept within 0..1. So every ping starts at age 0,
  one made partway through a period included (it just lasts a shorter time), and reaches 1 as the next is due. The
  draw fades the circle from full to 40 % across it, so each new ping reads as a pulse.
- When the enemy is seen again the held ping is dropped at once, and the next time it is unseen a new ping is made at
  once.
- A new round clears it, as the tracker's ghosts are cleared (`epoch`).

### 2.4 The view state

- `FogView` (`render/tactical/fogModel.ts`) gains an optional `blip?: Blip | null` (absent means none, so the
  `FogView` literals in the tests need no edit), with `Blip = { x: number; y: number; r: number; age: number }` in
  world units and `age` 0..1.
- `FogTracker` gains the held ping (`{ index, madeAt, x, y, r }`, or none).
- `GhostKind` keeps `'enemy'` (the `seen` record still has the enemy's flag), but no ghost of that kind is produced.

## 3. Drawing and readouts

- **The map** (`render/tactical/tacticalModel.ts`, `tacticalLayer.ts`), on every console map that draws ghosts today
  (Helm, Weapons, Science, and the Valkyrn's Flight seat):
  - a dotted circle of the ping's radius about its centre (`dashCircle`, 2 px dashes, 6 px gaps, as the sensor range
    ring), in `CRT.mid`, its alpha `1 − 0.6 × age`;
  - a small `?` at the centre, same tint and alpha;
  - nothing else for the enemy: no hull, no heading mark, no torpedo, no rounds (the existing unseen rules).
  - **When it is drawn.** The model carries it as `TacticalDraw.blip?: { x, y, r, alpha } | null` in screen pixels.
    The circle is drawn when its ring crosses the view (`ringCrossesRect`, as the sensor ring's test) or its centre
    is on screen. The `?` is drawn only when the centre is on screen (by the edge arrow's test, below). The ghosts' own test (a 40 px margin about the
    centre) is not used: it would drop a large circle whose centre is just off the view.
  - **The edge arrow.** While the enemy is unseen the scene leaves it out of `ships`, so today's enemy arrow is not
    built, and at the default zoom a blip is usually off the map. So when the ping's centre is off screen, the model
    builds an edge arrow toward it with the existing `arrow()` helper, as a new `ArrowTarget` `'blip'`. It is not the
    `'enemy'` arrow, so the goal glow and the FIRING SOLUTION mark, which read the enemy arrow (`weaponsModel.ts`),
    never attach to it.
    - `ARROW_NAMES` gains `blip: 'BLIP'`.
    - The helper sets every other arrow's `distance` to the exact rounded length and its label to the name and that
      number. For `'blip'` it sets `distance = Math.round(d / 100) * 100`, with `d` the length from the crew ship to
      the ping's centre, and the label `` `BLIP ~${distance}` ``.
    - The layer's `arrowGlyph` picks its fill by target. A `'blip'` arrow gets its own case: hollow, stroked in
      `CRT.mid` (the circle's tint) at the ping's alpha, so it does not read as the enemy's or the torpedo's arrow.
    - "Off screen" is the helper's own test (the one that places an arrow at the edge). The `?` uses the same test,
      so a ping's centre gets the `?` or the arrow, never both and never neither.
- **The OUTSIDE readout** (`render/duel/readoutModel.ts`): the row `ENEMY  NO CONTACT` becomes `ENEMY  BLIP ~<n>`, where
  `n` is the distance from the crew ship to the **ping's centre**, rounded to the nearest 100. No bearing row, as
  today. With no blip (no enemy ship) the row is as today.
  - `readoutRows`' input gains an optional `fog?: FogView | null`. With `fog.blip` set and the enemy unseen, the row
    reads `` `BLIP ~${Math.round(dist / 100) * 100}` ``. With no `fog`, or no blip, it reads as today (`NO CONTACT`
    when unseen). Only the scene's call that draws the rows passes the frame's fog view; its three calls that only
    count rows, and the existing tests, pass none and are unchanged.
- **The sit-down card's place** (`app/duel/scene.ts`, `render/duel/sitModel.ts`) is chosen today from whether the
  enemy's true position is below the crew ship, seen or not. While the enemy is unseen the scene uses the ping's
  centre for that test instead, so the card's place tells no more than the blip does.
- **Unchanged:** the contact window's `CONTACT LOST` / `OUT OF SENSOR RANGE`; the `NO CONTACT` lock refusal; the
  situation line; picking (a blip cannot be clicked, scanned or locked); the camera (it frames the enemy only when
  seen); the dropped sparks and centred sounds from unseen points; AUTO fire needing the enemy seen. A shot by hand at
  the blip is allowed, as a shot by hand at an unseen enemy is today.

## 4. Tests

- **Rewritten, not added:** `tests/engineeringFog.test.ts`'s cases that expect the enemy's ghost at its last seen
  place, its fade, and `ghosts` holding kind `'enemy'` become the blip cases below (no enemy ghost, a blip present).
  Its `NO CONTACT` readout case stays as the no-fog case.
- **`fogModel`** (a state with the enemy placed by hand and its `tick` set by the test):
  - unseen from the first frame gives a blip at once, with no earlier sighting;
  - the radius at 0, 1000 and 3000 u beyond range is 150, 400 and 600;
  - the ping's centre is within `0.8 × r` of the enemy's position at the ping's frame;
  - the same `epoch` and ping index give the same centre; another index gives another; the hash's `u` and `v` for
    three fixed (`epoch`, `index`) pairs equal pinned values;
  - the circle holds its centre and radius for 120 ticks while the enemy moves, then a new ping is made; `age` runs 0
    to 1 across it; a ping made 78 ticks into a period starts at age 0 and reaches 1 at the period's end;
  - a state whose tick does not advance, stepped across 10 s of the presentation clock, keeps one ping;
  - seen again: no blip; unseen again: a new ping at once;
  - the enemy destroyed: no blip; a new `epoch` clears the held ping;
  - no ghost of kind `'enemy'` is ever produced; the derelict's and the torpedo's ghosts are as before.
- **Map model and layer:** an unseen enemy draws the dotted circle and the `?` at the ping's place with the alpha for
  its age, and no ship; a seen enemy draws neither; a circle whose centre is off screen but whose ring crosses the
  view is drawn without the `?`; with the centre off screen there is a `'blip'` edge arrow labelled `BLIP` with
  `~<n>`, and no `'enemy'` arrow; the goal glow and the FIRING SOLUTION mark do not show on it.
- **Readout:** `ENEMY  BLIP ~1800` for a ping centre 1760 u away with the fog passed; `NO CONTACT` with none; today's
  rows when seen.
- **Sit card:** with the enemy unseen its place follows the ping's centre, not the enemy.
- **Unchanged rules:** a click on the blip picks nothing; `lockRefusal` still reads `NO CONTACT`.
- No sim test changes: the goldens and the determinism fixture are untouched.
- **Final checks:** `npm run typecheck`, `npm test`, `npm run build`.

## 5. Where it is built

- Its own small branch from master. It touches `render/tactical/fogModel.ts`, `tacticalModel.ts`, `tacticalLayer.ts`
  and `render/duel/readoutModel.ts` (and `app/duel/scene.ts` to pass the fog view to the readout and the ping's centre
  to the sit card). W-4b's map task
  also edits `tacticalModel.ts` and `tacticalLayer.ts`, in the Weapons draws; whichever lands second merges.
- One gate entry in `docs/gates.md`: fly out of sensor range and watch the ping; lower the Sensors bars and watch the
  enemy turn into a blip; the circle grows with distance; the readout's rough range.

## 6. Not in this build

- **Sensors extending weapon range and the reticle** (Ryan's "later"), and the worry that a sensor hit would then hurt
  twice.
- **Blips for the derelict and the enemy's torpedo** (they keep the fading ghost).
- **A blip the two players share exactly** (each screen makes its own).
- **Fog for the Hunter.** It still always knows where the crew is.
- **Other places that may give an unseen enemy away today** and were not traced for this spec: the Helm's predicted
  path stopping on an unseen ship, and the readout's `TORPEDO INBOUND` row for a torpedo beyond sensor range. They
  predate this and are left as they are.

## 7. Judgement calls (owner to check)

1. **The ping holds still for 2 s** rather than gliding with the enemy (§2.3), so the blip never gives away the
   enemy's speed or heading.
2. **The enemy's exact last-seen ghost goes** (§2.1). The blip replaces it from the first unseen frame.
3. **The readout's range is to the blip, not to the enemy** (§3), so it is as rough as the circle.
4. **An enemy that starts out of range has a blip from the start** (§2.1), so a round never opens with nothing on the
   map.
5. **Pings run on game time** (§2.3), so pausing does not hand out fresh guesses.
6. **An off-screen blip gets an edge arrow** labelled `BLIP ~<n>` (§3). Without it the blip would usually be off the
   map at the default zoom and give no direction.
