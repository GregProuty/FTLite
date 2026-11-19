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
- **Hp is a real number**, `hp = ceil(r / 10)` at birth (2 to 6). Damage may be fractional (§3.3, §4.2, §5.1). A rock breaks the
  moment hp ≤ 0. The crack rendering reads `hp / hpMax`, with `hpMax = ceil(r / 10)` recomputed from r.
- **Static becomes moving, never the reverse.** A seeded rock sits still (kind 1) until it **wakes**: a laser push or a
  blast always wakes it; a rock-rock contact (§3.3) or a ship's ram (§5.1) wakes it only when the closing speed exceeds
  `ROCK_WAKE_SPEED = 40` u/s. Then it is kind 2 for good. A kind-1 rock that does not wake is treated as infinitely
  heavy for that contact: it takes no velocity and no position change. The grid invariant from spike i holds: the
  never-rebuilt grid indexes only seeded slots, a grid hit counts only while its slot is still kind 1, and a kind-1 rock
  never moves. A seeded slot reused for a piece holds kind 2, so the grid ignores it and the scan finds it. Moving rocks
  (seeded or pieces) are found by the linear scan.
- **The born mask.** A per-tick transient array (one flag per slot, not hashed, not snapshotted, cleared at the start
  of every `stepDuel` tick, so a save between ticks never needs it) marks every slot written with a new piece this
  tick. A born slot does not move this tick, is skipped as either body in rock-rock contacts this tick (§3.3), is
  skipped by ship contacts this tick (§5.1), is not hit by the blast that made it (§4.2), and is never chosen for
  eviction (§3.4).
- **Single-ship flight paths.** `stepFlight` and `stepSoloFlight` (`physics.ts`; the flight-only modes that call the
  contacts but not `stepRocks`) keep today's contact exactly: a rock contact there is today's `hitStatic` (infinite
  mass, hull cost 1), with no wake, no ram damage, no break and no use of the born mask.

### 3.2 Motion (`stepRocks` part 1: every kind-2, not-born rock in ascending slot order)

- Gravity at `ROCK_GRAVITY = 1.0` × the ships' gravity, then drag `v ← v · (1 − ROCK_DRAG · dt)` with `ROCK_DRAG = 0.1`
  per second, then a speed cap `ROCK_MAX_SPEED = 300` u/s (scale the velocity down to it), then semi-implicit Euler.
  Velocity changes from hits between motion steps are not capped until the next motion step.
- All motion happens before any contact (part 2). The planet and edge test is the first step of each rock's turn in
  part 2.
- Tuning risk, to report: with gravity on, a pushed belt rock never comes to rest and drifts slowly toward the planet
  (about 1.7 u/s² at the belt). `ROCK_GRAVITY` is a knob; the report says what 1.0 and 0.0 feel like.

### 3.3 Rock-on-rock collisions

`stepRocks` part 2, after all motion. A transient per-tick **processed mask** (like the born mask, not hashed) records
which slots have had their turn as `a`.

- **Outer loop, live**: for slot `a` from 0 upward to the pool's end, reading kinds as they stand now, `a` takes a turn
  when it is kind 2 and not born. (A rock woken earlier in this pass at a higher slot therefore takes its turn; one
  woken at a lower slot does not, but its pairs with later rocks are still resolved from their side, below.)
- **Turn of a**: first the planet and edge test: a rock touching the planet, or whose centre is outside the map
  (`x² + y² > R_MAP²`), turns to dust (§3.5) and its turn ends. Otherwise take `rocksNear(a)` once, ascending, and for
  each `b ≠ a` in it: skip `b` if it is no longer alive, is born, or is processed; else resolve the pair if they touch.
  If `a` breaks during its turn, its turn ends at once. Mark `a` processed when its turn ends.
- **Resolving a touching pair**, normal `n` from b to a (zero distance: `n` = north, as in `damageRock`), closing speed
  `vc = (vb − va) · n`:
  - **Wake**: a kind-1 `b` wakes when `vc > ROCK_WAKE_SPEED`; otherwise it stays kind 1 and counts as infinitely heavy.
  - **Separate** by the overlap: shared by inverse mass when both are kind 2; all of it to `a` when `b` is kind 1.
  - **Bounce**, only when `vc > 0`, with restitution `ROCK_RESTITUTION = 0.8`: impulse
    `j = (1 + e) · vc / (1/ma + 1/mb)` along `n`, with `1/mb = 0` for a kind-1 `b`. Both kind 2: momentum along `n` is
    conserved (to floating point).
  - **Damage**, only when `vc > ROCK_CRUSH_SPEED = 30` u/s: `base = (vc − 30) / ROCK_CRUSH_STEP` with
    `ROCK_CRUSH_STEP = 40`; `da = base · 2·mb / (ma + mb)` and `db = base · 2·ma / (ma + mb)` (masses `r²` here even
    for a kind-1 `b`). Equal rocks take `base` each; the lighter takes more. **Both amounts are worked out first, then
    applied, a then b**, and only then are any breaks done (a's first). A break uses the collision normal as its hit
    direction (`n` for a, `−n` for b) and the rock's post-bounce velocity as the parent velocity.
- No grace window between rocks: separation plus the closing-speed test stops repeat damage on resting contacts.

### 3.4 Breaking

When a rock's hp reaches ≤ 0 it breaks at once. The **hit direction** `u` (unit) and the **cause** come from what broke
it (a shot's line, the blast's centre-to-rock direction, a collision normal, a ram).

Belt rocks have r 15 to 45 (never 45: `map.ts` draws 15 + u · 30, u < 1) and cluster rocks r 20 to 55, so the
thresholds below are set so that belt rocks split too.

- **Laser, blast-secondary, collision or ram break** (the fan pattern):
  - `r ≥ 40`: 3 pieces; `13 ≤ r < 40`: 2 pieces; `r < 13`: dust (`FAN_TRIPLE_MIN_R`, `FAN_SPLIT_MIN_R`; at r 13 each
    piece is about 8.27).
  - Tuned 2026-11-18 from 25 after the §9.4 feel proxy (1/10) so chain breaks keep making pieces.
  - Piece radius `rp = 0.9 · r / √n`. Pieces with `rp < ROCK_MIN_R = 8` are dust instead.
  - Directions: fanned across the 120° in front of `u`, piece k of n at `θk = −60° + 120° · (k + 0.5) / n` from `u`
    (2 pieces: ±30°; 3 pieces: −40°, 0°, +40°). Speed `ROCK_FLING = 150` u/s plus the parent's velocity.
- **Torpedo direct hit** (the rock the torpedo touched; the burst pattern):
  - `r ≥ 35`: 6 pieces; `25 ≤ r < 35`: 4 pieces; `r < 25`: dust.
  - Same radius rule (r 35, n 6: rp about 12.9; r 25, n 4: 11.25). Directions: a full circle, `θk = 360° · k / n`
    rotated from `u` (the torpedo's velocity relative to the rock; zero: north), so one piece flies straight on. Speed
    `ROCK_BLAST_FLING = 200` u/s plus the parent's velocity.
- Pieces start at `centre + dir · 0.6 · r`, kind 2, `hp = ceil(rp / 10)`, fresh contact grace on every ship (spike i's
  `freshGrace`), and are marked born (§3.1).
- Angles are fixed fractions of a turn (multiples of 15°, 20°, 30°, 60°), so directions come from a table of cos/sin
  values written as literals and rotated onto `u` by multiplication. No `Math.cos` / `Math.sin` at run time; the
  determinism guard (`tests/helpers/determinismGuard.ts`) allows `+ − × ÷`, abs, ceil, floor, round, min, max, sign,
  imul and sqrt.
- **Slot use**: the first piece keeps the broken rock's slot; the others take the lowest empty slots, ascending. When no
  slot is free: if some kind-2 rock that is **not born this tick and not either body of the contact being resolved** is
  smaller than the new piece, the smallest such rock (ties: the lowest slot) is turned to dust and its slot reused
  (`rockEvictions` + 1); otherwise the new piece is dust. Never silent: every dust emits an event.
- **A slot rewritten this tick is a new rock.** Any damage, push or contact computed against a slot that is born this
  tick is skipped; `damageRock` and the push helpers check the born mask, so a reused slot can never take a hit meant for
  the rock that used to be there.

### 3.5 Dust

Dust is visual only: the slot is cleared, a `rock` event with `what: 'dust'` (§8) carries its position, radius and
velocity, and the renderer throws a puff of particles along that velocity.

## 4. Weapon hits on rocks

### 4.1 Laser shot

A laser shot that meets a rock (aimed at it, §6, or in the way of the enemy, or the aimless nose ray of spike i) does
`LASER_ROCK_DAMAGE = 2` (up from 1) and gives the rock a push `LASER_ROCK_PUSH = 4000` along the shot line: `Δv = J / m`
(r 15: about 18 u/s; r 45: about 2 u/s). Push first, then damage. A kind-1 rock wakes (§3.1).

### 4.2 Torpedo blast

A torpedo that touches any rock (on purpose or not) **detonates** at its position, `BLAST_RADIUS = 120`:

1. The rock it touched takes the direct hit: it breaks at once (§3.4, the burst pattern), whatever its hp.
2. Every other live rock whose surface is within the radius (`d = max(0, dist − r) < 120`, distance from the blast point)
   takes `fall = 1 − d / 120`:
   - damage `BLAST_ROCK_DAMAGE_MIN + (BLAST_ROCK_DAMAGE_MAX − BLAST_ROCK_DAMAGE_MIN) · fall` with 2 and 6;
   - push `Δv = BLAST_PUSH · fall / m` along the blast-to-rock direction (zero distance: north),
     `BLAST_PUSH = 60000` (r 45 at fall 1: about 30 u/s; r 15: about 267 u/s; anything above `ROCK_MAX_SPEED` is cut
     at the next motion step);
   - push first, then damage; a rock this breaks uses the **laser pattern** (2 or 3 pieces fanned outward along the
     blast-to-rock direction). Only the touched rock gets the 4 to 6 piece burst.
   - The list of rocks in the radius is taken once, ascending, before the direct hit's pieces are written; each is
     then processed in order, skipping any slot that is born (§3.4) or no longer alive. Pieces born from the blast are
     not hit by it.
3. Every active ship within the radius (surface distance, ship radius) is pushed `Δv = BLAST_SHIP_PUSH · fall` along
   the blast-to-ship direction, `BLAST_SHIP_PUSH = 120` u/s. No hull damage from the blast.
4. The torpedo ends with cause `'asteroid'` as now. A torpedo that lands on a ship does not blast (unchanged rules).

## 5. Ships and rocks

### 5.1 Contact

Ship-rock contact (`contacts.ts`) becomes two-body. For ship s (mass `SHIP_MASS`) and rock k touching, normal n from rock
to ship, closing speed `vc = (vk − vs) · n`:

Ships meet rocks in ship contacts as today (each active ship in slot order, the planet then `rocksNear`, the list taken
once), skipping slots that are born or no longer alive.

1. **Wake test first.** A kind-1 rock wakes only if `vc > ROCK_WAKE_SPEED` (40 u/s), and never in the single-ship
   flight paths (§3.1).
2. **A kind-1 rock that does not wake is infinitely heavy, exactly as today**: full push-out of the ship, the ship's
   normal speed reflected with `RESTITUTION = 0.5` (`contacts.ts` today), and the hull cost of today
   (`ASTEROID_CONTACT_HULL = 1`). Flying into the still terrain keeps the Helm's current tuning; the speed-scaled cost
   below is for moving rocks only.
3. **A kind-2 rock (or one that just woke)** is a two-body contact: the overlap shared by inverse mass; impulse
   `j = (1 + RESTITUTION) · vc / (1/ms + 1/mk)` along n applied to both, only when `vc > 0`; `impact = vc · mk / (mk + ms)`.
- **Hull cost for case 3** (outside the pair's grace, as now): `min(4, 1 + floor(max(0, impact − 40) / 40))`. A gentle
  bump costs 1, as today. Examples: r 15 piece at 200 u/s: impact 40, cost 1; r 30 piece at 200: 100, cost 2; r 45 piece
  at 250: about 173, cost 4. (A ship that hits a static rock hard enough to wake it is case 3: r 45 at 200 u/s, impact
  about 138, cost 3.)
- **Rock damage from a ram** (any of the three cases, outside the pair's grace, applied after the bounce): the rock takes
  `max(0, vc − ROCK_CRUSH_SPEED) / ROCK_CRUSH_STEP · 2·ms / (ms + mk)` (the §3.3 formula with the ship as the other
  body). A break uses `u = −n` (from the ship into the rock) and the rock's post-bounce velocity. Ramming a small
  cracked rock can break it.

### 5.2 Torpedoes and pieces

A torpedo meets moving rocks exactly as static ones (spike i): it touches, it detonates (§4.2).

## 6. Targeting rocks

### 6.1 State and commands

- Each ship system gets three new fields, hashed, snapshotted and cloned with the other system fields:
  - `laserRock`: the laser's rock target, a slot or −1.
  - `torpRock`: the next torpedo's rock target, a slot or −1 (a single shot, like `torpLock`).
  - `torpRockFlying`: the flying torpedo's rock, a slot, −1 (no rock: the torpedo follows today's rules) or −2 (its
    rock broke: it flies unguided). Like `torpRoom`.
- A new crew command `rockLock { weapon: 'laser' | 'torpedo', rock: number }`:
  - **Wire**: added to the duel command kinds (`DUEL_KINDS` in `sim/duel/step.ts`), the command union and its codec
    (`src/renderer/src/net/codec.ts`), and `WEAPON_ORDER` right after `torpLock`
    (`laserLock, torpLock, rockLock, laserCharge, missileLaunch`).
  - **Admission of `missileLaunch`** in the same tick evaluates `canLaunch` with the effective `torpRock`: the last
    accepted `rockLock(torpedo)` of this tick, else the stored value, so its result matches what applyWeaponsInput
    then does.
  - **Validation**, in step.ts with the other weapon commands: stale first, then the same seat rule as `laserLock`
    (`not-at-weapons` unless sent by the Weapons seat's player), then `malformed` unless `weapon` is one of the two and
    `rock` is an integer from −1 to `rockSlots − 1`, then `noop` when `rock ≥ 0` and the slot holds no live rock. Within
    the tick the last accepted `rockLock` per weapon wins.
  - **Folding**: into a new `ShipInput.rockLock: { laser: number | null; torpedo: number | null }` (null: no command),
    applied in `applyWeaponsInput` after `laserLock` and `torpLock` and before `stepBurst`. So a same-tick `rockLock`
    beats a same-tick room lock for the same weapon.
  - **Laser effects**: `rockLock(laser, k ≥ 0)` sets `laserRock = k` and `laserTargeted = true` (the crew auto-fire
    reads it). `rockLock(laser, −1)` sets `laserRock = −1` and `laserTargeted = false` (today's right-click effect).
    An accepted `laserLock` (room or −1) sets `laserRock = −1` before its own effect.
  - **Torpedo effects**: `rockLock(torpedo, k ≥ 0)` sets `torpRock = k` and `torpLock = −1`; `rockLock(torpedo, −1)`
    sets `torpRock = −1`. An accepted `torpLock` sets `torpRock = −1` before its own effect.
- **A rock target clears itself**: whenever a slot is cleared or rewritten (break, dust, eviction; §3.4), every
  `laserRock` and `torpRock` equal to it becomes −1, and every `torpRockFlying` equal to it becomes −2. So a reused slot
  is never mistaken for the old rock.

### 6.2 Laser with a rock target

- While `laserRock ≥ 0` the laser aims at that rock, not the enemy. It is **on target** when the rock's centre is inside
  the laser's arc and the rock's surface within the laser's range (`dist − r ≤ range`). The shot's line runs from the
  ship to the rock's centre; spike i's `firstBlocker` on that line decides what it meets: the planet (the shot misses),
  another rock (that rock takes the hit, an accident) or the target rock.
- `firstBlocker` skips born slots (the line passes through a piece made earlier this tick).
- A manual shot while `laserRock ≥ 0` and the rock is not on target follows today's miss path (the blocked enemy line or
  the nose ray, spike i).
- The laser's fire rules are today's (charge, manual fire, the crew auto-fire, the burst), with `laserEligible` replaced
  by "on target" while `laserRock ≥ 0`. Auto-fire therefore needs `laserTargeted`, which `rockLock(laser, k)` sets. The
  Weapons card's FIRING flash and reason row use the same test, with today's words (`LASER: OUT OF ARC: HELM TURN
  RIGHT`, `OUT OF RANGE`).
- A burst's later shots re-aim at the rock as it now stands. If the rock broke, `laserRock` is −1 and they follow
  today's enemy rules.

### 6.3 Accidental hits, AUTO_DIG and hostility

- A laser shot at the enemy whose line is blocked by a rock hits that rock (spike i, kept). The aimless nose ray (no
  target in reach) also stays.
- **`AUTO_DIG` is false.** The laser never fires on its own just because a rock is in the way; digging is chosen by
  dropping the laser on the rock.
- **Hostility is unchanged**: every crew laser shot and torpedo launch counts in `shots` and `missilesLaunched` as
  today, so shooting rocks during the Hunter's hold ends the hold (`science.ts`). Gunfire is gunfire.

### 6.4 Torpedo with a rock target

- **Range**: while `torpRock ≥ 0`, `torpedoInRange` (and so `canLaunch` and the card's IN RANGE / OUT OF RANGE) tests
  the rock's centre distance against the class's torpedo range, instead of the target ship's.
- **Launch**: the crew's auto-launch fires when `torpRock ≥ 0` and `canLaunch` holds, as it does today for
  `torpLock ≥ 0`. `launchMissile` copies `torpRock` into `torpRockFlying` and clears `torpRock` (single shot), as it
  does `torpLock` into `torpRoom`. A manual `missileLaunch` with `torpRock ≥ 0` does the same.
- **Homing**: while `torpRockFlying ≥ 0`, `homingTurn` uses that rock's position and velocity in place of the target
  ship's. At −2 it returns 0 (unguided). At −1 it is today's homing on the enemy.
- The missile's end (any cause) sets `torpRockFlying = −1`, as it does `torpRoom`.
- A `rockLock(torpedo)` while a torpedo flies sets the next shot's target only.
- It detonates on whatever rock it touches first (§4.2), which may not be its target.

### 6.5 UI (map views)

- A new controller method `pickRock(slot)` in `contactController.ts`: valid only while a weapon is picked up; it emits a
  request the duel mode turns into `rockLock { weapon, rock: slot }`, then disarms the pick-up and closes the contact
  window. The scan request that today's `pickUp` makes below Level 1 stands (it was sent at pick-up).
- A new pure `pickRock` hit test in `render/tactical/tacticalModel.ts` beside `pickContact`, returning the slot of the
  live rock under the pointer (the nearest centre among rocks whose drawn circle contains it; ties: lowest slot) or null.
  The scene asks `pickContact` first: **a ship contact under the pointer wins over a rock**.
- While a weapon is picked up, the rock under the pointer shows a hover bracket in the weapon's mark.
- A targeted rock wears that weapon's bracket (laser and torpedo marks differ, both on the CRT amber ramp) until the
  target clears.
- The card's target words read `TGT ROCK` while that weapon's rock target (`laserRock`, or `torpRock` /
  `torpRockFlying ≥ 0` for the torpedo) is set.
- A right-click on the LASER card sends `rockLock(laser, −1)` when `laserRock ≥ 0`, else today's `lock(−1)`; on the
  TORPEDO card, `rockLock(torpedo, −1)` when `torpRock ≥ 0`, else today's `torpLock(−1)`.
- The drop works from any map view that allows a pick-up today (Helm and Weapons). The sim's seat rule decides: a
  `rockLock` from a player not at Weapons is rejected `not-at-weapons`, exactly as a room drop is. In single player
  the solo seat handling applies as it does to `laserLock`.
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
  (x, y the contact point), `split` carries `pieces`, and `ship` names the ship whose laser hit, torpedo (its direct
  hit and every break its blast causes) or ram caused it; `ship` is absent for breaks caused by rock-rock collisions,
  the planet, the edge and eviction. Spike i's `'shatter'` is renamed `'dust'` and `'fragment'` becomes `'collision'`.
- Counters (in the space module, hashed): `rockHits`, `rockSplits`, `rockDust`, `rockBlasts`, `rockCollisions`
  (damaging rock-rock contacts), `rockEvictions`. Per ship system: `rocksBroken`, + 1 per rock break whose cause is that
  ship (its laser hit, its torpedo's direct hit or blast, its ram), counted once at the break however many events the
  break emits. Overflow-piece dust, eviction, the planet and the edge are not breaks. Chain breaks from collisions do
  not count.

## 9. Measurement and acceptance

The spike is accepted for the owner's play when all of these hold:

1. **Determinism**: twin runs over seeds 1 to 20 agree (hash every 500 ticks over 4,000 ticks) in a **stress script**
   that fires a torpedo into the belt every 10 s and the laser at rocks whenever charged; save and restore at tick 4,000
   then 1,000 more ticks agree; the checkpoint continuation test passes; goldens re-blessed by the two-step procedure;
   `boundary.test.ts` passes on every touched sim file.
2. **Broad phase**: `rocksNear` agrees with brute force while seeded rocks are moving and pieces are flying (spike i's
   test, extended).
3. **Physics unit tests**: a rock-rock collision conserves momentum along n (within 1e-9 relative); no damage at
   `vc ≤ 30`; the lighter rock takes more; a laser push gives `Δv = J/m`; a torpedo direct hit on r 50 and on r 35 gives
   6 pieces, on r 30 gives 4, on r 20 dust, each `0.9 · r / √n`, total piece area ≤ the parent's; a laser break on
   r 42 gives 3, on r 30, r 20 and r 13 gives 2 (r 13: about 8.27 each), on r 12.9 and r 12 dust; a kind-1 rock touched at `vc ≤ 40` stays kind 1 and does not move;
   the born mask keeps a reused slot from taking the old rock's pending damage; a pair is resolved once per tick; blast damage and push fall off linearly to
   zero at the radius; the ship hull-cost examples of §5.1; eviction picks the smallest moving rock; a rock target clears
   when its rock breaks and when its slot is reused; a rock-targeted torpedo homes on a moving rock and hits it.
4. **Feel proxies** (scripted, logged in the report, not pass/fail beyond these floors). Setup per shot: a fresh duel
   on seed 2026, the Hunter inactive, the crew ship placed at the rock's centre plus 300 u along the outward radial
   (away from the planet), at rest, facing the rock, with `rockLock(torpedo, rock)`; the test ends 5 s after the blast.
   For each of the 10 largest belt rocks: count the pieces made (the direct hit plus every secondary break) and the
   damaging collisions among rocks that are either pieces of this blast or were hit by it. Floor: at least 8 pieces
   (the direct hit gives 6, so at least one secondary break is needed)
   and at least 2 damaging collisions in at least 7 of the 10. The report also logs breaks, the farthest piece travel
   and the moving-rock count 30 s after the blast.
5. **Cost**: a pass gate: tactical `stepDuel` p99 under 0.5 ms over the stress script on the dev PC. If it fails,
   build a moving-rock grid (rebuilt each tick, same ascending, no-repeat `rocksNear` contract) and re-measure; the
   spike is not accepted until it passes. Also measured and reported, with no threshold beyond the existing publication
   budgets (host 1.5 ms, client 1.0 ms, which must still hold): snapshot values, full image, 20 Hz delta images (median
   and max, with 0 and with 60 moving rocks) and publication cost per tick, against master and spike i, as spike i's
   report did.
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

1. **Belt erosion and wake cascades**: moving seeded rocks never re-enter the grid and, with gravity on, never come
   to rest; a drifting rock can wake neighbours when it reaches them above `ROCK_WAKE_SPEED`. A long round with many
   blasts leaves many moving bodies and a thinning belt. Measured by the stress script: the moving count every 10 s.
2. **Chaos for tests and tuning**: as spike i found, any rock event changes the rest of a round. Fixtures pinned to
   scripted ticks will need re-finding after the merge and after this change.
3. **Pair cost**: moving-moving contacts are O(n²) over at most 91 + 96 movers (maps have 82 to 91 seeded rocks, by
   seed), about 17,000 pairs a tick at worst. §9.5's gate decides whether the moving-rock grid is built.
4. **Snapshot growth**: the pool grows to (82 to 91 + 96) × 7 values plus ship grace for 96 more bodies. Measured,
   spike only.
5. **Duel gates**: pieces flying into ships may shorten rounds; if `duelGates` fails, tune `BLAST_SHIP_PUSH`, the hull
   cost thresholds or `ROCK_FLING` within the spike and say so in the report.

## 12. As built: the merge with master (Valkyrn, Sci-2, Web-i, CRT menu; SIM 54, 2026-11-18)

- **Gun rounds and rocks.** The Valkyrn's minigun rounds (`sim/tactical/gun.ts` `stepRounds`) sweep the live rock pool
  `state.rocks` as it stands when the sweep runs (after `stepRocks` moved the rocks this tick, the same post-move moment
  the round tests the ships at), found with `rocksNear` as the laser's `firstBlocker` does, ties by ascending slot, and,
  like `firstBlocker`, a piece born this tick is not in the way. A gone seeded rock no longer stops a round. A round that
  meets a rock is **absorbed**: it ends, as on master, and the rock takes nothing (no push, no wear, no `rock` event, no
  `rockHits`). A laser-style chip was rejected: the gun fires 10 rounds a second, and a full laser hit each (2 damage,
  `LASER_ROCK_PUSH`) would shred the belt; a fractional chip needs a per-rock wear field (a new rock stride and hashed
  state) for a spike. Test: `tests/valkyrnRoundsRocks.test.ts`.
- **A class without a laser** (Valkyrn spec §6.1): `rockLock(laser)` is rejected `unavailable` at admission, as
  `laserLock` and `laserCharge` are, and `applyWeaponsInput` ignores a laser rock target for such a class; the rock
  helpers (`rockOnTarget`, `laserRockTarget`, `inLaserReach`, the laser's rock situation) answer "no" without a laser.
  `rockLock(torpedo)` works on every class. The Flight seat forwards a card's rock clear (`rockTo`) and a contact-window
  rock request to `rockLock` (the laser's only on the laser fit); map clicks on the Flight seat stay the gun's, so a rock
  drop on the map is from the Weapons seat only.
- **Hash and snapshot.** The systems record carries both sides' fields: the four rock fields, then the gun's eight, then
  `rooms` and `gunRoomWear`; the space module has the round pool after the missiles and the rock pool and its counters
  last. Validation and the compile-time completeness checks cover both.
- **Tuning.** No rock knob moved; this spec's gates pass unchanged. The Valkyrn gate needed one pilot retune
  (`PILOT_ORBIT_R` 1850 → 2200, Valkyrn spec §12).
