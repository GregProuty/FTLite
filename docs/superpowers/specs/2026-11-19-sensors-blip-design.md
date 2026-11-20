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
  enemy somewhere inside it when it was drawn. It is redrawn every 2 s at a new guess, like a ping. It never fades
  away for good.
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
- A new ping is made on the first frame the enemy is unseen, and after that whenever the frame's time has passed the
  next multiple of `BLIP_PING_SECONDS` (2 s) on the presentation clock (`now`, the clock `stepFog` already takes).
- **The ping's centre** is the enemy's true position at that frame plus an offset inside the circle:
  - the offset's length is `0.8 × r × sqrt(u)` and its direction is `2π × v`, where `u` and `v` are two numbers in 0..1
    from a small integer hash of the round (`epoch`) and the ping's index (`floor(now / BLIP_PING_SECONDS)`);
  - so the enemy is inside the circle when the ping is made, at least `0.2 × r` from its edge, and the centre is not a
    good guess of where it is;
  - the hash is plain view code (no sim random source is read, so the sim's randomness is untouched). The same round
    and ping index give the same offset. Two clients need not agree: the blip is each screen's own.
- **Between pings** the circle does not move. The enemy does, so it can leave the circle before the next ping. That is
  the roughness.
- **Its age** (0 at the ping, 1 just before the next) is carried to the draw, which fades the circle from full to 40 %
  across the 2 s, so each new ping reads as a pulse.
- When the enemy is seen again the blip goes at once, and the next time it is unseen a new ping is made at once.
- A new round clears it, as the tracker's ghosts are cleared (`epoch`).

### 2.4 The view state

- `FogView` (`render/tactical/fogModel.ts`) gains `blip: Blip | null`, with
  `Blip = { x: number; y: number; r: number; age: number }` in world units and `age` 0..1.
- `FogTracker` gains the held ping (`{ index, x, y, r }`, or none).
- `GhostKind` keeps `'enemy'` (the `seen` record still has the enemy's flag), but no ghost of that kind is produced.

## 3. Drawing and readouts

- **The map** (`render/tactical/tacticalModel.ts`, `tacticalLayer.ts`), on every console map that draws ghosts today
  (Helm, Weapons, Science, and the Valkyrn's Flight seat):
  - a dotted circle of the ping's radius about its centre (`dashCircle`, 2 px dashes, 6 px gaps, as the sensor range
    ring), in `CRT.mid`, its alpha `1 − 0.6 × age`;
  - a small `?` at the centre, same tint and alpha;
  - nothing else for the enemy: no hull, no heading mark, no torpedo, no rounds (the existing unseen rules).
- **The OUTSIDE readout** (`render/duel/readoutModel.ts`): the row `ENEMY  NO CONTACT` becomes `ENEMY  BLIP ~<n>`, where
  `n` is the distance from the crew ship to the **ping's centre**, rounded to the nearest 100. No bearing row, as
  today. With no blip (no enemy ship) the row is as today.
  - The readout model takes the frame's `FogView` for this (or the ping's centre); the plan names the path.
- **Unchanged:** the contact window's `CONTACT LOST` / `OUT OF SENSOR RANGE`; the `NO CONTACT` lock refusal; the
  situation line; picking (a blip cannot be clicked, scanned or locked); the camera (it frames the enemy only when
  seen); the dropped sparks and centred sounds from unseen points; AUTO fire needing the enemy seen. A shot by hand at
  the blip is allowed, as a shot by hand at an unseen enemy is today.

## 4. Tests

- **`fogModel`** (a fake clock, a state with the enemy placed by hand):
  - unseen from the first frame gives a blip at once, with no earlier sighting;
  - the radius at 0, 1000 and 3000 u beyond range is 150, 400 and 600;
  - the ping's centre is within `0.8 × r` of the enemy's position at the ping's frame;
  - the same `epoch` and ping index give the same centre; another index gives another;
  - the circle holds its centre and radius for 2 s while the enemy moves, then a new ping is made; `age` runs 0 to 1
    across it;
  - seen again: no blip; unseen again: a new ping at once;
  - the enemy destroyed: no blip; a new `epoch` clears the held ping;
  - no ghost of kind `'enemy'` is ever produced; the derelict's and the torpedo's ghosts are as before.
- **Map model and layer:** an unseen enemy draws the dotted circle and the `?` at the ping's place with the alpha for
  its age, and no ship; a seen enemy draws neither.
- **Readout:** `ENEMY  BLIP ~1800` for a ping centre 1760 u away; today's rows when seen.
- **Unchanged rules:** a click on the blip picks nothing; `lockRefusal` still reads `NO CONTACT`.
- No sim test changes: the goldens and the determinism fixture are untouched.
- **Final checks:** `npm run typecheck`, `npm test`, `npm run build`.

## 5. Where it is built

- Its own small branch from master. It touches `render/tactical/fogModel.ts`, `tacticalModel.ts`, `tacticalLayer.ts`
  and `render/duel/readoutModel.ts` (and `app/duel/scene.ts` to pass the fog view to the readout). W-4b's map task
  also edits `tacticalModel.ts` and `tacticalLayer.ts`, in the Weapons draws; whichever lands second merges.
- One gate entry in `docs/gates.md`: fly out of sensor range and watch the ping; lower the Sensors bars and watch the
  enemy turn into a blip; the circle grows with distance; the readout's rough range.

## 6. Not in this build

- **Sensors extending weapon range and the reticle** (Ryan's "later"), and the worry that a sensor hit would then hurt
  twice.
- **Blips for the derelict and the enemy's torpedo** (they keep the fading ghost).
- **A blip the two players share exactly** (each screen makes its own).
- **Fog for the Hunter.** It still always knows where the crew is.

## 7. Judgement calls (owner to check)

1. **The ping holds still for 2 s** rather than gliding with the enemy (§2.3), so the blip never gives away the
   enemy's speed or heading.
2. **The enemy's exact last-seen ghost goes** (§2.1). The blip replaces it from the first unseen frame.
3. **The readout's range is to the blip, not to the enemy** (§3), so it is as rough as the circle.
4. **An enemy that starts out of range has a blip from the start** (§2.1), so a round never opens with nothing on the
   map.
