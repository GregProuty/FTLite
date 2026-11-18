# Spike report: billiard asteroids (2026-11-18)

Spec: `docs/superpowers/specs/2026-11-18-asteroids-ii-design.md`. Plan: `docs/superpowers/plans/2026-11-18-asteroids-ii.md`.
Branch `spike/asteroids-ii`, built on spike i's merged tip. SIM_VERSION goes 52 → 53 on this branch only. This branch is
not for merge: if the owner plays it in single player and says yes, it gets a proper spec and build. Spike i
(`docs/superpowers/research/2026-11-17-asteroid-spike.md`) found its fragments slow, short-lived and nearly irrelevant.
This spike does the opposite: rocks are real bodies. They take pushes, bounce off each other, crack each other and fly
into ships.

## What was built

- **Task 1: the pool, constants, masks, events and fields.**
  - `rockTuning.ts` holds every spec value.
  - The pool has `ROCK_RESERVE 96` reserve slots. Mass is `m = r²` and hp is real, `hp = ceil(r/10)`, with `rockHpMax`.
  - New counters: `rockDust`, `rockBlasts`, `rockCollisions` and `rockEvictions`.
  - Two transient masks, `rockBorn` and `rockDone`, are not hashed and not snapshotted, and are cleared by
    `beginRockTick` at the start of every tick.
  - New ship fields: `laserRock`, `torpRock`, `torpRockFlying` and `rocksBroken`.
- **Task 2: breaking (`rockBreak.ts`).**
  - The fan pattern (laser, collision, ram and blast-secondary breaks) gives 3 pieces from r ≥ 40, 2 from r ≥ 13, and
    dust below that.
  - The burst pattern (a torpedo's direct hit) gives 6, 4 or dust. Each piece is `0.9 · r / √n`, flung at
    `ROCK_FLING 150` or `ROCK_BLAST_FLING 200` u/s.
  - Piece 0 keeps the broken rock's slot. The others take the lowest empty slots. With no slot free, a piece evicts the
    smallest moving rock smaller than itself, or becomes dust.
  - Every dust emits an event. A rock target clears itself whenever its slot is cleared or rewritten.
- **Task 3: motion and rock-on-rock contact (`rockContacts.ts`).**
  - Motion: gravity × `ROCK_GRAVITY 1.0`, drag `0.1`/s, a cap of `300` u/s, then semi-implicit Euler.
  - Contact: a live ascending outer loop. Each pair wakes, separates and bounces (restitution `0.8`).
  - Crush damage is `(vc − 30) / 40` above 30 u/s, and the lighter rock takes more.
  - A static rock touched at 40 u/s or less stays static.
- **Task 4: the laser on rocks (`rockWeapons.ts`).**
  - A shot that meets a rock does 2 damage and pushes it (`J 4000`, `Δv = J/m`).
  - A rock can be the laser's target on purpose. A rock in the way takes an off-target shot by accident.
  - `AUTO_DIG` is off. Hostility is unchanged.
- **Task 5: the torpedo's area blast (`rockBlast.ts`).**
  - Radius `120`. Rock damage falls linearly from 6 at the centre to 2 at the edge. Push `60000 · fall`.
  - Ships in the radius get `120 · fall` u/s of push and no hull damage.
  - A torpedo can be rock-targeted: it homes on a moving rock and detonates on any rock it meets. Pieces born this tick
    are skipped.
- **Task 6: ships and rocks (`contacts.ts`).**
  - Contact between a ship and a rock is two-body, with `SHIP_MASS 900` and restitution 0.5.
  - Hull cost is `min(4, 1 + floor(max(0, impact − 40) / 40))`.
  - A ram does crush damage to the rock, so a ship can break a rock by flying into it.
  - The single-ship flight modes keep today's `hitStatic`.
- **Task 7: the `rockLock` command.** It goes on the wire (codec), is validated, ordered after `laserLock` and
  `torpLock`, and folded into the tick. Missile-launch admission uses the effective `torpRock`.
- **Task 8: the UI.**
  - `pickRock` on the Weapons map: click a weapon, then a rock.
  - Rock brackets: laser hot corners, torpedo dashed ring, hover.
  - The cards show `TGT ROCK`. Right-click a weapon to clear it.
  - The command goes through runtime and online play.
- **Task 9: the feel (view only).**
  - Visuals: laser chips and specks, a blast shockwave ring and core, motion streaks on moving rocks, and cracks from
    `hp / hpMax`.
  - Screen shakes for breaks and blasts on the map views.
  - Rock sounds.
  - A `ROCKS n` tally on the Weapons card (`rocksBroken`).
- **Tasks 10 and 11: gates and measurement.** Task 10: goldens and pins at SIM 53. Task 11: the stress, feel and size
  measurements. Then one tuning step (below).

**Deviations from the spec, each justified in the plan's "Deviations and clarifications":**
1. Missile-launch admission uses an effective `torpRock` of −1 when a `torpLock` was accepted this tick and no
   `rockLock(torpedo)` was.
2. Event fields:
   - `split` carries `pieces: number[]`, and a rock-rock `bump` carries `other`.
   - A lost piece emits `dust` with `rock: −1`.
   - Eviction dust carries `evicted: true`, so it is not counted as a break.
3. `hit` events come from laser and blast damage only. Collision and ram damage emit `bump`.
4. `pickRock`'s hit radius is floored at 6 px, so a dot-sized rock can still be clicked.
5. A rock-targeted shot that is off target follows spike i's miss path. When that finds nothing, the miss beam is drawn
   to the end of the nose ray.
6. Born slots: `lineOfSight` skips them, as `firstBlocker` does.
7. The status line names the rock (`ROCK OUT OF RANGE: CLOSE TO 450`). The enemy FIRING SOLUTION bracket is hidden
   while the laser has a rock target.
8. The new UI fields are optional, so the existing test fakes compile untouched.
9. The blast fall-off test checks the §4.2 formula exactly: push falls to 0, damage falls to 2 at the edge, then
   nothing beyond it.
10. The stress script drives the crew: it parks the ship by the belt, keeps the hull full, tops up the magazine and
    turns the nose onto the laser's rock. The Hunter is switched off.
11. **Tuning, 2026-11-18:** the fan's 2-piece threshold went from r ≥ 25 to **r ≥ 13** (`FAN_SPLIT_MIN_R`).
    - Why: the first feel-proxy run passed 1 of 10 shots. Chain breaks of small belt rocks and of the r ≈ 12–13 burst
      pieces all crumbled to dust, so a torpedo made 6 pieces and stopped.
    - Effect: at r 13 each piece is ≈ 8.27, just above `ROCK_MIN_R 8`, so the cascade keeps going one more step.
    - The spec's §3.4 and §9.3 were updated to match.

## Numbers

All numbers are from `scripts/spike-asteroids-ii-measure.ts` and `scripts/profile-duel-publication.ts`. The committed
JSON is in `docs/superpowers/research/2026-11-18-asteroid-spike-ii/`. Numbers are after the tuning unless a row says
otherwise.

### Determinism
| check | result |
|---|---|
| Twin runs, seeds 1–20 × 4,000 ticks of the stress script, hashed every 500 ticks | **all agree**, in all three runs (`failures` empty) |
| Save and restore at tick 4,000, then 1,000 more ticks | **all 20 agree**, in all three runs |
| Spike i's scripted-duel twins and save/restore, run on this branch | no failures in three runs |
| Checkpoint continuation (`tests/duelCheckpoint.test.ts`) | passes at **SEED 2 / SPLIT 7195**. Seed 1 no longer has a qualifying tick. After the tuning, the round is a crew loss at tick 14424. |
| Goldens | re-blessed by the two-step procedure in Task 10: same-version bless at 52, canonical-trace and duel-oracle baselines at 52 (both "identical" on the check), bump to 53, version-only bless. A same-version bless at 53 followed the tuning. No `--fresh`. |
| `boundary.test.ts` (the determinism guard on every touched sim file) | passes. The whole suite is green: 367 files, 4,895 tests. |

### Cost (tactical `stepDuel` per tick over the stress script, median of 3 runs)
| median | p99 | max | gate p99 < 0.5 ms |
|---|---|---|---|
| 0.0099 ms | **0.0299 ms** | 1.31 ms (single outlier ticks, likely GC) | **PASS**, about 17× under the gate |

The moving-rock grid was **not built**, because the gate passed by a wide margin. Before the tuning the numbers were
0.0070 / 0.0292 ms. The median rose because more rocks are moving, but p99 did not.

### Snapshot and publication
These use spike i's measure script on each tree for like-for-like numbers: seed 2026, tick 3000. The 60-mover delta
comes from this spike's own script.

| | master 21b41758 (SIM 51) | spike i 577bb00c (SIM 50) | spike ii (SIM 53) |
|---|---|---|---|
| snapshot values | 967 | 1,866 | 2,454 |
| snapshot JSON | 3,238 B | 9,386 B | 10,906 B |
| full image (`encodeFull`) | 8,335 B | 15,527 B | 20,231 B |
| 20 Hz delta, median / max, no moving rocks seeded | 841 / 1,177 B | 841 / 1,177 B | 1,093 / 1,249 B |
| 20 Hz delta, with movers | n/a | 1,274 B (10 fragments) | 1,718 B (that script's fragment case). With **60 movers** (`delta60`): median **5,078 B**, max 5,354 B. There were 60 movers at the start and **88 at the end** of the 300 ticks, because the fan keeps splitting. |
| publication, host ms per tick (budget 1.5) | 0.478 | 0.738 | 0.822 (0 movers seeded, 3 natural); 0.810 with `--movers 60` |
| publication, client ms per publication (budget 1.0) | 0.321 | 0.511 | 0.557 (0 movers); 0.543 with `--movers 60` |

- Everything is within budget.
- Spike ii's publication cost is about 1.7× master's and 1.1× spike i's. The master and spike i rows were measured a
  day earlier on a somewhat slower-reading PC, so compare ratios, not absolutes.
- Movers barely change the publication cost, because the pool's size is fixed. They do grow the 20 Hz delta, about
  4.6× at 60 to 88 movers.

### Feel proxies (§9.4)
Seed 2026, Hunter off, crew at rest 300 u outward of each of the 10 largest belt rocks, one rock-targeted torpedo each.

| rock | r | blasted | pieces | breaks | damaging collisions | farthest travel (u) | moving at 30 s |
|---|---|---|---|---|---|---|---|
| 21 | 44.8 | yes | 10 | 3 | 5 | 863 | 7 |
| 16 | 44.1 | yes | 18 | 10 | 7 | 1050 | 9 |
| 54 | 43.8 | yes | 24 | 16 | 12 | 1168 | 16 |
| 18 | 43.6 | yes | 12 | 5 | 2 | 898 | 9 |
| 59 | 43.3 | yes | 12 | 7 | 5 | 1106 | 7 |
| 23 | 43.1 | yes | 16 | 8 | 4 | 982 | 14 |
| 33 | 43.1 | yes | 16 | 8 | 4 | 898 | 14 |
| 67 | 42.9 | yes | 16 | 10 | 7 | 898 | 10 |
| 43 | 41.7 | yes | 12 | 8 | 7 | 1063 | 12 |
| 10 | 41.1 | yes | 16 | 10 | 7 | 914 | 8 |

- **After tuning (fan 2-piece threshold r ≥ 13): 10 / 10 pass** (floor: at least 8 pieces and at least 2 damaging
  collisions, in at least 7 of 10).
- **First run (threshold r ≥ 25): 1 / 10 pass.**
  - Pieces were 6 in nine shots and 10 in one (rock 54). The collision half held in 8 of 10.
  - The secondary breaks happened (3 to 8 per shot), but every one of them ended in dust.

### Moving rocks over a stress round (20 seeds, a torpedo every 10 s and the laser whenever charged)
| t | 10 s | 20 s | 30 s | 40 s | 50 s | 60 s |
|---|---|---|---|---|---|---|
| median | 13.5 | 20.5 | 25.5 | 34.5 | 38.5 | 39.5 |
| max | 20 | 29 | 40 | 49 | 68 | 60 |

- Before the tuning, the 60 s figures were median 24.5 and max 34.
- No seed evicted a rock: there were 30–73 splits and 43–95 dust events per seed.
- The count levels off at about 40 by 60 s. That is with a torpedo every 10 s and the laser always firing, much more
  than a real fight fires at rocks.

### duelGates (the Cutter, gate seeds 1–10)
| run | median round | crew W / L | notes |
|---|---|---|---|
| Task 10, threshold r 25 | 234.8 s | 8 / 2 | 3 planet ends, none under 30 s; every duel uses both weapons |
| After the tuning, threshold r 13 | **251.1 s** | **9 / 1** | 3 planet ends (seeds 2, 3, 10), none under 30 s; every duel uses both weapons; passive crews survive 116–137 s, all lost |

No §11.5 knob was touched (`BLAST_SHIP_PUSH`, the hull-cost thresholds and `ROCK_FLING` all keep their spec values).
The gate (median 180–300 s, the crew both wins and loses) passed both times.

### App smoke
- `npm run test:duel-app-runtime`: **PASS**, `ACTUAL TWO-PROCESS DUEL APPLICATION PASS (85493 ms)`, after the tuning.
- An earlier run that day failed at step 2 ("guest could not reach its console"), the held-key walk under machine
  load. It passed on re-run.
- The smoke's forced-end seed had to be re-pinned twice: 351 → 1902 in Task 10, then 1902 → 1980 after the tuning.
- The internet smoke (`internet-app-smoke.ts`) was **not run**, because it needs the deployed service.

## ROCK_GRAVITY

`ROCK_GRAVITY` was set to 0.0 in a local, uncommitted edit for the same feel-proxy run, then restored. SIM stays 53 with
gravity 1.0.

| | gravity 1.0 (as built) | gravity 0.0 |
|---|---|---|
| feel floor | 10 / 10 | 10 / 10 |
| pieces (sum over 10 shots) | 152 | 154 |
| damaging collisions (sum) | 60 | 57 |
| farthest travel, median per shot | 948 u | 926 u |
| farthest travel, range | 863–1168 u | 838–1177 u |
| moving at 30 s, sum | 106 | 133 |
| moving at 30 s, median per shot | 9.5 | 13 |

Gravity barely changes the first seconds after a blast: the pieces, collisions and reach are the same within noise,
because the fling speeds of 150–200 u/s swamp it. What it changes is the after-life:

- **Gravity off (0.0):** about 25% more pieces are still alive and moving 30 s later. The run does not record why. The
  likely reason is that with gravity on, more pieces end in the planet.
- **Gravity on (1.0):** a pushed belt rock never comes to rest. It drifts in at about 1.7 u/s² at the belt. Against
  the drag of 0.1/s, that settles at about 17 u/s inward. Every rock the laser nudges, and every blast's survivor, slowly
  falls toward the planet and thins the belt over a long round.
- **Gravity 0.0:** a pushed rock coasts under drag. It stops within about 10 s (1/drag) and stays where it stopped, as
  a moving body that no longer moves. The belt keeps its shape, but those bodies never re-enter the static grid.

I would keep 1.0 for the play test, because it is the consistent physics. The owner should note whether the slow
inward drift reads as alive or as messy.

## Screenshots

Taken in `C:\Users\djuar\FTLite-shots\asteroid-spike-ii\` with `scripts/spike-asteroids-ii-shots.cjs`.
- Setup: single player, the crew seated at Weapons through the solo hook, pinned at rest outward of a big belt rock,
  facing it. The Hunter is pinned about 2,800–3,900 u away.
- Two sets: the default map zoom 0.25 (`*.png`) and a closer zoom 0.39 (`*-zoom.png`, two presses of `=`).
- `b4b` is an extra shot, added because the contact itself lasts one tick.
- The bought art (`public/assets/paid`, gitignored) was copied from the main checkout into the worktree for the shots.
  The CRT map does not use it.

- `b0-laser-chip`:
  - Shows: the laser beam from the crew ship onto the bracketed rock. Card reads `FIRING`, `TGT ROCK`, status
    `FIRING SOLUTION`, `ROCKS 0`.
  - Not visible: the chip sparks are not distinguishable from the bracket and beam at either zoom. (Fixed after this
    pass, Task 13: the rock fx now keep a minimum screen size; see "Not so good" below.)
- `b1-laser-split`:
  - Shows: the rock just split. A small cluster of pieces sits where it was, with one cracked piece glyph (zoom), and
    the beam is still drawn.
  - The laser target cleared itself: the card is back to `TGT SHLD` and the status line reads
    `ENEMY OUT OF RANGE: CLOSE TO 450`. `ROCKS 2`.
  - Not visible: no "streaking" is visible yet at 250 ms.
- `b2-blast-shockwave`:
  - **Reads well.** A bright double ring (the shockwave) and a smaller ring for a secondary break sit inside the
    torpedo arc, with cracked bright-outlined pieces in the middle. `MAG 3/4`, `ROCKS 4`.
- `b3-belt-after-blast` (3 s later):
  - Shows: pieces scattered 300–700 u across the belt, each small one with a short motion streak. A few cracked rocks
    have bright outlines. One piece already hit the crew: `HULL 39/40`. `ROCKS 5`.
  - The cascade is real but drawn small: at zoom 0.25 the pieces are 3–6 px dots.
- `b4-piece-hits-crew`:
  - Shows: an r 18 piece thrown at the crew at 220 u/s, closing just behind the stern with a short streak.
  - Not visible: at zoom 0.25 the piece is a dot under the ship.
- `b4b-piece-after-hit`:
  - Shows: 120 ms after contact, `HULL 38/40` (from 39). The piece has split into two small pieces just under the hull.
    `ROCKS 6`.
  - Not visible: there is no impact flash or marker on the ship. Apart from the ship shake, the hull number is the only
    cue in a still.
- `b5-laser-target-bracket`:
  - Shows: hot corner brackets around a belt rock 557 u away. The status line reads `ROCK OUT OF RANGE: CLOSE TO 450`,
    the card `TGT ROCK` and `LASER: OUT OF RANGE 557/450`.
  - Overlap: the Hunter's off-screen `CHARGING`/`FIRING` telegraph label happened to be drawn on top of the bracketed
    rock.

## What felt good, and what did not

From the screenshots, the numbers, and the state of the code. Nobody has played it yet.

**Good**

- **The cascade happens.** One torpedo into a big belt rock now makes 10–24 pieces and 2–12 damaging collisions, and
  the pieces travel 860–1170 u. That is the "explode in multiple pieces" and "crashing into each other" the owner asked
  for. In `b3` a blast piece reached and hurt the crew ship 3 s later without any staging. Rocks are a hazard you
  create, not scenery.
- **The blast reads.** `b2`'s double ring and bright pieces are the most legible effect on the map.
- **Targeting a rock is clear.** The brackets, `TGT ROCK`, the status line naming the rock, the target clearing itself
  when the rock breaks, and the `ROCKS n` tally all show up as designed (`b0`, `b1`, `b5`).
- **The ROCKS tally does not collide** with the `RIGHT-CLICK A WEAPON: CLEAR` line at this resolution (`b0`).
- **It costs nothing that matters.**
  - Sim p99 is 0.03 ms. Publication stays within budget with 60 to 88 movers.
  - Determinism holds across twins and save/restore.
  - duelGates is still inside the band: 251 s, 9 wins and 1 loss.

**Not so good**

- **At the default map zoom (0.25) most of the feel is small.**
  - Laser chips are invisible in a still, pieces are 3–6 px dots, and a piece striking the crew ship shows only as the
    hull number dropping.
  - Shakes and sounds are not visible in stills, so they are untested here. The owner's ears and eyes decide.
  - Zooming to 0.39 helps but does not fix it. The chip, speck and impact effects may need to be bigger for the map
    scale.
  - Fixed for the fx in Task 13 (view only): `rockEffectDraw` floors each rock effect at a screen size and follows its
    world size once zoomed in past it: chips at least 2 px with a 6 px tail (drawn as a tail and a head), specks 1.5 px,
    the core flash 10 px, the rock impact flare 8 px, the shockwave's stroke 2 px. The pieces themselves are unchanged.
- **Laser shots at a rock showed "MISS" callouts at the Hunter** (`b0`, `b1` in the first pass). Fixed in Task 13.
  - Cause: `hitModel.ts` called out every crew laser release that did not hit the enemy, including deliberate rock
    shots.
  - Fix: `hitCallouts` skips the MISS for a laser event that carries a rock (`rock >= 0`); the rock's own chips and
    flare are its feedback. A stray shot still reads MISS.
- **Chaos for tests and tuning got worse, as §11.2 predicted.**
  - Every rule change moves the pinned trajectories: the checkpoint seed and split, the snapshot fixture, the slots
    tick count, and the app smoke's forced-end seed (moved twice).
  - Input-free rounds almost never end early now, because the Hunter's rams knock it off its planet dives.
- **More bodies to keep track of.** With the r ≥ 13 fan, about 40 rocks are moving after a minute of heavy fire, and
  the 60-mover delta image is about 5 KB.
- **The Hunter is not rock-aware.** It never targets rocks and never uses a blast on purpose. Its threat check reads
  the pool as it stands (spike i's `rocksNear`), so it does not lead a moving piece. Its rams were a big part of why
  duel trajectories changed (Task 10's seed 1 investigation).
- **Online is untested for the rock feel.**
  - Guests see rock positions through the snapshot as in spike i, but the chip, blast, streak and shake fx are driven
    by local events.
  - The online fx path was not built or tried. `rockLock` is on the wire and validated.
- **Uncapped fx.** `fx.items` has no cap, so a big cascade adds chips, specks and shocks without limit. It has not been
  seen to matter, but it is unbounded.

## Risks

1. **Belt erosion and wake cascades (§11.1).**
   - The moving count grows to a median of 39.5 and a max of 68 over 60 s of the stress script, and levels off at
     about 40.
   - There were no evictions.
   - With gravity on, those bodies drift inward for good. A long real round fires far less at rocks, but the belt does
     thin.
2. **Chaos for tests and tuning (§11.2).**
   - Realised: three fixtures and the smoke seed were re-pinned in Task 10, and again after the one tuning change.
   - Input-free rounds became long, and Hunter planet dives are rarer.
   - Any future rule change will repeat this re-pinning.
3. **Pair cost (§11.3).** Not a problem: p99 0.03 ms against 0.5 ms, with no grid. The O(n²) moving-pair worst case
   never came close.
4. **Snapshot growth (§11.4).**
   - Values +154% over master (967 → 2,454). Full image ×2.4 (8.3 → 20.2 KB).
   - Publication cost is about 1.7× master's, within budget.
   - The real growth is the delta under movers: about 5 KB at 60 to 88 movers, against 1 KB.
   - This is the first thing to count against more ships (R-5).
5. **Duel gates (§11.5).** They passed without touching the named knobs: 234.8 s then 251.1 s, and the crew both wins
   and loses. Rounds did not get shorter. They got slightly longer, because the Hunter's rams knock it off its course.

## Recommendation: ship, with the owner's play test as the deciding gate

The billiard version is what the owner asked for ("blow shit up", "explode in multiple pieces", "crashing into each
other should cause damage"), and after one tuning step the measured cascade delivers it. Its costs are within budget
by wide margins: sim, publication and determinism. Spike i's recommendation to drop fragments was right for spike i's
slow, short-lived fragments. That reason is gone here, because the pieces matter.

So the recommendation is to **ship the billiard version** if the owner's play test confirms that the cascade feels fun
from the Weapons seat. A proper build should add:
- rock fx for guests, derived from pool diffs;
- no `MISS` callout for rock shots (done in the spike, Task 13);
- a cap on rock fx items;
- bigger chip and impact cues at map zoom (screen-size floors done in the spike, Task 13; pieces still small);
- a Hunter that at least avoids moving pieces by their velocity.

It should also plan for re-pinning fixtures on every tuning change. If the play test says the effects are too small to
notice or the belt gets messy, the fallback is **ship simpler**: keep the push, cracks and blast, but cut the fan back
to r ≥ 25 or turn gravity off. Do not go back to spike i's static-only rocks.

## Owner's play test

How to launch this branch's build, from a terminal on the PC:
1. `cd C:\Users\djuar\FTLite\.worktrees\asteroids-ii`
2. Optional, for the bought art: copy `C:\Users\djuar\FTLite\public\assets\paid` into this worktree's `public\assets\`.
   It is gitignored, and the shots were taken with it in place. The CRT map plays the same without it.
3. `npm run dev` (electron-vite dev; it opens the app window). This is the only start script in `package.json`.

Then:
1. On the main menu, choose **Single player**.
2. Walk to the **Weapons** console and press **E** to sit. The top tab shows WEAPONS.
3. Click **TORPEDO** (or press **2**), then click a belt rock near the Hunter. Watch for:
   - the dashed bracket;
   - the blast ring when it lands;
   - the pieces flying with streaks;
   - the cracks on rocks they hit.
   If the Hunter is close, check whether the blast's push or the pieces reach it.
4. Click **LASER** (or press **1**), then a rock within 450 u and in the arc. Watch for:
   - the chips;
   - the push, which moves a small rock and barely moves a big one;
   - the split into 2 or 3 pieces.
   Note whether the chips are visible at your zoom (`=` and `-` zoom the map).
5. **Right-click LASER** to clear the rock target. The card goes back to its room target.
6. Press **Tab** to switch to the other crew member. Walk them to Navigation, sit (**E**), and fly into a moving piece
   (W/S throttle). Feel the bump, watch the hull cost, and see whether the piece breaks.
7. Read **ROCKS n** on the Weapons card: the rocks you broke.

Questions for the owner:
- Is the cascade fun, and is it readable at map zoom?
- Is the slow inward drift of pushed rocks good or messy?
- Should a real build keep this, or go simpler?

## Reproduce

Measurements (Task 11 Step 3, on this branch):
```bash
SCR=/c/Users/djuar/AppData/Local/Temp/claude/86da55dbee83ee65/e5d2d162-fb66-4ee0-85a9-584b0a19138f/scratchpad/spike-ii
npx tsx scripts/spike-asteroids-ii-measure.ts --json $SCR/ii.json
npx tsx scripts/profile-duel-publication.ts --json $SCR/pub-ii-0.json
npx tsx scripts/profile-duel-publication.ts --movers 60 --json $SCR/pub-ii-60.json
```

Master and spike i comparison (Task 11 Step 8). In Git Bash `mklink` failed on its switch parsing. Task 11 made the
junction with PowerShell `New-Item -ItemType Junction` instead, and removed the junction before removing the worktree:
```bash
git worktree add --detach $SCR/master-wt 21b41758
cmd //c mklink /J "$(cygpath -w $SCR/master-wt/node_modules)" "C:\\Users\\djuar\\FTLite\\node_modules"
git show 577bb00c:scripts/spike-asteroids-measure.ts > $SCR/master-wt/scripts/spike-asteroids-measure.ts
(cd $SCR/master-wt && npx tsx scripts/spike-asteroids-measure.ts --json $SCR/master.json && npx tsx scripts/profile-duel-publication.ts --json $SCR/pub-master.json)
(cd /c/Users/djuar/FTLite/.worktrees/spike-asteroids && npx tsx scripts/spike-asteroids-measure.ts --json $SCR/spike-i.json && npx tsx scripts/profile-duel-publication.ts --json $SCR/pub-spike-i.json)
git worktree remove --force $SCR/master-wt
```

Screenshots (Task 12 Step 3). Install playwright-core outside the repo, build, then run the script once per zoom. The
third argument is the number of zoom-in presses: 0 gives the `*.png` set, 2 gives `*-zoom.png`.
```bash
npm run build
mkdir -p $SCR/pw && (cd $SCR/pw && npm init -y >/dev/null && npm install playwright-core@1.48.2)
cp scripts/spike-asteroids-ii-shots.cjs $SCR/pw/
node $SCR/pw/spike-asteroids-ii-shots.cjs C:/Users/djuar/FTLite-shots/asteroid-spike-ii C:/Users/djuar/FTLite/.worktrees/asteroids-ii 0
node $SCR/pw/spike-asteroids-ii-shots.cjs C:/Users/djuar/FTLite-shots/asteroid-spike-ii C:/Users/djuar/FTLite/.worktrees/asteroids-ii 2
```

ROCK_GRAVITY 0 vs 1 (Task 12 Step 4). This is a temporary local edit, never committed:
```bash
sed -i 's/^export const ROCK_GRAVITY = 1.0;/export const ROCK_GRAVITY = 0.0;/' src/renderer/src/sim/tactical/rockTuning.ts
npx tsx scripts/spike-asteroids-ii-measure.ts --only feel --json $SCR/feel-g0.json; true
git checkout -- src/renderer/src/sim/tactical/rockTuning.ts
git diff --exit-code src/renderer/src/sim/tactical/rockTuning.ts
```
