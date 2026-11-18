# Spike ii: billiard asteroids (2026-11-18)

Owner, 2026-11-18: "I want it to feel like Asteroids but with better physics / more fun. Weapons needs to feel like the
job where you get to blow shit up and it needs to feel fun and satisfying." Also: "the torpedos need to do a bunch of
damage to the asteroids, like they should explode in multiple pieces", "the asteroids crashing into each other should
cause damage too", and rocks "should also be able to be hit by accident".

A second spike, built on spike i (`spike/asteroids`, report `docs/superpowers/research/2026-11-17-asteroid-spike.md` on
that branch). Spike i found pieces slow (40 u/s), short-lived (they shattered on the first rock they touched) and nearly
irrelevant (a ship touched one on 4 ticks in 10 duels). This spike does the opposite: rocks are real bodies that take
pushes, bounce, crack each other and fly into ships. Branch `spike/asteroids-ii`. Not merged until the owner has played it
in single player and said yes; then it gets a proper spec and build.

## 0. Owner decisions (fixed)

1. **Weapons stay as they are**: the charging laser (burst) and the homing torpedo. New weapons (a free-aim gun) are a
   different spike.
2. **Billiards physics**: hits push rocks; pieces fly fast and carry the hit's push; rocks bounce off rocks by mass.
3. **Torpedoes blow rocks apart**: an area blast; the rock it meets bursts into many pieces; rocks around it are cracked
   and thrown outward.
4. **Rock-on-rock collisions damage both rocks.**
5. **Rocks are targets on purpose** (a weapon dropped on a rock) **and by accident** (a shot that meets a rock on its way).
6. **Pieces hurt everyone**: the crew ship, the Hunter and torpedoes; damage scales with the piece's speed and size.
7. **Blast pushes ships, does not damage them**; flying pieces still can.
8. Built as a spike on top of spike i; single player is the gate.

## 1. Goals and non-goals

Goals: the physics and rules below; satisfying feedback (§7); the measured feel proxies and costs (§9); a playable solo
build and a report.

Non-goals: online effects for guests (they see rock positions through the snapshot as in spike i, with no new fx work),
the Hunter or the scripted pair using rocks on purpose, the Helm's predicted path seeing rock motion, any new weapon,
merging to master.

## 2. Starting point

- Branch `spike/asteroids-ii` starts at spike i's tip (577bb00c). Its **first task** merges current `master` into it
  (a merge, not a rebase; master is at SIM_VERSION 51), resolves conflicts, and re-blesses with the two-step procedure
  spike i used (version-only bump, then a same-version bless). The owner plays on current master's game.
- Spike i's rock pool (`sim/tactical/rocks.ts`), its `rocksNear` broad phase, its hashing, snapshot and clone wiring, its
  crack rendering and its laser-hits-rock path are kept and extended. Its `AUTO_DIG` is turned off (§6.3).

## 3. Rocks as bodies

### 3.1 Pool

- The pool keeps its layout (kind, x, y, vx, vy, r, hp; kind 0 gone, 1 static, 2 moving). `ROCK_RESERVE` rises from 32
  to **96** spare slots.
- **Mass** `m = r²` (no unit). Ships have mass `SHIP_MASS = 900` for rock contacts (§5); every class uses it in this spike.
- **Hp is a real number**, `hp = ceil(r / 10)` at birth (2 to 6). Damage may be fractional (§4.3, §5.1). A rock breaks the
  moment hp ≤ 0. The crack rendering reads `hp / hpMax`, with `hpMax = ceil(r / 10)` recomputed from r.
- **Static becomes moving, never the reverse.** A seeded rock sits still (kind 1) until anything gives it a velocity
  change: a laser push, a blast, a collision, a ship's ram. Then it is kind 2 for good. The grid invariant from spike i
  holds: the never-rebuilt grid indexes only seeded slots, a grid hit counts only while its slot is still kind 1, and a
  kind-1 rock never moves. Moving rocks (seeded or pieces) are found by the linear scan.

### 3.2 Motion (`stepRocks`, each moving rock in ascending slot order)

- Gravity at `ROCK_GRAVITY = 1.0` × the ships' gravity, then drag `v ← v · (1 − ROCK_DRAG · dt)` with `ROCK_DRAG = 0.1`
  per second, then a speed cap `ROCK_MAX_SPEED = 300` u/s (scale the velocity down to it), then semi-implicit Euler.
- A moving rock that touches the planet, or whose centre leaves the map (`x² + y² > R_MAP²`), is gone as **dust**
  (§3.5).
- Tuning risk, to report: with gravity on, a pushed belt rock never comes to rest and drifts slowly toward the planet
  (about 1.7 u/s² at the belt). `ROCK_GRAVITY` is a knob; the report says what 1.0 and 0.0 feel like.

### 3.3 Rock-on-rock collisions

After every moving rock has moved, contacts are resolved once per pair, in a fixed order: for each moving rock `a` in
ascending slot, each rock `b` from `rocksNear` with `b ≠ a`, skipping a pair already resolved this tick (both moving and
`b < a`). For a touching pair, with normal `n` from b to a and closing speed `vc = (vb − va) · n > 0`:

- **Separate** by the overlap, shared by inverse mass (a kind-1 rock is moved only if it becomes moving this contact).
- **Bounce** with restitution `ROCK_RESTITUTION = 0.8`, impulse `j = (1 + e) · vc / (1/ma + 1/mb)`, applied along `n` to
  both. A kind-1 `b` becomes kind 2 and takes its share. Momentum along `n` is conserved (to floating point).
- **Damage** when `vc > ROCK_CRUSH_SPEED = 30` u/s: `base = (vc − 30) / ROCK_CRUSH_STEP` with `ROCK_CRUSH_STEP = 40`;
  rock a takes `base · 2·mb / (ma + mb)`, rock b takes `base · 2·ma / (ma + mb)`. Equal rocks take `base` each; the
  lighter takes more. Damage is applied after the bounce, a then b; a break (§3.4) uses the collision normal as its hit
  direction (a's away from b, b's away from a) and the rock's post-bounce velocity as the parent velocity.
- A pair closing at ≤ 30 u/s only bounces. A pair moving apart (`vc ≤ 0`) only separates.
- No grace window between rocks: separation plus the closing-speed test stops repeat damage on resting contacts.

### 3.4 Breaking

When a rock's hp reaches ≤ 0 it breaks at once. The **hit direction** `u` (unit) and the **cause** come from what broke
it (a shot's line, the blast's centre-to-rock direction, a collision normal, a ram).

- **Laser or collision or ram break**:
  - `r ≥ 45`: 3 pieces; `30 ≤ r < 45`: 2 pieces; `r < 30`: dust.
  - Piece radius `rp = 0.9 · r / √n`. Pieces with `rp < ROCK_MIN_R = 8` are dust instead.
  - Directions: fanned across the 120° in front of `u`, piece k of n at `θk = −60° + 120° · (k + 0.5) / n` from `u`
    (2 pieces: ±30°; 3 pieces: −40°, 0°, +40°). Speed `ROCK_FLING = 150` u/s plus the parent's velocity.
- **Torpedo direct hit** (the rock the torpedo touched):
  - `r ≥ 45`: 6 pieces; `30 ≤ r < 45`: 4 pieces; `r < 30`: dust.
  - Same radius rule. Directions: a full circle, `θk = 360° · k / n`, rotated from `u` (the torpedo's direction of travel
    relative to the rock), so one piece always flies straight on. Speed `ROCK_BLAST_FLING = 200` u/s plus the parent's
    velocity.
- Pieces start at `centre + dir · 0.6 · r`, kind 2, `hp = ceil(rp / 10)`, fresh contact grace on every ship (spike i's
  `freshGrace`). Pieces born this tick first move next tick, and are not tested against each other this tick.
- Angles are fixed rational fractions of a turn, so directions come from a precomputed table of cos/sin values written as
  literals (no `Math.cos`/`Math.sin` at run time; the guard allows only `+ − × ÷`, sqrt, abs, min, max, ceil).
- **Slot use**: the first piece keeps the broken rock's slot; the others take the lowest empty slots, ascending. When no
  slot is free: if some moving rock is smaller than the new piece, the smallest moving rock (ties: the lowest slot) is
  turned to dust and its slot reused; otherwise the new piece is dust. Never silent: every dust emits an event.

### 3.5 Dust

Dust is visual only: the slot is cleared, a `rock` event with `what: 'dust'` (§8) carries its position, radius and
velocity, and the renderer throws a puff of particles along that velocity.

## 4. Weapon hits on rocks

### 4.1 Laser shot

A laser shot that meets a rock (aimed at it, §6, or in the way of the enemy, or the aimless nose ray of spike i) does
`LASER_ROCK_DAMAGE = 2` (up from 1) and gives the rock a push `LASER_ROCK_PUSH = 4000` along the shot line: `Δv = J / m`
(r 15: about 18 u/s; r 45: about 2 u/s). Push first, then damage. A kind-1 rock becomes kind 2.

### 4.2 Torpedo blast

A torpedo that touches any rock (on purpose or not) **detonates** at its position, `BLAST_RADIUS = 120`:

1. The rock it touched takes the direct hit: it breaks at once (§3.4, torpedo pattern), whatever its hp.
2. Every other live rock whose surface is within the radius (`d = max(0, dist − r) < 120`, distance from the blast point)
   takes `fall = 1 − d / 120`:
   - damage `BLAST_ROCK_DAMAGE_MIN + (BLAST_ROCK_DAMAGE_MAX − BLAST_ROCK_DAMAGE_MIN) · fall` with 2 and 6;
   - push `Δv = BLAST_PUSH · fall / m` along the blast-to-rock direction, `BLAST_PUSH = 60000` (r 45 at 0: about 30 u/s;
     r 15: capped at 300);
   - push first, then damage; a rock this breaks uses the **laser pattern** (2 or 3 pieces fanned outward along the
     blast-to-rock direction). Only the touched rock gets the 4 to 6 piece burst.
   - Rocks are processed in ascending slot. Pieces born from the blast are not themselves hit by it.
3. Every active ship within the radius (surface distance, ship radius) is pushed `Δv = BLAST_SHIP_PUSH · fall` along
   the blast-to-ship direction, `BLAST_SHIP_PUSH = 120` u/s. No hull damage from the blast.
4. The torpedo ends with cause `'asteroid'` as now. A torpedo that lands on a ship does not blast (unchanged rules).

## 5. Ships and rocks

### 5.1 Contact

Ship-rock contact (`contacts.ts`) becomes two-body. For ship s (mass `SHIP_MASS`) and rock k touching, normal n from rock
to ship, closing speed `vc = (vk − vs) · n`:

- Separate: the ship is pushed out of the rock fully when the rock is kind 1; when kind 2, the overlap is shared by
  inverse mass.
- Bounce: impulse `j = (1 + RESTITUTION) · vc / (1/ms + 1/mk)` (ships keep their `RESTITUTION = 0.5`) applied to both,
  only when `vc > 0`. A kind-1 rock struck by a ship becomes kind 2 **only if** `vc > ROCK_WAKE_SPEED = 40` u/s (so
  scraping along the belt does not set it drifting).
- **Hull cost** (outside the pair's grace, as now): `impact = vc · mk / (mk + ms)`; cost
  `min(4, 1 + floor(max(0, impact − 40) / 40))`. A gentle bump costs 1, as today. Examples: r 15 piece at 200 u/s:
  impact 40, cost 1; r 30 at 200: 100, cost 2; r 45 at 250: about 173, cost 4.
- **Rock damage from a ram**: the rock takes `max(0, vc − ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP · 2·ms / (ms + mk)` (the
  §3.3 formula with the ship as the other body). Ramming a small cracked rock can break it.

### 5.2 Torpedoes and pieces

A torpedo meets moving rocks exactly as static ones (spike i): it touches, it detonates (§4.2).

## 6. Targeting rocks

### 6.1 State and commands

- Each ship system gets `laserRock` and `torpRock` (a rock slot, or −1). They are hashed, snapshotted and cloned with the
  other system fields.
- A new crew command `rockLock { weapon: 'laser' | 'torpedo', rock: number }` sets one of them (−1 clears it). It is
  validated like `laserLock` / `torpLock` (seat rules: the Weapons seat), rejected as malformed when the slot is out of
  range, and rejected as `noop` when the slot holds no live rock. `laserLock` / `torpLock` with a room clear the matching
  rock target (the weapon goes back to the enemy).
- **A rock target clears itself** the tick its rock breaks or turns to dust (any slot cleared or rewritten by §3.4 clears
  every `laserRock` / `torpRock` that pointed at it), so a reused slot is never mistaken for the old rock.

### 6.2 Laser with a rock target

- While `laserRock ≥ 0` the laser's aim is that rock, not the enemy. A shot is **on target** when the rock is inside the
  laser's arc and its surface within the laser's range. The shot's line runs from the ship to the rock's centre; the first
  blocker on it (spike i's `firstBlocker`) takes the shot: the planet (the shot misses), another rock (it takes the hit, an
  accident), or the target rock.
- The laser's existing fire rules (charge, hold, manual fire, the crew auto-fire when lined up, the burst) apply with
  "lined up" meaning "the rock target on target". The Weapons card's FIRING flash and its reason row use the same test
  (`LASER: OUT OF ARC`, `OUT OF RANGE`, words as today).
- A burst's later shots re-aim at the rock as it now stands; if it broke, they fall back to the enemy rules.

### 6.3 Accidental hits and AUTO_DIG

- A laser shot at the enemy whose line is blocked by a rock hits that rock (spike i, kept). The aimless nose ray (no
  target in reach) also stays.
- **`AUTO_DIG` is false.** The laser never fires on its own just because a rock is in the way; digging is chosen by
  dropping the laser on the rock.

### 6.4 Torpedo with a rock target

- While `torpRock ≥ 0` the torpedo homes on that rock: `homingTurn` uses the rock's position and velocity in place of the
  target ship's. Its IN RANGE / OUT OF RANGE state uses the distance to the rock.
- If the rock breaks while the torpedo flies, the torpedo flies on unguided (as when its target ship is gone).
- It detonates on whatever rock it touches first (§4.2), which may not be its target.

### 6.5 UI (Weapons and Helm map views)

- With a weapon picked up (a card or 1 / 2, as today), the pointer over a rock on the map highlights it (a bracket in
  the weapon's mark), and a click on it drops the weapon there: the duel mode sends `rockLock`. The contact window closes.
- A targeted rock wears that weapon's bracket (laser and torpedo marks differ, both drawn on the CRT amber ramp) until the
  target clears.
- The card's target words read `TGT ROCK`. A right-click on the card clears the target, as today (it sends `rockLock`
  with −1 and the room lock as it was).
- A click on a rock with no weapon picked up does nothing new.

## 7. Feel: the feedback

All view-owned, never hashed, driven by the tick's `rock` events and the live pool. Colours stay on the CRT amber ramp
(`crtColours.test.ts` covers any new colour).

1. **Impact**: a laser hit on a rock draws the beam to the impact point (spike i), a flare, and **chips**: 5 to 8 short-
   lived sparks thrown back along the shot line with spread, fading in about 0.4 s.
2. **Cracks**: spike i's crack lines and dimming, driven by `hp / hpMax`.
3. **Motion cue**: every moving rock faster than 20 u/s draws a short fading streak behind it (length scales with speed),
   fixing spike i's "pieces look like terrain".
4. **Break**: a burst sized by the rock, plus a ring of 10 to 16 debris specks thrown outward that fade over about 0.6 s.
5. **Torpedo blast**: an expanding shockwave ring to `BLAST_RADIUS` over about 0.35 s, a bright core flash, and a
   heavier debris spray.
6. **Shake**: the map shake today fires only when the crew ship is hit. It also fires for a torpedo blast on screen
   (strong: about 8 px, 0.35 s, falling with distance from the crew ship) and a rock break on screen (light: about 2 px,
   0.12 s). Shakes do not stack past the strongest.
7. **Rock collision**: a damaging rock-rock contact draws a spark at the contact point; a bounce under the crush speed
   draws nothing.
8. **Sound** (existing CC0 bank where it fits, else the nearest existing cue): a crack on a laser hit, a crunch on a
   break, a deep boom on a torpedo blast, a soft knock on a damaging rock collision. Rate-limited so a chain reaction
   cannot play more than about 6 rock sounds per second. Volumes go through the existing SFX volume.
9. **Tally**: the Weapons station shows `ROCKS n` (rocks the crew broke this round, by laser, torpedo or ram, counted from
   a new per-ship counter `rocksBroken`). A small brag, cheap to read.

## 8. Events and counters

- The `rock` event becomes
  `{ kind: 'rock'; what: 'hit' | 'split' | 'dust' | 'blast' | 'bump'; by: 'laser' | 'torpedo' | 'collision' | 'ram' | 'planet' | 'edge'; rock; x; y; r; vx; vy; ship? }`
  where `blast` is the detonation (x, y the blast point, r the radius), `bump` a damaging rock-rock or ship-rock contact
  (x, y the contact point), `split` carries `pieces`, and `ship` names the ship whose shot, torpedo or ram caused it.
  Spike i's `'shatter'` is renamed `'dust'` and `'fragment'` becomes `'collision'`.
- Counters (in the space module, hashed): `rockHits`, `rockSplits`, `rockDust`, `rockBlasts`, `rockCollisions`
  (damaging rock-rock contacts), `rockEvictions`. Per ship system: `rocksBroken`.

## 9. Measurement and acceptance

The spike is accepted for the owner's play when all of these hold:

1. **Determinism**: twin runs over seeds 1 to 20 agree (hash every 500 ticks over 4,000 ticks) in a **stress script**
   that fires a torpedo into the belt every 10 s and the laser at rocks whenever charged; save and restore at tick 4,000
   then 1,000 more ticks agree; the checkpoint continuation test passes; goldens re-blessed by the two-step procedure;
   `boundary.test.ts` passes on every touched sim file.
2. **Broad phase**: `rocksNear` agrees with brute force while seeded rocks are moving and pieces are flying (spike i's
   test, extended).
3. **Physics unit tests**: a rock-rock collision conserves momentum along n (within 1e-9 relative); no damage at
   `vc ≤ 30`; the lighter rock takes more; a laser push gives `Δv = J/m`; a torpedo direct hit on r 50 gives 6 pieces and
   on r 35 gives 4, each `0.9 · r / √n`, total piece area ≤ the parent's; blast damage and push fall off linearly to
   zero at the radius; the ship hull-cost examples of §5.1; eviction picks the smallest moving rock; a rock target clears
   when its rock breaks and when its slot is reused; a rock-targeted torpedo homes on a moving rock and hits it.
4. **Feel proxies** (scripted, logged in the report, not pass/fail beyond these floors): one torpedo into each of the
   10 largest belt rocks (crew stationary 300 u away, aimed on it) produces at least 4 pieces and at least 2 damaging
   collisions within 5 s in at least 7 of the 10; the report logs pieces, collisions, breaks and the farthest piece
   travel per shot.
5. **Cost**: tactical `stepDuel` p99 under 0.5 ms in the stress script on the dev PC; snapshot values, full image,
   20 Hz delta images (median and max, with 0 and with 60 moving rocks) and publication cost per tick measured against
   master and spike i, as spike i's report did. No pass threshold beyond the existing publication budgets (host 1.5 ms,
   client 1.0 ms), which must still hold.
6. **Existing gates**: the whole suite green; `duelGates` passes (median round in 180 to 300 s, the crew wins and loses);
   `npm run test:duel-app-runtime` passes.
7. **Screenshots** (staged with the solo hook, CRT map): a laser chipping a rock with sparks, a laser split with pieces
   streaking, a torpedo blast's shockwave mid-expansion, the belt seconds after a blast, a piece striking the crew ship,
   a rock wearing a laser target bracket.

## 10. Deliverables

- The build on `spike/asteroids-ii` (SIM bumped on the branch only), playable in single player.
- `docs/superpowers/research/2026-11-18-asteroid-spike-ii.md`: what was built, the numbers of §9, what felt good and not,
  the `ROCK_GRAVITY` note, the risks, and a recommendation (ship / ship simpler / drop), plus the steps for the owner's
  play test: sit at Weapons, drop the torpedo on a belt rock near the Hunter, laser a rock, ram a piece.
- Screenshots in `C:\Users\djuar\FTLite-shots\asteroid-spike-ii\`.

## 11. Risks

1. **Belt erosion**: moving seeded rocks never re-enter the grid; a long round with many blasts leaves many moving
   bodies and a thinning belt. Measured by the stress script (moving count over time).
2. **Chaos for tests and tuning**: as spike i found, any rock event changes the rest of a round. Fixtures pinned to
   scripted ticks will need re-finding after the merge and after this change.
3. **Pair cost**: moving-moving contacts are O(n²) over at most 86 + 96 movers (about 16,500 pairs a tick at worst). The
   p99 budget in §9.5 decides whether a moving-rock grid is needed; not built unless it fails.
4. **Snapshot growth**: the pool grows to (86 + 96) × 7 values plus ship grace for 96 more bodies. Measured, spike only.
5. **Duel gates**: pieces flying into ships may shorten rounds; if `duelGates` fails, tune `BLAST_SHIP_PUSH`, the hull
   cost thresholds or `ROCK_FLING` within the spike and say so in the report.
