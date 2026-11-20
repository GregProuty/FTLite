# Asteroids-iv: cell rocks

Date: 2026-11-20. Status: draft for the owner's review (a sketch of the look is named in §7). Follows the look pass
(`2026-11-20-asteroids-look-design.md`), which is drawing only. This spec changes the sim.

## 1. Goal

The owner's words: rocks should be "built out of particles or blocks, that could then fragment into smaller pieces",
and the pieces must be "pieces of the original rocks. So if an asteroid gets split down the middle, you have two halfs of
the original asteroid floating around." Today a broken rock is replaced by 2 to 8 new round rocks, which is the thing to
remove.

After this work:

- A rock is a rigid body made of blocks (cells). Its outline is the outline of its cells.
- A break never invents shapes. It divides the rock's cells into groups, and each group flies on as its own rock with the
  same cells in the same places.
- Shots, ships and other rocks meet the real shape, not a circle round it.
- Rocks turn. A hit off centre makes a piece tumble.
- The look stays background: dim, no bright effects (the look pass rules carry over).

Not in this work: craters dug cell by cell by ordinary laser fire, per-bond damage state, friction, any change to gravity,
lanes, rejoin rules, weapon damage numbers or the Hunter's rock avoidance.

## 2. Prior art

A short check, as the asteroids-iii notes asked for before cell rocks.

- **Noita** (Purho, GDC 2019). Every pixel of a rigid body knows its body and its place in it. When pixels are destroyed
  the body's shape is recomputed, and it becomes several bodies if it was cut in two. This is the "pieces of the original"
  rule, at pixel grain.
- **NVIDIA Blast.** A pre-fractured object is chunks joined by bonds in a support graph. Damage breaks bonds, then island
  detection on the graph makes each still-connected group a new actor. Fracture lines are fixed in advance; only which
  ones open is decided at run time.
- **Cometa** (an Asteroids-style game). Each rock is a pixel grid; after a hit a flood fill checks whether every pixel is
  still reachable, and unreachable groups become new rocks. The write-up warns that naive fills over grids of several
  hundred pixels a side ran poorly.

What this spec takes: fixed cells per rock (Blast), groups found by a connectivity fill (all three), and a small cell
count so the fill and the contact tests stay cheap (Cometa's warning). It does not take per-bond health: a break here is
one geometric cut, decided at the moment the rock's hp runs out (§5). That keeps the state per rock to one bit mask.

## 3. The rock model

### 3.1 Cells

- **Lattice.** Cells sit on a hexagonal lattice in the rock's own frame. Cell (q, r) has its centre at
  `d · (q + r / 2, r · 0.8660254037844386)`, d the rock's cell spacing. Two cells are neighbours when they are one
  lattice step apart (six neighbours).
- **Two radii per cell.** The contact radius `d / 2` is used when a body meets a body (ship, rock, planet): neighbouring
  cells exactly touch, so two halves of a cut rock are born touching and not overlapping. The hit radius
  `d · 0.5773502691896258` (the hexagon's corner distance) is used for thin things (beams, rounds, torpedoes): the cells
  then cover the rock with no holes for a beam to slip through.
- **Why hexagons.** Six equal neighbours give one clear rule for "connected", circles pack well on them, and with
  jittered corners (§7) the cells draw as irregular stone shards, not a honeycomb or a pixel grid.

### 3.2 Templates

Every seeded asteroid k has a template: its spacing d and its list of cells, made once per map from the map radius R of
that asteroid and the round's seed. Integer hashing and `+ − × ÷` only.

| Map radius R | Shells | Full cell count | Spacing d |
| --- | --- | --- | --- |
| R ≤ 20 | 1 | 7 | R / 1.5773502691896258 |
| 20 < R ≤ 40 | 2 | 19 | R / 2.5773502691896258 |
| R > 40 | 2 and the 12 cells at √7 | 31 | R / 3.2231015802542165 |

- The spacing puts the outermost cell's hit circle exactly at R (the divisor is the outermost centre's distance in
  spacings plus 0.5773502691896258), so no part of a rock lies outside its map circle and the map's spacing rules
  (`ASTEROID_GAP`, the lanes, the clusters) still hold.
- **Variety.** Each cell of the outermost shell is a candidate to drop when `hash(seed, k, q, r) mod 100 < RIM_DROP`
  (30). Candidates are dropped in ascending hash order until the template is down to its floor of 4, 13 or 25 cells.
  Inner cells are never dropped, so every template is connected. Rocks get bays and bumps.
- A template has at most 31 cells, so a rock's live cells fit one unsigned 32-bit mask.

### 3.3 State beside the pool

The pool (`state.rocks`, stride 8) is unchanged: kind, x, y, vx, vy, r, hp, t. Three typed arrays sit beside it, one entry
per slot, and are hashed, snapshotted, cloned and sent with it:

- `rockTmpl: Int16Array`: the seeded asteroid this rock is a piece of, or −1.
- `rockMask: Uint32Array`: which of the template's cells it still has.
- `rockTurn: Float64Array` (3 per slot): its orientation as a unit pair (c, s), and its spin ω in rad/s.

Meaning of the pool fields for a cell rock:

- **x, y** is the centre of mass: the mean of its live cells' centres (all cells of a rock weigh the same).
- **r** is a bounding radius about that centre. A seeded rock starts with r = R, its map radius (all its cells lie inside
  it, §3.2). A piece is born with r = its farthest live cell centre plus the hit radius. Everything that used r as a
  rough size keeps doing so: the grid, predictions, rejoin, targeting brackets, the Hunter's avoidance.
- **hp** is `rockHp(r)` at birth, as today (`ceil(r / 10)`), so an unbroken rock is exactly as tough as now.

**A plain rock.** A slot with `rockTmpl` −1 is a rock of one round cell whose contact and hit radius are both r. Every rule
below then gives today's circle behaviour for it, and it cannot be cut (one cell), so it turns to dust at hp ≤ 0. Seeded
rocks always have a template; plain rocks exist for tests and as the safe meaning of a bare `writeRock`.

**Derived values** (never hashed, memoised per template and mask): the cell count, the centre of mass in the template
frame, each live cell's offset from it, the bounding radius, the mass and the moment of inertia.

- Mass: every cell of a template weighs `R³ / (ROCK_MASS_DIVISOR · full cell count)`, so a rock with no cell dropped
  weighs exactly today's R³ / 30 (R 30 weighs 900, the ship's mass). A rock's mass is its cell count times that. A break
  conserves mass, less the dust.
- Inertia: `Σ m_cell · (|offset|² + (d / 2)² / 2)`.

## 4. Motion

- **A free rock** moves as today (`moveFreeSlot`), and its orientation turns by ω each tick: `(c, s)` times
  `seriesStep(ω · DT)`, then divided by its length. ω is capped at `ROCK_SPIN_MAX` (2 rad/s, inside the series' range) and
  fades with the same age-ramped settling rate as the velocity drag.
- **A rail rock** (Rail or Tumble) keeps the orientation it had at its anchor tick, turned by the same rotation `railPos`
  applies to its offset. A lane rock therefore always shows the planet the same face, and a cluster turns as one rigid
  group. Nothing in a rail slot changes while it stays on the rail, as today.
- **Freeing** writes the rail's current orientation and ω = 0. **Rejoining** needs |ω| under `REJOIN_SPIN` (0.05 rad/s)
  on top of today's conditions, then stores the orientation as the new anchor.

## 5. Breaking

### 5.1 When

Unchanged. Weapons, rams and hard rock-rock contacts wear hp by today's amounts, and a rock breaks at hp ≤ 0. A torpedo's
direct hit breaks its rock whatever its hp. A free rock inside `ROCHE_R` breaks tidally. A slot born this tick takes no
damage, push or contact.

### 5.2 The cut

Every break but the torpedo's direct hit is one straight cut, given by a point P and a direction u:

| Cause | P | u |
| --- | --- | --- |
| Laser, autocannon round | where the shot met the rock | the shot's direction |
| Ram | the contact point | the contact normal |
| Rock-rock contact | the contact point | the contact normal |
| Torpedo blast on a nearby rock | the centre of its cell nearest the blast | from the blast point to that cell |
| Tidal | the centre of mass | the rock's velocity |

1. P and u are turned into the rock's frame.
2. Each live cell goes to the left or right of the line by the sign of `cross(u, cell − P)` (zero counts as left).
3. If one side is empty, the line is moved to pass through the centre of mass. If one side is still empty (the cells lie
   along u), u is turned a quarter turn. Any rock of two or more cells is now divided.
4. Within each side, cells are grouped by neighbour connectivity (a fill over the six-neighbour rule on a 32-bit mask).
5. Each group of two or more cells whose bounding radius is at least `ROCK_MIN_R` becomes a piece. Any other group is
   dust.

A shot through the middle gives two halves. A grazing shot shaves a few cells off one side. Each piece is born with
full hp for its size, so a big rock takes several breaks to grind down, as today.

### 5.3 The shatter

A torpedo's direct hit, at impact point P with hit direction u:

1. Cells whose centre lies within `CRATER_R` (0.75 d) of P are dust.
2. The rest are divided by three lines through P: along u, and u turned 60° and 120° (literal cos and sin). That is six
   sectors.
3. Groups by connectivity within each sector; pieces and dust by rule 5 above.

A 31-cell rock gives about four to six real chunks round a small hole.

### 5.4 A piece's birth

- **Place.** Its centre of mass, at the parent's orientation. No cell moves at the moment of the break.
- **Velocity.** The parent's velocity at that point (`v + ω × offset`), plus a kick:
  - a cut: the two sides part along the line's normal at a relative speed `v_esc(ρ) · CUT_KICK` (0.12; a tidal cut 0.04),
    shared between the sides by inverse mass so momentum is kept; every piece on a side gets that side's change;
  - a shatter: away from P at `v_esc(ρ) · (0.30 + 0.30 f_j)`, as today's burst.
- **Spin.** The parent's ω.
- **Slots.** Unchanged: the largest piece keeps the parent's slot, the rest take the lowest empty slots, then evict a
  smaller rock, else are dust. Pieces are Free, born, share one clock t, and are linked into the grid.
- **Events.** One `split` event listing the pieces (`burst: true` for a shatter), and one `dust` event per dust group, as
  today. Counters as today.

Removed: the fan and burst direction tables, piece counts by radius, `pieceRadius`, the birth offsets and the per-piece
kick fractions for fans.

## 6. True shapes

One module (`rockShape.ts`) answers three questions about a rock from its cells, after a cheap test on the bounding
circle. For a plain rock each gives today's circle answer.

| Question | Used by | Cells' radius |
| --- | --- | --- |
| Where does a segment first enter this rock? | `firstBlocker` (lasers, sight lines), autocannon rounds, pew rounds | hit |
| Does this small circle touch it, and where? | a torpedo's contact | hit |
| What is the deepest overlap with this circle or this other rock: point, normal, depth? | ship-rock, rock-rock, the planet test | contact |

- **Contacts with spin.** A rock-rock or ship-rock contact uses the deepest overlapping cell pair. The impulse is the
  standard rigid-body one along the normal n at contact point c: `j = (1 + e) · vc / (1/ma + 1/mb + (ra × n)² / Ia +
  (rb × n)² / Ib)`, with vc the closing speed of the two contact points, and each rock's ω changed by `(r × n) · j / I`.
  Today's restitution curve, separation fix, crush rule, touch and bump events are kept. No friction. A ship has no
  inertia term: its heading is the pilot's.
- **Pushes with spin.** A laser's, round's or blast's push is applied at its point, so it also turns the rock.
- **Aim point.** A hollow piece's centre of mass can lie in empty space. Wherever a weapon aims at "the rock" (the laser's
  line to a rock target, the torpedo's guidance), it aims at the centre of the live cell nearest the centre of mass.
- **The blast's reach** is measured to the nearest cell's surface.
- **The planet and the edge.** A free rock with any cell touching the planet, or its centre past the far edge, is dust,
  whole, as today.
- **Predictions keep the circle.** The Helm's predicted path and collision warning, the targeted rock's dotted path and
  the Hunter's avoidance read the bounding circle, so they err on the safe side near a bay or a flat face.

## 7. Drawing

- **Outline.** The boundary of the union of the rock's cells, as hexagons whose corners are each moved by a fixed hashed
  offset of up to 0.18 d (a corner is shared by three cells, so neighbours still fit exactly). Two more moves ease the
  rim, so it reads as stone and not as a cog: a rim corner shared by two live cells (the notch between them) moves 0.2 d
  outward, and one that belongs to a single live cell (a tip) moves 0.13 d toward that cell. Built once per template and
  mask, then turned and placed each frame. `CRT.dim` fill, 1 px `CRT.mid` outline, at any wear. The drawn outline is
  drawing only; shots and contacts meet the cells' circles (§3.1).
- **Sketch.** `C:\Users\djuar\FTLite-shots\asteroids-iv\cell-rocks-sketch.png` (its source beside it) draws §3.2's
  templates, §5.2's cut and §5.3's shatter by these rules: whole rocks at four sizes, worn rocks, a central cut, a
  grazing cut and a torpedo's direct hit.
- **Seams.** The edges between two live cells, in `CRT.faint` at alpha `CRACK_ALPHA · wear`: invisible on a whole rock,
  faint on a worn one. These replace the four invented cracks. They are the real lines a cut can open along.
- **Orientation** is the sim's, lerped between ticks like the position. The hashed drawing-only spin is removed.
- **Effects.** As the look pass: a dim puff per dust group and per split. Nothing bright belongs to a rock.
- Too small to outline: the 2 px dot, as today.

## 8. Hash, wire, version

- `rockTmpl`, `rockMask` and `rockTurn` join the hashed fields, the snapshot, the clone and the published vectors, with
  validation rules (a gone slot holds zeros and −1; a mask is a non-empty subset of its template; c² + s² within 1e-9 of
  1; |ω| ≤ `ROCK_SPIN_MAX`).
- `SIM_VERSION` goes up by one at each phase that changes the sim (§10). Helm round 2 also plans a bump from 63, so each
  phase takes the next free number when it merges.
- Golden, determinism (Node, Electron, Firefox) and the duel gates are re-blessed per phase.
- The publication's size is measured before and after. A rail's shape values do not change while it stays on its rail.

## 9. Cost

The owner wants the rock step as cheap as possible. Today's p99 is 0.1 to 0.45 ms per tick.

- Every shape test starts with the bounding circle, so untouched rocks cost what they cost now.
- A rock's world cell centres are memoised per slot until the slot moves or turns.
- A rock-rock test first drops each rock's cells that are out of reach of the other's bounding circle.
- Budget: p99 at most 0.6 ms per tick in the asteroids-iii stress scene after three torpedo bursts. The measure script
  gains this scene.

## 10. Phases

Each phase ends with the full suite, determinism and the app smoke, and is merged on its own so the owner can look early.

- **iv-a: real pieces with true shapes.** Templates, the three arrays, hash and wire, the cut and the shatter,
  `rockShape.ts` and its callers (beams, rounds, torpedoes, ships, rock-rock, the planet test, the blast's reach, the aim
  point), and the drawing of cells. Nothing turns yet: every orientation is the identity and ω stays 0, so contacts use
  the impulse of §6 without its inertia terms. The owner sees and flies among real halves and chunks.
- **iv-b: spin.** ω and the orientation's motion, rotational impulses and pushes, rails turning their rocks, rejoin's spin
  rule, the renderer's orientation lerp.

The two were first drafted as three, with the pieces arriving before the true shapes. That middle state was dropped: two
fresh halves' bounding circles overlap deeply, so circle physics would throw them apart on the next tick.

## 11. Tests

- **Templates:** deterministic per seed and index, connected, 1 to 31 cells, every contact circle inside R.
- **The cut:** a central cut of a full rock gives two pieces whose masks are disjoint and together equal the parent's;
  every piece's cells are connected; no cell's world place changes at the break; the fallbacks of §5.2 step 3; dust for
  single cells; mass and momentum kept (less dust).
- **The shatter:** the crater cells are dust; pieces never share a cell; counts within the slot rules.
- **Shapes:** a beam through a bay of a rock passes; a beam at a cell stops there; a ship beside a half rock's flat side
  does not touch it; plain rocks give today's answers bit for bit.
- **Spin:** an off-centre push turns the rock the right way; angular momentum of a two-rock contact is kept; orientation
  stays unit length over an hour of ticks; a rail rock's orientation matches its rail's rotation.
- **Wire:** a snapshot round trip keeps the three arrays; validation rejects each bad case in §8.
- **Drawing:** the outline of a mask is a closed loop; seams only between live neighbours; ramp colours only.

## 12. For the owner's playtest

Starting numbers, all in `rockTuning.ts`: `RIM_DROP` 30, `CUT_KICK` 0.12, the tidal kick 0.04, `CRATER_R` 0.75 d,
`ROCK_SPIN_MAX` 2, `REJOIN_SPIN` 0.05, the corner jitter 0.18 d. Questions for the look after iv-a: are the blocks the
right size (the cell counts 7, 19 and 31 of §3.2), do the halves drift apart at the right speed, and are the seams faint
enough?
